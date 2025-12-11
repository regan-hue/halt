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

      <!-- 全局工具栏 -->
      <div class="global-toolbar">
        <button 
          class="tool-btn" 
          :class="{ active: measureToolActive }" 
          @click="toggleMeasureTool" 
          :title="measureToolActive ? '关闭长度测量工具' : '启用长度测量工具'"
        >
          📏 长度
        </button>
        <button 
          class="tool-btn" 
          :class="{ active: angleToolActive }" 
          @click="toggleAngleTool" 
          :title="angleToolActive ? '关闭角度测量工具' : '启用角度测量工具'"
        >
          📐 角度
        </button>
        <button class="tool-btn" @click="$emit('undo-measurement')" title="撤销最后一次测量">
          ↩️ 撤销
        </button>
      </div>

      <!-- 视图状态管理 -->
      <div class="view-states-panel">
        <div class="view-states-header">
          <h4>💾 视图状态管理</h4>
          <button class="icon-btn" @click="showSaveDialog = true" title="保存当前视图">
            ➕
          </button>
        </div>
        
        <div v-if="savedViewStates && savedViewStates.length > 0" class="view-states-list">
          <div v-for="state in savedViewStates" :key="state.id" class="view-state-item">
            <div class="state-info">
              <div class="state-name">{{ state.name }}</div>
              <div class="state-time">{{ state.timestamp }}</div>
            </div>
            <div class="state-actions">
              <button class="action-btn restore" @click="$emit('restore-view-state', state.id)" title="恢复">
                🔄
              </button>
              <button class="action-btn rename" @click="showRenameDialog(state)" title="重命名">
                ✏️
              </button>
              <button class="action-btn delete" @click="$emit('delete-view-state', state.id)" title="删除">
                🗑️
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          暂无保存的视图状态
        </div>
      </div>

      <!-- 保存对话框 -->
      <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog = false">
        <div class="modal-content">
          <h3>保存视图状态</h3>
          <input 
            v-model="newStateName" 
            type="text" 
            placeholder="输入状态名称"
            @keyup.enter="saveCurrentView"
            class="name-input"
          />
          <div class="modal-actions">
            <button class="secondary-btn" @click="showSaveDialog = false">取消</button>
            <button class="primary-btn" @click="saveCurrentView">保存</button>
          </div>
        </div>
      </div>

      <!-- 重命名对话框 -->
      <div v-if="showRenameDialogFlag" class="modal-overlay" @click.self="showRenameDialogFlag = false">
        <div class="modal-content">
          <h3>重命名视图状态</h3>
          <input 
            v-model="renameStateName" 
            type="text" 
            placeholder="输入新名称"
            @keyup.enter="confirmRename"
            class="name-input"
          />
          <div class="modal-actions">
            <button class="secondary-btn" @click="showRenameDialogFlag = false">取消</button>
            <button class="primary-btn" @click="confirmRename">确认</button>
          </div>
        </div>
      </div>

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
          
          <!-- <div class="slider-control mt-20">
            <label>平面层级定位 (Stent_Frame_base_up_X)</label>
            <div class="slider-row">
               <input type="range" min="0" max="5" step="0.5" v-model="planeLevel" @input="onPlaneLevelChange">
               <span class="value-tag">{{ planeLevel }}</span>
            </div>
          </div> -->
          
          <div class="control-buttons mt-20">
            <button class="primary-btn" @click="saveHaltData">💾 保存到报告</button>
          </div>
          <div class="control-buttons mt-10">
            <button class="secondary-btn" @click="$emit('locate-plane', 'halt')">📍 定位平面</button>
            <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
          </div>
          <div v-if="savedHaltResult" class="info-message mt-10">
            ✓ 已保存到报告
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
            <button class="primary-btn" @click="saveSfdData">💾 保存到报告</button>
          </div>
          <div class="control-buttons mt-10">
            <button class="secondary-btn" @click="$emit('locate-plane', 'sfd')">📍 定位平面</button>
            <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
          </div>
          <div v-if="savedSfdResult" class="info-message mt-10">
            ✓ 已保存到报告
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
                <button 
                  class="secondary-btn" 
                  :class="{ 'active-tool': measureToolActive }" 
                  @click="toggleMeasureTool"
                >
                  {{ measureToolActive ? '📏 测量中...' : '📏 重新测量' }}
                </button>
             </div>
             <p class="hint">提示: 点击测量工具在 MPR 放两点完成长度测量</p>
          </div>
          
          <div class="control-buttons mt-20">
            <button class="primary-btn" @click="savePfdData">💾 保存到报告</button>
          </div>
          <div class="control-buttons mt-10">
            <button class="secondary-btn" @click="$emit('locate-plane', 'pfd')">📍 定位平面</button>
            <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
          </div>
          <div v-if="savedPfdResult" class="info-message mt-10">
            ✓ 已保存到报告
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
               <div class="data-row"><span>周长</span><span class="data-value">{{ formatNum(geometricData?.[geoType]?.perimeter) }} mm</span></div>
               <div class="data-row"><span>面积 (Area)</span><span class="data-value">{{ formatNum(geometricData?.[geoType]?.area) }} mm²</span></div>
               <div class="data-row"><span>最长径 (Dmax)</span><span class="data-value">{{ formatNum(geometricData?.[geoType]?.max_dist) }} mm</span></div>
               <div class="data-row"><span>最短径 (Dmin)</span><span class="data-value">{{ formatNum(geometricData?.[geoType]?.min_dist) }} mm</span></div>
               <div class="data-row highlight"><span>周长衍生直径 (PED)</span><span class="data-value">{{ formatNum(geometricData?.[geoType]?.PED) }} mm</span></div>
               <div class="data-row"><span>面积衍生直径 (AED)</span><span class="data-value">{{ formatNum(geometricData?.[geoType]?.AED) }} mm</span></div>
            </div>
            
            <div class="control-buttons mt-20">
              <button class="secondary-btn" @click="$emit('locate-plane', geoType)">📍 定位平面</button>
              <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
            </div>
        </div>

        <div v-if="geoType === 'depth'" class="analysis-content">
             <h4>📏 瓣膜植入深度</h4>
             <div class="tool-panel">
                <button 
                  class="secondary-btn" 
                  :class="{ 'active-tool': measureToolActive }" 
                  @click="toggleMeasureTool"
                >
                  {{ measureToolActive ? '📏 测量中...' : '📏 测量工具' }}
                </button>
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
             
             <div class="control-buttons mt-20">
              <button class="secondary-btn" @click="$emit('locate-plane', 'inflow')">📍 定位平面</button>
              <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
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
                <button 
                  class="small-btn" 
                  :class="{ 'active-tool': angleToolActive }" 
                  @click="toggleAngleTool"
                >
                  {{ angleToolActive ? '📐 测量中...' : '📐 角度测量' }}
                </button>
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

            <div class="control-buttons mt-10">
                <button class="secondary-btn" @click="$emit('locate-plane', 'commissure_alignment')">📍 定位平面</button>
                <button class="secondary-btn" @click="$emit('restore-mpr')">🔄 恢复MPR</button>
            </div>
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
            <h4>二、瓣叶功能评估</h4>
            
            <p><strong>HALT状态与分级</strong></p>
            <div class="info-grid">
                <div>状态: {{ savedHaltResult ? (savedHaltResult === 'none' ? '无' : savedHaltResult === 'exists' ? '有' : '难以判定') : '未保存' }}</div>
            </div>
            <div v-if="savedHaltResult === 'exists' && savedHaltDetails" class="info-grid mt-5">
                <div>LC分级: {{ savedHaltDetails.LC }}</div>
                <div>RC分级: {{ savedHaltDetails.RC }}</div>
                <div>NC分级: {{ savedHaltDetails.NC }}</div>
            </div>

            <p class="mt-10"><strong>SFD分析</strong></p>
            <div class="info-grid">
                <div>状态: {{ savedSfdResult ? (savedSfdResult === 'none' ? '无' : savedSfdResult === 'exists' ? '有' : '难以判定') : '未保存' }}</div>
            </div>
            <div v-if="savedSfdResult === 'exists' && savedSfdDetails" class="info-grid mt-5">
                <div>LC: {{ savedSfdDetails.LC ? '是' : '否' }}</div>
                <div>RC: {{ savedSfdDetails.RC ? '是' : '否' }}</div>
                <div>NC: {{ savedSfdDetails.NC ? '是' : '否' }}</div>
            </div>

            <p class="mt-10"><strong>PFD分析</strong></p>
            <div class="info-grid">
                <div>状态: {{ savedPfdResult ? (savedPfdResult === 'none' ? '无' : savedPfdResult === 'exists' ? '有' : '难以判定') : '未保存' }}</div>
                <div v-if="savedPfdResult === 'exists' && savedPfdThickness">最大厚度: {{ savedPfdThickness }} mm</div>
            </div>
        </div>

        <div class="analysis-content mt-10">
            <h4>三、几何形态评估</h4>
            
            <div v-if="geometricData?.inflow">
                <p><strong>流入平面 (Inflow)</strong></p>
                <div class="data-grid">
                    <div class="data-row"><span>周长</span><span class="data-value">{{ formatNum(geometricData.inflow.perimeter) }} mm</span></div>
                    <div class="data-row"><span>面积 (Area)</span><span class="data-value">{{ formatNum(geometricData.inflow.area) }} mm²</span></div>
                    <div class="data-row"><span>最长径 (Dmax)</span><span class="data-value">{{ formatNum(geometricData.inflow.max_dist) }} mm</span></div>
                    <div class="data-row"><span>最短径 (Dmin)</span><span class="data-value">{{ formatNum(geometricData.inflow.min_dist) }} mm</span></div>
                    <div class="data-row highlight"><span>周长衍生直径 (PED)</span><span class="data-value">{{ formatNum(geometricData.inflow.PED) }} mm</span></div>
                    <div class="data-row"><span>面积衍生直径 (AED)</span><span class="data-value">{{ formatNum(geometricData.inflow.AED) }} mm</span></div>
                </div>
            </div>

            <div v-if="geometricData?.nadir" class="mt-10">
                <p><strong>最低点平面 (Nadir)</strong></p>
                <div class="data-grid">
                    <div class="data-row"><span>周长</span><span class="data-value">{{ formatNum(geometricData.nadir.perimeter) }} mm</span></div>
                    <div class="data-row"><span>面积 (Area)</span><span class="data-value">{{ formatNum(geometricData.nadir.area) }} mm²</span></div>
                    <div class="data-row"><span>最长径 (Dmax)</span><span class="data-value">{{ formatNum(geometricData.nadir.max_dist) }} mm</span></div>
                    <div class="data-row"><span>最短径 (Dmin)</span><span class="data-value">{{ formatNum(geometricData.nadir.min_dist) }} mm</span></div>
                    <div class="data-row highlight"><span>周长衍生直径 (PED)</span><span class="data-value">{{ formatNum(geometricData.nadir.PED) }} mm</span></div>
                    <div class="data-row"><span>面积衍生直径 (AED)</span><span class="data-value">{{ formatNum(geometricData.nadir.AED) }} mm</span></div>
                </div>
            </div>

            <div v-if="geometricData?.commissure" class="mt-10">
                <p><strong>交接平面 (Commissure)</strong></p>
                <div class="data-grid">
                    <div class="data-row"><span>周长</span><span class="data-value">{{ formatNum(geometricData.commissure.perimeter) }} mm</span></div>
                    <div class="data-row"><span>面积 (Area)</span><span class="data-value">{{ formatNum(geometricData.commissure.area) }} mm²</span></div>
                    <div class="data-row"><span>最长径 (Dmax)</span><span class="data-value">{{ formatNum(geometricData.commissure.max_dist) }} mm</span></div>
                    <div class="data-row"><span>最短径 (Dmin)</span><span class="data-value">{{ formatNum(geometricData.commissure.min_dist) }} mm</span></div>
                    <div class="data-row highlight"><span>周长衍生直径 (PED)</span><span class="data-value">{{ formatNum(geometricData.commissure.PED) }} mm</span></div>
                    <div class="data-row"><span>面积衍生直径 (AED)</span><span class="data-value">{{ formatNum(geometricData.commissure.AED) }} mm</span></div>
                </div>
            </div>

            <p class="mt-10"><strong>瓣膜植入深度 (mm)</strong></p>
            <div class="info-grid">
                <div>NC: {{ formatNum(implantDepth.NC) }}</div>
                <div>LC: {{ formatNum(implantDepth.LC) }}</div>
                <div>RC: {{ formatNum(implantDepth.RC) }}</div>
            </div>
        </div>

        <div class="analysis-content mt-10">
            <h4>四、交接对齐</h4>
            
            <p><strong>交接对齐角度</strong></p>
            <div class="data-grid">
                <div class="data-row"><span>RCA to RCC/LCC</span><span class="data-value">{{ formatNum(alignmentAngles.RCA_RCC_LCC) }}°</span></div>
                <div class="data-row"><span>RCA to LCC/NCC</span><span class="data-value">{{ formatNum(alignmentAngles.RCA_LCC_NCC) }}°</span></div>
                <div class="data-row"><span>RCA to NCC/RCC</span><span class="data-value">{{ formatNum(alignmentAngles.RCA_NCC_RCC) }}°</span></div>
            </div>

            <p class="mt-10"><strong>形态改变评估</strong></p>
            <div class="info-grid">
                <div>评估结果: {{ morphologyChange === 'none' ? '无形态改变' : morphologyChange === 'exists' ? '存在形态改变' : '未填写' }}</div>
            </div>
        </div>
        
        <!-- 图像管理部分 -->
        <div class="analysis-content mt-10">
          <h4>📷 保存的图像</h4>
          <div v-if="savedImages && savedImages.length > 0" class="images-grid">
            <div v-for="image in savedImages" :key="image.id" class="image-card">
              <div class="image-thumbnail">
                <img :src="image.thumbnailUrl" :alt="image.title" />
              </div>
              <div class="image-info">
                <div class="image-title">{{ image.title }}</div>
                <div class="image-meta">
                  <span class="image-type">{{ image.viewType }}</span>
                  <span class="image-phase">{{ image.phase }}</span>
                </div>
                <div class="image-description">{{ image.description }}</div>
              </div>
              <div class="image-actions">
                <button class="action-btn edit" @click="showEditImageDialog(image)" title="编辑">
                  ✏️
                </button>
                <button class="action-btn delete" @click="deleteSavedImage(image.id)" title="删除">
                  🗑️
                </button>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            暂无保存的图像，请在各视图窗口点击保存按钮
          </div>
        </div>
        
        <button class="primary-btn mt-20" @click="exportReportPDF">📄 导出PDF报告</button>
      </div>
    </div>
    
    <!-- 编辑图像对话框 -->
    <div v-if="showEditDialog" class="dialog-overlay" @click="closeEditDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3>编辑图像信息</h3>
          <button class="close-btn" @click="closeEditDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>图像标题：</label>
            <input v-model="editImageTitle" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>图像描述：</label>
            <textarea v-model="editImageDescription" class="form-textarea" rows="3"></textarea>
          </div>
          <div class="image-preview">
            <img v-if="editImageData" :src="editImageData.dataUrl" alt="预览" />
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="closeEditDialog" class="btn btn-cancel">取消</button>
          <button @click="confirmEditImage" class="btn btn-primary">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useSidebar } from '../composables/useSidebar.js';
