/**
 * 应用程序配置
 * 集中管理所有配置常量和默认值
 */

/**
 * DICOM 系列实例 UID 配置
 * 支持通过 URL 参数或环境变量覆盖
 */
export const DEFAULT_SERIES_INSTANCE_UIDS = {
  收缩期: '1.3.12.2.1107.5.1.4.73336.30000022051900071431600050933',
  舒张期: '1.3.12.2.1107.5.1.4.73336.30000022051900071431600051249',
};

/**
 * 默认研究实例 UID
 */
export const DEFAULT_STUDY_INSTANCE_UID = '1.2.826.0.1.3680043.2.109.5.20220519102622656.1699758078.1';

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
 * 从 URL 参数或环境变量获取配置
 * @returns {Object} 配置对象
 */
export function getAppConfig() {
  const urlParams = new URLSearchParams(window.location.search);

  return {
    seriesInstanceUIDs: {
      收缩期: urlParams.get('seriesUID_systolic') || 
              import.meta.env.VITE_SERIES_UID_SYSTOLIC || 
              DEFAULT_SERIES_INSTANCE_UIDS.收缩期,
      舒张期: urlParams.get('seriesUID_diastolic') || 
              import.meta.env.VITE_SERIES_UID_DIASTOLIC || 
              DEFAULT_SERIES_INSTANCE_UIDS.舒张期,
    },
    studyInstanceUID: urlParams.get('studyUID') || 
                      import.meta.env.VITE_STUDY_INSTANCE_UID || 
                      DEFAULT_STUDY_INSTANCE_UID,
  };
}

