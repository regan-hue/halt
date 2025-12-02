/**
 * 报告导出工具
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'jspdf-autotable';

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * 加载中文字体
 * @param {jsPDF} doc 
 */
async function loadChineseFont(doc) {
  try {
    const response = await fetch('/fonts/SimHei.ttf');
    if (!response.ok) {
      console.warn('无法加载中文字体文件，将使用默认字体');
      return false;
    }
    const buffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    
    doc.addFileToVFS('SimHei.ttf', base64);
    doc.addFont('SimHei.ttf', 'SimHei', 'normal');
    doc.setFont('SimHei');
    return true;
  } catch (error) {
    console.error('加载字体出错:', error);
    return false;
  }
}

/**
 * 导出报告为PDF格式
 * @param {Object} reportData - 报告数据
 * @param {string} filename - 文件名（不含扩展名）
 */
export async function exportReportPDF(reportData, filename = 'halt-report') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // 加载中文字体
  const fontLoaded = await loadChineseFont(doc);
  
  // 如果字体加载失败，回退到 Helvetica，但中文会乱码
  if (!fontLoaded) {
    doc.setFont('helvetica');
  }

  let yPos = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 20;
  const marginRight = 20;

  // 页眉设计
  doc.setFillColor(41, 128, 185);
  doc.rect(0, 0, pageWidth, 8, 'F');

  doc.setFontSize(24);
  doc.setTextColor(41, 128, 185);
  // 如果字体加载成功，使用中文标题，否则使用英文
  if (fontLoaded) {
    doc.text('HALT 术后预测报告', pageWidth / 2, yPos, { align: 'center' });
  } else {
    doc.text('HALT Postoperative Prediction Report', pageWidth / 2, yPos, { align: 'center' });
  }
  
  yPos += 8;
  doc.setFontSize(18);
  doc.setTextColor(52, 73, 94);
  if (fontLoaded) {
    doc.text('HALT 术后分析报告', pageWidth / 2, yPos, { align: 'center' });
  } else {
    doc.text('HALT Postoperative Analysis Report', pageWidth / 2, yPos, { align: 'center' });
  }
  
  yPos += 3;
  doc.setLineWidth(0.5);
  doc.setDrawColor(41, 128, 185);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  yPos += 10;

  // 通用表格样式
  const tableStyles = {
    theme: 'grid',
    headStyles: { 
      fillColor: [41, 128, 185], 
      textColor: [255, 255, 255], 
      fontSize: 11, 
      fontStyle: fontLoaded ? 'normal' : 'bold', // 中文字体通常不支持 bold 样式，除非有对应的 bold 字体文件
      font: fontLoaded ? 'SimHei' : 'helvetica'
    },
    bodyStyles: { 
      fontSize: 10, 
      textColor: [52, 73, 94],
      font: fontLoaded ? 'SimHei' : 'helvetica'
    },
    alternateRowStyles: { fillColor: [240, 248, 255] },
    margin: { left: marginLeft, right: marginRight }
  };

  // 基本信息
  if (reportData.basicInfo) {
    doc.setFontSize(14);
    doc.setTextColor(41, 128, 185);
    if (fontLoaded) {
      doc.text('一、基本信息', marginLeft, yPos);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text('I. Basic Information', marginLeft, yPos);
    }
    yPos += 8;

    const basicInfoData = [];
    const { basicInfo } = reportData;
    
    if (fontLoaded) {
      if (basicInfo.patientId) basicInfoData.push(['受试者编号', basicInfo.patientId]);
      if (basicInfo.name) basicInfoData.push(['姓名', basicInfo.name]);
      if (basicInfo.gender) basicInfoData.push(['性别', basicInfo.gender]);
      if (basicInfo.age) basicInfoData.push(['年龄', `${basicInfo.age} 岁`]);
      if (basicInfo.surgeryDate) basicInfoData.push(['手术日期', basicInfo.surgeryDate]);
    } else {
      if (basicInfo.patientId) basicInfoData.push(['Patient ID', basicInfo.patientId]);
      if (basicInfo.name) basicInfoData.push(['Name', basicInfo.name]);
      if (basicInfo.gender) basicInfoData.push(['Gender', basicInfo.gender]);
      if (basicInfo.age) basicInfoData.push(['Age', `${basicInfo.age} years`]);
      if (basicInfo.surgeryDate) basicInfoData.push(['Surgery Date', basicInfo.surgeryDate]);
    }

    autoTable(doc, {
      startY: yPos,
      head: [[fontLoaded ? '项目' : 'Item', fontLoaded ? '数值' : 'Value']],
      body: basicInfoData,
      ...tableStyles
    });

    yPos = doc.lastAutoTable.finalY + 10;
  }

  // 瓣叶功能评估
  if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
  
  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  if (fontLoaded) {
    doc.text('二、瓣叶功能评估', marginLeft, yPos);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text('II. Valve Function Assessment', marginLeft, yPos);
  }
  yPos += 8;

  const valveData = [];
  const { valveAssessment } = reportData;

  if (valveAssessment?.halt) {
    if (fontLoaded) {
      const haltStatusMap = { 'none': '无', 'exists': '有', 'hard': '难以判定' };
      valveData.push(['HALT 状态', haltStatusMap[valveAssessment.halt.result] || '未填写']);
      
      if (valveAssessment.halt.result === 'exists' && valveAssessment.halt.details) {
        valveData.push(['  LC 分级', valveAssessment.halt.details.LC || '-']);
        valveData.push(['  RC 分级', valveAssessment.halt.details.RC || '-']);
        valveData.push(['  NC 分级', valveAssessment.halt.details.NC || '-']);
      }
    } else {
      const haltStatusMap = { 'none': 'None', 'exists': 'Exists', 'hard': 'Hard to determine' };
      valveData.push(['HALT Status', haltStatusMap[valveAssessment.halt.result] || 'Not filled']);
    }
  }

  if (valveAssessment?.sfd) {
    if (fontLoaded) {
      const sfdStatusMap = { 'none': '无', 'exists': '有', 'hard': '难以判定' };
      valveData.push(['SFD 状态', sfdStatusMap[valveAssessment.sfd.result] || '未填写']);
      
      if (valveAssessment.sfd.result === 'exists' && valveAssessment.sfd.details) {
        valveData.push(['  LC', valveAssessment.sfd.details.LC ? '是' : '否']);
        valveData.push(['  RC', valveAssessment.sfd.details.RC ? '是' : '否']);
        valveData.push(['  NC', valveAssessment.sfd.details.NC ? '是' : '否']);
      }
    }
  }

  if (valveAssessment?.pfd) {
    if (fontLoaded) {
      const pfdStatusMap = { 'none': '无', 'exists': '有', 'hard': '难以判定' };
      valveData.push(['PFD 状态', pfdStatusMap[valveAssessment.pfd.result] || '未填写']);
      
      if (valveAssessment.pfd.result === 'exists' && valveAssessment.pfd.thickness !== undefined) {
        valveData.push(['  最大厚度', `${valveAssessment.pfd.thickness} mm`]);
      }
    }
  }

  if (valveData.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [[fontLoaded ? '评估项目' : 'Assessment Item', fontLoaded ? '结果' : 'Result']],
      body: valveData,
      ...tableStyles,
      headStyles: { ...tableStyles.headStyles, fillColor: [52, 152, 219] }
    });
    yPos = doc.lastAutoTable.finalY + 10;
  }

  // 几何形态评估
  if (yPos > pageHeight - 80) { doc.addPage(); yPos = 20; }
  
  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  if (fontLoaded) {
    doc.text('三、几何形态评估', marginLeft, yPos);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text('III. Geometric Assessment', marginLeft, yPos);
  }
  yPos += 8;

  const { geometricAssessment, alignment } = reportData;
  const formatValue = (val) => (val === undefined || val === null) ? '--' : Number(val).toFixed(2);

  // 检查是否有两期相数据
  if (reportData.metadata?.hasBothPhases && geometricAssessment?.systolic && geometricAssessment?.diastolic) {
    // 两期相数据并排显示
    const planes = ['inflow', 'nadir', 'commissure'];
    const planeNames = fontLoaded ? { 
      inflow: '流入平面 (Inflow)', 
      nadir: '最低点平面 (Nadir)', 
      commissure: '联合平面 (Commissure)' 
    } : {
      inflow: 'Inflow Plane', 
      nadir: 'Nadir Plane', 
      commissure: 'Commissure Plane' 
    };
    
    const metrics = fontLoaded ? [
      { key: 'perimeter', label: '周长', unit: 'mm' },
      { key: 'area', label: '面积', unit: 'mm²' },
      { key: 'max_dist', label: '最长径 (Dmax)', unit: 'mm' },
      { key: 'min_dist', label: '最短径 (Dmin)', unit: 'mm' },
      { key: 'PED', label: '周长衍生直径 (PED)', unit: 'mm' },
      { key: 'AED', label: '面积衍生直径 (AED)', unit: 'mm' }
    ] : [
      { key: 'perimeter', label: 'Perimeter', unit: 'mm' },
      // ... English metrics
    ];

    for (const plane of planes) {
      const systolicData = geometricAssessment.systolic[plane];
      const diastolicData = geometricAssessment.diastolic[plane];
      
      if (systolicData || diastolicData) {
        if (yPos > pageHeight - 70) { doc.addPage(); yPos = 20; }
        
        doc.setFontSize(12);
        doc.setTextColor(52, 73, 94);
        doc.text(planeNames[plane], marginLeft, yPos);
        yPos += 6;

        // 创建对比表格数据
        const comparisonData = metrics.map(metric => {
          const systolicValue = systolicData ? formatValue(systolicData[metric.key]) : '--';
          const diastolicValue = diastolicData ? formatValue(diastolicData[metric.key]) : '--';
          return [
            metric.label,
            `${systolicValue} ${metric.unit}`,
            `${diastolicValue} ${metric.unit}`
          ];
        });

        autoTable(doc, {
          startY: yPos,
          head: [[fontLoaded ? '测量项目' : 'Measurement', fontLoaded ? '收缩期' : 'Systolic', fontLoaded ? '舒张期' : 'Diastolic']],
          body: comparisonData,
          ...tableStyles,
          headStyles: { 
            ...tableStyles.headStyles,
            fillColor: [52, 152, 219], 
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 70, fontStyle: fontLoaded ? 'normal' : 'bold' },
            1: { cellWidth: 'auto', halign: 'center' },
            2: { cellWidth: 'auto', halign: 'center' }
          }
        });

        yPos = doc.lastAutoTable.finalY + 8;
      }
    }
  } else {
    // 单期相数据（原有逻辑）
    const planeNames = fontLoaded ? { 
      inflow: '流入平面 (Inflow)', 
      nadir: '最低点平面 (Nadir)', 
      commissure: '联合平面 (Commissure)' 
    } : {
      inflow: 'Inflow Plane', 
      nadir: 'Nadir Plane', 
      commissure: 'Commissure Plane' 
    };
    
    ['inflow', 'nadir', 'commissure'].forEach(plane => {
      if (geometricAssessment?.[plane]) {
        if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
        
        doc.setFontSize(12);
        doc.setTextColor(52, 73, 94);
        doc.text(planeNames[plane], marginLeft, yPos);
        yPos += 6;

        const data = geometricAssessment[plane];
        const planeData = fontLoaded ? [
          ['周长', `${formatValue(data.perimeter)} mm`],
          ['面积', `${formatValue(data.area)} mm²`],
          ['最长径 (Dmax)', `${formatValue(data.max_dist)} mm`],
          ['最短径 (Dmin)', `${formatValue(data.min_dist)} mm`],
          ['周长衍生直径 (PED)', `${formatValue(data.PED)} mm`],
          ['面积衍生直径 (AED)', `${formatValue(data.AED)} mm`]
        ] : [];

        autoTable(doc, {
          startY: yPos,
          body: planeData,
          theme: 'striped',
          bodyStyles: { ...tableStyles.bodyStyles },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: marginLeft + 5, right: marginRight },
          columnStyles: { 0: { cellWidth: 80, fontStyle: fontLoaded ? 'normal' : 'bold' }, 1: { cellWidth: 'auto' } }
        });

        yPos = doc.lastAutoTable.finalY + 8;
      }
    });
  }

  // 植入深度
  if (alignment?.implantDepth) {
    if (yPos > pageHeight - 40) { doc.addPage(); yPos = 20; }
    
    doc.setFontSize(12);
    doc.setTextColor(52, 73, 94);
    doc.text(fontLoaded ? '植入深度' : 'Implant Depth', marginLeft, yPos);
    yPos += 6;

    const depthData = [
      ['NC', `${formatValue(alignment.implantDepth.NC)} mm`],
      ['LC', `${formatValue(alignment.implantDepth.LC)} mm`],
      ['RC', `${formatValue(alignment.implantDepth.RC)} mm`]
    ];

    autoTable(doc, {
      startY: yPos,
      body: depthData,
      theme: 'striped',
      bodyStyles: { ...tableStyles.bodyStyles },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: marginLeft + 5, right: marginRight },
      columnStyles: { 0: { cellWidth: 60, fontStyle: fontLoaded ? 'normal' : 'bold' }, 1: { cellWidth: 'auto' } }
    });

    yPos = doc.lastAutoTable.finalY + 10;
  }

  // 交接对齐
  if (alignment) {
    if (yPos > pageHeight - 50) { doc.addPage(); yPos = 20; }
    
    doc.setFontSize(14);
    doc.setTextColor(41, 128, 185);
    if (fontLoaded) {
      doc.text('四、交接对齐', marginLeft, yPos);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text('IV. Commissural Alignment', marginLeft, yPos);
    }
    yPos += 8;

    const alignmentData = [];

    if (alignment.angles) {
      alignmentData.push(['RCA to RCC/LCC', `${formatValue(alignment.angles.RCA_RCC_LCC)}°`]);
      alignmentData.push(['RCA to LCC/NCC', `${formatValue(alignment.angles.RCA_LCC_NCC)}°`]);
      alignmentData.push(['RCA to NCC/RCC', `${formatValue(alignment.angles.RCA_NCC_RCC)}°`]);
    }

    if (alignment.morphologyChange) {
      if (fontLoaded) {
        const morphologyMap = { 
          'none': '无形态改变', 
          'exists': '存在形态改变', 
          'unfilled': '未填写' 
        };
        alignmentData.push(['形态改变', morphologyMap[alignment.morphologyChange] || alignment.morphologyChange]);
      }
    }

    if (alignmentData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [[fontLoaded ? '项目' : 'Item', fontLoaded ? '数值' : 'Value']],
        body: alignmentData,
        ...tableStyles,
        headStyles: { ...tableStyles.headStyles, fillColor: [52, 152, 219] }
      });
    }
  }

  // 页脚
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(41, 128, 185);
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    if (fontLoaded) {
      doc.text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, marginLeft, pageHeight - 8);
      doc.text(`第 ${i} 页 / 共 ${pageCount} 页`, pageWidth - marginRight, pageHeight - 8, { align: 'right' });
    } else {
      doc.text(`Generated: ${new Date().toLocaleString('zh-CN')}`, marginLeft, pageHeight - 8);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginRight, pageHeight - 8, { align: 'right' });
    }
  }

  doc.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);
}

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
    
    // 检查是否有两期相数据
    if (reportData.metadata?.hasBothPhases && geometricAssessment.systolic && geometricAssessment.diastolic) {
      // 收缩期数据
      text += '【收缩期 (Systolic Phase)】\n\n';
      
      if (geometricAssessment.systolic.inflow) {
        text += '流入平面 (Inflow):\n';
        text += `  周长: ${formatValue(geometricAssessment.systolic.inflow.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.systolic.inflow.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.systolic.inflow.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.systolic.inflow.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.systolic.inflow.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.systolic.inflow.AED)} mm\n`;
        text += '\n';
      }
      
      if (geometricAssessment.systolic.nadir) {
        text += '最低点平面 (Nadir):\n';
        text += `  周长: ${formatValue(geometricAssessment.systolic.nadir.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.systolic.nadir.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.systolic.nadir.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.systolic.nadir.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.systolic.nadir.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.systolic.nadir.AED)} mm\n`;
        text += '\n';
      }
      
      if (geometricAssessment.systolic.commissure) {
        text += '联合平面 (Commissure):\n';
        text += `  周长: ${formatValue(geometricAssessment.systolic.commissure.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.systolic.commissure.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.systolic.commissure.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.systolic.commissure.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.systolic.commissure.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.systolic.commissure.AED)} mm\n`;
        text += '\n';
      }

      // 舒张期数据
      text += '【舒张期 (Diastolic Phase)】\n\n';
      
      if (geometricAssessment.diastolic.inflow) {
        text += '流入平面 (Inflow):\n';
        text += `  周长: ${formatValue(geometricAssessment.diastolic.inflow.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.diastolic.inflow.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.diastolic.inflow.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.diastolic.inflow.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.diastolic.inflow.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.diastolic.inflow.AED)} mm\n`;
        text += '\n';
      }
      
      if (geometricAssessment.diastolic.nadir) {
        text += '最低点平面 (Nadir):\n';
        text += `  周长: ${formatValue(geometricAssessment.diastolic.nadir.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.diastolic.nadir.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.diastolic.nadir.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.diastolic.nadir.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.diastolic.nadir.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.diastolic.nadir.AED)} mm\n`;
        text += '\n';
      }
      
      if (geometricAssessment.diastolic.commissure) {
        text += '联合平面 (Commissure):\n';
        text += `  周长: ${formatValue(geometricAssessment.diastolic.commissure.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.diastolic.commissure.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.diastolic.commissure.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.diastolic.commissure.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.diastolic.commissure.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.diastolic.commissure.AED)} mm\n`;
        text += '\n';
      }
    } else {
      // 单期相数据（原有逻辑）
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
        text += '联合平面 (Commissure):\n';
        text += `  周长: ${formatValue(geometricAssessment.commissure.perimeter)} mm\n`;
        text += `  面积 (Area): ${formatValue(geometricAssessment.commissure.area)} mm²\n`;
        text += `  最长径 (Dmax): ${formatValue(geometricAssessment.commissure.max_dist)} mm\n`;
        text += `  最短径 (Dmin): ${formatValue(geometricAssessment.commissure.min_dist)} mm\n`;
        text += `  周长衍生直径 (PED): ${formatValue(geometricAssessment.commissure.PED)} mm\n`;
        text += `  面积衍生直径 (AED): ${formatValue(geometricAssessment.commissure.AED)} mm\n`;
        text += '\n';
      }
    }
  }
    
  if (alignment && alignment.implantDepth) {
    text += '瓣膜植入深度:\n';
    text += `  NC: ${formatValue(alignment.implantDepth.NC)} mm\n`;
    text += `  LC: ${formatValue(alignment.implantDepth.LC)} mm\n`;
    text += `  RC: ${formatValue(alignment.implantDepth.RC)} mm\n`;
    text += '\n';
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
 * @param {Object} geometricData - 几何数据（可以是单期相或两期相的数据）
 * @returns {Object} 完整的报告数据
 */
export function collectReportData(sidebarData, geometricData = null) {
  // 判断是否包含两期相数据
  const hasBothPhases = geometricData && geometricData.systolic && geometricData.diastolic;
  
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
    geometricAssessment: hasBothPhases ? {
      systolic: {
        inflow: geometricData.systolic.inflow || null,
        nadir: geometricData.systolic.nadir || null,
        commissure: geometricData.systolic.commissure || null
      },
      diastolic: {
        inflow: geometricData.diastolic.inflow || null,
        nadir: geometricData.diastolic.nadir || null,
        commissure: geometricData.diastolic.commissure || null
      }
    } : {
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
      exportDate: new Date().toISOString(),
      hasBothPhases: hasBothPhases
    }
  };
}
