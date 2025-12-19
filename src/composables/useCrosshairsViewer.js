import { ref } from 'vue'
import * as cornerstone from '@cornerstonejs/core'
import {
  init as cornerstoneInit,
  imageLoader,
  getRenderingEngine,
  RenderingEngine,
  Enums,
  volumeLoader,
  cache,
  eventTarget,
} from '@cornerstonejs/core'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'
import { 
  init as cornerstoneToolsInit, 
  addTool, 
  ToolGroupManager, 
  CrosshairsTool,
  LengthTool,
  AngleTool,
  annotation,
  Enums as ToolsEnums 
} from '@cornerstonejs/tools'
import { cornerstoneStreamingImageVolumeLoader } from '@cornerstonejs/streaming-image-volume-loader'
import CustomOrientationMarkerTool from '../tools/CustomOrientationMarkerTool.js'
import { fetchJSONFile } from '../utils/apiClient.js'

// ========== 向量运算辅助函数 ==========
function crossProductVec(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalizeVec(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dotProductVec(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtractVec(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vectorLength(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

// ========== 性能优化辅助函数 ==========
/**
 * 创建节流函数，限制函数执行频率
 */
function throttle(func, delay) {
  let lastCall = 0;
  let timeoutId = null;
  
  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    // 清除之前的延迟调用
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func.apply(this, args);
    } else {
      // 延迟调用以确保最后一次调用被执行
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * 请求动画帧节流
 */
function rafThrottle(func) {
  let rafId = null;
  let lastArgs = null;
  
  return function(...args) {
    lastArgs = args;
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func.apply(this, lastArgs);
        rafId = null;
      });
    }
  };
}

// ========== 常量定义 ==========
const RENDERING_ENGINE_ID = 'myRenderingEngine';
const TOOL_GROUP_ID = 'myToolGroup';

/**
 * Crosshairs Viewer Composable
 * 处理 Cornerstone 3D 体积数据的加载和显示逻辑
 * 
 * @param {Object} props - 组件属性
 * @param {string} props.seriesInstanceUID - 系列实例 UID
 * @param {Object} allSeriesUIDs - 所有期相的系列实例UID映射对象，如 {收缩期: 'uid1', 舒张期: 'uid2'}
 */
export function useCrosshairsViewer(props, allSeriesUIDs = null) {
  // ========== 状态管理 ==========
  const loading = ref(true);
  const error = ref(null);
  
  // ========== 内部状态 ==========
  let renderingEngine = null;
  let viewportIds = null;
  let currentVolumeId = null;
  let initialCameraPositions = null; // 保存初始MPR位置
  const savedViewStates = ref([]); // 保存的视图状态列表
  const measurementHistory = ref([]); // 测量历史记录
  const volumeCache = {}; // 缓存已加载的体积数据 {seriesUID: {volumeId, imageIds}}
  let savedPlaneState = null; // 保存的平面定位状态（用于期相切换时保持平面）
  let lastCameraState = null; // 保存最后的相机状态（用于切换期相时保持MPR视图）
  let planeAnnotationsUIDs = []; // 保存平面绘图的annotation UIDs，用于清除
  let diameterAnnotationsUIDs = []; // 保存最长径最短径的annotation UIDs，用于单独清除
  let curveAnnotationsUIDs = []; // 保存曲线的annotation UIDs
  let currentAnalysisType = null; // 当前分析类型
  let cameraModifiedListeners = []; // 保存相机变化监听器，用于清除
  let planeGeometryVisible = false; // 标记平面几何是否可见
  let cameraChangeHandler = null; // 保存相机变化处理函数引用
  let crosshairPositionChangeHandler = null; // 保存crosshair位置变化处理函数引用
  let lastCrosshairPosition = null; // 保存上次crosshair位置
  let customSVGElements = []; // 保存自定义绘制的SVG元素
  let customCurveData = {}; // 保存自定义曲线的世界坐标数据，用于缩放时重绘 {viewportId: {points: [], uid: '', style: {}}}
  let cameraModifiedListenersForCurves = []; // 保存曲线更新的相机监听器
  
  // Wave Image 相关
  let axialContainer = null;
  let waveImageElement = null;
  let isWaveImageVisible = false;
  let waveOpacity = 1.0;
  let waveRotation = 0;

  // ========== 性能优化 ==========
  /**
   * 创建一个优化的渲染函数，使用RAF节流
   */
  const createOptimizedRender = () => {
    let rafId = null;
    
    return (vpIds = null) => {
      if (!renderingEngine) return;
      
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        try {
          const viewportsToRender = vpIds || (viewportIds ? [
            viewportIds.axial,
            viewportIds.sagittal,
            viewportIds.coronal
          ] : []);
          
          if (viewportsToRender.length > 0) {
            renderingEngine.renderViewports(viewportsToRender);
          }
        } catch (e) {
          console.warn('优化渲染时出错:', e);
        }
        rafId = null;
      });
    };
  };
  
  const optimizedRender = createOptimizedRender();

  /**
   * 保存当前相机状态（用于期相切换）
   */
  function saveCurrentCameraState() {
    if (!renderingEngine || !viewportIds) return;
    
    try {
      const cameraState = {};
      ['axial', 'sagittal', 'coronal'].forEach(viewName => {
        try {
          const vp = renderingEngine.getViewport(viewportIds[viewName]);
          if (vp) {
            const camera = vp.getCamera();
            cameraState[viewName] = {
              position: [...camera.position],
              focalPoint: [...camera.focalPoint],
              viewUp: [...camera.viewUp],
              parallelScale: camera.parallelScale,
              viewPlaneNormal: camera.viewPlaneNormal ? [...camera.viewPlaneNormal] : undefined
            };
          }
        } catch (e) {
          console.warn(`保存${viewName}相机状态失败:`, e);
        }
      });
      lastCameraState = cameraState;
    } catch (e) {
      console.warn('保存相机状态失败:', e);
    }
  }

  /**
   * 设置相机变化监听器（使用节流）
   */
  function setupCameraChangeListener() {
    if (!renderingEngine || !viewportIds) return;
    
    // 使用节流，避免频繁保存
    let saveTimeout = null;
    
    const handleCameraChange = () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      
      saveTimeout = setTimeout(() => {
        saveCurrentCameraState();
      }, 200); // 200ms 延迟，避免频繁保存
    };
    
    // 监听渲染事件（当相机改变时会触发渲染）
    try {
      const element = renderingEngine.getViewport(viewportIds.axial)?.element;
      if (element) {
        element.addEventListener('cornerstoneimagerendered', handleCameraChange);
      }
    } catch (e) {
      console.warn('设置相机变化监听失败:', e);
    }
  }

  /**
   * 获取系列中的所有实例
   * 
   * @param {string|null} seriesInstanceUIDParam - 系列实例 UID（可选）
   * @returns {Promise<string[]>} 图像 ID 数组
   */
  async function fetchInstances(seriesInstanceUIDParam = null) {
    try {
      const targetUID = seriesInstanceUIDParam || props.seriesInstanceUID;
      
      // 通过 Orthanc API 查询系列
      const findResponse = await fetch('/tools/find', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Level: 'Series',
          Query: {
            SeriesInstanceUID: targetUID,
          },
        }),
      });

      if (!findResponse.ok) {
        throw new Error(`查询系列失败: ${findResponse.status}`)
      }

      const seriesIds = await findResponse.json()

      if (!seriesIds || seriesIds.length === 0) {
        throw new Error('未找到指定的系列')
      }

      // 获取第一个系列的详细信息
      const seriesId = seriesIds[0]
      const seriesResponse = await fetch(`/series/${seriesId}`)
      
      if (!seriesResponse.ok) {
        throw new Error(`获取系列信息失败: ${seriesResponse.status}`)
      }

      const seriesData = await seriesResponse.json()
      
      // 获取实例列表
      const instanceIds = seriesData.Instances || []
      
      if (instanceIds.length === 0) {
        throw new Error('系列中没有找到实例')
      }

      // 获取每个实例的元数据并排序
      const instancesWithMetadata = await Promise.all(
        instanceIds.map(async (instanceId) => {
          try {
            // 获取实例的标签（tags）
            const tagsResponse = await fetch(`/instances/${instanceId}/tags?simplify`)
            if (!tagsResponse.ok) {
              console.warn(`无法获取实例 ${instanceId} 的标签`)
              return { instanceId, imageId: `wadouri:/instances/${instanceId}/file`, position: null, sliceLocation: null, instanceNumber: null }
            }
            
            const tags = await tagsResponse.json()
            
            // 提取关键排序字段
            // ImagePositionPatient (0020,0032) - 图像在患者坐标系中的位置
            // SliceLocation (0020,1041) - 切片位置
            // InstanceNumber (0020,0013) - 实例编号（备用）
            const imagePositionPatient = tags['0020,0032'] || tags['ImagePositionPatient']
            const sliceLocation = tags['0020,1041'] || tags['SliceLocation']
            const instanceNumber = tags['0020,0013'] || tags['InstanceNumber']
            
            // 解析 ImagePositionPatient（格式通常是 "x\\y\\z"）
            let position = null
            if (imagePositionPatient && typeof imagePositionPatient === 'string') {
              const coords = imagePositionPatient.split('\\').map(Number)
              if (coords.length >= 3 && !coords.some(isNaN)) {
                position = coords
              }
            }
            
            return {
              instanceId,
              imageId: `wadouri:/instances/${instanceId}/file`,
              position,
              sliceLocation: sliceLocation ? Number(sliceLocation) : null,
              instanceNumber: instanceNumber ? Number(instanceNumber) : null,
            }
          } catch (err) {
            console.warn(`处理实例 ${instanceId} 时出错:`, err)
            return { instanceId, imageId: `wadouri:/instances/${instanceId}/file`, position: null, sliceLocation: null, instanceNumber: null }
          }
        })
      )

      // 按照空间位置排序
      instancesWithMetadata.sort((a, b) => {
        // 优先使用 ImagePositionPatient 的 Z 坐标（通常是轴向位置）
        if (a.position && b.position && a.position.length >= 3 && b.position.length >= 3) {
          // 对于轴向视图，使用 Z 坐标；对于矢状视图，使用 X 坐标；对于冠状视图，使用 Y 坐标
          // 通常轴向视图使用 Z 坐标排序
          const zDiff = a.position[2] - b.position[2]
          if (Math.abs(zDiff) > 0.001) {
            return zDiff
          }
        }
        
        // 如果没有 ImagePositionPatient，使用 SliceLocation
        if (a.sliceLocation !== null && b.sliceLocation !== null) {
          const sliceDiff = a.sliceLocation - b.sliceLocation
          if (Math.abs(sliceDiff) > 0.001) {
            return sliceDiff
          }
        }
        
        // 最后使用 InstanceNumber 作为备用排序
        if (a.instanceNumber !== null && b.instanceNumber !== null) {
          return a.instanceNumber - b.instanceNumber
        }
        
        // 如果都没有，保持原顺序
        return 0
      })

      // 提取排序后的 imageIds
      const imageIds = instancesWithMetadata.map(item => item.imageId)
      
      console.log(`已加载 ${imageIds.length} 个实例，已按空间位置排序`)
      
      return imageIds
    } catch (err) {
      console.error('获取实例失败:', err)
      throw err
    }
  }

  /**
   * 预加载指定系列的体积数据（后台加载，不阻塞当前视图）
   */
  async function preloadVolume(seriesInstanceUID) {
    try {
      // 如果已经缓存，跳过
      if (volumeCache[seriesInstanceUID]?.loaded) {
        console.log(`体积 ${seriesInstanceUID} 已经加载，跳过预加载`)
        return
      }

      console.log(`开始预加载体积: ${seriesInstanceUID}`)
      
      // 获取实例
      const imageIds = await fetchInstances(seriesInstanceUID)
      
      if (!imageIds || imageIds.length === 0) {
        console.warn(`预加载失败: 未找到系列 ${seriesInstanceUID} 的实例`)
        return
      }

      // 定义体积ID
      const volumeId = `cornerstoneStreamingImageVolume:volume-${seriesInstanceUID}`
      
      // 检查体积是否已经在缓存中
      let volume = cache.getVolume(volumeId)
      
      if (!volume) {
        // 创建新的体积加载器
        volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
        })
      }

      // 后台加载体积数据
      if (!volume.loadStatus || volume.loadStatus.loaded === false) {
        const loadPromise = volume.load()
        
        // 确保 load() 返回了 Promise
        if (loadPromise && typeof loadPromise.then === 'function') {
          loadPromise.then(() => {
            console.log(`体积 ${seriesInstanceUID} 预加载完成`)
            // 更新缓存状态为完全加载
            if (volumeCache[seriesInstanceUID]) {
              volumeCache[seriesInstanceUID].fullyLoaded = true
            }
          }).catch(err => {
            console.error(`预加载体积 ${seriesInstanceUID} 失败:`, err)
          })
        } else {
          console.warn(`体积 ${seriesInstanceUID} 的 load() 方法未返回 Promise，可能已加载`)
        }
      } else {
        console.log(`体积 ${seriesInstanceUID} 已加载，跳过`)
      }

      // 缓存体积信息
      volumeCache[seriesInstanceUID] = {
        volumeId,
        imageIds,
        loaded: true,
        fullyLoaded: false
      }

      console.log(`体积 ${seriesInstanceUID} 已启动后台加载`)
    } catch (err) {
      console.error(`预加载体积 ${seriesInstanceUID} 失败:`, err)
    }
  }

  /**
   * 加载体积数据到 viewports
   * @param {boolean} preserveCamera - 是否保留相机状态（默认false）
   */
  async function loadVolume(renderingEngineInstance, viewportIdsInstance, imageIds, seriesInstanceUID, preserveCamera = false) {
    try {
      // 定义体积ID
      const volumeId = `cornerstoneStreamingImageVolume:volume-${seriesInstanceUID}`
      
      // 保存当前相机状态（如果需要保留，或使用已保存的lastCameraState）
      let savedCameras = null
      if (preserveCamera) {
        if (currentVolumeId) {
          // 如果有当前体积，保存当前相机状态
          savedCameras = {}
          try {
            ['axial', 'sagittal', 'coronal'].forEach(viewName => {
              const vp = renderingEngineInstance.getViewport(viewportIdsInstance[viewName])
              if (vp) {
                savedCameras[viewName] = vp.getCamera()
              }
            })
            console.log('已保存当前相机状态用于切换')
          } catch (e) {
            console.warn('保存相机状态失败:', e)
            savedCameras = null
          }
        } else if (lastCameraState) {
          // 如果没有当前体积但有之前保存的状态，使用它
          savedCameras = lastCameraState
          console.log('使用之前保存的相机状态')
        }
      }
      
      // 如果之前有体积，先清理旧的体积
      if (currentVolumeId && currentVolumeId !== volumeId) {
        try {
          // 从缓存中移除旧体积
          const oldVolume = cache.getVolume(currentVolumeId)
          if (oldVolume) {
            cache.removeVolumeLoadObject(currentVolumeId)
          }
        } catch (e) {
          console.warn('清理旧体积时出错:', e)
        }
      }

      // 检查体积是否已经在缓存中
      let volume = cache.getVolume(volumeId)
      
      if (!volume) {
        // 创建新的体积加载器
        volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
        })
      }

      // 加载体积数据（如果还未加载）
      if (volume && (!volume.loadStatus || volume.loadStatus.loaded === false)) {
        const loadPromise = volume.load()
        if (loadPromise && typeof loadPromise.then === 'function') {
          await loadPromise
        }
      }

      // 验证体积数据已正确加载
      if (!volume || !volume.imageData) {
        console.error('体积数据未正确加载')
        throw new Error('体积数据加载失败')
      }

      // 缓存体积信息
      volumeCache[seriesInstanceUID] = {
        volumeId,
        imageIds,
        loaded: true,
        fullyLoaded: true
      }

      // 设置每个viewport显示体积
      const axialViewport = renderingEngineInstance.getViewport(viewportIdsInstance.axial)
      const sagittalViewport = renderingEngineInstance.getViewport(viewportIdsInstance.sagittal)
      const coronalViewport = renderingEngineInstance.getViewport(viewportIdsInstance.coronal)

      // 设置体积到各个viewport（setVolumes 是异步的，需要等待完成）
      // 传递 immediate: false 防止立即渲染，避免在 extent 未就绪时调用 resetCamera
      await Promise.all([
        axialViewport.setVolumes([{ volumeId }], false),
        sagittalViewport.setVolumes([{ volumeId }], false),
        coronalViewport.setVolumes([{ volumeId }], false)
      ])

      // 等待一小段时间，确保体积的 imageData 和 extent 已完全初始化
      await new Promise(resolve => setTimeout(resolve, 50))

      // 等待第一次渲染完成，确保体积数据已准备好
      await renderingEngineInstance.renderViewports([
        viewportIdsInstance.axial,
        viewportIdsInstance.sagittal,
        viewportIdsInstance.coronal
      ])

      // 再次延迟确保 VTK 内部状态（如 extent）已完全更新
      await new Promise(resolve => setTimeout(resolve, 50))

      // 更新当前体积ID
      currentVolumeId = volumeId

      // 如果需要恢复相机状态
      if (preserveCamera && savedCameras) {
        try {
          ['axial', 'sagittal', 'coronal'].forEach(viewName => {
            const vp = renderingEngineInstance.getViewport(viewportIdsInstance[viewName])
            const savedCamera = savedCameras[viewName]
            if (vp && savedCamera) {
              vp.setCamera(savedCamera)
            }
          })
          console.log('已恢复相机状态')
        } catch (e) {
          console.warn('恢复相机状态失败:', e)
        }
      }

      // 使用优化的渲染函数
      optimizedRender([viewportIdsInstance.axial, viewportIdsInstance.sagittal, viewportIdsInstance.coronal])
    } catch (err) {
      console.error('加载体积失败:', err)
      throw err
    }
  }

  /**
   * 处理标注添加事件
   */
  function onAnnotationAdded(evt) {
    const { annotation } = evt.detail;
    if (annotation.metadata.toolName === LengthTool.toolName || annotation.metadata.toolName === AngleTool.toolName) {
      measurementHistory.value.push(annotation.annotationUID);
      console.log('已添加测量记录:', annotation.annotationUID);
    }
  }

  /**
   * 处理标注移除事件
   */
  function onAnnotationRemoved(evt) {
    const { annotation } = evt.detail;
    const index = measurementHistory.value.indexOf(annotation.annotationUID);
    if (index > -1) {
      measurementHistory.value.splice(index, 1);
      console.log('已移除测量记录:', annotation.annotationUID);
    }
  }

  /**
   * 更新 Wave Image 位置和大小
   */
  function updateWaveImagePosition() {
    if (!isWaveImageVisible || !waveImageElement || !renderingEngine || !viewportIds) return;

    const viewport = renderingEngine.getViewport(viewportIds.axial);
    if (!viewport) return;

    const camera = viewport.getCamera();
    const focalPoint = camera.focalPoint;
    const canvasPos = viewport.worldToCanvas(focalPoint);

    waveImageElement.style.left = `${canvasPos[0]}px`;
    waveImageElement.style.top = `${canvasPos[1]}px`;

    // 计算并设置图片大小
    // 图片实际物理尺寸为 26mm
    const physicalSize = 26; // mm
      
    // 计算像素比例
    // parallelScale 是视口高度的一半（世界单位）
    const parallelScale = camera.parallelScale;
    const canvasHeight = viewport.element.clientHeight;
      
    if (parallelScale && canvasHeight) {
      // 1 mm 对应的像素数
      const pixelsPerMm = canvasHeight / (2 * parallelScale);
      const sizeInPixels = physicalSize * pixelsPerMm;
      
      waveImageElement.style.width = `${sizeInPixels}px`;
      waveImageElement.style.height = `${sizeInPixels}px`;
      waveImageElement.style.objectFit = 'contain';
    }
  }

  /**
   * 更新 Wave Image 透明度 (使用 rAF 节流优化)
   */
  const updateWaveOpacity = rafThrottle((opacity) => {
    waveOpacity = opacity;
    if (waveImageElement) {
      waveImageElement.style.opacity = waveOpacity;
    }
  });

  /**
   * 更新 Wave Image 旋转角度 (使用 rAF 节流优化)
   */
  const updateWaveRotation = rafThrottle((rotation) => {
    waveRotation = rotation;
    if (waveImageElement) {
      // 保持居中并旋转
      waveImageElement.style.transform = `translate(-50%, -50%) rotate(${waveRotation}deg)`;
    }
  });

  /**
   * 切换 Wave Image 显示
   */
  function toggleWaveImage() {
    if (!axialContainer) {
      console.warn('Axial container not initialized');
      return;
    }

    isWaveImageVisible = !isWaveImageVisible;

    if (isWaveImageVisible) {
      if (!waveImageElement) {
        waveImageElement = document.createElement('img');
        // 使用 import.meta.env.BASE_URL 来获取 base 路径，确保在设置了 base: '/halt/' 后也能正确访问
        const baseURL = import.meta.env.BASE_URL || '/';
        waveImageElement.src = `${baseURL}wave.png`.replace(/\/\//g, '/'); // 处理可能的双斜杠
        waveImageElement.style.position = 'absolute';
        waveImageElement.style.pointerEvents = 'none';
        waveImageElement.style.transform = `translate(-50%, -50%) rotate(${waveRotation}deg)`;
        waveImageElement.style.zIndex = '100';
        waveImageElement.style.opacity = waveOpacity;
        // 设置旋转中心为图片中心
        waveImageElement.style.transformOrigin = 'center center';
      }
      axialContainer.appendChild(waveImageElement);
      
      // 初始位置更新
      updateWaveImagePosition();

      // 添加事件监听
      axialContainer.addEventListener(Enums.Events.CAMERA_MODIFIED, updateWaveImagePosition);
    } else {
      if (waveImageElement && waveImageElement.parentNode) {
        waveImageElement.parentNode.removeChild(waveImageElement);
      }
      // 移除事件监听
      axialContainer.removeEventListener(Enums.Events.CAMERA_MODIFIED, updateWaveImagePosition);
    }
  }

  /**
   * 初始化 Cornerstone 和加载体积数据
   */
  async function initialize(axialElement, sagittalElement, coronalElement) {
    try {
      // 保存 axialElement 引用
      axialContainer = axialElement;

      // 初始化 Cornerstone
      await cornerstoneInit()
      await cornerstoneToolsInit()
      
      // 添加事件监听
      eventTarget.addEventListener(ToolsEnums.Events.ANNOTATION_ADDED, onAnnotationAdded);
      eventTarget.addEventListener(ToolsEnums.Events.ANNOTATION_REMOVED, onAnnotationRemoved);
      
      // 配置 DICOM 图像加载器
      // 设置 cornerstone 实例 - 这是必需的！
      cornerstoneDICOMImageLoader.external.cornerstone = cornerstone
      // 设置 dicomParser - 这也是必需的！
      cornerstoneDICOMImageLoader.external.dicomParser = dicomParser
      
      // 初始化 Web Worker 管理器
      const config = {
        maxWebWorkers: navigator.hardwareConcurrency || 4,
        startWebWorkersOnDemand: true,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: false,
            usePDFJS: false,
            strict: false,
          },
        },
      }
      
      if (cornerstoneDICOMImageLoader.webWorkerManager) {
        cornerstoneDICOMImageLoader.webWorkerManager.initialize(config)
      }
      
      // 注册 DICOM 图像加载器
      // 使用 register 方法自动注册所有加载器
      if (cornerstoneDICOMImageLoader.register) {
        cornerstoneDICOMImageLoader.register(imageLoader)
      } else {
        // 如果没有 register 方法，手动注册 wadouri 加载器
        if (cornerstoneDICOMImageLoader.wadouri && cornerstoneDICOMImageLoader.wadouri.loadImage) {
          imageLoader.registerImageLoader('wadouri', cornerstoneDICOMImageLoader.wadouri.loadImage)
        } else if (cornerstoneDICOMImageLoader.loadImage) {
          imageLoader.registerImageLoader('wadouri', cornerstoneDICOMImageLoader.loadImage)
        }
      }
      
      // 注册体积加载器
      volumeLoader.registerVolumeLoader('cornerstoneStreamingImageVolume', cornerstoneStreamingImageVolumeLoader)

      // 创建或获取渲染引擎
      if (!renderingEngine) {
        renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
      } else {
        renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
      }

      // 创建或获取工具组
      let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      const isNewToolGroup = !toolGroup;
      if (!toolGroup) {
        toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
      }

      // 添加工具（只在工具组新创建时添加）
      if (isNewToolGroup) {
        // 添加 Crosshairs 工具
        addTool(CrosshairsTool)
        toolGroup.addTool(CrosshairsTool.toolName, {
          getReferenceLineColor: (viewportId) => {
            if (viewportId.includes('axial')) return 'rgb(255, 0, 0)';      // 红色
            if (viewportId.includes('sagittal')) return 'rgb(255, 255, 0)'; // 黄色
            if (viewportId.includes('coronal')) return 'rgb(0, 0, 255)';   // 蓝色
            return 'rgb(200, 200, 200)'; // 默认灰色
          }
        });
        // 默认将十字架设置为激活状态（可以移动）
        toolGroup.setToolActive(CrosshairsTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
        })

        // 添加长度测量工具
        addTool(LengthTool)
        toolGroup.addTool(LengthTool.toolName)
        // 默认将 LengthTool 设置为被动状态（不激活）
        toolGroup.setToolPassive(LengthTool.toolName)

        // 添加角度测量工具
        addTool(AngleTool)
        toolGroup.addTool(AngleTool.toolName)
        // 默认将 AngleTool 设置为被动状态（不激活）
        toolGroup.setToolPassive(AngleTool.toolName)

        // 添加自定义方向标记工具（使用Human.stl模型显示解剖方向）
        addTool(CustomOrientationMarkerTool)
        toolGroup.addTool(CustomOrientationMarkerTool.toolName)
        // 启用方向标记工具，但不需要交互
        toolGroup.setToolEnabled(CustomOrientationMarkerTool.toolName)

        // 添加其他必要的工具
        const { PanTool, WindowLevelTool, ZoomTool, StackScrollMouseWheelTool } = await import('@cornerstonejs/tools')
        addTool(PanTool)
        addTool(WindowLevelTool)
        addTool(ZoomTool)
        addTool(StackScrollMouseWheelTool)

        toolGroup.addTool(PanTool.toolName)
        toolGroup.addTool(WindowLevelTool.toolName)
        toolGroup.addTool(ZoomTool.toolName)
        toolGroup.addTool(StackScrollMouseWheelTool.toolName)

        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
        })
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
        })
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary, modifierKey: ToolsEnums.KeyboardBindings.Shift }],
        })
        toolGroup.setToolActive(StackScrollMouseWheelTool.toolName, {
          bindings: [],
        })
        
        // 优化工具性能配置
        try {
          // 为工具设置优化选项，减少不必要的重绘
          const toolInstances = [
            toolGroup.getToolInstance(CrosshairsTool.toolName),
            toolGroup.getToolInstance(PanTool.toolName),
            toolGroup.getToolInstance(ZoomTool.toolName),
            toolGroup.getToolInstance(WindowLevelTool.toolName),
            toolGroup.getToolInstance(LengthTool.toolName),
            toolGroup.getToolInstance(AngleTool.toolName),
            toolGroup.getToolInstance(CustomOrientationMarkerTool.toolName),
          ].filter(Boolean);
          
          // 注意：Cornerstone工具通常自带优化，这里主要确保配置正确
          console.log(`已配置 ${toolInstances.length} 个工具的优化选项`);
        } catch (e) {
          console.warn('配置工具优化选项时出错:', e);
        }
      }

      // 获取系列中的所有实例
      const imageIds = await fetchInstances(props.seriesInstanceUID)
      
      if (!imageIds || imageIds.length === 0) {
        throw new Error('未找到DICOM实例')
      }

      // 创建 viewport IDs（如果不存在）
      if (!viewportIds) {
        viewportIds = {
          axial: 'axial-viewport',
          sagittal: 'sagittal-viewport',
          coronal: 'coronal-viewport',
        }
      }

      // 创建 Volume Viewports（用于多平面重建）
      const viewportInputArray = [
        {
          viewportId: viewportIds.axial,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          element: axialElement,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
            background: [0, 0, 0],
          },
        },
        {
          viewportId: viewportIds.sagittal,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          element: sagittalElement,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
            background: [0, 0, 0],
          },
        },
        {
          viewportId: viewportIds.coronal,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          element: coronalElement,
          defaultOptions: {
            orientation: Enums.OrientationAxis.CORONAL,
            background: [0, 0, 0],
          },
        },
      ]

      renderingEngine.setViewports(viewportInputArray)

      // 优化渲染引擎性能设置
      try {
        // 设置渲染引擎的帧率限制，避免过度渲染
        if (renderingEngine.setOptions) {
          renderingEngine.setOptions({
            suppressEvents: false,
            useNorm16Texture: true, // 使用16位纹理以提高性能
          })
        }
        
        // 为每个viewport设置优化选项
        const viewportOptimizations = {
          suppressEvents: false,
          invert: false,
        }
        
        Object.values(viewportIds).forEach(vpId => {
          try {
            const vp = renderingEngine.getViewport(vpId)
            if (vp && vp.setOptions) {
              vp.setOptions(viewportOptimizations)
            }
          } catch (e) {
            console.warn(`设置viewport ${vpId} 优化选项失败:`, e)
          }
        })
      } catch (e) {
        console.warn('设置渲染优化选项失败:', e)
      }

      // 将 viewports 添加到工具组
      try {
        toolGroup.addViewport(viewportIds.axial, RENDERING_ENGINE_ID);
        toolGroup.addViewport(viewportIds.sagittal, RENDERING_ENGINE_ID);
        toolGroup.addViewport(viewportIds.coronal, RENDERING_ENGINE_ID);
      } catch (e) {
        // viewport 可能已经添加，忽略错误
        console.warn('添加 viewport 到工具组时出错（可能已存在）:', e);
      }

      // 加载体积数据
      await loadVolume(renderingEngine, viewportIds, imageIds, props.seriesInstanceUID)

      // 保存初始MPR位置
      saveInitialPositions()
      
      // 保存初始相机状态
      saveCurrentCameraState()
      
      // 添加相机变化监听，自动保存状态
      setupCameraChangeListener()

      loading.value = false

      // 预加载其他期相的数据（后台进行，不阻塞当前操作）
      if (allSeriesUIDs) {
        setTimeout(() => {
          Object.values(allSeriesUIDs).forEach(seriesUID => {
            if (seriesUID && seriesUID !== props.seriesInstanceUID) {
              preloadVolume(seriesUID).catch(err => {
                console.warn(`预加载系列 ${seriesUID} 失败:`, err)
              })
            }
          })
        }, 1000) // 延迟1秒，确保主视图已完全加载
      }
    } catch (err) {
      console.error('初始化错误:', err)
      error.value = err.message || '初始化失败'
      loading.value = false
      throw err
    }
  }

  /**
   * 切换体积（用于期相切换等场景）
   */
  async function switchVolume(newSeriesInstanceUID) {
    try {
      if (!renderingEngine || !viewportIds) {
        console.warn('渲染引擎或viewport未初始化，无法切换体积')
        return
      }

      // 切换前先保存当前相机状态
      saveCurrentCameraState()

      loading.value = true
      error.value = null

      // 检查是否已有缓存
      let imageIds
      if (volumeCache[newSeriesInstanceUID]?.imageIds) {
        console.log(`使用缓存的体积数据: ${newSeriesInstanceUID}`)
        imageIds = volumeCache[newSeriesInstanceUID].imageIds
      } else {
        // 获取新系列的实例
        imageIds = await fetchInstances(newSeriesInstanceUID)
        
        if (!imageIds || imageIds.length === 0) {
          throw new Error('未找到DICOM实例')
        }
      }

      // 检查是否有平面定位状态需要保持
      const shouldRestorePlane = savedPlaneState !== null
      
      // 加载新体积，始终保留相机状态
      await loadVolume(renderingEngine, viewportIds, imageIds, newSeriesInstanceUID, true)

      // 如果有保存的平面状态，需要恢复平面（重新应用平面变换）
      if (shouldRestorePlane && savedPlaneState) {
        try {
          console.log('正在恢复平面状态到新期相...')
          // 延迟一点，确保体积已完全加载
          await new Promise(resolve => setTimeout(resolve, 100))
          await applyPlanePosition(savedPlaneState.less_points)
          
          // 重新绘制平面几何，传递保存的模块类型
          const moduleType = savedPlaneState.moduleType || 'geometric';
          drawPlaneGeometry({
            less_points: savedPlaneState.less_points,
            max_dist_pair: savedPlaneState.max_dist_pair,
            min_dist_pair: savedPlaneState.min_dist_pair
          }, moduleType);
          
          // 如果是 geometric 模块且绘制了几何图形，重新设置监听器
          if (moduleType === 'geometric' && planeGeometryVisible) {
            setupPlaneGeometryCameraListener();
          }
          
          console.log('平面状态和几何图形已恢复到新期相')
        } catch (err) {
          console.error('恢复平面状态失败:', err)
        }
      }

      loading.value = false
    } catch (err) {
      console.error('切换体积失败:', err)
      error.value = err.message || '切换体积失败'
      loading.value = false
      throw err
    }
  }

  /**
   * 清理资源
   */
  function cleanup() {
    try {
      // 移除事件监听
      eventTarget.removeEventListener(ToolsEnums.Events.ANNOTATION_ADDED, onAnnotationAdded);
      eventTarget.removeEventListener(ToolsEnums.Events.ANNOTATION_REMOVED, onAnnotationRemoved);
      measurementHistory.value = [];

      // 移除相机变化监听器
      removePlaneGeometryCameraListener();
      
      // 移除自定义曲线的相机监听器
      removeCustomCurveCameraListeners();

      const viewportIds = {
        axial: 'axial-viewport',
        sagittal: 'sagittal-viewport',
        coronal: 'coronal-viewport',
      }
      
      // 从工具组中移除 viewport
      try {
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (toolGroup) {
          toolGroup.removeViewports(RENDERING_ENGINE_ID, [
            viewportIds.axial,
            viewportIds.sagittal,
            viewportIds.coronal,
          ]);
        }
      } catch (e) {
        // 工具组可能不存在，忽略错误
      }
      
      // 销毁渲染引擎
      try {
        const renderingEngineInstance = getRenderingEngine(RENDERING_ENGINE_ID);
        if (renderingEngineInstance) {
          renderingEngineInstance.destroy();
        }
      } catch (e) {
        // 渲染引擎可能已经销毁，忽略错误
      }
      
      // 销毁工具组
      try {
        ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
      } catch (e) {
        // 工具组可能已经销毁，忽略错误
      }
      
      // 清理缓存
      cache.purgeCache()
      
      // 清除平面标注
      clearPlaneAnnotations();
      
      // 重置状态
      renderingEngine = null
      viewportIds = null
      currentVolumeId = null
      savedPlaneState = null
      currentAnalysisType = null
      // 清空体积缓存
      Object.keys(volumeCache).forEach(key => delete volumeCache[key])
    } catch (err) {
      console.error('清理资源失败:', err)
    }
  }

  /**
   * 保存初始MPR位置
   */
  function saveInitialPositions() {
    if (!renderingEngine || !viewportIds) return;

    initialCameraPositions = {};
    ['axial', 'sagittal', 'coronal'].forEach(viewName => {
      try {
        const viewport = renderingEngine.getViewport(viewportIds[viewName]);
        if (viewport) {
          initialCameraPositions[viewName] = viewport.getCamera();
        }
      } catch (e) {
        console.warn(`保存${viewName}初始位置失败:`, e);
      }
    });
    console.log('已保存初始MPR位置');
  }

  /**
   * 恢复到初始MPR位置
   */
  function restoreMPR() {
    if (!renderingEngine || !viewportIds) {
      console.error('无法恢复MPR: 渲染引擎未初始化');
      return;
    }

    try {
      // 清除保存的平面状态
      savedPlaneState = null;
      currentAnalysisType = null;
      
      // 移除相机变化监听器
      removePlaneGeometryCameraListener();
      
      // 重置所有viewport的相机到默认状态
      Object.keys(viewportIds).forEach(viewName => {
        const viewport = renderingEngine.getViewport(viewportIds[viewName]);
        if (viewport) {
          const resetPan = true;
          const resetZoom = true;
          const resetToCenter = true;
          const resetRotation = true;
          viewport.resetCamera({
            resetPan,
            resetZoom,
            resetToCenter,
            resetRotation,
          });
        }
      });
      
      optimizedRender([
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal,
      ]);
      
      // 清除平面标注
      clearPlaneAnnotations();
      
      console.log('已重置MPR相机到默认状态，并清除平面状态');
    } catch (err) {
      console.error('重置MPR相机失败:', err);
    }
  }

  /**
   * 清除平面标注
   */
  function clearPlaneAnnotations() {
    if (planeAnnotationsUIDs.length === 0 && diameterAnnotationsUIDs.length === 0 && curveAnnotationsUIDs.length === 0 && customSVGElements.length === 0) return;
    
    try {
      const annotationState = annotation.state;
      
      // 清除所有平面标注（包括曲线）
      planeAnnotationsUIDs.forEach(uid => {
        try {
          annotationState.removeAnnotation(uid);
        } catch (err) {
          console.warn('移除annotation失败:', uid, err);
        }
      });
      planeAnnotationsUIDs = [];
      
      // 清除直径标注
      diameterAnnotationsUIDs.forEach(uid => {
        try {
          annotationState.removeAnnotation(uid);
        } catch (err) {
          console.warn('移除直径annotation失败:', uid, err);
        }
      });
      diameterAnnotationsUIDs = [];
      
      // 清除曲线标注（现在是空的，因为不再使用annotation）
      curveAnnotationsUIDs = [];
      
      // 清除自定义绘制的SVG元素
      customSVGElements.forEach(element => {
        try {
          if (element && element.parentNode) {
            element.parentNode.removeChild(element);
          }
        } catch (err) {
          console.warn('移除SVG元素失败:', err);
        }
      });
      customSVGElements = [];
      
      // 清除自定义曲线数据
      customCurveData = {};
      
      // 移除自定义曲线的相机监听器
      removeCustomCurveCameraListeners();
      
      // 重置可见标志
      planeGeometryVisible = false;
      
      console.log('已清除平面标注');
      
      // 刷新所有视图
      if (renderingEngine && viewportIds) {
        renderingEngine.renderViewports([
          viewportIds.axial,
          viewportIds.sagittal,
          viewportIds.coronal
        ]);
      }
    } catch (err) {
      console.error('清除平面标注失败:', err);
    }
  }
  
  /**
   * 清除直径标注（最长径和最短径）
   */
  function clearDiameterAnnotations() {
    if (diameterAnnotationsUIDs.length === 0) return;
    
    try {
      const annotationState = annotation.state;
      diameterAnnotationsUIDs.forEach(uid => {
        try {
          annotationState.removeAnnotation(uid);
        } catch (err) {
          console.warn('移除直径annotation失败:', uid, err);
        }
      });
      diameterAnnotationsUIDs = [];
      console.log('已清除直径标注');
      
      // 刷新所有视图
      if (renderingEngine && viewportIds) {
        renderingEngine.renderViewports([
          viewportIds.axial,
          viewportIds.sagittal,
          viewportIds.coronal
        ]);
      }
    } catch (err) {
      console.error('清除直径标注失败:', err);
    }
  }

  /**
   * 设置crosshair位置变化监听器
   * 当crosshair位置变化时，隐藏平面几何图形
   */
  function setupPlaneGeometryCameraListener() {
    if (!renderingEngine || !viewportIds) return;
    
    // 如果已有监听器，先移除
    removePlaneGeometryCameraListener();
    
    // 初始化位置记录（记录当前crosshair位置作为起始位置）
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (toolGroup) {
        const crosshairsTool = toolGroup.getToolInstance(CrosshairsTool.toolName);
        if (crosshairsTool && crosshairsTool.toolCenter) {
          lastCrosshairPosition = [...crosshairsTool.toolCenter];
        } else {
          lastCrosshairPosition = null;
        }
      } else {
        lastCrosshairPosition = null;
      }
    } catch (e) {
      console.warn('初始化crosshair位置失败:', e);
      lastCrosshairPosition = null;
    }
    
    // 创建crosshair位置检查函数（使用requestAnimationFrame轮询）
    let rafId = null;
    const CHECK_INTERVAL = 100; // 100ms检查一次
    let lastCheckTime = 0;
    
    const checkCrosshairPosition = (timestamp) => {
      // 如果几何图形已不可见，停止监听
      if (!planeGeometryVisible) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        return;
      }
      
      // 节流：只在达到检查间隔时才执行
      if (timestamp - lastCheckTime >= CHECK_INTERVAL) {
        try {
          const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
          if (toolGroup) {
            const crosshairsTool = toolGroup.getToolInstance(CrosshairsTool.toolName);
            if (crosshairsTool && crosshairsTool.toolCenter) {
              const currentPosition = crosshairsTool.toolCenter;
              
              // 检查位置是否改变（使用阈值避免微小变化触发）
              if (lastCrosshairPosition && (
                  Math.abs(currentPosition[0] - lastCrosshairPosition[0]) > 0.5 ||
                  Math.abs(currentPosition[1] - lastCrosshairPosition[1]) > 0.5 ||
                  Math.abs(currentPosition[2] - lastCrosshairPosition[2]) > 0.5)) {
                
                // 位置改变了，清除平面几何图形
                console.log('检测到crosshair位置变化，隐藏平面几何图形');
                clearPlaneAnnotations();
                lastCrosshairPosition = null; // 重置
                
                // 停止监听
                if (rafId) {
                  cancelAnimationFrame(rafId);
                  rafId = null;
                }
                return;
              }
            }
          }
        } catch (e) {
          console.warn('检查crosshair位置失败:', e);
        }
        
        lastCheckTime = timestamp;
      }
      
      // 继续下一帧
      rafId = requestAnimationFrame(checkCrosshairPosition);
    };
    
    // 启动监听
    rafId = requestAnimationFrame(checkCrosshairPosition);
    crosshairPositionChangeHandler = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    
    console.log('已设置crosshair位置变化监听');
  }

  /**
   * 移除crosshair位置变化监听器
   */
  function removePlaneGeometryCameraListener() {
    if (crosshairPositionChangeHandler) {
      crosshairPositionChangeHandler();
      crosshairPositionChangeHandler = null;
    }
    lastCrosshairPosition = null;
    console.log('已移除crosshair位置变化监听器');
  }

  /**
   * 在 SVG 上直接绘制闭合曲线
   */
  function drawClosedCurveOnSVG(viewport, points, uid, style) {
    try {
      // 获取 viewport 的 SVG 容器
      const svgLayer = viewport.element.querySelector('svg');
      if (!svgLayer) {
        console.warn('未找到 SVG layer');
        return;
      }
      
      // 将世界坐标转换为画布坐标
      const canvasPoints = points.map(point => {
        const canvasPos = viewport.worldToCanvas(point);
        return canvasPos;
      });
      
      // 创建 SVG polyline 元素（闭合曲线）
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      
      // 构建 points 属性值（添加第一个点到末尾形成闭合曲线）
      const pointsStr = [...canvasPoints, canvasPoints[0]].map(p => `${p[0]},${p[1]}`).join(' ');
      polyline.setAttribute('points', pointsStr);
      
      // 设置样式
      polyline.setAttribute('stroke', style.color);
      polyline.setAttribute('stroke-width', style.lineWidth);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke-linecap', 'round');
      polyline.setAttribute('stroke-linejoin', 'round');
      
      if (style.lineDash) {
        polyline.setAttribute('stroke-dasharray', style.lineDash);
      }
      
      // 添加自定义属性用于标识
      polyline.setAttribute('data-custom-curve', uid);
      polyline.setAttribute('data-curve-type', 'closed');
      
      // 添加到 SVG
      svgLayer.appendChild(polyline);
      
      // 保存引用和世界坐标数据
      customSVGElements.push(polyline);
      
      // 保存世界坐标数据，用于缩放时重绘
      const viewportId = viewport.id;
      if (!customCurveData[viewportId]) {
        customCurveData[viewportId] = [];
      }
      customCurveData[viewportId].push({
        points: points, // 世界坐标
        uid: uid,
        style: style,
        polyline: polyline
      });
      
      console.log(`已在SVG上绘制闭合曲线: ${uid}，点数: ${points.length}`);
    } catch (err) {
      console.error('绘制闭合曲线失败:', err);
    }
  }
  
  /**
   * 更新自定义曲线的画布坐标（当相机变化时调用）
   */
  function updateCustomCurvesOnViewport(viewport) {
    try {
      const viewportId = viewport.id;
      const curves = customCurveData[viewportId];
      
      if (!curves || curves.length === 0) {
        return;
      }
      
      curves.forEach(curveData => {
        const { points, polyline } = curveData;
        
        // 重新将世界坐标转换为画布坐标
        const canvasPoints = points.map(point => {
          const canvasPos = viewport.worldToCanvas(point);
          return canvasPos;
        });
        
        // 更新 polyline 的 points 属性
        const pointsStr = [...canvasPoints, canvasPoints[0]].map(p => `${p[0]},${p[1]}`).join(' ');
        polyline.setAttribute('points', pointsStr);
      });
    } catch (err) {
      console.warn('更新自定义曲线失败:', err);
    }
  }
  
  /**
   * 设置自定义曲线的相机监听器
   */
  function setupCustomCurveCameraListeners() {
    if (!renderingEngine || !viewportIds) return;
    
    // 先移除旧的监听器
    removeCustomCurveCameraListeners();
    
    try {
      ['axial', 'sagittal', 'coronal'].forEach(viewName => {
        const viewport = renderingEngine.getViewport(viewportIds[viewName]);
        if (!viewport || !viewport.element) return;
        
        // 使用节流的相机变化处理函数
        const handleCameraModified = rafThrottle(() => {
          updateCustomCurvesOnViewport(viewport);
        });
        
        // 监听相机变化事件
        viewport.element.addEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
        
        // 保存监听器引用以便清理
        cameraModifiedListenersForCurves.push({
          element: viewport.element,
          handler: handleCameraModified
        });
      });
      
      console.log('已设置自定义曲线的相机监听器');
    } catch (err) {
      console.error('设置自定义曲线相机监听器失败:', err);
    }
  }
  
  /**
   * 移除自定义曲线的相机监听器
   */
  function removeCustomCurveCameraListeners() {
    cameraModifiedListenersForCurves.forEach(({ element, handler }) => {
      try {
        element.removeEventListener(Enums.Events.CAMERA_MODIFIED, handler);
      } catch (err) {
        console.warn('移除相机监听器失败:', err);
      }
    });
    cameraModifiedListenersForCurves = [];
    console.log('已移除自定义曲线的相机监听器');
  }

  /**
   * 在图像上绘制平面几何（less_points曲线、最长径、最短径）
   * 只在支架几何形态评估模块（geometric）显示
   */
  function drawPlaneGeometry(planeData, moduleType = 'geometric') {
    if (!renderingEngine || !viewportIds) {
      console.error('渲染引擎未初始化');
      return;
    }

    // 只在支架几何形态评估模块显示
    if (moduleType !== 'geometric') {
      console.log('非支架几何形态评估模块，跳过绘制平面几何');
      return;
    }

    // 先清除之前的标注
    clearPlaneAnnotations();

    const { less_points, max_dist_pair, min_dist_pair } = planeData;
    
    if (!less_points || !Array.isArray(less_points) || less_points.length === 0) {
      console.warn('less_points数据无效');
      return;
    }

    try {
      // 在所有三个视图中绘制
      const viewportIdsArray = [viewportIds.axial, viewportIds.sagittal, viewportIds.coronal];
      
      viewportIdsArray.forEach(viewportId => {
        const viewport = renderingEngine.getViewport(viewportId);
        if (!viewport) return;
        
        const camera = viewport.getCamera();
        const viewPlaneNormal = camera.viewPlaneNormal || [0, 0, -1];
        const viewUp = camera.viewUp || [0, -1, 0];
        
        // 1. 绘制less_points组成的闭合曲线 - 红色
        console.log(`在视图 ${viewportId} 绘制less_points闭合曲线，点数:`, less_points.length);
        
        // 直接在 SVG 上绘制闭合曲线，不使用 LengthTool
        const curveUID = `plane_curve_${viewportId}_${Date.now()}`;
        drawClosedCurveOnSVG(viewport, less_points, curveUID, {
          color: 'rgb(255, 0, 0)', // 红色
          lineWidth: 2,
          lineDash: ''
        });
        
        curveAnnotationsUIDs.push(curveUID);

        // 2. 绘制最长径 - 黄色虚线
        if (max_dist_pair && Array.isArray(max_dist_pair) && max_dist_pair.length === 2) {
          console.log(`在视图 ${viewportId} 绘制最长径`);
          const annotationUID = `plane_max_diameter_${viewportId}_${Date.now()}`;
          
          const newAnnotation = {
            annotationUID,
            highlighted: false,
            invalidated: false,
            metadata: {
              viewPlaneNormal: [...viewPlaneNormal],
              viewUp: [...viewUp],
              FrameOfReferenceUID: viewport.getFrameOfReferenceUID?.() || '',
              referencedImageId: '',
              toolName: 'Length',
            },
            data: {
              handles: {
                points: [[...max_dist_pair[0]], [...max_dist_pair[1]]],
                activeHandleIndex: null,
                textBox: {
                  hasMoved: false,
                  worldPosition: [0, 0, 0],
                  worldBoundingBox: {
                    topLeft: [0, 0, 0],
                    topRight: [0, 0, 0],
                    bottomLeft: [0, 0, 0],
                    bottomRight: [0, 0, 0],
                  }
                }
              },
              label: '', // 不显示标签
              cachedStats: {}
            },
            isLocked: true,
            isVisible: true,
            // 自定义样式（存储在顶层，用于后续处理）
            customStyle: {
              color: 'rgb(255, 255, 0)', // 黄色
              lineWidth: 2,
              lineDash: '4,4' // 虚线
            }
          };
          
          annotation.state.addAnnotation(newAnnotation, viewportId);
          planeAnnotationsUIDs.push(annotationUID);
          diameterAnnotationsUIDs.push(annotationUID);
        }

        // 3. 绘制最短径 - 黄色虚线
        if (min_dist_pair && Array.isArray(min_dist_pair) && min_dist_pair.length === 2) {
          console.log(`在视图 ${viewportId} 绘制最短径`);
          const annotationUID = `plane_min_diameter_${viewportId}_${Date.now()}`;
          
          const newAnnotation = {
            annotationUID,
            highlighted: false,
            invalidated: false,
            metadata: {
              viewPlaneNormal: [...viewPlaneNormal],
              viewUp: [...viewUp],
              FrameOfReferenceUID: viewport.getFrameOfReferenceUID?.() || '',
              referencedImageId: '',
              toolName: 'Length',
            },
            data: {
              handles: {
                points: [[...min_dist_pair[0]], [...min_dist_pair[1]]],
                activeHandleIndex: null,
                textBox: {
                  hasMoved: false,
                  worldPosition: [0, 0, 0],
                  worldBoundingBox: {
                    topLeft: [0, 0, 0],
                    topRight: [0, 0, 0],
                    bottomLeft: [0, 0, 0],
                    bottomRight: [0, 0, 0],
                  }
                }
              },
              label: '', // 不显示标签
              cachedStats: {}
            },
            isLocked: true,
            isVisible: true,
            // 自定义样式（存储在顶层，用于后续处理）
            customStyle: {
              color: 'rgb(255, 255, 0)', // 黄色
              lineWidth: 2,
              lineDash: '4,4' // 虚线
            }
          };
          
          annotation.state.addAnnotation(newAnnotation, viewportId);
          planeAnnotationsUIDs.push(annotationUID);
          diameterAnnotationsUIDs.push(annotationUID);
        }
      });

      console.log(`绘制完成，共创建 ${planeAnnotationsUIDs.length} 个标注`);
      
      // 标记几何图形可见
      planeGeometryVisible = true;
      
      // 设置自定义曲线的相机监听器（用于在缩放时更新曲线位置）
      setupCustomCurveCameraListeners();
      
      // 刷新所有视图
      renderingEngine.renderViewports([
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal
      ]);
      
      // 延迟应用自定义样式（等待 SVG 渲染完成）
      // 多次尝试应用样式，因为SVG可能延迟渲染
      setTimeout(() => {
        applyCustomStylesToAnnotations();
      }, 100);
      setTimeout(() => {
        applyCustomStylesToAnnotations();
      }, 300);
      setTimeout(() => {
        applyCustomStylesToAnnotations();
      }, 500);
      
    } catch (err) {
      console.error('绘制平面几何失败:', err);
    }
  }

  /**
   * 应用自定义样式到 annotations 的 SVG 元素
   */
  function applyCustomStylesToAnnotations() {
    if (!renderingEngine || !viewportIds) return;
    
    try {
      ['axial', 'sagittal', 'coronal'].forEach(viewName => {
        try {
          const viewport = renderingEngine.getViewport(viewportIds[viewName]);
          if (!viewport || !viewport.element) return;
          
          // 获取 SVG layer
          const svgLayer = viewport.element.querySelector('.cornerstone-canvas-wrapper svg, .viewport-element svg, svg');
          if (!svgLayer) {
            console.warn(`未找到 ${viewName} 的 SVG layer`);
            return;
          }
          
          // 遍历所有自定义样式的 annotations
          [...curveAnnotationsUIDs, ...diameterAnnotationsUIDs].forEach(annotationUID => {
            try {
              // 获取 annotation 对象
              const ann = annotation.state.getAnnotation(annotationUID);
              if (!ann || !ann.customStyle) return;
              
              // 查找对应的 SVG 元素（通过 data-annotation-uid 或其他属性）
              const svgElements = svgLayer.querySelectorAll(`[data-uid="${annotationUID}"], g[data-tool="Length"]`);
              if (svgElements.length === 0) return;
              
              // 应用自定义样式
              svgElements.forEach(svgElement => {
                // 查找 line 或 path 元素
                const lines = svgElement.querySelectorAll('line, path, polyline');
                lines.forEach(line => {
                  if (ann.customStyle.color) {
                    line.setAttribute('stroke', ann.customStyle.color);
                  }
                  if (ann.customStyle.lineWidth) {
                    line.setAttribute('stroke-width', ann.customStyle.lineWidth);
                  }
                  if (ann.customStyle.lineDash) {
                    line.setAttribute('stroke-dasharray', ann.customStyle.lineDash);
                  }
                });
                
                // 隐藏文本标签和距离标注（如果有）
                const texts = svgElement.querySelectorAll('text, .annotation-text, .distance-label');
                texts.forEach(text => {
                  text.style.display = 'none';
                  text.style.visibility = 'hidden';
                  text.setAttribute('display', 'none');
                });
                
                // 也隐藏可能的标注容器
                const labelContainers = svgElement.querySelectorAll('.annotation-label, .measurement-label, [class*="label"]');
                labelContainers.forEach(container => {
                  container.style.display = 'none';
                  container.style.visibility = 'hidden';
                });
              });
            } catch (e) {
              console.warn(`应用样式到 annotation ${annotationUID} 失败:`, e);
            }
          });
        } catch (e) {
          console.warn(`处理 ${viewName} 视图的样式失败:`, e);
        }
      });
    } catch (err) {
      console.error('应用自定义样式失败:', err);
    }
  }

  /**
   * 根据分析类型定位到特定平面
   * @param {string} analysisType - 分析类型（inflow、nadir、commissure等）
   * @param {string} moduleType - 模块类型（默认为 geometric）
   */
  async function locatePlane(analysisType, moduleType = null) {
    if (!renderingEngine || !viewportIds) {
      console.error('渲染引擎未初始化');
      return;
    }

    // 确定模块类型（优先使用参数，其次使用 props.currentModule）
    const actualModuleType = moduleType || props.currentModule || 'geometric';
    
    try {
      // 保存当前分析类型
      currentAnalysisType = analysisType;
      
      // 读取收缩期与舒张期两个 measurement.json（优先使用与当前期相同的文件）
      const [dataS, dataD] = await Promise.all([
        fetchJSONFile('measurement.json', '收缩期').catch(() => null),
        fetchJSONFile('measurement.json', '舒张期').catch(() => null)
      ]);
      
      if (!dataS && !dataD) {
        throw new Error('无法加载任何 measurement.json');
      }

      let targetPlaneKey;
      if (analysisType === 'halt') {
        targetPlaneKey = 'Stent_Frame_Base_plane';
      } else if (analysisType === 'sfd') {
        targetPlaneKey = 'SOV_plane';
      } else if (analysisType === 'pfd') {
        targetPlaneKey = 'Stent_Frame_base_up_1.0_plane';
      } else if (analysisType === 'inflow') {
        targetPlaneKey = 'Stent_Frame_base_up_0.5_plane';
      } else if (analysisType === 'nadir') {
        targetPlaneKey = 'Stent_Frame_base_up_1.0_plane';
      } else if (analysisType === 'commissure') {
        targetPlaneKey = 'Stent_Frame_base_up_1.5_plane';
      } else if (analysisType === 'commissure_alignment') {
        targetPlaneKey = 'Stent_Frame_Base_plane';
      } else {
        console.error('未知的分析类型:', analysisType);
        return;
      }

      console.log('[locatePlane] analysisType=', analysisType, 'moduleType=', actualModuleType, 'currentPhase=', props.currentPhase);
      // 先尝试在与当前期相同的文件中查找目标平面，其次查另一个文件
      const phase = props.currentPhase || '收缩期';
      const preferSystole = phase === '收缩期';

      let planeData = null;
      if (preferSystole) {
        if (dataS && dataS[targetPlaneKey]) planeData = dataS[targetPlaneKey];
        if (!planeData && dataD && dataD[targetPlaneKey]) planeData = dataD[targetPlaneKey];
      } else {
        if (dataD && dataD[targetPlaneKey]) planeData = dataD[targetPlaneKey];
        if (!planeData && dataS && dataS[targetPlaneKey]) planeData = dataS[targetPlaneKey];
      }

      if (!planeData || !planeData.less_points) {
        throw new Error(`未找到 ${targetPlaneKey} 的 less_points 数据`);
      }

      let less_points = planeData.less_points;
      console.log('[locatePlane] 找到平面', targetPlaneKey, 'pointsCount=', Array.isArray(less_points) ? less_points.length : 0);

      // 规范化点数据为数字数组
      less_points = less_points.map(pt => {
        if (!Array.isArray(pt)) return null;
        return pt.map(v => (typeof v === 'string' ? Number(v) : v));
      }).filter(Boolean);

      try {
        await applyPlanePosition(less_points);
        
        // 规范化max_dist_pair和min_dist_pair为数字数组
        // 注意：这里交换了max和min，因为数据源中标反了
        let max_dist_pair = planeData.min_dist_pair;
        let min_dist_pair = planeData.max_dist_pair;
        
        if (max_dist_pair && Array.isArray(max_dist_pair)) {
          max_dist_pair = max_dist_pair.map(pt => {
            if (!Array.isArray(pt)) return null;
            return pt.map(v => (typeof v === 'string' ? Number(v) : v));
          }).filter(Boolean);
        }
        
        if (min_dist_pair && Array.isArray(min_dist_pair)) {
          min_dist_pair = min_dist_pair.map(pt => {
            if (!Array.isArray(pt)) return null;
            return pt.map(v => (typeof v === 'string' ? Number(v) : v));
          }).filter(Boolean);
        }
        
        // 绘制平面几何（曲线、最长径、最短径）- 只在 geometric 模块显示
        drawPlaneGeometry({
          less_points,
          max_dist_pair,
          min_dist_pair
        }, actualModuleType);
        
        // 设置相机变化监听器（只在 geometric 模块且绘制了几何图形时）
        if (actualModuleType === 'geometric' && planeGeometryVisible) {
          setupPlaneGeometryCameraListener();
        }
        
        // 保存平面状态，用于期相切换时保持平面
        savedPlaneState = {
          analysisType,
          less_points,
          max_dist_pair,
          min_dist_pair,
          targetPlaneKey,
          moduleType: actualModuleType
        }
        console.log('定位平面成功，已保存平面状态并绘制几何图形');
        return { success: true, less_points, max_dist_pair, min_dist_pair };
      } catch (err) {
        console.error('[locatePlane] applyPlanePosition 失败', err);
        throw err;
      }

    } catch (err) {
      console.error('定位平面失败:', err);
      alert('定位平面失败: ' + err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 应用平面位置（复用例子.vue的逻辑）
   */
  async function applyPlanePosition(less_points) {
    const viewports = {
      axial: renderingEngine.getViewport(viewportIds.axial),
      sagittal: renderingEngine.getViewport(viewportIds.sagittal),
      coronal: renderingEngine.getViewport(viewportIds.coronal),
    };

    if (!viewports.axial || !viewports.sagittal || !viewports.coronal) {
      throw new Error('找不到一个或多个 viewports（axial/sagittal/coronal）');
    }

    console.log('[applyPlanePosition] less_points length=', less_points ? less_points.length : 0);

    // 确保 less_points 格式正确
    if (!Array.isArray(less_points) || less_points.length === 0) {
      throw new Error('less_points 格式不正确或为空');
    }

    // 计算点的中心
    let centerSum = [0, 0, 0];
    less_points.forEach(point => {
      centerSum[0] += point[0];
      centerSum[1] += point[1];
      centerSum[2] += point[2];
    });
    const origin = [
      centerSum[0] / less_points.length,
      centerSum[1] / less_points.length,
      centerSum[2] / less_points.length
    ];

    // 计算平面法向量
    const p1 = less_points[0];
    const p2 = less_points[Math.floor(less_points.length / 3)];
    const p3 = less_points[Math.floor(less_points.length * 2 / 3)];

    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    const normal_raw = crossProductVec(v1, v2);
    const n_plane = normalizeVec(normal_raw);

    // 获取当前视图的preferred normal和up
    const MPR_CAMERA_VALUES = {
      axial: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
      sagittal: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
      coronal: { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] },
    };

    const getPreferredNormal = (viewName) => {
      try {
        const camera = viewports[viewName].getCamera();
        if (camera.viewPlaneNormal) {
          return normalizeVec(camera.viewPlaneNormal);
        }
      } catch (e) {}
      return normalizeVec(MPR_CAMERA_VALUES[viewName].viewPlaneNormal);
    };

    const getPreferredUp = (viewName) => {
      try {
        const camera = viewports[viewName].getCamera();
        if (camera.viewUp) {
          return normalizeVec(camera.viewUp);
        }
      } catch (e) {}
      return normalizeVec(MPR_CAMERA_VALUES[viewName].viewUp);
    };

    const axialPreferredNormal = getPreferredNormal('axial');
    const sagittalPreferredNormal = getPreferredNormal('sagittal');
    const coronalPreferredNormal = getPreferredNormal('coronal');
    const axialPreferredUp = getPreferredUp('axial');
    const sagittalPreferredUp = getPreferredUp('sagittal');
    const coronalPreferredUp = getPreferredUp('coronal');

    // 计算新的法向量
    let n_axial = [...n_plane];
    if (dotProductVec(n_axial, axialPreferredNormal) < 0) {
      n_axial = [-n_axial[0], -n_axial[1], -n_axial[2]];
    }

    const sagProjLen = dotProductVec(sagittalPreferredNormal, n_axial);
    const sagProjOnAxial = [n_axial[0] * sagProjLen, n_axial[1] * sagProjLen, n_axial[2] * sagProjLen];
    let n_sagittal_raw = subtractVec(sagittalPreferredNormal, sagProjOnAxial);
    const sagLen = vectorLength(n_sagittal_raw);

    let n_sagittal = normalizeVec(n_sagittal_raw);
    if (dotProductVec(n_sagittal, sagittalPreferredNormal) < 0) {
      n_sagittal = [-n_sagittal[0], -n_sagittal[1], -n_sagittal[2]];
    }

    let n_coronal_raw = crossProductVec(n_axial, n_sagittal);
    let n_coronal = normalizeVec(n_coronal_raw);
    if (dotProductVec(n_coronal, coronalPreferredNormal) < 0) {
      n_coronal = [-n_coronal[0], -n_coronal[1], -n_coronal[2]];
    }

    // 计算viewUp
    const computeViewUpVector = (normal, preferredUp) => {
      const n = normalizeVec(normal);
      const pu = normalizeVec(preferredUp);
      const projLen = dotProductVec(pu, n);
      const proj = [n[0] * projLen, n[1] * projLen, n[2] * projLen];
      let tangent = subtractVec(pu, proj);
      const tangentLen = vectorLength(tangent);

      if (tangentLen < 0.01) {
        let refVec = [0, 0, 1];
        if (Math.abs(dotProductVec(n, refVec)) > 0.9) {
          refVec = [0, 1, 0];
        }
        tangent = crossProductVec(n, refVec);
      }

      return normalizeVec(tangent);
    };

    const axialViewUp = computeViewUpVector(n_axial, axialPreferredUp);
    const sagittalViewUp = computeViewUpVector(n_sagittal, sagittalPreferredUp);
    const coronalViewUp = computeViewUpVector(n_coronal, coronalPreferredUp);

    // 计算相机距离和位置
    let cameraDistance = 500;
    try {
      const axialCamera = viewports.axial.getCamera();
      const currentDist = vectorLength(subtractVec(axialCamera.position, axialCamera.focalPoint));
      if (currentDist > 0 && currentDist < 10000) {
        cameraDistance = currentDist;
      }
    } catch (e) {}

    const axialPosition = [
      origin[0] + n_axial[0] * cameraDistance,
      origin[1] + n_axial[1] * cameraDistance,
      origin[2] + n_axial[2] * cameraDistance
    ];
    const sagittalPosition = [
      origin[0] + n_sagittal[0] * cameraDistance,
      origin[1] + n_sagittal[1] * cameraDistance,
      origin[2] + n_sagittal[2] * cameraDistance
    ];
    const coronalPosition = [
      origin[0] + n_coronal[0] * cameraDistance,
      origin[1] + n_coronal[1] * cameraDistance,
      origin[2] + n_coronal[2] * cameraDistance
    ];

    // 计算parallelScale
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    less_points.forEach(point => {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxZ = Math.max(maxZ, point[2]);
    });
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    const maxRange = Math.max(rangeX, rangeY, rangeZ);
    const parallelScale = maxRange * 1.5;

    // 计算 viewPlane.normal（等于 normalize(focalPoint - position)）
    const calculateViewPlaneNormal = (position, focalPoint) => {
      return normalizeVec(subtractVec(focalPoint, position));
    };

    const axialViewPlaneNormal = calculateViewPlaneNormal(axialPosition, origin);
    const sagittalViewPlaneNormal = calculateViewPlaneNormal(sagittalPosition, origin);
    const coronalViewPlaneNormal = calculateViewPlaneNormal(coronalPosition, origin);

    // 应用到viewports（与例子.vue逻辑保持一致：同时设置 viewPlane 和 viewPlaneNormal）
    const presetData = {
      axial: {
        position: axialPosition,
        focalPoint: [...origin],
        viewUp: [...axialViewUp],
        viewPlaneNormal: [...n_axial],
        // parallelScale: parallelScale,
        viewAngle: 90.00,
        viewPlane: {
          normal: [...axialViewPlaneNormal],
          point: [...origin]
        }
      },
      sagittal: {
        position: sagittalPosition,
        focalPoint: [...origin],
        viewUp: [...sagittalViewUp],
        viewPlaneNormal: [...n_sagittal],
        // parallelScale: parallelScale,
        viewAngle: 90.00,
        viewPlane: {
          normal: [...sagittalViewPlaneNormal],
          point: [...origin]
        }
      },
      coronal: {
        position: coronalPosition,
        focalPoint: [...origin],
        viewUp: [...coronalViewUp],
        viewPlaneNormal: [...n_coronal],
        // parallelScale: parallelScale,
        viewAngle: 90.00,
        viewPlane: {
          normal: [...coronalViewPlaneNormal],
          point: [...origin]
        }
      }
    };

    Object.keys(viewports).forEach((viewName) => {
      const viewport = viewports[viewName];
      const data = presetData[viewName];

      if (data && viewport) {
        try {
          console.log(`[applyPlanePosition] ${viewName} camera before:`, viewport.getCamera());
        } catch (e) {
          console.warn(`[applyPlanePosition] 无法读取 ${viewName} camera before`, e);
        }

        try {
          // 按例子.vue 的做法，构建 cameraParams 并设置 viewPlane 与 viewPlaneNormal
          const cameraParams = {
            position: data.position,
            focalPoint: data.focalPoint,
            viewUp: data.viewUp,
            parallelScale: data.parallelScale,
            viewAngle: data.viewAngle,
          };

          if (data.viewPlaneNormal) cameraParams.viewPlaneNormal = data.viewPlaneNormal;
          if (data.viewPlane) cameraParams.viewPlane = data.viewPlane;

          viewport.setCamera(cameraParams);
          console.log(`[applyPlanePosition] ${viewName} setCamera OK`);
        } catch (err) {
          console.error(`[applyPlanePosition] ${viewName} setCamera 失败:`, err, 'cameraData=', data);
        }

        try {
          console.log(`[applyPlanePosition] ${viewName} camera after:`, viewport.getCamera());
        } catch (e) {
          console.warn(`[applyPlanePosition] 无法读取 ${viewName} camera after`, e);
        }
      }
    });

    optimizedRender([
      viewportIds.axial,
      viewportIds.sagittal,
      viewportIds.coronal,
    ]);

    console.log('平面定位完成');

    // 更新 Crosshairs 工具的中心点位置到 origin（保持与例子.vue 行为一致）
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (toolGroup) {
        const crosshairsTool = toolGroup.getToolInstance(CrosshairsTool.toolName);
        if (crosshairsTool) {
          crosshairsTool.toolCenter = [...origin];
          console.log('已设置 Crosshairs 工具中心点为:', origin);
          optimizedRender([viewportIds.axial, viewportIds.sagittal, viewportIds.coronal]);
        } else {
          console.warn('未找到 Crosshairs 工具实例');
        }
      } else {
        console.warn('未找到工具组，无法更新 Crosshairs');
      }
    } catch (err) {
      console.error('更新 Crosshairs 位置失败:', err);
    }
  }

  /**
   * 启用长度测量工具
   */
  function enableLengthTool() {
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        console.warn('工具组未找到，无法启用长度测量工具');
        return;
      }

      // 禁用 Crosshairs 工具（设置为被动），使其不能移动
      toolGroup.setToolPassive(CrosshairsTool.toolName);
      
      // 激活长度测量工具
      toolGroup.setToolActive(LengthTool.toolName, {
        bindings: [
          {
            mouseButton: ToolsEnums.MouseBindings.Primary, // 左键点击
          },
        ],
      });
      
      console.log('长度测量工具已启用，十字架已禁用移动');
    } catch (err) {
      console.error('启用长度测量工具失败:', err);
    }
  }

  /**
   * 禁用长度测量工具，恢复 Crosshairs 工具
   */
  function disableLengthTool() {
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        console.warn('工具组未找到，无法禁用长度测量工具');
        return;
      }

      // 将长度测量工具设置为被动
      toolGroup.setToolPassive(LengthTool.toolName);
      
      // 重新激活 Crosshairs 工具，使其可以移动
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
      
      console.log('长度测量工具已禁用，十字架已恢复可移动状态');
    } catch (err) {
      console.error('禁用长度测量工具失败:', err);
    }
  }

  /**
   * 启用角度测量工具
   */
  function enableAngleTool() {
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        console.warn('工具组未找到，无法启用角度测量工具');
        return;
      }

      // 禁用 Crosshairs 工具（设置为被动），使其不能移动
      toolGroup.setToolPassive(CrosshairsTool.toolName);
      
      // 激活角度测量工具
      toolGroup.setToolActive(AngleTool.toolName, {
        bindings: [
          {
            mouseButton: ToolsEnums.MouseBindings.Primary, // 左键点击
          },
        ],
      });
      
      console.log('角度测量工具已启用，十字架已禁用移动');
    } catch (err) {
      console.error('启用角度测量工具失败:', err);
    }
  }

  /**
   * 禁用角度测量工具，恢复 Crosshairs 工具
   */
  function disableAngleTool() {
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        console.warn('工具组未找到，无法禁用角度测量工具');
        return;
      }

      // 将角度测量工具设置为被动
      toolGroup.setToolPassive(AngleTool.toolName);
      
      // 重新激活 Crosshairs 工具，使其可以移动
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
      
      console.log('角度测量工具已禁用，十字架已恢复可移动状态');
    } catch (err) {
      console.error('禁用角度测量工具失败:', err);
    }
  }

  /**
   * 撤销最后一个测量标注（长度或角度）
   */
  function undoLastMeasurement() {
    try {
      if (!renderingEngine || !viewportIds) {
        console.warn('渲染引擎未初始化');
        return;
      }

      if (measurementHistory.value.length === 0) {
        console.log('没有可撤销的测量');
        return;
      }

      // 获取最后一个标注UID
      const lastAnnotationUID = measurementHistory.value[measurementHistory.value.length - 1];
      
      // 删除标注 (这将触发 onAnnotationRemoved，从而从 history 中移除)
      annotation.state.removeAnnotation(lastAnnotationUID);
      
      // 重新渲染视图
      optimizedRender([
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal
      ]);
      
      console.log('已撤销最后一个测量:', lastAnnotationUID);
    } catch (err) {
      console.error('撤销测量失败:', err);
    }
  }

  /**
   * 启用十字架工具
   */
  function enableCrosshairs() {
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        console.warn('工具组未找到');
        return;
      }

      // 禁用其他工具
      toolGroup.setToolPassive(LengthTool.toolName);
      
      // 激活十字架工具
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
      
      console.log('十字架工具已启用');
    } catch (err) {
      console.error('启用十字架工具失败:', err);
    }
  }

  /**
   * 禁用十字架工具
   */
  function disableCrosshairs() {
    try {
      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        console.warn('工具组未找到');
        return;
      }

      // 将十字架工具设置为被动
      toolGroup.setToolPassive(CrosshairsTool.toolName);
      
      console.log('十字架工具已禁用');
    } catch (err) {
      console.error('禁用十字架工具失败:', err);
    }
  }

  /**
   * 保存当前视图状态
   * @param {string} name - 状态名称
   * @returns {Object} 保存的状态信息
   */
  function saveViewState(name = '未命名状态') {
    try {
      if (!renderingEngine || !viewportIds) {
        console.warn('渲染引擎未初始化，无法保存状态');
        return null;
      }

      const viewState = {
        id: Date.now() + Math.random(),
        name: name,
        timestamp: new Date().toLocaleString('zh-CN'),
        cameras: {},
        volumeId: currentVolumeId
      };

      // 保存每个视图的相机状态
      ['axial', 'sagittal', 'coronal'].forEach(viewName => {
        try {
          const viewport = renderingEngine.getViewport(viewportIds[viewName]);
          if (viewport) {
            const camera = viewport.getCamera();
            viewState.cameras[viewName] = {
              position: [...camera.position],
              focalPoint: [...camera.focalPoint],
              viewUp: [...camera.viewUp],
              parallelScale: camera.parallelScale,
              viewPlaneNormal: camera.viewPlaneNormal ? [...camera.viewPlaneNormal] : undefined
            };
          }
        } catch (e) {
          console.warn(`保存${viewName}视图失败:`, e);
        }
      });

      savedViewStates.value.push(viewState);
      console.log(`已保存视图状态: ${name}`);
      return viewState;
    } catch (err) {
      console.error('保存视图状态失败:', err);
      return null;
    }
  }

  /**
   * 恢复到指定的保存状态
   * @param {number|string} stateId - 状态ID
   */
  function restoreViewState(stateId) {
    try {
      if (!renderingEngine || !viewportIds) {
        console.warn('渲染引擎未初始化，无法恢复状态');
        return false;
      }

      const viewState = savedViewStates.value.find(s => s.id === stateId);
      if (!viewState) {
        console.warn('未找到指定的视图状态');
        return false;
      }

      // 恢复每个视图的相机状态
      ['axial', 'sagittal', 'coronal'].forEach(viewName => {
        try {
          const viewport = renderingEngine.getViewport(viewportIds[viewName]);
          const savedCamera = viewState.cameras[viewName];
          if (viewport && savedCamera) {
            viewport.setCamera(savedCamera);
          }
        } catch (e) {
          console.warn(`恢复${viewName}视图失败:`, e);
        }
      });

      // 重新渲染所有视图
      optimizedRender([
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal
      ]);

      console.log(`已恢复视图状态: ${viewState.name}`);
      return true;
    } catch (err) {
      console.error('恢复视图状态失败:', err);
      return false;
    }
  }

  /**
   * 删除保存的状态
   * @param {number|string} stateId - 状态ID
   */
  function deleteViewState(stateId) {
    const index = savedViewStates.value.findIndex(s => s.id === stateId);
    if (index !== -1) {
      const deletedState = savedViewStates.value.splice(index, 1)[0];
      console.log(`已删除视图状态: ${deletedState.name}`);
      return true;
    }
    return false;
  }

  /**
   * 重命名保存的状态
   * @param {number|string} stateId - 状态ID
   * @param {string} newName - 新名称
   */
  function renameViewState(stateId, newName) {
    const viewState = savedViewStates.value.find(s => s.id === stateId);
    if (viewState) {
      viewState.name = newName;
      console.log(`已重命名视图状态为: ${newName}`);
      return true;
    }
    return false;
  }

  /**
   * 清空所有保存的状态
   */
  function clearAllViewStates() {
    savedViewStates.value = [];
    console.log('已清空所有保存的视图状态');
  }

  /**
   * 获取 Axial 视图的当前切片位置
   * @returns {Object|null} 包含 origin 和 normal 的对象
   */
  function getAxialSlicePosition() {
    try {
      if (!renderingEngine || !viewportIds) {
        return null;
      }

      const axialViewport = renderingEngine.getViewport(viewportIds.axial);
      if (!axialViewport) {
        return null;
      }

      const camera = axialViewport.getCamera();
      return {
        origin: [...camera.focalPoint],
        normal: camera.viewPlaneNormal ? [...camera.viewPlaneNormal] : [0, 0, 1]
      };
    } catch (err) {
      console.error('获取 Axial 切片位置失败:', err);
      return null;
    }
  }

  /**
   * 处理窗口大小调整，自动调整 viewport 大小
   */
  function handleResize() {
    if (!renderingEngine || !viewportIds) {
      return
    }

    try {
      // 获取所有 viewport 并调用 resize
      const viewportIdArray = [
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal
      ]

      viewportIdArray.forEach(vpId => {
        try {
          const viewport = renderingEngine.getViewport(vpId)
          if (viewport && viewport.canvas) {
            // 获取父元素的实际大小
            const canvas = viewport.canvas
            const parent = canvas.parentElement
            if (parent) {
              const rect = parent.getBoundingClientRect()
              // 设置 canvas 大小
              canvas.width = rect.width
              canvas.height = rect.height
              canvas.style.width = rect.width + 'px'
              canvas.style.height = rect.height + 'px'
            }
          }
        } catch (e) {
          console.warn(`调整 viewport ${vpId} 大小失败:`, e)
        }
      })

      // 通知渲染引擎更新 viewport 大小
      renderingEngine.resize(true)

      // 重新渲染所有 viewport
      optimizedRender(viewportIdArray)
    } catch (err) {
      console.warn('处理窗口大小调整失败:', err)
    }
  }

  return {
    loading,
    error,
    initialize,
    switchVolume,
    cleanup,
    locatePlane,
    restoreMPR,
    enableLengthTool,
    disableLengthTool,
    enableAngleTool,
    disableAngleTool,
    undoLastMeasurement,
    enableCrosshairs,
    disableCrosshairs,
    handleResize,
    // 视图状态管理
    savedViewStates,
    saveViewState,
    restoreViewState,
    deleteViewState,
    renameViewState,
    clearAllViewStates,
    getAxialSlicePosition,
    toggleWaveImage,
    updateWaveOpacity,
    updateWaveRotation
  }
}

