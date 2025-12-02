<template>
  <div class="main-viewer">
    <div class="viewport-grid">
      <div class="viewport-container">
        <div class="viewport-header">
          <div class="viewport-label">AXIAL</div>
          <div class="viewport-indicator" :style="{ backgroundColor: getLabelColor('AXIAL') }"></div>
        </div>
        <div class="viewport-element" ref="viewport1"></div>
      </div>
      <div class="viewport-container stl-viewport">
        <!-- <div class="viewport-label">3D MODEL</div> -->
        <div class="viewport-element" ref="stlViewport"></div>
        <div v-if="stlLoading" class="stl-loading">
          <div class="spinner"></div>
          <p>加载 3D 模型...</p>
        </div>
        <div v-if="stlError" class="stl-error">{{ stlError }}</div>
      </div>
      <div class="viewport-container">
        <div class="viewport-header">
          <div class="viewport-label">CORONAL</div>
          <div class="viewport-indicator" :style="{ backgroundColor: getLabelColor('CORONAL') }"></div>
        </div>
        <div class="viewport-element" ref="viewport3"></div>
      </div>
      <div class="viewport-container">
        <div class="viewport-header">
          <div class="viewport-label">SAGITTAL</div>
          <div class="viewport-indicator" :style="{ backgroundColor: getLabelColor('SAGITTAL') }"></div>
        </div>
        <div class="viewport-element" ref="viewport2"></div>
      </div>
    </div>

    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>加载中...</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useCrosshairsViewer } from '../composables/useCrosshairsViewer.js'
import { useSTLViewer } from '../composables/useSTLViewer.js'

const props = defineProps({
  seriesInstanceUID: { type: String, required: true },
  currentPhase: { type: String, default: '收缩期' },
  allSeriesUIDs: { type: Object, default: () => ({}) }, // 所有期相的UID映射
})

const { 
  loading, 
  error, 
  initialize, 
  switchVolume, 
  cleanup, 
  locatePlane, 
  restoreMPR, 
  enableLengthTool, 
  disableLengthTool, 
  undoLastMeasurement, 
  enableCrosshairs, 
  disableCrosshairs,
  handleResize,
  savedViewStates,
  saveViewState,
  restoreViewState,
  deleteViewState,
  renameViewState,
  clearAllViewStates,
  getAxialSlicePosition
} = useCrosshairsViewer(props, props.allSeriesUIDs)
const { 
  loading: stlLoading, 
  error: stlError, 
  initialize: initializeSTL, 
  switchPhase: switchSTLPhase,
  showPlane: showSTLPlane,
  hidePlane: hideSTLPlane,
  updatePlanePosition: updateSTLPlanePosition,
  cleanup: cleanupSTL 
} = useSTLViewer()

const viewport1 = ref(null)
const viewport2 = ref(null)
const viewport3 = ref(null)
const stlViewport = ref(null)

// 根据viewport类型获取标签颜色，与十字交叉线颜色匹配
const getLabelColor = (type) => {
  switch (type) {
    case 'AXIAL': return '#ff0000'; // 红色
    case 'SAGITTAL': return '#ffff00'; // 黄色
    case 'CORONAL': return '#0000ff'; // 蓝色
    default: return '#00e5ff';
  }
}

// 获取对应的text-shadow
const getLabelShadow = (type) => {
  const color = getLabelColor(type);
  return `0 0 8px ${color}80`; // 添加透明度
}

onMounted(async () => {
  await nextTick()
  
  // 初始化 2D DICOM 查看器
  if (viewport1.value && viewport2.value && viewport3.value) {
    // initialize 参数顺序: axialElement, sagittalElement, coronalElement
    // viewport1 = AXIAL, viewport2 = SAGITTAL, viewport3 = CORONAL
    await initialize(viewport1.value, viewport2.value, viewport3.value)
    
    // 设置 Axial 视图变化监听，用于同步 STL 平面
    setupAxialViewListener()
  }
  
  // 同时初始化两个期相的 3D STL 查看器
  await new Promise(resolve => setTimeout(resolve, 200))
  if (stlViewport.value) {
    try {
      // 初始化当前期相的 STL
      await initializeSTL(stlViewport.value, props.currentPhase)
      console.log(`当前期相 ${props.currentPhase} 的 STL 已加载`)
      
      // 后台预加载另一个期相的 STL 文件
      if (props.allSeriesUIDs) {
        const otherPhase = props.currentPhase === '收缩期' ? '舒张期' : '收缩期'
        setTimeout(() => {
          console.log(`开始预加载 ${otherPhase} 的 STL 文件...`)
          // 后台预加载，使用switchPhase会缓存文件
          switchSTLPhase(otherPhase).then(() => {
            console.log(`${otherPhase} 的 STL 文件预加载完成`)
            // 切换回当前期相
            return switchSTLPhase(props.currentPhase)
          }).catch(err => {
            console.warn(`预加载 ${otherPhase} STL 文件失败:`, err)
          })
        }, 3000) // 延迟3秒开始预加载，确保不影响主流程
      }
    } catch (err) {
      console.error('初始化 3D STL 查看器失败:', err)
    }
  }
})