import { useSavedImages } from '../composables/useSavedImages.js';
import { collectReportData, exportReportPDF as exportPDF } from '../utils/reportExporter.js';

const props = defineProps(['initialPhase', 'geometricData', 'savedViewStates', 'loadGeometricDataForBothPhases']);
const emit = defineEmits([
  'phase-change', 
  'module-change', 
  'sub-module-change', 
  'plane-level-change', 
  'start-measure',
  'stop-measure',
  'start-angle-measure',
  'stop-angle-measure',
  'undo-measurement',
  'toggle-virtual-valve', 
  'update-valve-opacity', 
  'update-valve-rotation',
  'locate-plane',
  'restore-mpr',
  'save-view-state',
  'restore-view-state',
  'delete-view-state',
  'rename-view-state'
]);

const {
  currentPhase,
  currentModule,
  subModule,
  geoType,
  haltResult,
  haltDetails,
  haltGrades,
  savedHaltResult,
  savedHaltDetails,
  sfdResult,
  sfdDetails,
  savedSfdResult,
  savedSfdDetails,
  pfdResult,
  pfdThickness,
  savedPfdResult,
  savedPfdThickness,
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
  formatNum,
  saveHaltData,
  saveSfdData,
  savePfdData
} = useSidebar(props, emit);

// 图像管理
const { savedImages, deleteImage, updateImage } = useSavedImages();

