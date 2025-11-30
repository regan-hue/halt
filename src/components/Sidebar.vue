<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Halt 术后预测</h2>
      <div class="phase-toggle">
        <button 
          :class="{ active: currentPhase === '收缩期' }" 
          @click="setPhase('收缩期')"
        >收缩期</button>
        <button 
          :class="{ active: currentPhase === '舒张期' }" 
          @click="setPhase('舒张期')"
        >舒张期</button>
      </div>
    </div>

    <div class="modules-nav">
      <div 
        class="nav-item" 
        :class="{ active: currentModule === 'valve' }"
        @click="setModule('valve')"
      >
        瓣叶功能评估
      </div>
      <div 
        class="nav-item" 
        :class="{ active: currentModule === 'geometric' }"
        @click="setModule('geometric')"
      >
        瓣膜支架几何形态评估
      </div>
      <div 
        class="nav-item" 
        :class="{ active: currentModule === 'alignment' }"
        @click="setModule('alignment')"
      >
        交接对齐
      </div>
      <div 
        class="nav-item" 
        :class="{ active: currentModule === 'report' }"
        @click="setModule('report')"
      >
        报告生成
      </div>
    </div>

    <div class="module-content">
      <!-- Global Slice Control -->
      <!-- Removed slice view toggle -->

      <!-- Valve Assessment Module -->
      <div v-if="currentModule === 'valve'" class="module-panel">
        <div class="sub-menu">
          <button :class="{ active: subModule === 'halt' }" @click="setSubModule('halt')">HALT分析</button>
          <button :class="{ active: subModule === 'sfd' }" @click="setSubModule('sfd')">SFD分析</button>
          <button :class="{ active: subModule === 'pfd' }" @click="setSubModule('pfd')">PFD分析</button>
        </div>
        
        <!-- HALT -->
        <div v-if="subModule === 'halt'" class="analysis-content">
          <h4><span class="icon">🧪</span> HALT 状态与分级</h4>
          <p class="sub-label">1. HALT状态</p>
          <div class="status-options">
            <label class="status-btn" :class="{ active: haltResult === 'none' }">
              <input type="radio" v-model="haltResult" value="none"> 无
            </label>
            <label class="status-btn" :class="{ active: haltResult === 'exists' }">
              <input type="radio" v-model="haltResult" value="exists"> 有
            </label>
            <label class="status-btn" :class="{ active: haltResult === 'hard' }">
              <input type="radio" v-model="haltResult" value="hard"> 难以判定
            </label>
          </div>

          <div v-if="haltResult === 'exists'" class="detail-panel">
            <p class="sub-label">HALT分级 (0 -> <=25% -> 25-50% -> 50-75% -> >75%)</p>
            
            <div class="grade-row" v-for="leaf in ['LC', 'RC', 'NC']" :key="leaf">
              <span class="leaf-label">{{ leaf }}</span>
              <div class="grade-options">
                 <button 
                   v-for="grade in haltGrades" 
                   :key="grade"
                   :class="{ active: haltDetails[leaf] === grade }"
                   @click="haltDetails[leaf] = grade"
                 >{{ grade }}</button>
              </div>
            </div>
          </div>
          
          <div class="slider-control mt-20">
            <label>平面层级定位 (Stent_Frame_base_up_X)</label>
            <div class="slider-row">
               <input type="range" min="0" max="5" step="0.5" v-model="planeLevel" @input="onPlaneLevelChange">
               <span class="value-tag">{{ planeLevel }}</span>
            </div>
          </div>
          
          <div class="control-buttons mt-20">
            <button class="secondary-btn" @click="$emit('locate-plane', 'halt')">📍 定位平面</button>
            <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
          </div>
        </div>

        <!-- SFD -->
        <div v-if="subModule === 'sfd'" class="analysis-content">
          <h4><span class="icon">🧪</span> SFD 状态与选择</h4>
          <p class="sub-label">1. SFD状态</p>
          <div class="status-options">
            <label class="status-btn" :class="{ active: sfdResult === 'none' }">
              <input type="radio" v-model="sfdResult" value="none"> 无
            </label>
            <label class="status-btn" :class="{ active: sfdResult === 'exists' }">
              <input type="radio" v-model="sfdResult" value="exists"> 有
            </label>
            <label class="status-btn" :class="{ active: sfdResult === 'hard' }">
              <input type="radio" v-model="sfdResult" value="hard"> 难以判定
            </label>
          </div>

           <div v-if="sfdResult === 'exists'" class="detail-panel">
            <p class="sub-label">2. 受累主动脉窦</p>
            <div class="checkbox-group">
                <label class="checkbox-btn" :class="{ active: sfdDetails.LC }">
                   <input type="checkbox" v-model="sfdDetails.LC"> LC
                </label>
                <label class="checkbox-btn" :class="{ active: sfdDetails.RC }">
                   <input type="checkbox" v-model="sfdDetails.RC"> RC
                </label>
                <label class="checkbox-btn" :class="{ active: sfdDetails.NC }">
                   <input type="checkbox" v-model="sfdDetails.NC"> NC
                </label>
            </div>
          </div>
          
          <div class="control-buttons mt-20">
            <button class="secondary-btn" @click="$emit('locate-plane', 'sfd')">📍 定位平面</button>
            <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
          </div>
        </div>

        <!-- PFD -->
        <div v-if="subModule === 'pfd'" class="analysis-content">
          <h4><span class="icon">🧪</span> PFD 状态与厚度</h4>
          <p class="sub-label">1. PFD状态</p>
          <div class="status-options">
            <label class="status-btn" :class="{ active: pfdResult === 'none' }">
              <input type="radio" v-model="pfdResult" value="none"> 无
            </label>
            <label class="status-btn" :class="{ active: pfdResult === 'exists' }">
              <input type="radio" v-model="pfdResult" value="exists"> 有
            </label>
            <label class="status-btn" :class="{ active: pfdResult === 'hard' }">
              <input type="radio" v-model="pfdResult" value="hard"> 难以判定
            </label>
          </div>
          
          <div v-if="pfdResult === 'exists'" class="detail-panel">
             <p class="sub-label">2. 最大厚度</p>
             <div class="input-with-button">
                <label>厚度 (mm): </label>
                <input type="number" v-model="pfdThickness" step="0.1">
                <button class="secondary-btn" @click="$emit('start-measure')">重新测量</button>
             </div>
             <p class="hint">提示: 点击测量工具在 MPR 放两点完成长度测量</p>
          </div>
          
          <div class="control-buttons mt-20">
            <button class="secondary-btn" @click="$emit('locate-plane', 'pfd')">📍 定位平面</button>
            <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
          </div>
        </div>
      </div>

      <!-- Geometric Assessment -->
      <div v-if="currentModule === 'geometric'" class="module-panel">
        <h3>瓣膜支架几何形态评估</h3>
        <div class="sub-menu">
          <button :class="{ active: geoType === 'inflow' }" @click="showGeometric('inflow')">Inflow</button>
          <button :class="{ active: geoType === 'nadir' }" @click="showGeometric('nadir')">Nadir</button>
          <button :class="{ active: geoType === 'commissure' }" @click="showGeometric('commissure')">Commissure</button>
          <button :class="{ active: geoType === 'depth' }" @click="showGeometric('depth')">瓣膜植入深度</button>
        </div>
        
        <div v-if="geoType !== 'depth'" class="analysis-content">
            <h4>📊 测量参数</h4>
            <div class="data-grid">
               <div class="data-row"><span>周长</span><span class="data-value">{{ formatNum(geometricData?.perimeter) }} mm</span></div>
               <div class="data-row"><span>面积 (Area)</span><span class="data-value">{{ formatNum(geometricData?.area) }} mm²</span></div>
               <div class="data-row"><span>最长径 (Dmax)</span><span class="data-value">{{ formatNum(geometricData?.max_dist) }} mm</span></div>
               <div class="data-row"><span>最短径 (Dmin)</span><span class="data-value">{{ formatNum(geometricData?.min_dist) }} mm</span></div>
               <div class="data-row highlight"><span>周长衍生直径 (PED)</span><span class="data-value">{{ formatNum(geometricData?.PED) }} mm</span></div>
               <div class="data-row"><span>面积衍生直径 (AED)</span><span class="data-value">{{ formatNum(geometricData?.AED) }} mm</span></div>
            </div>
            
            <div class="control-buttons mt-20">
              <button class="secondary-btn" @click="$emit('locate-plane', geoType)">📍 定位平面</button>
              <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
            </div>
        </div>

        <div v-if="geoType === 'depth'" class="analysis-content">
             <h4>📏 瓣膜植入深度</h4>
             <div class="tool-panel">
                <button class="secondary-btn" @click="$emit('start-measure')">测量工具</button>
                <p class="hint">启动工具在MPR中放置两个点完成测量</p>
             </div>
             <div class="form-grid">
                <div class="form-item">
                    <label>NC (mm)</label>
                    <input type="number" v-model="implantDepth.NC">
                </div>
                <div class="form-item">
                    <label>LC (mm)</label>
                    <input type="number" v-model="implantDepth.LC">
                </div>
                <div class="form-item">
                    <label>RC (mm)</label>
                    <input type="number" v-model="implantDepth.RC">
                </div>
             </div>
        </div>
      </div>

      <!-- Alignment Module -->
      <div v-if="currentModule === 'alignment'" class="module-panel">
        <h3>🩺 瓣膜支架叠加</h3>
        <button class="danger-btn" @click="$emit('toggle-virtual-valve')">移除/添加 叠加</button>
        
        <div class="analysis-content">
            <div class="slider-control">
                <label>透明度 {{ Math.round(valveOpacity * 100) }}%</label>
                <input type="range" min="0" max="1" step="0.05" v-model="valveOpacity" @input="$emit('update-valve-opacity', valveOpacity)">
            </div>
            <div class="slider-control">
                <label>支架旋转 {{ valveRotation }}°</label>
                <input type="range" min="-180" max="180" step="1" v-model="valveRotation" @input="$emit('update-valve-rotation', valveRotation)">
            </div>
        </div>

        <div class="analysis-content mt-20">
            <div class="header-row">
                <h4>交接对齐测量</h4>
                <button class="small-btn" @click="$emit('start-measure')">角度测量</button>
            </div>
            
            <div class="form-item-row">
                <label>Angle RCA to RCC/LCC commissure</label>
                <input type="number" v-model="alignmentAngles.RCA_RCC_LCC">
                <span>°</span>
            </div>
            <div class="form-item-row">
                <label>Angle RCA to LCC/NCC commissure</label>
                <input type="number" v-model="alignmentAngles.RCA_LCC_NCC">
                <span>°</span>
            </div>
            <div class="form-item-row">
                <label>Angle RCA to NCC/RCC commissure</label>
                <input type="number" v-model="alignmentAngles.RCA_NCC_RCC">
                <span>°</span>
            </div>
            <p class="hint">填写三个交接点之间的相对角度</p>
        </div>
      </div>

      <!-- Report Module -->
      <div v-if="currentModule === 'report'" class="module-panel">
        <h3>📄 报告生成</h3>
        <div class="analysis-content">
            <h4>一、基本情况</h4>
            <div class="info-grid">
                <div>受试者编号: P3306022</div>
                <div>姓名: HOU SHAN MIN</div>
                <div>性别: 男</div>
                <div>年龄: 72</div>
                <div>手术日期: 2025-11-20</div>
            </div>
        </div>

        <div class="analysis-content mt-10">
             <h4>三、人工瓣膜支架评估</h4>
             <p><strong>瓣膜植入深度 (mm)</strong></p>
             <div class="info-grid">
                 <div>NC: {{ implantDepth.NC }}</div>
                 <div>LC: {{ implantDepth.LC }}</div>
                 <div>RC: {{ implantDepth.RC }}</div>
             </div>
             
             <div class="form-item mt-10">
                 <label>形态改变评估</label>
                 <select v-model="morphologyChange">
                     <option value="none">无形态改变</option>
                     <option value="exists">存在形态改变</option>
                     <option value="unfilled">未填写</option>
                 </select>
             </div>
        </div>
        
        <button class="primary-btn mt-20" @click="exportReport">导出报告</button>
        <div class="export-options mt-10">
          <button class="secondary-btn" @click="exportReportJSON">导出为JSON</button>
          <button class="secondary-btn" @click="exportReportText">导出为文本</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSidebar } from '../composables/useSidebar.js';
