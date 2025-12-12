<template>
  <div class="main-viewer">
    <div class="viewport-grid" :class="{ 'has-maximized': maximizedViewport }">
      <div class="viewport-container" :class="{ maximized: maximizedViewport === 'AXIAL' }">
        <div class="viewport-header">
          <div class="viewport-header-left">
            <div class="viewport-label">AXIAL</div>
            <div class="viewport-indicator" :style="{ backgroundColor: getLabelColor('AXIAL') }"></div>
          </div>
          <div class="viewport-header-right">
            <button class="action-btn" @click="toggleMaximize('AXIAL')" :title="maximizedViewport === 'AXIAL' ? '还原' : '最大化'">
              <svg v-if="maximizedViewport === 'AXIAL'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
              </svg>
            </button>
            <button class="action-btn" @click="openSaveImageDialog('AXIAL', viewport1)" title="保存图像">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="viewport-element" ref="viewport1"></div>
      </div>
      <div class="viewport-container stl-viewport" :class="{ maximized: maximizedViewport === 'STL' }">
        <div class="viewport-header">
          <div class="viewport-header-left">
            <div class="viewport-label">3D MODEL</div>
          </div>
          <div class="viewport-header-right">
            <button class="action-btn" @click="toggleMaximize('STL')" :title="maximizedViewport === 'STL' ? '还原' : '最大化'">
              <svg v-if="maximizedViewport === 'STL'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
              </svg>
            </button>
            <button class="action-btn" @click="openSaveImageDialog('STL', stlViewport)" title="保存图像">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="viewport-element" ref="stlViewport"></div>
        <div v-if="stlLoading" class="stl-loading">
          <div class="spinner"></div>
          <p>加载 3D 模型...</p>
        </div>
        <div v-if="stlError" class="stl-error">{{ stlError }}</div>
      </div>
      <div class="viewport-container" :class="{ maximized: maximizedViewport === 'CORONAL' }">
        <div class="viewport-header">
          <div class="viewport-header-left">
            <div class="viewport-label">CORONAL</div>
            <div class="viewport-indicator" :style="{ backgroundColor: getLabelColor('CORONAL') }"></div>
          </div>
          <div class="viewport-header-right">
            <button class="action-btn" @click="toggleMaximize('CORONAL')" :title="maximizedViewport === 'CORONAL' ? '还原' : '最大化'">
              <svg v-if="maximizedViewport === 'CORONAL'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
              </svg>
            </button>
            <button class="action-btn" @click="openSaveImageDialog('CORONAL', viewport3)" title="保存图像">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="viewport-element" ref="viewport3"></div>
      </div>
      <div class="viewport-container" :class="{ maximized: maximizedViewport === 'SAGITTAL' }">
        <div class="viewport-header">
          <div class="viewport-header-left">
            <div class="viewport-label">SAGITTAL</div>
            <div class="viewport-indicator" :style="{ backgroundColor: getLabelColor('SAGITTAL') }"></div>
          </div>
          <div class="viewport-header-right">
            <button class="action-btn" @click="toggleMaximize('SAGITTAL')" :title="maximizedViewport === 'SAGITTAL' ? '还原' : '最大化'">
              <svg v-if="maximizedViewport === 'SAGITTAL'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
              </svg>
            </button>
            <button class="action-btn" @click="openSaveImageDialog('SAGITTAL', viewport2)" title="保存图像">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="viewport-element" ref="viewport2"></div>
      </div>
    </div>

    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>加载中...</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>

    <!-- 保存图像对话框 -->
    <div v-if="showSaveDialog" class="dialog-overlay" @click="closeSaveImageDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3>保存图像 - {{ currentSaveView }}</h3>
          <button class="close-btn" @click="closeSaveImageDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>图像标题：</label>
            <input v-model="imageTitle" type="text" placeholder="输入图像标题" class="form-input" />
          </div>
          <div class="form-group">
            <label>图像描述：</label>
            <textarea v-model="imageDescription" placeholder="输入图像描述" class="form-textarea" rows="3" maxlength="50"></textarea>
            <div class="char-count">{{ imageDescription.length }}/50</div>
          </div>
          <div class="image-preview">
            <img v-if="previewImageUrl" :src="previewImageUrl" alt="预览" />
            <div v-else class="preview-placeholder">
              <p>正在捕获图像...</p>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="closeSaveImageDialog" class="btn btn-cancel">取消</button>
          <button @click="confirmSaveImage" class="btn btn-primary">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useCrosshairsViewer } from '../composables/useCrosshairsViewer.js'
