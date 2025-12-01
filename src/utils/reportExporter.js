/**
 * 报告导出工具
 */

/**
 * 导出报告为JSON格式
 * @param {Object} reportData - 报告数据
 * @param {string} filename - 文件名（不含扩展名）
 */
export function exportReportJSON(reportData, filename = 'halt-report') {
  const jsonStr = JSON.stringify(reportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 导出报告为文本格式
 * @param {Object} reportData - 报告数据
 * @param {string} filename - 文件名（不含扩展名）
 */
export function exportReportText(reportData, filename = 'halt-report') {
  let text = generateReportText(reportData);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 生成报告文本内容
 * @param {Object} reportData - 报告数据
 * @returns {string} 报告文本
 */
function generateReportText(reportData) {
  const { basicInfo, valveAssessment, geometricAssessment, alignment, measurements } = reportData;
  
  let text = '='.repeat(60) + '\n';
  text += 'HALT术后预测分析报告\n';
  text += '='.repeat(60) + '\n\n';
  
  // 基本信息
  if (basicInfo) {
    text += '一、基本情况\n';
    text += '-'.repeat(60) + '\n';
    if (basicInfo.patientId) text += `受试者编号: ${basicInfo.patientId}\n`;
    if (basicInfo.name) text += `姓名: ${basicInfo.name}\n`;
    if (basicInfo.gender) text += `性别: ${basicInfo.gender}\n`;
    if (basicInfo.age) text += `年龄: ${basicInfo.age}\n`;
    if (basicInfo.surgeryDate) text += `手术日期: ${basicInfo.surgeryDate}\n`;
    text += '\n';
  }
  
  // 瓣叶功能评估
  if (valveAssessment) {
    text += '二、瓣叶功能评估\n';
    text += '-'.repeat(60) + '\n';
    
    if (valveAssessment.halt) {
      text += 'HALT状态与分级:\n';
      const haltStatusMap = { 'none': '无', 'exists': '有', 'hard': '难以判定' };
      text += `  状态: ${haltStatusMap[valveAssessment.halt.result] || '未填写'}\n`;
      if (valveAssessment.halt.result === 'exists' && valveAssessment.halt.details) {
        text += `  LC分级: ${valveAssessment.halt.details.LC || '-'}\n`;
        text += `  RC分级: ${valveAssessment.halt.details.RC || '-'}\n`;
        text += `  NC分级: ${valveAssessment.halt.details.NC || '-'}\n`;
      }
      text += '\n';
    }
    
    if (valveAssessment.sfd) {
      text += 'SFD分析:\n';
      const sfdStatusMap = { 'none': '无', 'exists': '有', 'hard': '难以判定' };
      text += `  状态: ${sfdStatusMap[valveAssessment.sfd.result] || '未填写'}\n`;
      if (valveAssessment.sfd.result === 'exists' && valveAssessment.sfd.details) {
        text += `  LC: ${valveAssessment.sfd.details.LC ? '是' : '否'}\n`;
        text += `  RC: ${valveAssessment.sfd.details.RC ? '是' : '否'}\n`;
        text += `  NC: ${valveAssessment.sfd.details.NC ? '是' : '否'}\n`;
      }
      text += '\n';
    }
    
    if (valveAssessment.pfd) {
      text += 'PFD分析:\n';
      const pfdStatusMap = { 'none': '无', 'exists': '有', 'hard': '难以判定' };
      text += `  状态: ${pfdStatusMap[valveAssessment.pfd.result] || '未填写'}\n`;
      if (valveAssessment.pfd.result === 'exists' && valveAssessment.pfd.thickness !== undefined) {
        text += `  最大厚度: ${valveAssessment.pfd.thickness} mm\n`;
      }
      text += '\n';
    }
  }
  
  // 几何形态评估
  if (geometricAssessment) {
    text += '三、几何形态评估\n';
    text += '-'.repeat(60) + '\n';
    
    if (geometricAssessment.inflow) {
      text += '流入平面 (Inflow):\n';
      text += `  周长: ${formatValue(geometricAssessment.inflow.perimeter)} mm\n`;
      text += `  面积 (Area): ${formatValue(geometricAssessment.inflow.area)} mm²\n`;
      text += `  最长径 (Dmax): ${formatValue(geometricAssessment.inflow.max_dist)} mm\n`;
      text += `  最短径 (Dmin): ${formatValue(geometricAssessment.inflow.min_dist)} mm\n`;
      text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.inflow.PED)} mm\n`;
      text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.inflow.AED)} mm\n`;
      text += '\n';
    }
    
    if (geometricAssessment.nadir) {
      text += '最低点平面 (Nadir):\n';
      text += `  周长: ${formatValue(geometricAssessment.nadir.perimeter)} mm\n`;
      text += `  面积 (Area): ${formatValue(geometricAssessment.nadir.area)} mm²\n`;
      text += `  最长径 (Dmax): ${formatValue(geometricAssessment.nadir.max_dist)} mm\n`;
      text += `  最短径 (Dmin): ${formatValue(geometricAssessment.nadir.min_dist)} mm\n`;
      text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.nadir.PED)} mm\n`;
      text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.nadir.AED)} mm\n`;
      text += '\n';
    }
    
    if (geometricAssessment.commissure) {
      text += '交接平面 (Commissure):\n';
      text += `  周长: ${formatValue(geometricAssessment.commissure.perimeter)} mm\n`;
      text += `  面积 (Area): ${formatValue(geometricAssessment.commissure.area)} mm²\n`;
      text += `  最长径 (Dmax): ${formatValue(geometricAssessment.commissure.max_dist)} mm\n`;
      text += `  最短径 (Dmin): ${formatValue(geometricAssessment.commissure.min_dist)} mm\n`;
      text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.commissure.PED)} mm\n`;
      text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.commissure.AED)} mm\n`;
      text += '\n';
    }
    
    if (alignment && alignment.implantDepth) {
      text += '瓣膜植入深度:\n';
      text += `  NC: ${formatValue(alignment.implantDepth.NC)} mm\n`;
      text += `  LC: ${formatValue(alignment.implantDepth.LC)} mm\n`;
      text += `  RC: ${formatValue(alignment.implantDepth.RC)} mm\n`;
      text += '\n';
    }
  }
  
  // 交接对齐
  if (alignment) {
    text += '四、交接对齐\n';
    text += '-'.repeat(60) + '\n';
    
    if (alignment.angles) {
      text += '交接对齐角度:\n';
      text += `  RCA to RCC/LCC: ${formatValue(alignment.angles.RCA_RCC_LCC)}°\n`;
      text += `  RCA to LCC/NCC: ${formatValue(alignment.angles.RCA_LCC_NCC)}°\n`;
      text += `  RCA to NCC/RCC: ${formatValue(alignment.angles.RCA_NCC_RCC)}°\n`;
      text += '\n';
    }
    
    if (alignment.morphologyChange) {
      const morphologyMap = { 'none': '无形态改变', 'exists': '存在形态改变', 'unfilled': '未填写' };
      text += `形态改变评估: ${morphologyMap[alignment.morphologyChange] || alignment.morphologyChange}\n`;
      text += '\n';
    }
  }
  
  // 测量数据
  if (measurements && measurements.length > 0) {
    text += '五、测量数据\n';
    text += '-'.repeat(60) + '\n';
    measurements.forEach((measurement, index) => {
      text += `测量 ${index + 1}: ${JSON.stringify(measurement, null, 2)}\n`;
    });
    text += '\n';
  }
  
  text += '='.repeat(60) + '\n';
  text += `报告生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  text += '='.repeat(60) + '\n';
  
  return text;
}

/**
 * 格式化数值
 * @param {number|undefined|null} val - 要格式化的值
 * @returns {string} 格式化后的字符串
 */
function formatValue(val) {
  if (val === undefined || val === null) return '--';
  return Number(val).toFixed(2);
}

/**
 * 收集所有报告数据
 * @param {Object} sidebarData - Sidebar组件的数据
 * @param {Object} geometricData - 几何数据
 * @returns {Object} 完整的报告数据
 */
export function collectReportData(sidebarData, geometricData = null) {
  return {
    basicInfo: {
      patientId: 'P3306022',
      name: 'HOU SHAN MIN',
      gender: '男',
      age: 72,
      surgeryDate: '2025-11-20'
    },
    valveAssessment: {
      halt: {
        result: sidebarData.haltResult?.value || sidebarData.haltResult,
        details: sidebarData.haltDetails?.value || sidebarData.haltDetails
      },
      sfd: {
        result: sidebarData.sfdResult?.value || sidebarData.sfdResult,
        details: sidebarData.sfdDetails?.value || sidebarData.sfdDetails
      },
      pfd: {
        result: sidebarData.pfdResult?.value || sidebarData.pfdResult,
        thickness: sidebarData.pfdThickness?.value || sidebarData.pfdThickness
      }
    },
    geometricAssessment: {
      inflow: geometricData?.inflow || null,
      nadir: geometricData?.nadir || null,
      commissure: geometricData?.commissure || null
    },
    alignment: {
      angles: sidebarData.alignmentAngles?.value || sidebarData.alignmentAngles,
      implantDepth: sidebarData.implantDepth?.value || sidebarData.implantDepth,
      morphologyChange: sidebarData.morphologyChange?.value || sidebarData.morphologyChange
    },
    measurements: [],
    metadata: {
      phase: sidebarData.currentPhase?.value || sidebarData.currentPhase,
      exportDate: new Date().toISOString()
    }
  };
}