// 调试：监听savedImages变化
watch(savedImages, (newVal) => {
  console.log('📊 Sidebar检测到savedImages变化，当前数量:', newVal.length);
  if (newVal.length > 0) {
    console.log('最新图像:', newVal[newVal.length - 1].title);
  }
}, { deep: true });

// 组件挂载时检查
onMounted(() => {
  console.log('📋 Sidebar mounted, 当前savedImages数量:', savedImages.value.length);
});

const showEditDialog = ref(false);
const editImageData = ref(null);
const editImageTitle = ref('');
const editImageDescription = ref('');

// 显示编辑图像对话框
function showEditImageDialog(image) {
  editImageData.value = image;
  editImageTitle.value = image.title;
  editImageDescription.value = image.description;
  showEditDialog.value = true;
}

// 关闭编辑对话框
function closeEditDialog() {
  showEditDialog.value = false;
  editImageData.value = null;
  editImageTitle.value = '';
  editImageDescription.value = '';
}

// 确认编辑图像
function confirmEditImage() {
  if (!editImageTitle.value.trim()) {
    alert('请输入图像标题');
    return;
  }
  
  updateImage(editImageData.value.id, {
    title: editImageTitle.value,
    description: editImageDescription.value
  });
  
  closeEditDialog();
}

// 删除保存的图像
function deleteSavedImage(imageId) {
  if (confirm('确定要删除这张图像吗？')) {
    deleteImage(imageId);
  }
}

