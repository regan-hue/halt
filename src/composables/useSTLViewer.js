import { ref } from 'vue';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';

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
   * 加载单个 STL 文件
   */
  async function loadSTLFile(file, phase, renderer, renderWindow) {
    try {
      const dataPath = getDataPath(phase);
      const filePath = `${dataPath}/${file.name}`;
      
      console.log(`开始加载文件: ${filePath}`);
      
      // 使用 fetch 加载二进制文件
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // 获取 ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      
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
        visible: true
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
      const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 2;

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
   * 加载指定期相的所有 STL 文件
   */
  async function loadPhaseFiles(phase, renderer, renderWindow) {
    loading.value = true;
    error.value = null;
    
    try {
      // 隐藏现有平面
      hidePlane();

      // 清理所有已加载的文件（不管是什么期相）
      Object.keys(fileStates.value).forEach(key => {
        const state = fileStates.value[key];
        if (state && state.actor) {
          renderer.removeActor(state.actor);
          state.actor.delete();
          if (state.mapper) state.mapper.delete();
          if (state.reader) state.reader.delete();
        }
      });
      fileStates.value = {};

      // 加载新期相的文件
      for (const file of STL_FILE_LIST) {
        await loadSTLFile(file, phase, renderer, renderWindow);
        // 稍微延迟，避免同时加载造成卡顿
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 重置相机并渲染
      renderer.resetCamera();
      renderWindow.render();
      
      loading.value = false;
      console.log(`${phase} 所有文件加载完成`);
    } catch (err) {
      loading.value = false;
      error.value = err.message;
      console.error('加载期相文件失败:', err);
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

      // 创建全屏渲染窗口
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        rootContainer: containerElement,
        background: [0.1, 0.1, 0.15], // 深色背景
      });

      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();

      // 保存上下文
      context.value = {
        fullScreenRenderer,
        renderer,
        renderWindow,
      };

      // 加载当前期相的文件
      await loadPhaseFiles(phase, renderer, renderWindow);

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

      await loadPhaseFiles(newPhase, renderer, renderWindow);
      console.log(`期相切换完成: ${newPhase}`);
    } catch (err) {
      console.error(`期相切换失败: ${newPhase}`, err);
      throw err;
    }
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

  // ========== 返回值 ==========
  return {
    loading,
    error,
    fileList: STL_FILE_LIST,
    fileStates,
    initialize,
    switchPhase,
    toggleFileVisibility,
    showPlane,
    hidePlane,
    cleanup,
  };
}

