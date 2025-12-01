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
} from '@cornerstonejs/core'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'
import { 
  init as cornerstoneToolsInit, 
  addTool, 
  ToolGroupManager, 
  CrosshairsTool,
  LengthTool,
  annotation,
  Enums as ToolsEnums 
} from '@cornerstonejs/tools'
import { cornerstoneStreamingImageVolumeLoader } from '@cornerstonejs/streaming-image-volume-loader'

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

// ========== 常量定义 ==========
const RENDERING_ENGINE_ID = 'myRenderingEngine';
const TOOL_GROUP_ID = 'myToolGroup';

/**
 * Crosshairs Viewer Composable
 * 处理 Cornerstone 3D 体积数据的加载和显示逻辑
 * 
 * @param {Object} props - 组件属性
 * @param {string} props.seriesInstanceUID - 系列实例 UID
 */
export function useCrosshairsViewer(props) {
  // ========== 状态管理 ==========
  const loading = ref(true);
  const error = ref(null);
  
  // ========== 内部状态 ==========
  let renderingEngine = null;
  let viewportIds = null;
  let currentVolumeId = null;
  let initialCameraPositions = null; // 保存初始MPR位置

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
   * 加载体积数据到 viewports
   */
  async function loadVolume(renderingEngineInstance, viewportIdsInstance, imageIds, seriesInstanceUID) {
    try {
      // 定义体积ID
      const volumeId = `cornerstoneStreamingImageVolume:volume-${seriesInstanceUID}`
      
      // 如果之前有体积，先清理旧的体积
      if (currentVolumeId && currentVolumeId !== volumeId) {
        try {
          // 从缓存中移除旧体积
          const oldVolume = cache.getVolume(currentVolumeId)
          if (oldVolume) {
            cache.removeVolumeLoaders(currentVolumeId)
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
      if (!volume.loadStatus || volume.loadStatus.loaded === false) {
        await volume.load()
      }

      // 设置每个viewport显示体积
      const axialViewport = renderingEngineInstance.getViewport(viewportIdsInstance.axial)
      const sagittalViewport = renderingEngineInstance.getViewport(viewportIdsInstance.sagittal)
      const coronalViewport = renderingEngineInstance.getViewport(viewportIdsInstance.coronal)

      // 设置体积到各个viewport
      axialViewport.setVolumes([{ volumeId }])
      sagittalViewport.setVolumes([{ volumeId }])
      coronalViewport.setVolumes([{ volumeId }])

      // 更新当前体积ID
      currentVolumeId = volumeId

      // 渲染所有viewport
      renderingEngineInstance.renderViewports([viewportIdsInstance.axial, viewportIdsInstance.sagittal, viewportIdsInstance.coronal])
    } catch (err) {
      console.error('加载体积失败:', err)
      throw err
    }
  }

  /**
   * 初始化 Cornerstone 和加载体积数据
   */
  async function initialize(axialElement, sagittalElement, coronalElement) {
    try {
      // 初始化 Cornerstone
      await cornerstoneInit()
      await cornerstoneToolsInit()
      
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
        // 默认将十字架设置为被动状态（不显示）
        toolGroup.setToolPassive(CrosshairsTool.toolName)

        // 添加长度测量工具
        addTool(LengthTool)
        toolGroup.addTool(LengthTool.toolName)
        // 默认将 LengthTool 设置为被动状态（不激活）
        toolGroup.setToolPassive(LengthTool.toolName)

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
          },
        },
        {
          viewportId: viewportIds.sagittal,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          element: sagittalElement,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: viewportIds.coronal,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          element: coronalElement,
          defaultOptions: {
            orientation: Enums.OrientationAxis.CORONAL,
          },
        },
      ]

      renderingEngine.setViewports(viewportInputArray)

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

      loading.value = false
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

      loading.value = true
      error.value = null

      // 获取新系列的实例（复用fetchInstances函数）
      const imageIds = await fetchInstances(newSeriesInstanceUID)
      
      if (!imageIds || imageIds.length === 0) {
        throw new Error('未找到DICOM实例')
      }

      // 加载新体积
      await loadVolume(renderingEngine, viewportIds, imageIds, newSeriesInstanceUID)

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
      
      // 重置状态
      renderingEngine = null
      viewportIds = null
      currentVolumeId = null
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
      
      renderingEngine.renderViewports([
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal,
      ]);
      console.log('已重置MPR相机到默认状态');
    } catch (err) {
      console.error('重置MPR相机失败:', err);
    }
  }

  /**
   * 根据分析类型定位到特定平面
   */
  async function locatePlane(analysisType) {
    if (!renderingEngine || !viewportIds) {
      console.error('渲染引擎未初始化');
      return;
    }

    try {
      // 读取收缩期与舒张期两个 measurement.json（优先使用与当前期相同的文件）
      const systolePath = '/data/shousuoqi/measurement.json';
      const diastolePath = '/data/shuzhangqi/measurement.json';
      const [respS, respD] = await Promise.all([fetch(systolePath), fetch(diastolePath)]);
      if (!respS.ok && !respD.ok) {
        throw new Error('无法加载任何 measurement.json');
      }
      const [dataS, dataD] = [respS.ok ? await respS.json() : null, respD.ok ? await respD.json() : null];

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
      } else {
        console.error('未知的分析类型:', analysisType);
        return;
      }

      console.log('[locatePlane] analysisType=', analysisType, 'currentPhase=', props.currentPhase);
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
        console.log('定位平面成功');
        return { success: true, less_points };
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

    renderingEngine.renderViewports([
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
          renderingEngine.renderViewports([viewportIds.axial, viewportIds.sagittal, viewportIds.coronal]);
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

      // 禁用 Crosshairs 工具（设置为被动）
      toolGroup.setToolPassive(CrosshairsTool.toolName);
      
      // 激活长度测量工具
      toolGroup.setToolActive(LengthTool.toolName, {
        bindings: [
          {
            mouseButton: ToolsEnums.MouseBindings.Primary, // 左键点击
          },
        ],
      });
      
      console.log('长度测量工具已启用');
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
      
      // 重新激活 Crosshairs 工具
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
      
      console.log('长度测量工具已禁用，Crosshairs 工具已恢复');
    } catch (err) {
      console.error('禁用长度测量工具失败:', err);
    }
  }

  /**
   * 撤销最后一个长度测量标注
   */
  function undoLastMeasurement() {
    try {
      if (!renderingEngine || !viewportIds) {
        console.warn('渲染引擎未初始化');
        return;
      }

      // 获取所有标注
      const allAnnotations = annotation.state.getAllAnnotations();
      
      // 过滤出长度测量标注
      const lengthAnnotations = allAnnotations.filter(
        ann => ann.metadata?.toolName === LengthTool.toolName
      );

      if (lengthAnnotations.length === 0) {
        console.log('没有可撤销的测量');
        return;
      }

      // 获取最后一个标注
      const lastAnnotation = lengthAnnotations[lengthAnnotations.length - 1];
      
      // 删除标注
      annotation.state.removeAnnotation(lastAnnotation.annotationUID);
      
      // 重新渲染视图
      renderingEngine.renderViewports([
        viewportIds.axial,
        viewportIds.sagittal,
        viewportIds.coronal
      ]);
      
      console.log('已撤销最后一个测量');
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
    undoLastMeasurement,
    enableCrosshairs,
    disableCrosshairs,
  }
}

