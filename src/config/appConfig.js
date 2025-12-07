/**
 * 应用程序配置
 * 集中管理所有配置常量和默认值
 */

/**
 * DICOM 系列实例 UID 配置（默认值，可被 URL 参数覆盖）
 * URL 参数说明：
 * - StudyInstanceUID: 研究实例 UID
 * - BestSyst: 收缩期系列 UID
 * - BestDiast: 舒张期系列 UID
 * 
 * 示例：
 * http://192.168.1.3:3002/halt?StudyInstanceUID=1.2.826...&BestSyst=1.3.12...&BestDiast=1.3.12...
 */
export const DEFAULT_SERIES_INSTANCE_UIDS = {
  收缩期: '1',
  舒张期: '1',
};

/**
 * 默认研究实例 UID
 */
export const DEFAULT_STUDY_INSTANCE_UID = '1.2.';

/**
 * 默认期相
 */
export const DEFAULT_PHASE = '收缩期';

/**
 * 默认模块
 */
export const DEFAULT_MODULE = 'valve';

/**
 * 默认子模块
 */
export const DEFAULT_SUB_MODULE = 'halt';

/**
 * 当前应用配置（全局单例）
 * 在应用启动时初始化，供其他模块使用
 */
let currentAppConfig = null;

/**
 * 从 URL 参数获取配置
 * @returns {Object} 配置对象
 */
export function getAppConfig() {
  const urlParams = new URLSearchParams(window.location.search);

  // 从 URL 获取参数
  const studyUID = urlParams.get('StudyInstanceUID');
  const bestSyst = urlParams.get('BestSyst');
  const bestDiast = urlParams.get('BestDiast');

  // 打印调试信息
  if (studyUID || bestSyst || bestDiast) {
    console.log('📋 从 URL 获取到的参数:', {
      StudyInstanceUID: studyUID,
      BestSyst: bestSyst,
      BestDiast: bestDiast,
    });
  }

  const config = {
    seriesInstanceUIDs: {
      收缩期: bestSyst || 
              import.meta.env.VITE_SERIES_UID_SYSTOLIC || 
              DEFAULT_SERIES_INSTANCE_UIDS.收缩期,
      舒张期: bestDiast || 
              import.meta.env.VITE_SERIES_UID_DIASTOLIC || 
              DEFAULT_SERIES_INSTANCE_UIDS.舒张期,
    },
    studyInstanceUID: studyUID || 
                      import.meta.env.VITE_STUDY_INSTANCE_UID || 
                      DEFAULT_STUDY_INSTANCE_UID,
  };

  // 保存到全局配置
  currentAppConfig = config;
  
  return config;
}

/**
 * 获取当前应用配置
 * @returns {Object|null} 当前配置对象，如果未初始化则返回 null
 */
export function getCurrentAppConfig() {
  return currentAppConfig;
}