import { useSTLViewer } from '../composables/useSTLViewer.js'
import { useSavedImages } from '../composables/useSavedImages.js'
import { getRenderingEngine } from '@cornerstonejs/core'

const props = defineProps({
  seriesInstanceUID: { type: String, required: true },
  currentPhase: { type: String, default: '收缩期' },
  allSeriesUIDs: { type: Object, default: () => ({}) }, // 所有期相的UID映射
  geometricData: { type: Object, default: null },
})

// 图像保存相关
const { saveImage } = useSavedImages()
const showSaveDialog = ref(false)
const currentSaveView = ref('')
const currentViewportRef = ref(null)
const imageTitle = ref('')
const imageDescription = ref('')
const previewImageUrl = ref('')

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
  enableAngleTool, 
  disableAngleTool, 
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
  getAxialSlicePosition,
  toggleWaveImage,
  updateWaveOpacity,
  updateWaveRotation
} = useCrosshairsViewer(props, props.allSeriesUIDs)
const { 
  loading: stlLoading, 
  error: stlError, 
  initialize: initializeSTL, 
  switchPhase: switchSTLPhase,
  showPlane: showSTLPlane,
  hidePlane: hideSTLPlane,
  updatePlanePosition: updateSTLPlanePosition,
  captureImage: captureSTLImage,
  cleanup: cleanupSTL 
} = useSTLViewer()

const viewport1 = ref(null)
const viewport2 = ref(null)
const viewport3 = ref(null)
const stlViewport = ref(null)

// 视口最大化相关
const maximizedViewport = ref(null)

function toggleMaximize(viewType) {
  if (maximizedViewport.value === viewType) {
    maximizedViewport.value = null
  } else {
    maximizedViewport.value = viewType
  }
  
  // 触发 resize 以更新视口内容
  nextTick(() => {
    // 触发 window resize 事件，让 Cornerstone 和 VTK 重新计算大小
    window.dispatchEvent(new Event('resize'))
  })
}

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

/**
 * 打开保存图像对话框
 */
async function openSaveImageDialog(viewType, viewportRef, retryCount = 0) {
  console.log('打开保存对话框:', viewType)
  
  currentSaveView.value = viewType
  currentViewportRef.value = viewportRef
  
  // 设置默认标题
  imageTitle.value = `${viewType} 视图 - ${props.currentPhase}`
  imageDescription.value = ''
  
  // 重置预览图像
  previewImageUrl.value = ''
  
  // 先显示对话框
  showSaveDialog.value = true
  
  // 延迟捕获图像
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // 使用Cornerstone API捕获图像
  captureViewportImage(viewType)
}

/**
 * 关闭保存图像对话框
 */
function closeSaveImageDialog() {
  showSaveDialog.value = false
  imageTitle.value = ''
  imageDescription.value = ''
  previewImageUrl.value = ''
  currentSaveView.value = ''
  currentViewportRef.value = null
}

/**
 * 使用Cornerstone API捕获viewport图像
 */