// 设置 Axial 视图变化监听器
function setupAxialViewListener() {
  // 使用 requestAnimationFrame 优化轮询
  let lastPosition = null
  let rafId = null
  let lastCheckTime = 0
  const CHECK_INTERVAL = 50 // 降低检查频率到50ms，提升性能
  
  const checkPositionChange = (timestamp) => {
    // 节流：只在达到检查间隔时才执行
    if (timestamp - lastCheckTime >= CHECK_INTERVAL) {
      const currentPosition = getAxialSlicePosition()
      
      if (currentPosition && currentPosition.origin) {
        // 检查位置是否改变（使用稍大的阈值减少不必要的更新）
        if (!lastPosition || 
            Math.abs(currentPosition.origin[0] - lastPosition.origin[0]) > 0.5 ||
            Math.abs(currentPosition.origin[1] - lastPosition.origin[1]) > 0.5 ||
            Math.abs(currentPosition.origin[2] - lastPosition.origin[2]) > 0.5) {
          
          // 更新 STL 平面位置
          updateSTLPlanePosition(currentPosition.origin, currentPosition.normal)
          lastPosition = currentPosition
        }
      }
      
      lastCheckTime = timestamp
    }
    
    // 继续下一帧
    rafId = requestAnimationFrame(checkPositionChange)
  }
  
  // 启动RAF循环
  rafId = requestAnimationFrame(checkPositionChange)
  
  // 在组件卸载时清除RAF
  onBeforeUnmount(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
    }
  })
}

// 添加窗口大小调整监听器
onMounted(() => {
  const handleWindowResize = () => {
    if (handleResize) {
      handleResize()
    }
  }
  
  // 使用防抖避免频繁调用
  let resizeTimeout
  const debouncedResize = () => {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(handleWindowResize, 150)
  }
  
  window.addEventListener('resize', debouncedResize)
  
  // 清理监听器
  onBeforeUnmount(() => {
    window.removeEventListener('resize', debouncedResize)
    clearTimeout(resizeTimeout)
  })
})

onBeforeUnmount(() => {
  cleanup()
  cleanupSTL()
})

// 暴露方法给父组件
defineExpose({
  async locatePlane(analysisType) {
    const result = await locatePlane(analysisType);
    if (result.success) {
      showSTLPlane(result.less_points);
    }
    return result;
  },
  restoreMPR,
  enableLengthTool,
  disableLengthTool,
  undoLastMeasurement,
  enableCrosshairs,
  disableCrosshairs,
  savedViewStates,
  saveViewState,
  restoreViewState,
  deleteViewState,
  renameViewState,
  clearAllViewStates
})

// 监听 seriesInstanceUID 变化，切换体积
watch(() => props.seriesInstanceUID, async (newUID, oldUID) => {
  // 只在UID真正变化时切换体积
  if (newUID && newUID !== oldUID) {
    try {
      console.log(`DICOM 系列变化: ${oldUID} -> ${newUID}`)
      
      // 如果viewports已初始化，使用switchVolume切换体积
      // 否则需要先初始化
      if (viewport1.value && viewport2.value && viewport3.value) {
        // 检查是否已经初始化（通过检查loading状态，如果为false且没有error，说明已初始化）
        if (!loading.value && !error.value) {
          // 已初始化，直接切换体积
          await switchVolume(newUID)
        } else {
          // 未初始化，需要先初始化
          await initialize(viewport1.value, viewport2.value, viewport3.value)
        }
      }
    } catch (err) {
      console.error('切换体积失败:', err)
      // 如果切换失败，尝试重新初始化
      if (viewport1.value && viewport2.value && viewport3.value) {
        try {
          cleanup()
          await new Promise(resolve => setTimeout(resolve, 200))
          await initialize(viewport1.value, viewport2.value, viewport3.value)
        } catch (initErr) {
          console.error('重新初始化失败:', initErr)
        }
      }
    }
  }
}, { immediate: false })

// 监听期相变化，切换 STL 文件
watch(() => props.currentPhase, async (newPhase, oldPhase) => {
  if (newPhase && newPhase !== oldPhase) {
    console.log(`期相变化: ${oldPhase} -> ${newPhase}`)
    if (stlViewport.value) {
      try {
        // 如果 STL 查看器已初始化，切换期相
        await switchSTLPhase(newPhase)
      } catch (err) {
        console.error('切换期相失败:', err)
        // 如果切换失败，尝试重新初始化
        try {
          await initializeSTL(stlViewport.value, newPhase)
        } catch (initErr) {
          console.error('重新初始化 STL 查看器失败:', initErr)
        }
      }
    }
  }
}, { immediate: false })
</script>

<style scoped>
.main-viewer {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: #000;
}

.viewport-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  width: 100%;
  height: 100%;
  gap: 3px;
  background: linear-gradient(135deg, #0a1929 0%, #0d2847 100%);
  padding: 3px;
}

.stl-viewport {
  position: relative;
}

.stl-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #4fc3f7;
  z-index: 20;
}

.stl-loading .spinner {
  margin-bottom: 10px;
}

.stl-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ff4d4f;
  font-size: 14px;
  z-index: 20;
  background: rgba(0, 0, 0, 0.7);
  padding: 10px 20px;
  border-radius: 4px;
}

.viewport-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #000;
  border: 1px solid #1c3a5e;
  overflow: hidden;
  /* 性能优化 */
  contain: layout style paint;
  transform: translateZ(0);
}

.viewport-label {
  color: #00e5ff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(135deg, rgba(0, 39, 77, 0.9) 0%, rgba(0, 77, 128, 0.85) 100%);
  padding: 4px 12px;
  border-radius: 4px;
  pointer-events: none;
  border: 1px solid rgba(79, 195, 247, 0.3);
  box-shadow: 0 2px 10px rgba(0, 229, 255, 0.2);
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
  margin-right: 8px;
}

.viewport-header {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  z-index: 10;
}

.viewport-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  flex-shrink: 0;
}

.viewport-element {
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 硬件加速优化 */
  transform: translateZ(0);
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(11, 24, 41, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #4fc3f7;
  z-index: 100;
}

.spinner {
  border: 4px solid rgba(79, 195, 247, 0.3);
  border-top: 4px solid #4fc3f7;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

.error-text {
  color: #ff4d4f;
  margin-top: 10px;
  font-size: 14px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
