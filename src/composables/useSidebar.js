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
  const haltResult = ref('exists');
  const haltDetails = ref({ LC: '0', RC: '0', NC: '0' });
  const haltGrades = ['0', '≤25%', '25-50%', '50-75%', '>75%'];

  const sfdResult = ref('exists');
  const sfdDetails = ref({ LC: false, RC: true, NC: false });

  const pfdResult = ref('exists');
  const pfdThickness = ref(23.6);

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

  // ========== 返回值 ==========
  return {
    // 状态
    currentPhase,
    currentModule,
    subModule,
    geoType,
    haltResult,
    haltDetails,
    haltGrades,
    sfdResult,
    sfdDetails,
    pfdResult,
    pfdThickness,
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
    formatNum
  };
}