// 测量工具状态
const measureToolActive = ref(false);
const angleToolActive = ref(false);

function toggleMeasureTool() {
  // 如果角度工具激活，先关闭它
  if (angleToolActive.value) {
    angleToolActive.value = false;
    emit('stop-angle-measure');
  }
  
  measureToolActive.value = !measureToolActive.value;
  if (measureToolActive.value) {
    emit('start-measure');
  } else {
    emit('stop-measure');
  }
}

function toggleAngleTool() {
  // 如果长度工具激活，先关闭它
  if (measureToolActive.value) {
    measureToolActive.value = false;
    emit('stop-measure');
  }
  
  angleToolActive.value = !angleToolActive.value;
  if (angleToolActive.value) {
    emit('start-angle-measure');
  } else {
    emit('stop-angle-measure');
  }
}

// 视图状态管理
const showSaveDialog = ref(false);
const showRenameDialogFlag = ref(false);
const newStateName = ref('');
const renameStateName = ref('');
const renameStateId = ref(null);

function saveCurrentView() {
  const name = newStateName.value.trim() || '未命名状态';
  emit('save-view-state', name);
  newStateName.value = '';
  showSaveDialog.value = false;
}

function showRenameDialog(state) {
  renameStateId.value = state.id;
  renameStateName.value = state.name;
  showRenameDialogFlag.value = true;
}

