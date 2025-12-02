# 报告导出功能优化说明

## 优化内容

### 1. 收缩期和舒张期数据并排显示

**优化前：**
- 收缩期和舒张期的测量数据分开显示，需要上下翻页对比
- 不便于直接比较两个时期的数据差异

**优化后：**
- 每个平面（Inflow、Nadir、Commissure）的收缩期和舒张期数据在同一表格中并排显示
- 三列布局：测量指标 | 收缩期数值 | 舒张期数值
- 便于直观比较，提高报告可读性

**表格格式示例：**

```
Inflow Plane (Liu Ru Ping Mian)
┌─────────────────────────────────┬──────────────────────┬──────────────────────┐
│ Measurement                      │ Systolic (收缩期)     │ Diastolic (舒张期)    │
├─────────────────────────────────┼──────────────────────┼──────────────────────┤
│ Perimeter (Zhou Chang)          │ 75.20 mm             │ 73.50 mm             │
│ Area (Mian Ji)                  │ 450.30 mm²           │ 430.80 mm²           │
│ Dmax (Zui Chang Jing)           │ 25.40 mm             │ 24.80 mm             │
│ Dmin (Zui Duan Jing)            │ 22.10 mm             │ 21.60 mm             │
│ PED (Zhou Chang Yan Sheng...)   │ 23.95 mm             │ 23.40 mm             │
│ AED (Mian Ji Yan Sheng...)      │ 23.95 mm             │ 23.40 mm             │
└─────────────────────────────────┴──────────────────────┴──────────────────────┘
```

### 2. 中文显示支持（拼音方式）

**优化前：**
- PDF中只有英文，不支持中文
- 医生阅读时需要理解英文术语

**优化后：**
- 所有标题和字段都添加了中文拼音说明
- 格式：`English Term (Zhong Wen Pin Yin)`
- 保持专业性的同时提高可读性

**具体改进：**

#### 报告标题
- `HALT Postoperative Prediction Report`
- `HALT Postoperative Analysis Report`

#### 各部分标题
1. **基本信息**
   - `I. Basic Information (Ji Ben Xin Xi)`
   - Patient ID (Huan Zhe Bian Hao)
   - Name (Xing Ming)
   - Gender (Xing Bie)
   - Age (Nian Ling)
   - Surgery Date (Shou Shu Ri Qi)

2. **瓣叶功能评估**
   - `II. Valve Function Assessment (Ban Ye Gong Neng Ping Gu)`
   - HALT Status (Zhuang Tai)
   - None (Wu) / Exists (You) / Hard to determine (Nan Yi Pan Ding)
   - LC/RC/NC Grade (Fen Ji)

3. **几何形态评估**
   - `III. Geometric Assessment`
   - Inflow Plane (Liu Ru Ping Mian)
   - Nadir Plane (Zui Di Dian Ping Mian)
   - Commissure Plane (Lian He Ping Mian)
   - Perimeter (Zhou Chang)
   - Area (Mian Ji)
   - Dmax (Zui Chang Jing)
   - Dmin (Zui Duan Jing)
   - PED (Zhou Chang Yan Sheng Zhi Jing)
   - AED (Mian Ji Yan Sheng Zhi Jing)

4. **交接对齐**
   - `IV. Commissural Alignment (Jiao Jie Dui Qi)`
   - Implant Depth (Zhi Ru Shen Du)
   - Morphology Change (Xing Tai Gai Bian)

## 技术实现

### 核心改进代码

```javascript
// 两期相数据并排显示
if (reportData.metadata?.hasBothPhases && geometricAssessment?.systolic && geometricAssessment?.diastolic) {
  planes.forEach(plane => {
    const systolicData = geometricAssessment.systolic[plane];
    const diastolicData = geometricAssessment.diastolic[plane];
    
    // 创建对比表格数据
    const comparisonData = metrics.map(metric => {
      const systolicValue = systolicData ? formatValue(systolicData[metric.key]) : '--';
      const diastolicValue = diastolicData ? formatValue(diastolicData[metric.key]) : '--';
      return [
        metric.label,  // 测量指标（带中文拼音）
        `${systolicValue} ${metric.unit}`,  // 收缩期数值
        `${diastolicValue} ${metric.unit}`  // 舒张期数值
      ];
    });

    autoTable(doc, {
      head: [['Measurement', 'Systolic (Shou Suo Qi)', 'Diastolic (Shu Zhang Qi)']],
      body: comparisonData,
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 'auto', halign: 'center' },
        2: { cellWidth: 'auto', halign: 'center' }
      }
    });
  });
}
```

## 使用说明

1. 在侧边栏"报告生成"模块中，填写必要的评估数据
2. 点击"导出报告"按钮
3. 选择导出格式（PDF、JSON、TXT）
4. 生成的PDF报告将自动包含：
   - 中文拼音说明
   - 并排对比的收缩期/舒张期数据（如有两期相数据）

## 注意事项

### 中文字体支持
由于jsPDF默认不支持中文字符渲染，当前采用拼音方式显示中文。如需要完整的中文字符支持，需要：

1. 下载中文字体文件（如思源黑体）
2. 转换为jsPDF支持的格式
3. 在代码中引入字体
4. 设置字体使用

**完整中文支持实现方案：**
```javascript
// 1. 引入字体文件（需要预先准备）
import './fonts/SourceHanSansCN-Normal.js';

// 2. 在创建PDF时设置字体
doc.setFont('SourceHanSansCN-Normal');

// 3. 直接使用中文
doc.text('HALT 术后预测分析报告', pageWidth / 2, yPos, { align: 'center' });
```

### 兼容性
- 单期相数据：自动使用原有的单列显示格式
- 两期相数据：自动使用并排对比格式
- 向后兼容，不影响现有功能

## 效果对比

### 优化前
```
【收缩期 (Systolic Phase)】
Inflow Plane
  Perimeter: 75.20 mm
  Area: 450.30 mm²
  ...

【舒张期 (Diastolic Phase)】
Inflow Plane
  Perimeter: 73.50 mm
  Area: 430.80 mm²
  ...
```

### 优化后
```
Inflow Plane (Liu Ru Ping Mian)
┌─────────────────┬─────────────┬──────────────┐
│ Measurement     │ Systolic    │ Diastolic    │
├─────────────────┼─────────────┼──────────────┤
│ Perimeter       │ 75.20 mm    │ 73.50 mm     │
│ Area            │ 450.30 mm²  │ 430.80 mm²   │
│ ...             │ ...         │ ...          │
└─────────────────┴─────────────┴──────────────┘
```

## 总结

通过本次优化：
1. ✅ 收缩期和舒张期数据并排显示，便于对比分析
2. ✅ 添加中文拼音说明，提高可读性
3. ✅ 保持专业性和规范性
4. ✅ 向后兼容，支持单期相和两期相数据
5. ✅ 表格布局优化，提升视觉效果

报告更加清晰、专业、易读！