async function captureViewportImage(viewType) {
  console.log('使用Cornerstone API捕获图像:', viewType)
  
  try {
    // 获取rendering engine
    const renderingEngine = getRenderingEngine('myRenderingEngine')
    if (!renderingEngine) {
      console.error('❌ 未找到rendering engine')
      alert('渲染引擎未初始化')
      previewImageUrl.value = ''
      return
    }
    
    // 根据viewType获取对应的viewportId
    let viewportId = ''
    if (viewType === 'AXIAL') {
      viewportId = 'axial-viewport'
    } else if (viewType === 'SAGITTAL') {
      viewportId = 'sagittal-viewport'
    } else if (viewType === 'CORONAL') {
      viewportId = 'coronal-viewport'
    } else if (viewType === 'STL') {
      // STL视图使用VTK的captureImage方法
      await captureSTLImageFromVTK()
      return
    }
    
    if (!viewportId) {
      console.error('❌ 无效的viewType:', viewType)
      alert('无效的视图类型')
      previewImageUrl.value = ''
      return
    }
    
    console.log('获取viewport:', viewportId)
    const viewport = renderingEngine.getViewport(viewportId)
    if (!viewport) {
      console.error('❌ 未找到viewport:', viewportId)
      alert('视图未初始化')
      previewImageUrl.value = ''
      return
    }
    
    // 获取canvas
    const canvas = viewport.getCanvas()
    if (!canvas) {
      console.error('❌ viewport没有canvas')
      alert('无法获取画布')
      previewImageUrl.value = ''
      return
    }
    
    console.log('✅ 找到canvas:', canvas.width, 'x', canvas.height)
    
    // 转换为图像
    const dataUrl = canvas.toDataURL('image/png')
    if (dataUrl && dataUrl.length > 100) {
      previewImageUrl.value = dataUrl
      console.log('✅ 图像捕获成功，大小:', Math.round(dataUrl.length / 1024), 'KB')
    } else {
      console.error('❌ 图像数据无效')
      alert('图像捕获失败')
      previewImageUrl.value = ''
    }
  } catch (error) {
    console.error('❌ 捕获图像失败:', error)
    alert('捕获失败: ' + error.message)
    previewImageUrl.value = ''
  }
}

/**
 * 捕获STL视图图像（使用VTK的captureImage方法）
 */
async function captureSTLImageFromVTK() {
  console.log('捕获STL图像')
  
  try {
    const dataUrl = await captureSTLImage()
    if (dataUrl && dataUrl.length > 100) {
      previewImageUrl.value = dataUrl
      console.log('✅ STL图像捕获成功')
    } else {
      console.error('❌ STL图像数据无效')
      alert('STL图像捕获失败')
      previewImageUrl.value = ''
    }
  } catch (error) {
    console.error('❌ 捕获STL图像失败:', error)
    alert('3D视图捕获失败: ' + error.message)
    previewImageUrl.value = ''
  }
}

/**
 * 确认保存图像
 */
function confirmSaveImage() {
  console.log('开始保存图像...')
  console.log('标题:', imageTitle.value)
  console.log('视图类型:', currentSaveView.value)
  console.log('图像数据长度:', previewImageUrl.value?.length || 0)
  
  if (!imageTitle.value.trim()) {
    alert('请输入图像标题')
    return
  }
  
  if (!previewImageUrl.value) {
    console.error('保存失败：预览图像为空')
    alert('图像捕获失败，请重新打开保存对话框重试')
    return
  }
  
  // 再次验证图像数据
  if (previewImageUrl.value.length < 100) {
    console.error('保存失败：图像数据过小')
    alert('图像数据无效，请重新捕获')
    return
  }
  
  try {
    // 保存图像
    const savedImageObj = saveImage({
      dataUrl: previewImageUrl.value,
      viewType: currentSaveView.value,
      title: imageTitle.value,
      description: imageDescription.value,
      phase: props.currentPhase
    })
    
    console.log('✅ MainViewer: 图像已保存到集合')
    console.log('✅ 保存的图像对象:', {
      id: savedImageObj.id,
      title: savedImageObj.title,
      viewType: savedImageObj.viewType,
      hasData: !!savedImageObj.dataUrl
    })
    alert('图像保存成功！')
    closeSaveImageDialog()
  } catch (error) {
    console.error('❌ 保存图像失败:', error)
    alert('保存失败: ' + error.message)
  }
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
  enableAngleTool,
  disableAngleTool,
  undoLastMeasurement,
  enableCrosshairs,
  disableCrosshairs,
  savedViewStates,
  saveViewState,
  restoreViewState,
  deleteViewState,
  renameViewState,
  clearAllViewStates,
  toggleWaveImage,
  updateWaveOpacity,
  updateWaveRotation
})

