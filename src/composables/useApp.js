import { ref, computed } from 'vue';
import { 
  DEFAULT_SERIES_INSTANCE_UIDS, 
  DEFAULT_STUDY_INSTANCE_UID,
  DEFAULT_PHASE,
  DEFAULT_MODULE,
  DEFAULT_SUB_MODULE
} from '../config/appConfig.js';

/**
 * 应用状态管理 Composable
 * 管理全局应用状态和事件处理
 * 
 * @param {Object} seriesInstanceUIDs - 系列实例 UID 映射对象
 * @param {Ref<string>} studyInstanceUIDParam - 研究实例 UID 引用
 * @returns {Object} 应用状态和方法
 */
export function useApp(seriesInstanceUIDs = null, studyInstanceUIDParam = null) {
  // ========== 状态管理 ==========
  const currentPhase = ref(DEFAULT_PHASE);
  const currentModule = ref(DEFAULT_MODULE);
  const currentSubModule = ref(DEFAULT_SUB_MODULE);
  const currentSliceIndex = ref(-1);
  const currentGeoData = ref(null);
  const mainViewerRef = ref(null);

  // ========== 配置处理 ==========
  const seriesUIDs = seriesInstanceUIDs || DEFAULT_SERIES_INSTANCE_UIDS;

  /**
   * 根据当前期相计算系列实例 UID
   */
  const seriesInstanceUID = computed(() => {
    return seriesUIDs[currentPhase.value] || seriesUIDs[DEFAULT_PHASE];
  });
  
  /**
   * 研究实例 UID
   */
  const studyInstanceUID = computed(() => {
    return studyInstanceUIDParam?.value || DEFAULT_STUDY_INSTANCE_UID;
  });

  // ========== 事件处理函数 ==========
  
  /**
   * 更新几何数据
   */
  function handleGeoDataUpdate(data) {
    currentGeoData.value = data;
  }

  /**
   * 处理期相变化
   */
  function handlePhaseChange(phase) {
    currentPhase.value = phase;
  }

  /**
   * 处理模块变化
   * @param {string|Object} mod - 模块名称或包含模块信息的对象
   */
  function handleModuleChange(mod) {
    if (typeof mod === 'object' && mod.module) {
      currentModule.value = mod.module;
    } else {
      currentModule.value = mod;
    }
  }

  /**
   * 处理子模块变化
   */
  function handleSubModuleChange(sub) {
    currentSubModule.value = sub;
  }

  /**
   * 处理切片索引变化
   */
  // 切片视图功能已移除（保留 currentSliceIndex 供可能的内部使用）

  /**
   * 处理平面级别变化
   * 注意：当前使用CrosshairsViewer，暂不支持平面定位功能
   */
  function handlePlaneLevelChange(level) {
    console.log('Plane level change:', level);
  }

  /**
   * 开始测量功能
   * 启用长度测量工具
   */
  function handleStartMeasure() {
    console.log('Start measure');
    if (mainViewerRef.value && mainViewerRef.value.enableLengthTool) {
      mainViewerRef.value.enableLengthTool();
    } else {
      console.warn('MainViewer 引用未找到或 enableLengthTool 方法不可用');
    }
  }

  /**
   * 停止测量功能
   * 禁用长度测量工具，恢复 Crosshairs
   */
  function handleStopMeasure() {
    console.log('Stop measure');
    if (mainViewerRef.value && mainViewerRef.value.disableLengthTool) {
      mainViewerRef.value.disableLengthTool();
    } else {
      console.warn('MainViewer 引用未找到或 disableLengthTool 方法不可用');
    }
  }

  /**
   * 撤销最后一个测量
   */
  function handleUndoMeasurement() {
    console.log('Undo measurement');
    if (mainViewerRef.value && mainViewerRef.value.undoLastMeasurement) {
      mainViewerRef.value.undoLastMeasurement();
    } else {
      console.warn('MainViewer 引用未找到或 undoLastMeasurement 方法不可用');
    }
  }

  /**
   * 切换虚拟瓣膜显示
   */
  function handleToggleVirtualValve() {
    console.log('Toggle virtual valve');
  }

  /**
   * 更新瓣膜透明度
   */
  function handleUpdateValveOpacity(val) {
    console.log('Update valve opacity:', val);
  }

  /**
   * 更新瓣膜旋转角度
   */
  function handleUpdateValveRotation(val) {
    console.log('Update valve rotation:', val);
  }

  /**
   * 加载所有几何平面数据
   */
  async function loadAllGeometricData() {
    try {
      const phaseFolder = currentPhase.value === '收缩期' ? 'shousuoqi' : 'shuzhangqi';
      const response = await fetch(`/data/${phaseFolder}/measurement.json`);
      const data = await response.json();
      
      // 提取几何数据的辅助函数
      const extractPlaneData = (planeData) => {
        if (!planeData) return null;
        return {
          perimeter: planeData.perimeter,
          area: planeData.area,
          PED: planeData.PED,
          AED: planeData.AED,
          max_dist: planeData.max_dist,
          min_dist: planeData.min_dist,
          average_dist: planeData.average_dist
        };
      };
      
      // 更新为包含所有平面数据的对象
      currentGeoData.value = {
        inflow: extractPlaneData(data['Stent_Frame_Base_plane']),
        nadir: extractPlaneData(data['Stent_Frame_base_up_1.0_plane']),
        commissure: extractPlaneData(data['Stent_Frame_Crown_Frame_plane'])
      };
      
    } catch (error) {
      console.error('Failed to load geometric data:', error);
    }
  }

  /**
   * 加载收缩期和舒张期的几何数据（用于报告）
   */
  async function loadGeometricDataForBothPhases() {
    try {
      const extractPlaneData = (planeData) => {
        if (!planeData) return null;
        return {
          perimeter: planeData.perimeter,
          area: planeData.area,
          PED: planeData.PED,
          AED: planeData.AED,
          max_dist: planeData.max_dist,
          min_dist: planeData.min_dist,
          average_dist: planeData.average_dist
        };
      };

      // 加载收缩期数据
      const systolicResponse = await fetch('/data/shousuoqi/measurement.json');
      const systolicData = await systolicResponse.json();
      const systolic = {
        inflow: extractPlaneData(systolicData['Stent_Frame_Base_plane']),
        nadir: extractPlaneData(systolicData['Stent_Frame_base_up_1.0_plane']),
        commissure: extractPlaneData(systolicData['Stent_Frame_Crown_Frame_plane'])
      };

      // 加载舒张期数据
      const diastolicResponse = await fetch('/data/shuzhangqi/measurement.json');
      const diastolicData = await diastolicResponse.json();
      const diastolic = {
        inflow: extractPlaneData(diastolicData['Stent_Frame_Base_plane']),
        nadir: extractPlaneData(diastolicData['Stent_Frame_base_up_1.0_plane']),
        commissure: extractPlaneData(diastolicData['Stent_Frame_Crown_Frame_plane'])
      };

      return { systolic, diastolic };
    } catch (error) {
      console.error('Failed to load geometric data for both phases:', error);
      return null;
    }
  }

  /**
   * 处理定位平面
   */
  async function handleLocatePlane(analysisType) {
    if (mainViewerRef.value) {
      mainViewerRef.value.locatePlane(analysisType);
    }
    
    // 根据分析类型确定平面键名
    let targetPlaneKey;
    if (analysisType === 'halt') {
      targetPlaneKey = 'Stent_Frame_Base_plane';
    } else if (analysisType === 'sfd') {
      targetPlaneKey = 'SOV_plane';
    } else if (analysisType === 'pfd') {
      targetPlaneKey = 'Stent_Frame_base_up_1.0_plane';
    } else if (analysisType === 'inflow') {
      targetPlaneKey = 'Stent_Frame_Base_plane';
    } else if (analysisType === 'nadir') {
      targetPlaneKey = 'Stent_Frame_base_up_1.0_plane';
    } else if (analysisType === 'commissure') {
      targetPlaneKey = 'Stent_Frame_Crown_Frame_plane';
    } else {
      console.error('未知的分析类型:', analysisType);
      return;
    }
    
    // 加载所有几何数据
    await loadAllGeometricData();
  }

  /**
   * 处理恢复MPR
   */
  function handleRestoreMPR() {
    if (mainViewerRef.value) {
      mainViewerRef.value.restoreMPR();
    }
  }

  // ========== 返回值 ==========
  return {
    // 状态
    currentPhase,
    currentModule,
    currentSubModule,
    currentSliceIndex,
    currentGeoData,
    mainViewerRef,
    seriesInstanceUID,
    studyInstanceUID,
    // 事件处理
    handleGeoDataUpdate,
    handlePhaseChange,
    handleModuleChange,
    handleSubModuleChange,
    
    handlePlaneLevelChange,
    handleStartMeasure,
    handleStopMeasure,
    handleUndoMeasurement,
    handleToggleVirtualValve,
    handleUpdateValveOpacity,
    handleUpdateValveRotation,
    handleLocatePlane,
    handleRestoreMPR,
    loadAllGeometricData,
    loadGeometricDataForBothPhases
  };
}

