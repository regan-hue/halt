import { ref } from 'vue';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
import { fetchSTLFile } from '../utils/apiClient.js';

// ========== 常量定义 ==========
/**
 * STL 文件配置列表
 * 定义每个 STL 文件的显示名称和颜色
 */
const STL_FILE_LIST = [
  { name: 'aorta.stl', displayName: 'Aorta', color: '#9b59b6' }, // 紫色
  { name: 'GH.stl', displayName: 'GH', color: '#27ae60' }, // 绿色
  { name: 'LA.stl', displayName: 'Left Atrium', color: '#3498db' }, // 蓝色
  { name: 'LCA.stl', displayName: 'Left Coronary Artery', color: '#e67e22' }, // 橙色
  { name: 'RCA.stl', displayName: 'Right Coronary Artery', color: '#f39c12' }, // 黄色
  { name: 'ZJ.stl', displayName: 'ZJ', color: '#1abc9c' }, // 青色
];

/**
 * STL 3D 查看器 Composable
 * 根据期相加载和显示对应的 STL 文件
 * 
 * @returns {Object} STL 查看器状态和方法
 */
export function useSTLViewer() {
  // ========== 状态管理 ==========
  const loading = ref(false);
  const error = ref(null);
  const context = ref(null);
  const fileStates = ref({});
  const planeActor = ref(null);
  const progress = ref(0); // 加载进度 (0-100)
  
  // ========== 缓存管理 ==========
  const stlCache = new Map(); // 缓存已加载的 STL 文件数据
  let hasResetCameraOnce = false; // 只在首次真正完成可视加载后 resetCamera，避免切换时跳动/耗时
  let phaseLoadToken = 0; // 用于取消/去重期相切换，避免异步竞态导致显示停留在旧期相
  let backgroundBuildToken = 0; // 用于取消后台构建任务（例如重新初始化后）

  // ========== 工具函数 ==========
  
  /**
   * 向量叉积
   */
  function crossProductVec(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  /**
   * 向量归一化
   */
  function normalizeVec(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len === 0) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  /**
   * 根据期相获取数据目录路径
   * 
   * @param {string} phase - 期相名称（'收缩期' 或 '舒张期'）
   * @returns {string} 数据目录路径
   */
  function getDataPath(phase) {
    const pathMap = {
      '收缩期': '/data/shousuoqi/visualization',
      '舒张期': '/data/shuzhangqi/visualization',
    };
    return pathMap[phase] || pathMap['收缩期'];
  }

  /**
   * 十六进制转 RGB
   */
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  /**
   * 加载单个 STL 文件（带缓存优化）
   */
  async function loadSTLFile(file, phase, renderer, renderWindow, initialVisible = true) {
    const cacheKey = `${phase}_${file.name}`;
    
    try {
      console.log(`开始加载文件: ${file.name} (${phase})`);
      
      let arrayBuffer;
      
      // 检查缓存
      if (stlCache.has(cacheKey)) {
        console.log(`从缓存加载: ${file.name}`);
        arrayBuffer = stlCache.get(cacheKey);
      } else {
        // 从 API 获取并缓存
        arrayBuffer = await fetchSTLFile(file.name, phase);
        stlCache.set(cacheKey, arrayBuffer);
        console.log(`已缓存文件: ${file.name}`);
      }
      
      // 创建新的读取器、映射器和演员
      const stlReader = vtkSTLReader.newInstance();
      const mapper = vtkMapper.newInstance();
      const actor = vtkActor.newInstance();
      
      // 解析 STL 文件
      stlReader.parseAsArrayBuffer(arrayBuffer);
      
      // 获取数据
      const polydata = stlReader.getOutputData();
      const numPoints = polydata.getPoints().getNumberOfPoints();
      
      if (numPoints === 0) {
        throw new Error('文件没有数据');
      }
      
      // 设置映射器
      mapper.setInputData(polydata);
      mapper.setScalarVisibility(false);
      
      // 设置演员
      actor.setMapper(mapper);
      actor.setVisibility(Boolean(initialVisible));
      
      // 设置颜色
      const rgb = hexToRgb(file.color);
      const property = actor.getProperty();
      property.setColor(rgb.r / 255, rgb.g / 255, rgb.b / 255);
      property.setAmbient(0.3);
      property.setDiffuse(0.7);
      property.setSpecular(0.3);
      property.setSpecularPower(20);
      property.setOpacity(0.9);
      
      // 强制更新演员
      actor.modified();
      
      // 添加到场景
      renderer.addActor(actor);
      
      // 保存引用
      const fileKey = `${phase}_${file.name}`;
      fileStates.value[fileKey] = {
        actor,
        mapper,
        reader: stlReader,
        visible: Boolean(initialVisible)
      };
      
      console.log(`${file.name} 加载成功`);
      
      return { actor, mapper, reader: stlReader };
    } catch (error) {
      console.error(`${file.name} 加载失败:`, error);
      throw error;
    }
  }

  /**
   * 清理所有文件资源
   */
  function cleanupFiles() {
    Object.values(fileStates.value).forEach(state => {
      if (state.actor) state.actor.delete();
      if (state.mapper) state.mapper.delete();
      if (state.reader) state.reader.delete();
    });
    fileStates.value = {};
  }

  /**
   * 清理缓存（可选，用于内存管理）
   */
  function clearCache() {
    stlCache.clear();
    console.log('STL 文件缓存已清理');
  }

  /**
   * 显示定位平面
   */
  function showPlane(less_points) {
    if (!context.value || !Array.isArray(less_points) || less_points.length === 0) {
      console.warn('无法显示平面：上下文或点数据无效');
      return;
    }

    try {
      // 先隐藏现有平面
      hidePlane();

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
      const normal = normalizeVec(crossProductVec(v1, v2));

      // 计算平面大小（基于点的范围）
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
      const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 5;

      // 创建平面源
      const planeSource = vtkPlaneSource.newInstance();
      planeSource.setOrigin(origin[0] - size/2, origin[1] - size/2, origin[2]);
      planeSource.setPoint1(origin[0] + size/2, origin[1] - size/2, origin[2]);
      planeSource.setPoint2(origin[0] - size/2, origin[1] + size/2, origin[2]);
      planeSource.setNormal(normal[0], normal[1], normal[2]);

      // 创建映射器和演员
      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(planeSource.getOutputPort());

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      // 设置平面样式（半透明白色）
      const property = actor.getProperty();
      property.setColor(1, 1, 1); // 白色
      property.setOpacity(0.5);
      property.setAmbient(0.3);
      property.setDiffuse(0.7);
      
      // 强制更新演员
      actor.modified();

      // 添加到场景
      context.value.renderer.addActor(actor);
      planeActor.value = actor;

      // 渲染
      context.value.renderWindow.render();

      console.log('定位平面已显示');
    } catch (error) {
      console.error('显示平面失败:', error);
    }
  }

  /**
   * 隐藏定位平面
   */
  function hidePlane() {
    if (planeActor.value && context.value) {
      context.value.renderer.removeActor(planeActor.value);
      planeActor.value.delete();
      planeActor.value = null;
      context.value.renderWindow.render();
      console.log('定位平面已隐藏');
    }
  }

  /**
   * 更新平面位置（用于同步 Axial 切面移动）
   * @param {Array} origin - 新的平面中心点 [x, y, z]
   * @param {Array} normal - 平面法向量 [x, y, z]
   */
  function updatePlanePosition(origin, normal) {
    if (!planeActor.value || !context.value) {
      return;
    }

    try {
      // 获取当前平面的 mapper 和 source
      const mapper = planeActor.value.getMapper();
      const planeSource = mapper.getInputConnection(0).filter;
      
      if (!planeSource) {
        console.warn('无法获取平面源');
        return;
      }

      // 获取当前平面的 point1 和 point2，以保持平面大小
      const currentOrigin = planeSource.getOrigin();
      const currentPoint1 = planeSource.getPoint1();
      const currentPoint2 = planeSource.getPoint2();
      
      // 计算平面大小（从原点到 point1 的距离）
      const dx1 = currentPoint1[0] - currentOrigin[0];
      const dy1 = currentPoint1[1] - currentOrigin[1];
      const dz1 = currentPoint1[2] - currentOrigin[2];
      const dx2 = currentPoint2[0] - currentOrigin[0];
      const dy2 = currentPoint2[1] - currentOrigin[1];
      const dz2 = currentPoint2[2] - currentOrigin[2];

      // 计算平面大小
      const size = Math.sqrt(dx1*dx1 + dy1*dy1 + dz1*dz1);

      // 设置新的平面位置
      const normalizedNormal = normalizeVec(normal);
      planeSource.setOrigin(origin[0] - size/2, origin[1] - size/2, origin[2]);
      planeSource.setPoint1(origin[0] + size/2, origin[1] - size/2, origin[2]);
      planeSource.setPoint2(origin[0] - size/2, origin[1] + size/2, origin[2]);
      planeSource.setNormal(normalizedNormal[0], normalizedNormal[1], normalizedNormal[2]);
      
      // 强制更新
      planeSource.modified();
      planeActor.value.modified();
      
      // 渲染
      context.value.renderWindow.render();
    } catch (error) {
      console.error('更新平面位置失败:', error);
    }
  }

  /**
   * 加载指定期相的所有 STL 文件（并行加载优化）
   */
  async function loadPhaseFiles(phase, renderer, renderWindow, token) {
    loading.value = true;
    error.value = null;
    progress.value = 0;
    
    try {
      // 如果已经被新的切换请求取代，直接退出，避免覆盖最新显示
      if (token !== phaseLoadToken) return { cancelled: true };

      // 隐藏现有平面
      hidePlane();

      // 1) 先把“非当前期相”的 actor 全部隐藏（不 delete，避免反复 parse）
      Object.keys(fileStates.value).forEach(key => {
        const state = fileStates.value[key]
        if (!state?.actor) return
        const isTargetPhase = key.startsWith(`${phase}_`)
        state.visible = isTargetPhase
        state.actor.setVisibility(isTargetPhase)
      })

      console.log(`准备加载/显示 ${phase} 的 ${STL_FILE_LIST.length} 个 STL 文件...`);

      // 2) 确保当前期相的 actor 已存在；没有就增量加载（仍可并行 fetch，但 parse 可能较重）
      const loadPromises = STL_FILE_LIST.map(async (file, index) => {
        if (token !== phaseLoadToken) return
        const fileKey = `${phase}_${file.name}`
        if (!fileStates.value[fileKey]) {
          await loadSTLFile(file, phase, renderer, renderWindow, true)
        } else {
          // 已存在则只切换可见
          const state = fileStates.value[fileKey]
          if (state?.actor) {
            state.visible = true
            state.actor.setVisibility(true)
          }
        }
        progress.value = Math.round(((index + 1) / STL_FILE_LIST.length) * 100)
      })

      await Promise.all(loadPromises)
      if (token !== phaseLoadToken) return { cancelled: true };

      // 3) 首次加载完成后 resetCamera；后续切换保持相机状态（更快也更符合用户预期）
      if (!hasResetCameraOnce) {
        renderer.resetCamera()
        hasResetCameraOnce = true
      }
      renderWindow.render()
      
      loading.value = false;
      progress.value = 100;
      console.log(`${phase} 所有文件加载完成`);
      return { cancelled: false };
    } catch (err) {
      // 如果是被取消的切换，不视为错误（避免干扰 UI）
      if (token !== phaseLoadToken) return { cancelled: true };
      loading.value = false;
      error.value = err.message;
      progress.value = 0;
      console.error('加载期相文件失败:', err);
      return { cancelled: false, error: err };
    }
  }

  /**
   * 切换文件显示/隐藏
   */
  function toggleFileVisibility(fileName, phase, visible) {
    const fileKey = `${phase}_${fileName}`;
    const state = fileStates.value[fileKey];
    if (state && state.actor) {
      state.visible = visible;
      state.actor.setVisibility(visible);
      if (context.value) {
        context.value.renderWindow.render();
      }
    }
  }

  /**
   * 初始化 3D 场景
   */
  async function initialize(containerElement, phase) {
    if (!containerElement) {
      throw new Error('容器元素未找到');
    }

    try {
      loading.value = true;
      error.value = null;
      
      // 等待一下确保容器已准备好
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 如果已有场景，先清理
      if (context.value) {
        cleanupFiles();
        context.value.fullScreenRenderer.delete();
        context.value = null;
      }
      // 新上下文应重新 resetCamera
      hasResetCameraOnce = false;
      // 取消旧的后台构建
      backgroundBuildToken++;

      // 创建全屏渲染窗口
      // 尝试启用 preserveDrawingBuffer 以支持 canvas.toDataURL
      // 强制使用 WebGL 1 以避免 GLSL ES 300 shader 编译问题
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        rootContainer: containerElement,
        background: [0.1, 0.1, 0.15], // 深色背景
        containerStyle: { height: '100%', width: '100%', position: 'absolute' },
        config: {
          preserveDrawingBuffer: true,
          webgl2: false // 强制使用 WebGL 1
        }
      });

      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      
      // 尝试在 OpenGLRenderWindow 上设置 preserveDrawingBuffer
      const views = renderWindow.getViews();
      if (views.length > 0) {
        const glWindow = views[0];
        if (glWindow.setPreserveDrawingBuffer) {
           glWindow.setPreserveDrawingBuffer(true);
        }
      }

      // 保存上下文
      context.value = {
        fullScreenRenderer,
        renderer,
        renderWindow,
      };

      // 加载当前期相的文件
      const token = ++phaseLoadToken
      await loadPhaseFiles(phase, renderer, renderWindow, token);

      // 预加载另一个期相的文件
      const otherPhase = phase === '收缩期' ? '舒张期' : '收缩期';
      preloadPhaseFiles(otherPhase);

      // 后台构建另一期相的 actor（隐藏状态），降低第一次切换到另一期相的卡顿
      setTimeout(async () => {
        try {
          if (!context.value) return
          const bgToken = backgroundBuildToken
          console.log(`开始后台构建 ${otherPhase} 的 STL actor（隐藏）...`)
          for (let i = 0; i < STL_FILE_LIST.length; i++) {
            if (bgToken !== backgroundBuildToken) return
            const file = STL_FILE_LIST[i]
            const fileKey = `${otherPhase}_${file.name}`
            if (!fileStates.value[fileKey]) {
              await loadSTLFile(file, otherPhase, renderer, renderWindow, false)
              // 分帧让出主线程，避免后台预处理也造成卡顿
              await new Promise(resolve => setTimeout(resolve, 0))
            }
          }
          renderWindow.render()
          console.log(`后台构建 ${otherPhase} 完成`)
        } catch (e) {
          console.warn(`后台构建 ${otherPhase} 失败:`, e)
        }
      }, 300);

      loading.value = false;
      console.log('STL 3D 场景初始化完成');
    } catch (err) {
      loading.value = false;
      error.value = err.message;
      console.error('初始化失败:', err);
      throw err;
    }
  }

  /**
   * 切换期相
   */
  async function switchPhase(newPhase) {
    if (!context.value) {
      console.warn('STL 查看器未初始化，无法切换期相');
      return;
    }
    
    console.log(`切换期相: ${newPhase}`);
    const { renderer, renderWindow } = context.value;
    
    try {
      // 隐藏现有平面
      hidePlane();

      const token = ++phaseLoadToken
      const result = await loadPhaseFiles(newPhase, renderer, renderWindow, token);
      if (result?.cancelled) {
        console.log(`期相切换被取消（已有更新请求）: ${newPhase}`)
        return
      }
      
      // 预加载另一个期相的文件（如果有的话）
      const otherPhase = newPhase === '收缩期' ? '舒张期' : '收缩期';
      preloadPhaseFiles(otherPhase);
      
      console.log(`期相切换完成: ${newPhase}`);
    } catch (err) {
      console.error(`期相切换失败: ${newPhase}`, err);
      throw err;
    }
  }

  /**
   * 预加载指定期相的所有 STL 文件（后台加载，不影响当前显示）
   */
  async function preloadPhaseFiles(phase) {
    if (!phase) return;
    
    console.log(`开始后台预加载 ${phase} 的 STL 文件...`);
    
    const preloadPromises = STL_FILE_LIST.map(async (file) => {
      const cacheKey = `${phase}_${file.name}`;
      if (!stlCache.has(cacheKey)) {
        try {
          const arrayBuffer = await fetchSTLFile(file.name, phase);
          stlCache.set(cacheKey, arrayBuffer);
          console.log(`预加载完成: ${file.name} (${phase})`);
        } catch (error) {
          console.warn(`预加载失败: ${file.name} (${phase})`, error);
        }
      }
    });
    
    // 不等待完成，让它在后台运行
    Promise.all(preloadPromises).then(() => {
      console.log(`后台预加载 ${phase} 完成`);
    }).catch((error) => {
      console.warn(`后台预加载 ${phase} 出错:`, error);
    });
  }

  /**
   * 清理资源
   */
  function cleanup() {
    hidePlane();
    cleanupFiles();
    if (context.value) {
      context.value.fullScreenRenderer.delete();
      context.value = null;
    }
  }

  /**
   * 捕获当前STL视图为图像
   * @returns {Promise<string>} Base64编码的图像数据URL
   */
  async function captureImage() {
    if (!context.value) {
      throw new Error('STL 查看器未初始化');
    }

    try {
      const renderWindow = context.value.renderWindow;
      const view = renderWindow.getViews()[0];
      
      console.log('📸 开始捕获STL图像...');

      // 方法1: 使用 view.captureNextImage (推荐方法)
      // 需要先调用 captureNextImage 获取 promise，然后调用 render 触发截图
      if (view && typeof view.captureNextImage === 'function') {
        console.log('尝试 view.captureNextImage()');
        try {
          const capturePromise = view.captureNextImage('image/png');
          renderWindow.render(); // 关键：触发渲染以执行捕获
          
          // 添加超时处理，防止 Promise 永远不 resolve
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000));
          const captured = await Promise.race([capturePromise, timeoutPromise]);
          
          if (captured && typeof captured === 'string' && captured.length > 100) {
             console.log('✅ captureNextImage 成功, 大小:', Math.round(captured.length / 1024), 'KB');
             return captured;
          }
          console.warn('captureNextImage 返回无效数据');
        } catch (e) {
          console.warn('captureNextImage 失败或超时:', e);
        }
      }

      // 方法2: 使用 renderWindow.captureImages
      if (typeof renderWindow.captureImages === 'function') {
         console.log('尝试 renderWindow.captureImages()');
         const images = await renderWindow.captureImages();
         if (images && images.length > 0 && images[0] && images[0].length > 100) {
            console.log('✅ captureImages 成功');
            return images[0];
         }
      }

      // 方法3: Canvas toDataURL (回退方法)
      // 注意：如果没有 preserveDrawingBuffer: true，这可能返回黑屏
      // 我们尝试在渲染后立即捕获
      if (view && view.getCanvas) {
         console.log('尝试 canvas.toDataURL()');
         renderWindow.render();
         // 稍微等待渲染完成，但不要太久以免buffer被清除
         await new Promise(r => setTimeout(r, 20));
         const canvas = view.getCanvas();
         if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 100) {
              console.log('✅ canvas.toDataURL 成功, 大小:', Math.round(dataUrl.length / 1024), 'KB');
              return dataUrl;
            }
         }
      }

      throw new Error('所有捕获方法都失败或返回空数据');
    } catch (error) {
      console.error('❌ 捕获STL图像失败:', error);
      throw error;
    }
  }

  // ========== 返回值 ==========
  return {
    loading,
    error,
    progress,
    fileList: STL_FILE_LIST,
    fileStates,
    initialize,
    switchPhase,
    toggleFileVisibility,
    showPlane,
    hidePlane,
    updatePlanePosition,
    captureImage,
    cleanup,
  };
}