import { collectReportData, exportReportJSON as exportJSON, exportReportText as exportTXT } from '../utils/reportExporter.js';

const props = defineProps(['initialPhase', 'geometricData']);
const emit = defineEmits([
  'phase-change', 
  'module-change', 
  'sub-module-change', 
  'plane-level-change', 
  'start-measure', 
  'toggle-virtual-valve', 
  'update-valve-opacity', 
  'update-valve-rotation',
  'locate-plane',
  'restore-mpr'
]);

const {
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
  setPhase,
  setModule,
  setSubModule,
  onPlaneLevelChange,
  showGeometric,
  formatNum
} = useSidebar(props, emit);

function exportReport() {
  // 默认导出为JSON
  const reportData = collectReportData({
    currentPhase,
    haltResult,
    haltDetails,
    sfdResult,
    sfdDetails,
    pfdResult,
    pfdThickness,
    alignmentAngles,
    implantDepth,
    morphologyChange
  }, props.geometricData);
  exportJSON(reportData);
}

function exportReportJSON() {
  const reportData = collectReportData({
    currentPhase,
    haltResult,
    haltDetails,
    sfdResult,
    sfdDetails,
    pfdResult,
    pfdThickness,
    alignmentAngles,
    implantDepth,
    morphologyChange
  }, props.geometricData);
  exportJSON(reportData);
}