function confirmRename() {
  if (renameStateId.value && renameStateName.value.trim()) {
    emit('rename-view-state', renameStateId.value, renameStateName.value.trim());
    showRenameDialogFlag.value = false;
    renameStateName.value = '';
    renameStateId.value = null;
  }
}

async function exportReportPDF() {
  // 加载收缩期和舒张期的几何数据
  let bothPhasesGeoData = null;
  if (props.loadGeometricDataForBothPhases) {
    bothPhasesGeoData = await props.loadGeometricDataForBothPhases();
  }
  
  // 导出为PDF，包含保存的图像数据
  const reportData = collectReportData({
    currentPhase,
    haltResult: savedHaltResult,
    haltDetails: savedHaltDetails,
    sfdResult: savedSfdResult,
    sfdDetails: savedSfdDetails,
    pfdResult: savedPfdResult,
    pfdThickness: savedPfdThickness,
    alignmentAngles,
    implantDepth,
    morphologyChange
  }, bothPhasesGeoData || props.geometricData, savedImages.value);
  await exportPDF(reportData);
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

/* 全局工具栏 */
.global-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 15px;
  padding: 12px;
  background: #0f253e;
  border-radius: 6px;
  border: 1px solid #1c3a5e;
}

.tool-btn {
  flex: 1;
  background: linear-gradient(135deg, #1890ff 0%, #0277bd 100%);
  color: white;
  border: none;
  padding: 10px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.3);
  white-space: nowrap;
}

.tool-btn:hover {
  background: linear-gradient(135deg, #40a9ff 0%, #0288d1 100%);
  box-shadow: 0 4px 8px rgba(24, 144, 255, 0.5);
  transform: translateY(-1px);
}

.tool-btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(24, 144, 255, 0.3);
}

