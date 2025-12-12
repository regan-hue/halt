import { ref } from 'vue';
import { DEFAULT_PHASE, DEFAULT_MODULE, DEFAULT_SUB_MODULE } from '../config/appConfig.js';

/**
 * Sidebar Composable
 * 管理侧边栏的状态和交互逻辑
 * 
 * @param {Object} props - 组件属性
 * @param {Function} emit - 事件发射函数
 * @returns {Object} Sidebar 状态和方法
 */
export function useSidebar(props, emit) {
  // ========== 状态管理 ==========
  const currentPhase = ref(props.initialPhase || DEFAULT_PHASE);
  const currentModule = ref(DEFAULT_MODULE);
  const subModule = ref(DEFAULT_SUB_MODULE);
  const geoType = ref('inflow');

  // ========== 数据模型 ==========
  // HALT - 临时数据（编辑中）
  const haltResult = ref('exists');
  const haltDetails = ref({ LC: '0', RC: '0', NC: '0' });
  const haltGrades = ['0', '≤25%', '25-50%', '50-75%', '>75%'];
  
  // HALT - 已保存数据（用于报告）
  const savedHaltResult = ref(null);
  const savedHaltDetails = ref(null);

  // SFD - 临时数据（编辑中）
  const sfdResult = ref('exists');
  const sfdDetails = ref({ LC: false, RC: true, NC: false });
  
  // SFD - 已保存数据（用于报告）
  const savedSfdResult = ref(null);
  const savedSfdDetails = ref(null);

  // PFD - 临时数据（编辑中）
  const pfdResult = ref('exists');
  const pfdThickness = ref(0);
  
  // PFD - 已保存数据（用于报告）
  const savedPfdResult = ref(null);
  const savedPfdThickness = ref(null);

  const planeLevel = ref(0);
  const valveOpacity = ref(0.22);
  const valveRotation = ref(-29);


  const implantDepth = ref({ NC: 0.00, LC: 0.00, RC: 0.00 });
  const alignmentAngles = ref({ RCA_RCC_LCC: 0.0, RCA_LCC_NCC: 0.0, RCA_NCC_RCC: 0.0 });
  const morphologyChange = ref('exists');

  // ========== 事件处理函数 ==========
  
  /**
   * 设置当前期相
   */
  function setPhase(phase) {
    // 去重：重复点击同一期相不触发昂贵的全局切换
    if (phase === currentPhase.value) return;
    currentPhase.value = phase;
    emit('phase-change', phase);
  }

  /**
   * 设置当前模块
   * 
   * @param {string|Object} mod - 模块名称或模块对象
   */
  function setModule(mod) {
    currentModule.value = mod;
    
    if (mod === 'geometric') {
      // 几何模块需要特殊处理
      if (!geoType.value) geoType.value = 'inflow';
      emit('module-change', { module: 'geometric', type: geoType.value });
      emit('sub-module-change', { module: 'geometric', type: geoType.value });
    } else {
      emit('module-change', mod);
      if (mod === 'valve') {
        emit('sub-module-change', subModule.value);
      }
    }
  }

  /**
   * 设置当前子模块
   */
  function setSubModule(mod) {
    subModule.value = mod;
    emit('sub-module-change', mod);
    emit('module-change', mod);
  }

  /**
   * 处理平面级别变化
   */
  function onPlaneLevelChange() {
    emit('plane-level-change', Number(planeLevel.value));
  }

  /**
   * 显示几何分析类型
   */
  function showGeometric(type) {
    geoType.value = type;
    emit('sub-module-change', { module: 'geometric', type });
    emit('module-change', { module: 'geometric', type });
  }

  /**
   * 格式化数字显示
   * 
   * @param {number|undefined|null} val - 要格式化的值
   * @returns {string} 格式化后的字符串
   */
  function formatNum(val) {
    if (val === undefined || val === null) return '--';
    return Number(val).toFixed(2);
  }

  /**
   * 保存 HALT 数据到报告
   */
  function saveHaltData() {
    savedHaltResult.value = haltResult.value;
    savedHaltDetails.value = { ...haltDetails.value };
  }

  /**
   * 保存 SFD 数据到报告
   */
  function saveSfdData() {
    savedSfdResult.value = sfdResult.value;
    savedSfdDetails.value = { ...sfdDetails.value };
  }

  /**
   * 保存 PFD 数据到报告
   */
  function savePfdData() {
    savedPfdResult.value = pfdResult.value;
    savedPfdThickness.value = pfdThickness.value;
  }

  // ========== 返回值 ==========
  return {
    // 状态
    currentPhase,
    currentModule,
    subModule,
    geoType,
    // HALT 数据
    haltResult,
    haltDetails,
    haltGrades,
    savedHaltResult,
    savedHaltDetails,
    // SFD 数据
    sfdResult,
    sfdDetails,
    savedSfdResult,
    savedSfdDetails,
    // PFD 数据
    pfdResult,
    pfdThickness,
    savedPfdResult,
    savedPfdThickness,
    // 其他数据
    planeLevel,
    valveOpacity,
    valveRotation,
    implantDepth,
    alignmentAngles,
    morphologyChange,
    // 方法
    setPhase,
    setModule,
    setSubModule,
    onPlaneLevelChange,
    showGeometric,
    formatNum,
    saveHaltData,
    saveSfdData,
    savePfdData
  };
}