// 期相切换会同时触发 DICOM seriesInstanceUID 与 STL phase 的更新；
// 这里合并监听并做“UI 先更新 + 任务去重/取消”，避免点击后长时间无反应。
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))
let switchToken = 0
watch(
  () => [props.seriesInstanceUID, props.currentPhase],
  async ([newUID, newPhase], [oldUID, oldPhase]) => {
    const token = ++switchToken

    const uidChanged = Boolean(newUID && newUID !== oldUID)
    const phaseChanged = Boolean(newPhase && newPhase !== oldPhase)
    if (!uidChanged && !phaseChanged) return

    // 让侧边栏按钮等 UI 有机会先完成渲染，再开始重操作
    await nextTick()
    await nextFrame()
    if (token !== switchToken) return

    // 1) DICOM：seriesInstanceUID 变化时切换体积
    if (uidChanged) {
      try {
        console.log(`DICOM 系列变化: ${oldUID} -> ${newUID}`)
        if (viewport1.value && viewport2.value && viewport3.value) {
          if (!loading.value && !error.value) {
            await switchVolume(newUID)
          } else {
            await initialize(viewport1.value, viewport2.value, viewport3.value)
          }
        }
      } catch (err) {
        console.error('切换体积失败:', err)
        if (token !== switchToken) return
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

    if (token !== switchToken) return

    // 2) STL：期相变化时切换模型
    if (phaseChanged && stlViewport.value) {
      console.log(`期相变化: ${oldPhase} -> ${newPhase}`)
      try {
        await switchSTLPhase(newPhase)
      } catch (err) {
        console.error('切换期相失败:', err)
        if (token !== switchToken) return
        try {
          await initializeSTL(stlViewport.value, newPhase)
        } catch (initErr) {
          console.error('重新初始化 STL 查看器失败:', initErr)
        }
      }
    }
  },
  { immediate: false, flush: 'post' }
)
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
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 10;
}

.viewport-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* 操作按钮样式 */
.action-btn {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: #4fc3f7;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.action-btn:hover {
  background: rgba(79, 195, 247, 0.4);
  border-color: #4fc3f7;
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

.viewport-header-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 最大化相关样式 */
.viewport-grid.has-maximized .viewport-container:not(.maximized) {
  display: none;
}

.viewport-container.maximized {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  z-index: 100;
}

/* 对话框样式 */
.dialog-overlay {
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
  animation: fadeIn 0.3s ease;
}

.dialog-content {
  background: #1a2332;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid rgba(79, 195, 247, 0.2);
}

.dialog-header h3 {
  color: #4fc3f7;
  margin: 0;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 30px;
  height: 30px;
  transition: color 0.3s ease;
}

.close-btn:hover {
  color: #4fc3f7;
}

.dialog-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  color: #b0bec5;
  margin-bottom: 8px;
  font-size: 14px;
}

.form-input,
.form-textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(79, 195, 247, 0.3);
  color: #fff;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.char-count {
  text-align: right;
  color: #b0bec5;
  font-size: 12px;
  margin-top: 4px;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #4fc3f7;
  background: rgba(255, 255, 255, 0.08);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.image-preview {
  margin-top: 20px;
  border: 1px solid rgba(79, 195, 247, 0.3);
  border-radius: 4px;
  overflow: hidden;
  background: #0d1b2a;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview img {
  width: 100%;
  height: auto;
  display: block;
}

.preview-placeholder {
  color: #b0bec5;
  text-align: center;
  padding: 40px;
}

.preview-placeholder p {
  margin: 0;
  font-size: 14px;
}

.dialog-footer {
  padding: 20px;
  border-top: 1px solid rgba(79, 195, 247, 0.2);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-primary {
  background: #4fc3f7;
  color: #0d1b2a;
  font-weight: 500;
}

.btn-primary:hover {
  background: #29b6f6;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
