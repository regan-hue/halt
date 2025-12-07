/**
 * API 客户端工具
 * 用于从远程服务器获取 STL 文件和 JSON 数据
 */

import { DEFAULT_SERIES_INSTANCE_UIDS } from '../config/appConfig.js';

/**
 * API 基础配置
 */
const API_CONFIG = {
  baseURL: '', // 使用代理，不需要完整 URL
  endpoints: {
    assets: '/cad/sequence/assets',
  },
  seriesType: '12', // 固定为 12
};

/**
 * 数据名称映射
 * 将本地文件名映射到 API 的 dataName 参数
 */
const DATA_NAME_MAP = {
  // STL 文件映射
  'aorta.stl': { dataName: 'stl_aorta', inputType: '1' },
  'GH.stl': { dataName: 'stl_gh', inputType: '1' },
  'LA.stl': { dataName: 'stl_la', inputType: '1' },
  'LCA.stl': { dataName: 'stl_lca', inputType: '1' },
  'RCA.stl': { dataName: 'stl_rca', inputType: '1' },
  'ZJ.stl': { dataName: 'stl_zj', inputType: '1' },
  // JSON 文件映射
  'measurement.json': { dataName: 'halt_measurement', inputType: '3' },
};

/**
 * 获取期相对应的 seriesInstanceUid
 * @param {string} phase - 期相名称（'收缩期' 或 '舒张期'）
 * @returns {string} seriesInstanceUid
 */
function getSeriesInstanceUid(phase) {
  return DEFAULT_SERIES_INSTANCE_UIDS[phase] || DEFAULT_SERIES_INSTANCE_UIDS['收缩期'];
}

/**
 * 构建请求 URL
 * @param {string} fileName - 文件名（如 'aorta.stl' 或 'measurement.json'）
 * @param {string} phase - 期相名称（'收缩期' 或 '舒张期'）
 * @returns {string} 完整的请求 URL
 */
function buildRequestURL(fileName, phase) {
  const mapping = DATA_NAME_MAP[fileName];
  if (!mapping) {
    throw new Error(`未知的文件名: ${fileName}`);
  }

  const seriesInstanceUid = getSeriesInstanceUid(phase);
  const { dataName, inputType } = mapping;

  const params = new URLSearchParams({
    seriesInstanceUid,
    seriesType: API_CONFIG.seriesType,
    inputType,
    dataName,
  });

  return `${API_CONFIG.baseURL}${API_CONFIG.endpoints.assets}?${params.toString()}`;
}

/**
 * 获取 STL 文件
 * @param {string} fileName - STL 文件名（如 'aorta.stl'）
 * @param {string} phase - 期相名称（'收缩期' 或 '舒张期'）
 * @returns {Promise<ArrayBuffer>} STL 文件的二进制数据
 */
export async function fetchSTLFile(fileName, phase) {
  try {
    const url = buildRequestURL(fileName, phase);
    console.log(`加载 STL 文件: ${fileName} (${phase}) 从 ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // 携带 Cookie
      headers: {
        'Accept': 'application/octet-stream, */*',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.arrayBuffer();
  } catch (error) {
    console.error(`加载 STL 文件失败 (${fileName}, ${phase}):`, error);
    throw error;
  }
}

/**
 * 获取 JSON 数据
 * @param {string} fileName - JSON 文件名（如 'measurement.json'）
 * @param {string} phase - 期相名称（'收缩期' 或 '舒张期'）
 * @returns {Promise<Object>} 解析后的 JSON 对象
 */
export async function fetchJSONFile(fileName, phase) {
  try {
    const url = buildRequestURL(fileName, phase);
    console.log(`加载 JSON 文件: ${fileName} (${phase}) 从 ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // 携带 Cookie
      headers: {
        'Accept': 'application/json, */*',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // 处理 API 响应格式：{"code":1,"success":true,"msg":"操作成功","data":{"measurement":{...}}}
    if (result && result.data && result.data.measurement) {
      console.log(`成功解析 measurement 数据 (${phase})`);
      return result.data.measurement;
    }
    
    // 如果响应格式不匹配，抛出错误
    throw new Error(`响应格式不正确: ${JSON.stringify(result).substring(0, 100)}`);
  } catch (error) {
    console.error(`加载 JSON 文件失败 (${fileName}, ${phase}):`, error);
    throw error;
  }
}

/**
 * 批量获取所有 STL 文件
 * @param {string} phase - 期相名称（'收缩期' 或 '舒张期'）
 * @returns {Promise<Object>} 文件名到 ArrayBuffer 的映射
 */
export async function fetchAllSTLFiles(phase) {
  const stlFiles = ['aorta.stl', 'GH.stl', 'LA.stl', 'LCA.stl', 'RCA.stl', 'ZJ.stl'];
  
  const results = {};
  for (const fileName of stlFiles) {
    try {
      results[fileName] = await fetchSTLFile(fileName, phase);
    } catch (error) {
      console.error(`跳过文件 ${fileName}:`, error);
      results[fileName] = null;
    }
  }
  
  return results;
}