function exportReportText() {
  const reportData = collectReportData({
    currentPhase,
    haltResult,
    haltDetails,
    sfdResult,
    sfdDetails,
    pfdResult,
    pfdThickness,
    alignmentAngles,
    implantDepth,
    morphologyChange
  }, props.geometricData);
  exportTXT(reportData);
}
</script>

<style scoped>
.sidebar {
  width: 350px; /* Wider for better layout */
  background: #0b1829;
  color: #e0e0e0;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #1c3a5e;
  font-family: 'Segoe UI', sans-serif;
}

.sidebar-header {
  padding: 15px;
  background: #0f253e;
  border-bottom: 1px solid #1c3a5e;
}

.sidebar-header h2 {
  margin: 0 0 10px 0;
  color: #4fc3f7;
  font-size: 18px;
  font-weight: 600;
}

.phase-toggle {
  display: flex;
  background: #07101c;
  border-radius: 4px;
  padding: 2px;
  border: 1px solid #1c3a5e;
}

.phase-toggle button {
  flex: 1;
  background: transparent;
  border: none;
  color: #8aa4c0;
  padding: 6px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
}

.phase-toggle button.active {
  background: #0277bd;
  color: white;
  border-radius: 2px;
}

.modules-nav {
  display: flex;
  background: #0d2035;
  border-bottom: 1px solid #1c3a5e;
  overflow-x: auto;
}