.tool-btn.active {
  background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
  box-shadow: 0 2px 4px rgba(82, 196, 26, 0.3);
}

.tool-btn.active:hover {
  background: linear-gradient(135deg, #73d13d 0%, #52c41a 100%);
  box-shadow: 0 4px 8px rgba(82, 196, 26, 0.5);
}

/* 视图状态管理面板 */
.view-states-panel {
  background: #0f253e;
  border-radius: 6px;
  border: 1px solid #1c3a5e;
  padding: 12px;
  margin-bottom: 15px;
}

.view-states-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.view-states-header h4 {
  margin: 0;
  color: #4fc3f7;
  font-size: 14px;
  font-weight: 600;
}

.icon-btn {
  background: #1890ff;
  color: white;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.icon-btn:hover {
  background: #40a9ff;
  transform: scale(1.1);
}

.view-states-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.view-state-item {
  background: #132c48;
  border: 1px solid #1c3a5e;
  border-radius: 4px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.view-state-item:hover {
  background: #1a3a58;
  border-color: #2a5a8e;
}

.state-info {
  flex: 1;
  min-width: 0;
}

.state-name {
  color: #e0e0e0;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.state-time {
  color: #8aa4c0;
  font-size: 11px;
}

.state-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  background: transparent;
  border: 1px solid #1c3a5e;
  color: #8aa4c0;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.action-btn.restore:hover {
  background: #1890ff;
  border-color: #1890ff;
  color: white;
}

.action-btn.rename:hover {
  background: #faad14;
  border-color: #faad14;
  color: white;
}

.action-btn.delete:hover {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: #8aa4c0;
  font-size: 12px;
}

/* 对话框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #0b1829;
  border: 1px solid #1c3a5e;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-content h3 {
  margin: 0 0 16px 0;
  color: #4fc3f7;
  font-size: 16px;
}

.name-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #1c3a5e;
  border-radius: 4px;
  background: #132c48;
  color: #e0e0e0;
  font-size: 14px;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.name-input:focus {
  outline: none;
  border-color: #1890ff;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
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

.control-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.control-buttons button {
    flex: 1;
    min-width: 0;
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
    transition: all 0.3s ease;
}

.secondary-btn.active-tool {
    background: #52c41a;
    color: white;
    border-color: #52c41a;
    font-weight: 500;
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
    transition: all 0.3s ease;
}

.small-btn.active-tool {
    background: #52c41a;
    border: none;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(82, 196, 26, 0.4);
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
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.form-item {
    display: flex;
    flex-direction: column;
    min-width: 0; /* 防止溢出 */
}

.form-item label {
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.form-item input, .form-item select {
    padding: 6px 4px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    width: 100%;
    box-sizing: border-box;
    font-size: 12px;
}

.info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    font-size: 12px;
    line-height: 1.6;
    color: #555;
}

.info-grid > div {
    background: #f5f7fa;
    padding: 8px;
    border-radius: 4px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.info-message {
    background: #f6ffed;
    border: 1px solid #b7eb8f;
    color: #52c41a;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    text-align: center;
}

.mt-20 { margin-top: 20px; }
.mt-10 { margin-top: 10px; }
.mt-5 { margin-top: 5px; }

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

/* 图像网格样式 */
.images-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
  margin-top: 10px;
}

.image-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(79, 195, 247, 0.2);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.image-card:hover {
  border-color: rgba(79, 195, 247, 0.5);
  box-shadow: 0 2px 8px rgba(79, 195, 247, 0.2);
}

.image-thumbnail {
  width: 100%;
  height: 150px;
  overflow: hidden;
  background: #0d1b2a;
}

.image-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.image-info {
  padding: 12px;
}

.image-title {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  margin-bottom: 6px;
}

.image-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
}

.image-type,
.image-phase {
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(79, 195, 247, 0.2);
  color: #4fc3f7;
}

.image-description {
  font-size: 11px;
  color: #b0bec5;
  line-height: 1.4;
  margin-top: 6px;
}

.image-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(79, 195, 247, 0.1);
}

.empty-state {
  text-align: center;
  padding: 30px 20px;
  color: #607d8b;
  font-size: 13px;
}
</style>