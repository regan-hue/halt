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
      text += 'HALT分析:\n';
      text += `  状态: ${valveAssessment.halt.result || '未填写'}\n`;
      if (valveAssessment.halt.details) {
        text += `  LC分级: ${valveAssessment.halt.details.LC || '-'}\n`;
        text += `  RC分级: ${valveAssessment.halt.details.RC || '-'}\n`;
        text += `  NC分级: ${valveAssessment.halt.details.NC || '-'}\n`;
      }
      text += '\n';
    }
    
    if (valveAssessment.sfd) {
      text += 'SFD分析:\n';
      text += `  状态: ${valveAssessment.sfd.result || '未填写'}\n`;
      if (valveAssessment.sfd.details) {
        text += `  LC: ${valveAssessment.sfd.details.LC ? '是' : '否'}\n`;
        text += `  RC: ${valveAssessment.sfd.details.RC ? '是' : '否'}\n`;
        text += `  NC: ${valveAssessment.sfd.details.NC ? '是' : '否'}\n`;
      }
      text += '\n';
    }
    
    if (valveAssessment.pfd) {
      text += 'PFD分析:\n';
      text += `  状态: ${valveAssessment.pfd.result || '未填写'}\n`;
      if (valveAssessment.pfd.thickness !== undefined) {
        text += `  厚度: ${valveAssessment.pfd.thickness} mm\n`;
      }
      text += '\n';
    }
  }
  
  // 几何形态评估
  if (geometricAssessment) {
    text += '三、瓣膜支架几何形态评估\n';
    text += '-'.repeat(60) + '\n';
    if (geometricAssessment.inflow) {
      text += `流入平面: ${JSON.stringify(geometricAssessment.inflow, null, 2)}\n`;
    }
    if (geometricAssessment.nadir) {
      text += `最低点平面: ${JSON.stringify(geometricAssessment.nadir, null, 2)}\n`;
    }
    if (geometricAssessment.commissure) {
      text += `交接平面: ${JSON.stringify(geometricAssessment.commissure, null, 2)}\n`;
    }
    text += '\n';
  }
  
  // 交接对齐
  if (alignment) {
    text += '四、交接对齐\n';
    text += '-'.repeat(60) + '\n';
    if (alignment.angles) {
      text += `RCA to RCC/LCC: ${alignment.angles.RCA_RCC_LCC || '-'}°\n`;
      text += `RCA to LCC/NCC: ${alignment.angles.RCA_LCC_NCC || '-'}°\n`;
      text += `RCA to NCC/RCC: ${alignment.angles.RCA_NCC_RCC || '-'}°\n`;
    }
    if (alignment.implantDepth) {
      text += '\n瓣膜植入深度:\n';
      text += `  NC: ${alignment.implantDepth.NC || '-'} mm\n`;
      text += `  LC: ${alignment.implantDepth.LC || '-'} mm\n`;
      text += `  RC: ${alignment.implantDepth.RC || '-'} mm\n`;
    }
    if (alignment.morphologyChange) {
      text += `\n形态改变评估: ${alignment.morphologyChange}\n`;
    }
    text += '\n';
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
        result: sidebarData.haltResult,
        details: sidebarData.haltDetails
      },
      sfd: {
        result: sidebarData.sfdResult,
        details: sidebarData.sfdDetails
      },
      pfd: {
        result: sidebarData.pfdResult,
        thickness: sidebarData.pfdThickness
      }
    },
    geometricAssessment: geometricData || {},
    alignment: {
      angles: sidebarData.alignmentAngles,
      implantDepth: sidebarData.implantDepth,
      morphologyChange: sidebarData.morphologyChange
    },
    measurements: [],
    metadata: {
      phase: sidebarData.currentPhase,
      exportDate: new Date().toISOString()
    }
  };
}