.nav-item {
  flex: 1;
  text-align: center;
  padding: 10px 5px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 2px solid transparent;
  color: #8aa4c0;
  min-width: 70px;
}

.nav-item:hover {
  color: white;
}

.nav-item.active {
  border-bottom-color: #4fc3f7;
  color: #4fc3f7;
  background: #132c48;
  font-weight: bold;
}

.module-content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}

.module-panel h3 {
    color: #e0e0e0;
    font-size: 16px;
    margin-top: 0;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.sub-menu {
  display: flex;
  gap: 5px;
  margin-bottom: 15px;
  background: #0f253e;
  padding: 4px;
  border-radius: 4px;
}

.sub-menu button {
  background: transparent;
  border: none;
  color: #ccc;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  flex: 1;
}

.sub-menu button.active {
  background: white;
  color: #0b1829;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.analysis-content {
  background: #ffffff;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 15px;
  color: #333; /* Dark text on white panel for contrast like in screenshots */
}

/* Override for dark sections */
.analysis-content h4 {
    margin: 0 0 10px 0;
    color: #333;
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 5px;
}

.sub-label {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #555;
}

.status-options {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

.status-btn {
    background: #f0f2f5;
    border: 1px solid #d9d9d9;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}

.status-btn.active {
    border-color: #d32f2f; /* Red border for selection */
    color: #d32f2f;
    background: #fff1f0;
}

.status-btn input {
    display: none;
}

.status-btn:nth-child(1).active {
    border-color: #52c41a; /* Green for None */
    color: #52c41a;
    background: #f6ffed;
}

.grade-row {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
}

.leaf-label {
    width: 40px;
    font-weight: bold;
    font-size: 12px;
}

.grade-options {
    flex: 1;
    display: flex;
    gap: 4px;
}

.grade-options button {
    flex: 1;
    border: 1px solid #d9d9d9;
    background: #fff;
    font-size: 10px;
    padding: 4px 0;
    cursor: pointer;
    border-radius: 2px;
}

.grade-options button.active {
    background: #fff1f0;
    border-color: #ffccc7;
    color: #d32f2f;
}

.checkbox-group {
    display: flex;
    gap: 10px;
}

.checkbox-btn {
    background: #fff;
    border: 1px solid #d9d9d9;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.checkbox-btn.active {
    border-color: #1890ff;
    color: #1890ff;
}

.checkbox-btn input {
    display: none;
}

.input-with-button {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 5px;
}

.input-with-button input {
    width: 80px;
    padding: 6px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
}

.hint {
    font-size: 11px;
    color: #999;
    margin: 5px 0 0 0;
}

.data-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.data-row {
    display: flex;
    justify-content: space-between;
    padding: 8px;
    background: #f5f7fa;
    border-radius: 4px;
    font-size: 12px;
}

.data-row.highlight {
    background: #fff7e6;
    color: #fa8c16;
    font-weight: bold;
    border: 1px solid #ffd591;
}

.data-value {
    font-family: monospace;
}

.control-group {
    background: #132c48;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 15px;
    border: 1px solid #2c4f7a;
}

.slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.value-tag {
    background: #1890ff;
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    min-width: 30px;
    text-align: center;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: #fff;
    font-size: 13px;
}

.primary-btn {
    background: #1890ff;
    color: white;
    border: none;
    width: 100%;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    margin-top: 10px;
}

.secondary-btn {
    background: white;
    border: 1px solid #d9d9d9;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
}

.danger-btn {
    background: #ff4d4f;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 10px;
}

.small-btn {
    background: #1890ff;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
}

.header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.form-item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
}

.form-item-row input {
    width: 60px;
    padding: 4px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    text-align: right;
}

.form-grid {
    display: flex;
    gap: 10px;
}

.form-item {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.form-item label {
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
}

.form-item input, .form-item select {
    padding: 6px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
}

.info-grid {
    font-size: 12px;
    line-height: 1.6;
    color: #555;
}

.mt-20 { margin-top: 20px; }
.mt-10 { margin-top: 10px; }

input[type="range"] {
    width: 100%;
    accent-color: #1890ff;
}

/* Scrollbar refinement */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #0b1829; 
}
::-webkit-scrollbar-thumb {
  background: #1c3a5e; 
  border-radius: 3px;
}
</style>