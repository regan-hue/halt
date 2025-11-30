<template>
  <div class="crosshairs-viewer">
    <div class="viewport-container">
      <div ref="axialViewport" class="viewport">
        <div class="viewport-label">轴向 (Axial)</div>
      </div>
      <div ref="sagittalViewport" class="viewport">
        <div class="viewport-label">矢状 (Sagittal)</div>
      </div>
      <div ref="coronalViewport" class="viewport">
        <div class="viewport-label">冠状 (Coronal)</div>
      </div>
    </div>
    <!-- 保存/恢复控制按钮 -->
    <div class="control-panel" v-if="!loading && !error">
      <button 
        class="control-btn save-btn" 
        @click="saveCurrentPosition"
        :disabled="!canSave"
        title="保存当前MPR位置"
      >
        💾 保存位置
      </button>
      <button 
        class="control-btn restore-btn" 
        @click="restoreSavedPosition"
        :disabled="!hasSavedPosition"
        title="恢复到保存的位置"
      >
        🔄 恢复位置
      </button>
      <button 
        class="control-btn preset-btn" 
        @click="applyPresetPosition"
        title="定位到特定视角"
      >
        📍 定位视角
      </button>
      <div v-if="hasSavedPosition" class="save-info">
        已保存位置
      </div>
    </div>
    <!-- 数据探针面板 -->
    <div class="probe-panel" v-if="!loading && !error && cameraProbeData">
      <div class="probe-header">
        <h3>📊 数据探针</h3>
        <button class="probe-toggle-btn" @click="toggleProbePanel">
          {{ probePanelExpanded ? '−' : '+' }}
        </button>
      </div>
      <div v-if="probePanelExpanded" class="probe-content">
        <!-- 鼠标位置探针 -->
        <div class="probe-section-divider">
          <span>🖱️ 鼠标位置</span>
        </div>
        <div 
          v-for="(mouseData, viewName) in mouseProbeData" 
          :key="'mouse-' + viewName"
          class="probe-viewport-section mouse-probe-section"
        >
          <div class="probe-viewport-title">
            {{ getViewportDisplayName(viewName) }}
            <span v-if="mouseData && mouseData.isValid" class="probe-status-indicator">●</span>
            <span v-else class="probe-status-indicator inactive">○</span>
          </div>
          <div v-if="mouseData && mouseData.isValid" class="probe-data-grid">
            <div class="probe-data-item">
              <span class="probe-label">画布坐标:</span>
              <span class="probe-value">
                [{{ mouseData.canvasPoint[0] }}, {{ mouseData.canvasPoint[1] }}]
              </span>
            </div>
            <div class="probe-data-item">
              <span class="probe-label">世界坐标 (mm):</span>
              <span class="probe-value highlight">
                {{ formatVector(mouseData.worldPoint) }}
              </span>
            </div>
            <div class="probe-data-item">
              <span class="probe-label">图像坐标 (体素):</span>
              <span class="probe-value highlight">
                {{ formatImagePoint(mouseData.imagePoint) }}
              </span>
            </div>
            <div class="probe-data-item" v-if="mouseData.pixelValue !== null">
              <span class="probe-label">像素值 (HU):</span>
              <span class="probe-value highlight pixel-value">
                {{ mouseData.pixelValue }}
              </span>
            </div>
          </div>
          <div v-else class="probe-no-data">
            鼠标移入视口查看坐标信息
          </div>
        </div>
        
        <!-- 相机参数探针 -->
        <div class="probe-section-divider">
          <span>📷 相机参数</span>
        </div>
        <div 
          v-for="(data, viewName) in cameraProbeData" 
          :key="'camera-' + viewName"
          class="probe-viewport-section"
        >
          <div class="probe-viewport-title">
            {{ getViewportDisplayName(viewName) }}
          </div>
          <div class="probe-data-grid">
            <div class="probe-data-item">
              <span class="probe-label">相机位置 (Position):</span>
              <span class="probe-value">
                {{ formatVector(data.position) }}
              </span>
            </div>
            <div class="probe-data-item">
              <span class="probe-label">焦点 (Focal Point):</span>
              <span class="probe-value">
                {{ formatVector(data.focalPoint) }}
              </span>
            </div>
            <div class="probe-data-item">
              <span class="probe-label">视图向上 (View Up):</span>
              <span class="probe-value">
                {{ formatVector(data.viewUp) }}
              </span>
            </div>
            <div class="probe-data-item">
              <span class="probe-label">平行缩放 (Parallel Scale):</span>
              <span class="probe-value">
                {{ formatNumber(data.parallelScale) }} mm
              </span>
            </div>
            <div class="probe-data-item" v-if="data.viewAngle !== null && data.viewAngle !== undefined">
              <span class="probe-label">视角 (View Angle):</span>
              <span class="probe-value">
                {{ formatNumber(data.viewAngle) }}°
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as cornerstone from '@cornerstonejs/core'
import {
  init as cornerstoneInit,
  imageLoader,
  getRenderingEngine,
  RenderingEngine,
  Enums,
  volumeLoader,
  cache,
} from '@cornerstonejs/core'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'
import { 
  init as cornerstoneToolsInit, 
  addTool, 
  ToolGroupManager, 
  CrosshairsTool,
  Enums as ToolsEnums 
} from '@cornerstonejs/tools'
import { cornerstoneStreamingImageVolumeLoader } from '@cornerstonejs/streaming-image-volume-loader'

// Props 定义
const props = defineProps({
  studyInstanceUID: {
    type: String,
    required: true,
  },
  seriesInstanceUID: {
    type: String,
    required: true,
  },
})

const axialViewport = ref(null)
const sagittalViewport = ref(null)
const coronalViewport = ref(null)
const loading = ref(true)
const error = ref(null)

const renderingEngineId = 'myRenderingEngine'
const toolGroupId = 'myToolGroup'

// 保存的位置状态
const savedPosition = ref(null)
const hasSavedPosition = ref(false)
const canSave = ref(false)

// 数据探针相关状态
const cameraProbeData = ref(null)
const probePanelExpanded = ref(true)
let probeUpdateInterval = null

// 鼠标位置探针数据
const mouseProbeData = ref({
  axial: null,
  sagittal: null,
  coronal: null,
})

// 存储渲染引擎和viewport IDs的引用
let renderingEngineRef = null
let viewportIdsRef = null
let volumeRef = null

// DICOM 配置
// Orthanc服务器地址（根据Orthanc DICOMweb文档）
const orthancUrl = 'http://192.168.1.3:18997'

onMounted(async () => {
  try {
    // 初始化 Cornerstone
    await cornerstoneInit()
    await cornerstoneToolsInit()
    
    // 配置 DICOM 图像加载器
    // 设置 cornerstone 实例 - 这是必需的！
    cornerstoneDICOMImageLoader.external.cornerstone = cornerstone
    // 设置 dicomParser - 这也是必需的！
    cornerstoneDICOMImageLoader.external.dicomParser = dicomParser
    
    // 初始化 Web Worker 管理器
    const config = {
      maxWebWorkers: navigator.hardwareConcurrency || 4,
      startWebWorkersOnDemand: true,
      taskConfiguration: {
        decodeTask: {
          initializeCodecsOnStartup: false,
          usePDFJS: false,
          strict: false,
        },
      },
    }
    
    if (cornerstoneDICOMImageLoader.webWorkerManager) {
      cornerstoneDICOMImageLoader.webWorkerManager.initialize(config)
    }
    
    // 注册 DICOM 图像加载器
    // 使用 register 方法自动注册所有加载器
    if (cornerstoneDICOMImageLoader.register) {
      cornerstoneDICOMImageLoader.register(imageLoader)
    } else {
      // 如果没有 register 方法，手动注册
      if (cornerstoneDICOMImageLoader.wadouri && cornerstoneDICOMImageLoader.wadouri.loadImage) {
        imageLoader.registerImageLoader('dicomweb', cornerstoneDICOMImageLoader.wadouri.loadImage)
      } else if (cornerstoneDICOMImageLoader.loadImage) {
        imageLoader.registerImageLoader('dicomweb', cornerstoneDICOMImageLoader.loadImage)
      }
    }
    
    // 注册体积加载器
    volumeLoader.registerVolumeLoader('cornerstoneStreamingImageVolume', cornerstoneStreamingImageVolumeLoader)

    // 创建渲染引擎
    const renderingEngine = new RenderingEngine(renderingEngineId)
    renderingEngineRef = renderingEngine

    // 创建工具组
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId)

    // 添加 Crosshairs 工具
    addTool(CrosshairsTool)
    toolGroup.addTool(CrosshairsTool.toolName)
    toolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
    })

    // 添加其他必要的工具
    const { PanTool, WindowLevelTool, ZoomTool, StackScrollMouseWheelTool } = await import('@cornerstonejs/tools')
    addTool(PanTool)
    addTool(WindowLevelTool)
    addTool(ZoomTool)
    addTool(StackScrollMouseWheelTool)

    toolGroup.addTool(PanTool.toolName)
    toolGroup.addTool(WindowLevelTool.toolName)
    toolGroup.addTool(ZoomTool.toolName)
    toolGroup.addTool(StackScrollMouseWheelTool.toolName)

    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
    })
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
    })
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary, modifierKey: ToolsEnums.KeyboardBindings.Shift }],
    })
    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName, {
      bindings: [],
    })

    // 获取系列中的所有实例
    const imageIds = await fetchInstances()
    
    if (!imageIds || imageIds.length === 0) {
      throw new Error('未找到DICOM实例')
    }

    // 创建 viewport IDs
    const viewportIds = {
      axial: 'axial-viewport',
      sagittal: 'sagittal-viewport',
      coronal: 'coronal-viewport',
    }

    // 创建 Volume Viewports（用于多平面重建）
    const viewportInputArray = [
      {
        viewportId: viewportIds.axial,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: axialViewport.value,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportIds.sagittal,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: sagittalViewport.value,
        defaultOptions: {
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportIds.coronal,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: coronalViewport.value,
        defaultOptions: {
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]
    console.log('x轴的方向:', Enums.OrientationAxis.AXIAL)

    renderingEngine.setViewports(viewportInputArray)

    // 将 viewports 添加到工具组
    toolGroup.addViewport(viewportIds.axial, renderingEngineId)
    toolGroup.addViewport(viewportIds.sagittal, renderingEngineId)
    toolGroup.addViewport(viewportIds.coronal, renderingEngineId)

    // 存储viewport IDs引用
    viewportIdsRef = viewportIds

    // 加载体积数据
    await loadVolume(renderingEngine, viewportIds, imageIds)

    // 启用保存功能
    canSave.value = true
    loading.value = false
  } catch (err) {
    console.error('初始化错误:', err)
    error.value = err.message || '初始化失败'
    loading.value = false
  }
})

async function fetchInstances() {
  try {
    // Orthanc API: 先通过SeriesInstanceUID查询找到系列
    // 使用tools/find接口查询
    const findResponse = await fetch('/tools/find', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Level: 'Series',
        Query: {
          SeriesInstanceUID: props.seriesInstanceUID,
        },
      }),
    })

    if (!findResponse.ok) {
      throw new Error(`查询系列失败: ${findResponse.status}`)
    }

    const seriesIds = await findResponse.json()

    if (!seriesIds || seriesIds.length === 0) {
      throw new Error('未找到指定的系列')
    }

    // 获取第一个系列的详细信息
    const seriesId = seriesIds[0]
    const seriesResponse = await fetch(`/series/${seriesId}`)
    
    if (!seriesResponse.ok) {
      throw new Error(`获取系列信息失败: ${seriesResponse.status}`)
    }

    const seriesData = await seriesResponse.json()
    
    // 获取实例列表
    const instanceIds = seriesData.Instances || []
    
    if (instanceIds.length === 0) {
      throw new Error('系列中没有找到实例')
    }

    // 获取每个实例的元数据并排序
    const instancesWithMetadata = await Promise.all(
      instanceIds.map(async (instanceId) => {
        try {
          // 获取实例的标签（tags）
          const tagsResponse = await fetch(`/instances/${instanceId}/tags?simplify`)
          if (!tagsResponse.ok) {
            console.warn(`无法获取实例 ${instanceId} 的标签`)
            return { instanceId, imageId: `wadouri:/instances/${instanceId}/file`, position: null, sliceLocation: null, instanceNumber: null }
          }
          
          const tags = await tagsResponse.json()
          
          // 提取关键排序字段
          // ImagePositionPatient (0020,0032) - 图像在患者坐标系中的位置
          // SliceLocation (0020,1041) - 切片位置
          // InstanceNumber (0020,0013) - 实例编号（备用）
          const imagePositionPatient = tags['0020,0032'] || tags['ImagePositionPatient']
          const sliceLocation = tags['0020,1041'] || tags['SliceLocation']
          const instanceNumber = tags['0020,0013'] || tags['InstanceNumber']
          
          // 解析 ImagePositionPatient（格式通常是 "x\\y\\z"）
          let position = null
          if (imagePositionPatient && typeof imagePositionPatient === 'string') {
            const coords = imagePositionPatient.split('\\').map(Number)
            if (coords.length >= 3 && !coords.some(isNaN)) {
              position = coords
            }
          }
          
          return {
            instanceId,
            imageId: `wadouri:/instances/${instanceId}/file`,
            position,
            sliceLocation: sliceLocation ? Number(sliceLocation) : null,
            instanceNumber: instanceNumber ? Number(instanceNumber) : null,
          }
        } catch (err) {
          console.warn(`处理实例 ${instanceId} 时出错:`, err)
          return { instanceId, imageId: `wadouri:/instances/${instanceId}/file`, position: null, sliceLocation: null, instanceNumber: null }
        }
      })
    )

    // 按照空间位置排序
    instancesWithMetadata.sort((a, b) => {
      // 优先使用 ImagePositionPatient 的 Z 坐标（通常是轴向位置）
      if (a.position && b.position && a.position.length >= 3 && b.position.length >= 3) {
        // 对于轴向视图，使用 Z 坐标；对于矢状视图，使用 X 坐标；对于冠状视图，使用 Y 坐标
        // 通常轴向视图使用 Z 坐标排序
        const zDiff = a.position[2] - b.position[2]
        if (Math.abs(zDiff) > 0.001) {
          return zDiff
        }
      }
      
      // 如果没有 ImagePositionPatient，使用 SliceLocation
      if (a.sliceLocation !== null && b.sliceLocation !== null) {
        const sliceDiff = a.sliceLocation - b.sliceLocation
        if (Math.abs(sliceDiff) > 0.001) {
          return sliceDiff
        }
      }
      
      // 最后使用 InstanceNumber 作为备用排序
      if (a.instanceNumber !== null && b.instanceNumber !== null) {
        return a.instanceNumber - b.instanceNumber
      }
      
      // 如果都没有，保持原顺序
      return 0
    })

    // 提取排序后的 imageIds
    const imageIds = instancesWithMetadata.map(item => item.imageId)
    
    console.log(`已加载 ${imageIds.length} 个实例，已按空间位置排序`)
    
    return imageIds
  } catch (err) {
    console.error('获取实例失败:', err)
    throw err
  }
}

async function loadVolume(renderingEngine, viewportIds, imageIds) {
  try {
    // 定义体积ID
    const volumeId = `cornerstoneStreamingImageVolume:volume-${props.seriesInstanceUID}`
    
    // 创建体积加载器
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    })

    // 加载体积数据
    await volume.load()

    // 保存volume引用用于获取像素值
    volumeRef = volume

    // 设置每个viewport显示体积
    const axialViewport = renderingEngine.getViewport(viewportIds.axial)
    const sagittalViewport = renderingEngine.getViewport(viewportIds.sagittal)
    const coronalViewport = renderingEngine.getViewport(viewportIds.coronal)

    // 设置体积到各个viewport
    axialViewport.setVolumes([{ volumeId }])
    sagittalViewport.setVolumes([{ volumeId }])
    coronalViewport.setVolumes([{ volumeId }])
    
    // 渲染所有viewport（不设置任何相机位置，使用默认位置）
    renderingEngine.renderViewports([viewportIds.axial, viewportIds.sagittal, viewportIds.coronal])

    // 添加坐标输出功能
    setupCoordinateLogging(renderingEngine, viewportIds)
    
    // 启动数据探针
    startCameraProbe(renderingEngine, viewportIds)
  } catch (err) {
    console.error('加载体积失败:', err)
    throw err
  }
}

// 设置坐标日志记录
function setupCoordinateLogging(renderingEngine, viewportIds) {
  const viewports = {
    axial: renderingEngine.getViewport(viewportIds.axial),
    sagittal: renderingEngine.getViewport(viewportIds.sagittal),
    coronal: renderingEngine.getViewport(viewportIds.coronal),
  }

  const elements = {
    axial: axialViewport.value,
    sagittal: sagittalViewport.value,
    coronal: coronalViewport.value,
  }

  // 为每个viewport添加事件监听
  Object.keys(viewports).forEach((viewName) => {
    const element = elements[viewName]
    const viewport = viewports[viewName]

    // 鼠标移动事件 - 更新鼠标位置探针
    const handleMouseMove = (event) => {
      const rect = element.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      // 获取Canvas坐标
      const canvasPoint = [mouseX, mouseY]

      try {
        // 转换为世界坐标
        const worldPoint = viewport.canvasToWorld(canvasPoint)

        // 获取图像坐标（对于Volume viewport）
        let imagePoint = null
        let pixelValue = null
        
        try {
          // 对于Volume viewport，使用worldToIndex
          if (viewport.worldToIndex) {
            imagePoint = viewport.worldToIndex(worldPoint)
            
            // 获取像素值
            if (imagePoint && volumeRef) {
              pixelValue = getPixelValue(imagePoint, volumeRef)
            }
          }
        } catch (e) {
          // 如果转换失败，尝试其他方法
          try {
            if (viewport.getImageData) {
              const imageData = viewport.getImageData()
              // 可以在这里添加其他坐标转换逻辑
            }
          } catch (e2) {
            // 忽略错误
          }
        }

        // 更新鼠标位置探针数据
        updateMouseProbeData(viewName, {
          canvasPoint: [Math.round(mouseX), Math.round(mouseY)],
          worldPoint: worldPoint,
          imagePoint: imagePoint,
          pixelValue: pixelValue,
          isValid: true,
        })
      } catch (error) {
        // 如果坐标转换失败，标记为无效
        updateMouseProbeData(viewName, {
          canvasPoint: [Math.round(mouseX), Math.round(mouseY)],
          worldPoint: null,
          imagePoint: null,
          pixelValue: null,
          isValid: false,
        })
      }
    }

    // 鼠标离开视口时清除数据
    const handleMouseLeave = () => {
      updateMouseProbeData(viewName, null)
    }

    // 滚动事件 - 检测MPR滑动
    const handleWheel = (event) => {
      const rect = element.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const deltaY = event.deltaY

      console.log(`[${viewName.toUpperCase()} Viewport] MPR滑动事件:`, {
        滚动方向: deltaY > 0 ? '向下' : '向上',
        滚动量: Math.abs(deltaY),
        鼠标位置: {
          x: Math.round(mouseX),
          y: Math.round(mouseY),
        },
      })

      // 延迟获取坐标，等待渲染完成
      setTimeout(() => {
        try {
          const canvasPoint = [mouseX, mouseY]
          const worldPoint = viewport.canvasToWorld(canvasPoint)

          let imagePoint = null
          if (viewport.getImageData && viewport.worldToIndex) {
            try {
              imagePoint = viewport.worldToIndex(worldPoint)
            } catch (e) {
              // 忽略错误
            }
          }

          console.log(`[${viewName.toUpperCase()} Viewport] 滑动后坐标:`, {
            鼠标位置: {
              x: Math.round(mouseX),
              y: Math.round(mouseY),
            },
            世界坐标: {
              x: worldPoint[0]?.toFixed(2),
              y: worldPoint[1]?.toFixed(2),
              z: worldPoint[2]?.toFixed(2),
            },
            图像坐标: imagePoint ? {
              i: Math.round(imagePoint[0]),
              j: Math.round(imagePoint[1]),
              k: imagePoint[2] ? Math.round(imagePoint[2]) : null,
            } : '无法获取',
          })
        } catch (error) {
          console.log(`[${viewName.toUpperCase()} Viewport] 滑动后鼠标位置:`, {
            x: Math.round(mouseX),
            y: Math.round(mouseY),
          })
        }
      }, 50)
    }

    // 添加事件监听器
    element.addEventListener('mousemove', handleMouseMove)
    element.addEventListener('mouseleave', handleMouseLeave)
    element.addEventListener('wheel', handleWheel, { passive: true })

    // 存储清理函数
    element._coordinateLoggingCleanup = () => {
      element.removeEventListener('mousemove', handleMouseMove)
      element.removeEventListener('mouseleave', handleMouseLeave)
      element.removeEventListener('wheel', handleWheel)
    }
  })
}

// 向量工具函数
function vectorLength(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}

function normalizeVec(v) {
  const len = vectorLength(v)
  if (len === 0) return [0, 0, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function subtractVec(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dotProductVec(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function crossProductVec(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

// 格式化向量为字符串（保留6位小数）
function formatVec(v, decimals = 6) {
  if (!v || !Array.isArray(v)) return 'N/A'
  return `[${v.map(x => x.toFixed(decimals)).join(', ')}]`
}

// 保存当前MPR位置
async function saveCurrentPosition() {
  if (!renderingEngineRef || !viewportIdsRef) {
    console.error('渲染引擎未初始化')
    return
  }

  try {
    const viewports = {
      axial: renderingEngineRef.getViewport(viewportIdsRef.axial),
      sagittal: renderingEngineRef.getViewport(viewportIdsRef.sagittal),
      coronal: renderingEngineRef.getViewport(viewportIdsRef.coronal),
    }

    const savedState = {}

    console.log('\n')
    console.log('╔══════════════════════════════════════════════════════════════════╗')
    console.log('║                    📸 保存位置 - 详细参数输出                      ║')
    console.log('╚══════════════════════════════════════════════════════════════════╝')
    console.log('\n')

    // 保存每个viewport的相机状态
    Object.keys(viewports).forEach((viewName) => {
      const viewport = viewports[viewName]
      
      try {
        const camera = viewport.getCamera()
        
        // 保存相机状态（深拷贝所有重要属性）
        savedState[viewName] = {
          position: camera.position ? [...camera.position] : null,
          focalPoint: camera.focalPoint ? [...camera.focalPoint] : null,
          viewUp: camera.viewUp ? [...camera.viewUp] : null,
          parallelScale: camera.parallelScale !== undefined ? camera.parallelScale : null,
          viewAngle: camera.viewAngle !== undefined ? camera.viewAngle : null,
          parallelProjection: camera.parallelProjection !== undefined ? camera.parallelProjection : null,
          clippingRange: camera.clippingRange ? [...camera.clippingRange] : null,
        }
        
        // 计算派生参数
        const position = savedState[viewName].position
        const focalPoint = savedState[viewName].focalPoint
        const viewUp = savedState[viewName].viewUp
        
        // 视图方向 = normalize(focalPoint - position)
        let viewDirection = null
        let viewDirectionNormalized = null
        let cameraDistance = null
        
        if (position && focalPoint) {
          viewDirection = subtractVec(focalPoint, position)
          cameraDistance = vectorLength(viewDirection)
          viewDirectionNormalized = normalizeVec(viewDirection)
        }
        
        // 计算视图平面的法向量（与视图方向相同）
        const planeNormal = viewDirectionNormalized
        
        // 计算右向量 (right = viewDirection × viewUp)
        let rightVector = null
        if (viewDirectionNormalized && viewUp) {
          rightVector = normalizeVec(crossProductVec(viewDirectionNormalized, viewUp))
        }
        
        // 输出格式化的信息
        console.log(`┌──────────────────────────────────────────────────────────────────┐`)
        console.log(`│  📷 ${viewName.toUpperCase()} VIEWPORT 相机参数`)
        console.log(`├──────────────────────────────────────────────────────────────────┤`)
        console.log(`│  🔹 基础相机参数:`)
        console.log(`│     position (相机位置):     ${formatVec(position)}`)
        console.log(`│     focalPoint (焦点):       ${formatVec(focalPoint)}`)
        console.log(`│     viewUp (向上向量):       ${formatVec(viewUp)}`)
        console.log(`│     parallelScale (缩放):    ${savedState[viewName].parallelScale?.toFixed(4) || 'N/A'}`)
        console.log(`│     viewAngle (视角):        ${savedState[viewName].viewAngle?.toFixed(4) || 'N/A'}°`)
        console.log(`│     parallelProjection:      ${savedState[viewName].parallelProjection}`)
        console.log(`│     clippingRange:           ${formatVec(savedState[viewName].clippingRange, 2)}`)
        console.log(`│`)
        console.log(`│  🔹 派生参数:`)
        console.log(`│     viewDirection (视图方向): ${formatVec(viewDirectionNormalized)}`)
        console.log(`│     cameraDistance (距离):    ${cameraDistance?.toFixed(4) || 'N/A'} mm`)
        console.log(`│     planeNormal (平面法向量): ${formatVec(planeNormal)}`)
        console.log(`│     rightVector (右向量):     ${formatVec(rightVector)}`)
        console.log(`└──────────────────────────────────────────────────────────────────┘`)
        console.log('\n')
        
      } catch (err) {
        console.warn(`保存${viewName} viewport状态失败:`, err)
        savedState[viewName] = null
      }
    })

    // 输出十字线工具状态
    console.log(`┌──────────────────────────────────────────────────────────────────┐`)
    console.log(`│  ✚ 十字线 (Crosshairs) 工具状态`)
    console.log(`├──────────────────────────────────────────────────────────────────┤`)
    
    try {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId)
      if (toolGroup) {
        const crosshairsTool = toolGroup.getToolInstance(CrosshairsTool.toolName)
        
        if (crosshairsTool) {
          // 获取工具状态
          const toolState = crosshairsTool.toolState || {}
          console.log(`│  🔹 工具名称: ${CrosshairsTool.toolName}`)
          console.log(`│  🔹 工具状态: ${toolGroup.getToolOptions(CrosshairsTool.toolName)?.mode || 'N/A'}`)
          
          // 尝试获取十字线的参考点
          if (crosshairsTool.getReferencedImageId) {
            console.log(`│  🔹 参考图像ID: ${crosshairsTool.getReferencedImageId() || 'N/A'}`)
          }
          
          // 获取十字线配置
          const toolOptions = toolGroup.getToolOptions(CrosshairsTool.toolName)
          if (toolOptions) {
            console.log(`│  🔹 工具配置:`, toolOptions)
          }
          
          // 获取annotation state
          try {
            const { annotation } = await import('@cornerstonejs/tools')
            const annotations = annotation.state.getAnnotations(CrosshairsTool.toolName, viewportIdsRef.axial)
            
            if (annotations && annotations.length > 0) {
              console.log(`│  🔹 十字线标注数量: ${annotations.length}`)
              annotations.forEach((ann, index) => {
                console.log(`│     [${index}] annotationUID: ${ann.annotationUID}`)
                if (ann.data) {
                  console.log(`│         handles:`, ann.data.handles)
                  if (ann.data.handles && ann.data.handles.toolCenter) {
                    console.log(`│         toolCenter (十字线中心): ${formatVec(ann.data.handles.toolCenter)}`)
                  }
                }
              })
            } else {
              console.log(`│  🔹 未找到十字线标注`)
            }
          } catch (annErr) {
            console.log(`│  🔹 获取十字线标注失败:`, annErr.message)
          }
          
        } else {
          console.log(`│  ⚠️ 未找到Crosshairs工具实例`)
        }
      } else {
        console.log(`│  ⚠️ 未找到工具组`)
      }
    } catch (toolErr) {
      console.log(`│  ⚠️ 获取十字线工具状态失败:`, toolErr.message)
    }
    
    console.log(`└──────────────────────────────────────────────────────────────────┘`)
    console.log('\n')

    // 输出三视图正交性验证
    console.log(`┌──────────────────────────────────────────────────────────────────┐`)
    console.log(`│  📐 三视图正交性验证`)
    console.log(`├──────────────────────────────────────────────────────────────────┤`)
    
    try {
      const axialDir = savedState.axial?.focalPoint && savedState.axial?.position
        ? normalizeVec(subtractVec(savedState.axial.focalPoint, savedState.axial.position))
        : null
      const sagittalDir = savedState.sagittal?.focalPoint && savedState.sagittal?.position
        ? normalizeVec(subtractVec(savedState.sagittal.focalPoint, savedState.sagittal.position))
        : null
      const coronalDir = savedState.coronal?.focalPoint && savedState.coronal?.position
        ? normalizeVec(subtractVec(savedState.coronal.focalPoint, savedState.coronal.position))
        : null
      
      if (axialDir && sagittalDir && coronalDir) {
        const dotAS = dotProductVec(axialDir, sagittalDir)
        const dotAC = dotProductVec(axialDir, coronalDir)
        const dotSC = dotProductVec(sagittalDir, coronalDir)
        
        console.log(`│  🔹 Axial · Sagittal  = ${dotAS.toFixed(6)} (应接近0)`)
        console.log(`│  🔹 Axial · Coronal   = ${dotAC.toFixed(6)} (应接近0)`)
        console.log(`│  🔹 Sagittal · Coronal = ${dotSC.toFixed(6)} (应接近0)`)
        
        const threshold = 0.01
        const isOrthogonal = Math.abs(dotAS) < threshold && Math.abs(dotAC) < threshold && Math.abs(dotSC) < threshold
        console.log(`│  🔹 正交性: ${isOrthogonal ? '✅ 正交' : '❌ 不正交'}`)
      } else {
        console.log(`│  ⚠️ 无法验证正交性（缺少视图方向数据）`)
      }
    } catch (orthErr) {
      console.log(`│  ⚠️ 正交性验证失败:`, orthErr.message)
    }
    
    console.log(`└──────────────────────────────────────────────────────────────────┘`)
    console.log('\n')

    // 输出可复制的代码格式
    console.log(`┌──────────────────────────────────────────────────────────────────┐`)
    console.log(`│  📋 可复制的预设代码格式`)
    console.log(`├──────────────────────────────────────────────────────────────────┤`)
    console.log(`const presetData = {`)
    Object.keys(savedState).forEach((viewName) => {
      const state = savedState[viewName]
      if (state) {
        console.log(`  ${viewName}: {`)
        console.log(`    position: [${state.position?.map(v => v.toFixed(3)).join(', ')}],`)
        console.log(`    focalPoint: [${state.focalPoint?.map(v => v.toFixed(3)).join(', ')}],`)
        console.log(`    viewUp: [${state.viewUp?.map(v => v.toFixed(3)).join(', ')}],`)
        console.log(`    parallelScale: ${state.parallelScale?.toFixed(3)},`)
        console.log(`    viewAngle: ${state.viewAngle?.toFixed(3)}`)
        console.log(`  },`)
      }
    })
    console.log(`}`)
    console.log(`└──────────────────────────────────────────────────────────────────┘`)
    console.log('\n')

    savedPosition.value = savedState
    hasSavedPosition.value = true
    
    console.log('✅ 位置已保存完成!')
  } catch (err) {
    console.error('保存位置失败:', err)
    alert('保存位置失败: ' + err.message)
  }
}

// 恢复到保存的位置
function restoreSavedPosition() {
  if (!renderingEngineRef || !viewportIdsRef || !savedPosition.value) {
    console.error('无法恢复: 没有保存的位置')
    return
  }

  try {
    const viewports = {
      axial: renderingEngineRef.getViewport(viewportIdsRef.axial),
      sagittal: renderingEngineRef.getViewport(viewportIdsRef.sagittal),
      coronal: renderingEngineRef.getViewport(viewportIdsRef.coronal),
    }

    // 恢复每个viewport的相机状态
    Object.keys(viewports).forEach((viewName) => {
      const viewport = viewports[viewName]
      const savedState = savedPosition.value[viewName]

      if (savedState && savedState !== null) {
        try {
          const camera = viewport.getCamera()
          
          // 恢复相机状态
          if (savedState.position && Array.isArray(savedState.position)) {
            camera.position = [...savedState.position]
          }
          if (savedState.focalPoint && Array.isArray(savedState.focalPoint)) {
            camera.focalPoint = [...savedState.focalPoint]
          }
          if (savedState.viewUp && Array.isArray(savedState.viewUp)) {
            camera.viewUp = [...savedState.viewUp]
          }
          if (savedState.parallelScale !== null && savedState.parallelScale !== undefined) {
            camera.parallelScale = savedState.parallelScale
          }
          if (savedState.viewAngle !== null && savedState.viewAngle !== undefined) {
            camera.viewAngle = savedState.viewAngle
          }
          if (savedState.parallelProjection !== null && savedState.parallelProjection !== undefined) {
            camera.parallelProjection = savedState.parallelProjection
          }

          // 应用相机设置
          viewport.setCamera(camera)
        } catch (err) {
          console.warn(`恢复${viewName} viewport状态失败:`, err)
        }
      }
    })

    // 重新渲染所有viewport
    renderingEngineRef.renderViewports([
      viewportIdsRef.axial,
      viewportIdsRef.sagittal,
      viewportIdsRef.coronal,
    ])

    console.log('位置已恢复')
  } catch (err) {
    console.error('恢复位置失败:', err)
    alert('恢复位置失败: ' + err.message)
  }
}

// 应用预设位置
async function applyPresetPosition() {
  if (!renderingEngineRef || !viewportIdsRef) {
    console.error('渲染引擎未初始化')
    return
  }

  try {
    const viewports = {
      axial: renderingEngineRef.getViewport(viewportIdsRef.axial),
      sagittal: renderingEngineRef.getViewport(viewportIdsRef.sagittal),
      coronal: renderingEngineRef.getViewport(viewportIdsRef.coronal),
    }

    // ========== 根据点集合计算平面并重建三正交 MPR ==========
    // 参考文档：mpr-plane-orientation-notes.md 方案 B
    
    // 1. 点集合定义
    const less_points = [
      [31.50214385986328, -140.07765197753906, 859.3524780273438],
      [34.58005028416463, -141.6882029085106, 862.7489221061926],
      [36.77678577345103, -145.1404212737562, 865.4343205806341],
      [38.366546372851644, -149.20827428314414, 867.5557586555454],
      [39.26782760679941, -153.7362960800528, 869.0106359482569],
      [39.20237766015661, -158.56664231634903, 869.4903750293994],
      [37.59967700679518, -163.00194336521466, 868.3201652943335],
      [34.94380470594756, -166.3533901795924, 865.9276285186534],
      [31.767717502508365, -168.36767019269055, 862.8399388423335],
      [28.45614694304884, -169.21134772247547, 859.4781115063338],
      [25.14387881924835, -168.12118008491524, 855.8959789984457],
      [22.270828347227596, -165.91052583559835, 852.6453456080102],
      [20.01450129732287, -162.56020942448947, 849.9093146053336],
      [18.86841368358383, -158.21362607475058, 848.2194210195215],
      [18.989928792934382, -153.37034421552553, 847.7966966023463],
      [19.91445219632709, -148.7308044605562, 848.2355767150335],
      [21.984458101638452, -144.59890671975083, 849.9279877365689],
      [24.84366132888451, -141.80627991623572, 852.5964689029747],
      [28.116225529894905, -140.1623257331496, 855.8267680664645],
      [31.50214385986328, -140.07765197753906, 859.3524780273438]
    ]
    
    // 2. 计算点的中心（作为平面上的点 origin）
    let centerSum = [0, 0, 0]
    less_points.forEach(point => {
      centerSum[0] += point[0]
      centerSum[1] += point[1]
      centerSum[2] += point[2]
    })
    const origin = [
      centerSum[0] / less_points.length,
      centerSum[1] / less_points.length,
      centerSum[2] / less_points.length
    ]
    
    // 3. 使用三点法计算平面法向量
    const p1 = less_points[0]
    const p2 = less_points[Math.floor(less_points.length / 3)]
    const p3 = less_points[Math.floor(less_points.length * 2 / 3)]
    
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]
    const normal_raw = crossProductVec(v1, v2)
    const n_plane = normalizeVec(normal_raw)  // 给定的平面法向量（归一化）
    
    // 4. 获取当前三个视图的 preferred normal 和 preferred up（用于保持临床习惯）
    // 标准 MPR 相机值（来自 Cornerstone 内部规范）
    const MPR_CAMERA_VALUES = {
      axial: {
        viewPlaneNormal: [0, 0, -1],
        viewUp: [0, -1, 0],
      },
      sagittal: {
        viewPlaneNormal: [1, 0, 0],
        viewUp: [0, 0, 1],
      },
      coronal: {
        viewPlaneNormal: [0, -1, 0],
        viewUp: [0, 0, 1],
      },
    }
    
    // 尝试从当前相机获取 preferred 值，否则使用默认值
    const getPreferredNormal = (viewName) => {
      try {
        const viewport = viewports[viewName]
        const camera = viewport.getCamera()
        if (camera.viewPlaneNormal) {
          return normalizeVec(camera.viewPlaneNormal)
        }
      } catch (e) {}
      return normalizeVec(MPR_CAMERA_VALUES[viewName].viewPlaneNormal)
    }
    
    const getPreferredUp = (viewName) => {
      try {
        const viewport = viewports[viewName]
        const camera = viewport.getCamera()
        if (camera.viewUp) {
          return normalizeVec(camera.viewUp)
        }
      } catch (e) {}
      return normalizeVec(MPR_CAMERA_VALUES[viewName].viewUp)
    }
    
    const axialPreferredNormal = getPreferredNormal('axial')
    const sagittalPreferredNormal = getPreferredNormal('sagittal')
    const coronalPreferredNormal = getPreferredNormal('coronal')
    const axialPreferredUp = getPreferredUp('axial')
    const sagittalPreferredUp = getPreferredUp('sagittal')
    const coronalPreferredUp = getPreferredUp('coronal')
    console.log("获取相机的参数")
    console.log("相机的viewPlaneNormal参数")
    console.log(axialPreferredNormal)
    console.log(sagittalPreferredNormal)
    console.log(coronalPreferredNormal)
    console.log("相机的viewUp参数")
    console.log(axialPreferredUp)
    console.log(sagittalPreferredUp)
    console.log(coronalPreferredUp)

    // 5. 计算三个正交视图的法向量（方案 B）
    
    // 5.1 新 axial 法向量 n_axial
    let n_axial = [...n_plane]
    // 若与原 axial normal 方向相反，则取反以保持大致视角一致
    if (dotProductVec(n_axial, axialPreferredNormal) < 0) {
      n_axial = [-n_axial[0], -n_axial[1], -n_axial[2]]
    }
    
    // 5.2 新 sagittal 法向量 n_sagittal
    // 将原 sagittal normal 投影到 n_axial 的正交平面
    const sagProjLen = dotProductVec(sagittalPreferredNormal, n_axial)
    const sagProjOnAxial = [n_axial[0] * sagProjLen, n_axial[1] * sagProjLen, n_axial[2] * sagProjLen]
    let n_sagittal_raw = subtractVec(sagittalPreferredNormal, sagProjOnAxial)
    const sagLen = vectorLength(n_sagittal_raw)
    
    // 如果退化（n_sagittal_raw 太小），使用任意正交向量
    if (sagLen < 0.01) {
      let refVec = [1, 0, 0]
      if (Math.abs(dotProductVec(n_axial, refVec)) > 0.9) {
        refVec = [0, 1, 0]
      }
      n_sagittal_raw = crossProductVec(n_axial, refVec)
    }
    let n_sagittal = normalizeVec(n_sagittal_raw)
    // 若与原 sagittal normal 方向相反，则取反
    if (dotProductVec(n_sagittal, sagittalPreferredNormal) < 0) {
      n_sagittal = [-n_sagittal[0], -n_sagittal[1], -n_sagittal[2]]
    }
    
    // 5.3 新 coronal 法向量 n_coronal
    let n_coronal_raw = crossProductVec(n_axial, n_sagittal)
    let n_coronal = normalizeVec(n_coronal_raw)
    // 若与原 coronal normal 方向相反，则取反
    if (dotProductVec(n_coronal, coronalPreferredNormal) < 0) {
      n_coronal = [-n_coronal[0], -n_coronal[1], -n_coronal[2]]
    }
    
    // 6. 计算临床友好的 viewUp 向量
    // 函数：computeViewUpVector(normal, preferredUp)
    const computeViewUpVector = (normal, preferredUp) => {
      const n = normalizeVec(normal)
      const pu = normalizeVec(preferredUp)
      const projLen = dotProductVec(pu, n)
      const proj = [n[0] * projLen, n[1] * projLen, n[2] * projLen]
      let tangent = subtractVec(pu, proj)
      const tangentLen = vectorLength(tangent)
      
      // 如果退化（preferredUp 接近 normal），使用 fallback
      if (tangentLen < 0.01) {
        let refVec = [0, 0, 1]
        if (Math.abs(dotProductVec(n, refVec)) > 0.9) {
          refVec = [0, 1, 0]
        }
        tangent = crossProductVec(n, refVec)
      }
      
      return normalizeVec(tangent)
    }
    
    const axialViewUp = computeViewUpVector(n_axial, axialPreferredUp)
    const sagittalViewUp = computeViewUpVector(n_sagittal, sagittalPreferredUp)
    const coronalViewUp = computeViewUpVector(n_coronal, coronalPreferredUp)
    
    // 7. 计算相机距离和位置
    // 使用当前 axial 相机距离作为基准
    let cameraDistance = 500
    try {
      const axialCamera = viewports.axial.getCamera()
      const currentDist = vectorLength(subtractVec(axialCamera.position, axialCamera.focalPoint))
      if (currentDist > 0 && currentDist < 10000) {
        cameraDistance = currentDist
      }
    } catch (e) {}
    
    const axialPosition = [
      origin[0] + n_axial[0] * cameraDistance,
      origin[1] + n_axial[1] * cameraDistance,
      origin[2] + n_axial[2] * cameraDistance
    ]
    const sagittalPosition = [
      origin[0] + n_sagittal[0] * cameraDistance,
      origin[1] + n_sagittal[1] * cameraDistance,
      origin[2] + n_sagittal[2] * cameraDistance
    ]
    const coronalPosition = [
      origin[0] + n_coronal[0] * cameraDistance,
      origin[1] + n_coronal[1] * cameraDistance,
      origin[2] + n_coronal[2] * cameraDistance
    ]
    
    // 计算点的边界框，用于设置合适的 parallelScale
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    less_points.forEach(point => {
      minX = Math.min(minX, point[0])
      maxX = Math.max(maxX, point[0])
      minY = Math.min(minY, point[1])
      maxY = Math.max(maxY, point[1])
      minZ = Math.min(minZ, point[2])
      maxZ = Math.max(maxZ, point[2])
    })
    const rangeX = maxX - minX
    const rangeY = maxY - minY
    const rangeZ = maxZ - minZ
    const maxRange = Math.max(rangeX, rangeY, rangeZ)
    const parallelScale = maxRange * 1.5  // 添加50%边距确保所有点都可见
    
    // 8. 计算 viewPlane.normal（必须等于相机的实际观察方向）
    // 关键：viewPlane.normal = normalize(focalPoint - position)
    const calculateViewPlaneNormal = (position, focalPoint) => {
      return normalizeVec(subtractVec(focalPoint, position))
    }
    
    const axialViewPlaneNormal = calculateViewPlaneNormal(axialPosition, origin)
    const sagittalViewPlaneNormal = calculateViewPlaneNormal(sagittalPosition, origin)
    const coronalViewPlaneNormal = calculateViewPlaneNormal(coronalPosition, origin)
    
    // 验证：viewPlane.normal 应该等于 -n（相机的观察方向）
    

    const presetData = {
      axial: {
        position: axialPosition,
        focalPoint: [...origin],
        viewUp: [...axialViewUp],
        viewPlaneNormal: [...n_axial],  // 根据文档：viewPlaneNormal = n_axial
        // parallelScale: parallelScale,
        viewAngle: 90.00,
        viewPlane: {
          normal: [...axialViewPlaneNormal],  // 等于相机的观察方向
          point: [...origin],
        }
      },
      sagittal: {
        position: sagittalPosition,
        focalPoint: [...origin],
        viewUp: [...sagittalViewUp],
        viewPlaneNormal: [...n_sagittal],  // 根据文档：viewPlaneNormal = n_sagittal
        // parallelScale: parallelScale,
        viewAngle: 90.00,
        viewPlane: {
          normal: [...sagittalViewPlaneNormal],  // 等于相机的观察方向
          point: [...origin],
        }
      },
      coronal: {
        position: coronalPosition,
        focalPoint: [...origin],
        viewUp: [...coronalViewUp],
        viewPlaneNormal: [...n_coronal],  // 根据文档：viewPlaneNormal = n_coronal
        // parallelScale: parallelScale,
        viewAngle: 90.00,
        viewPlane: {
          normal: [...coronalViewPlaneNormal],  // 等于相机的观察方向
          point: [...origin],
        }
      }
    }
    console.log('重要信息！！！！！！')
    console.log(presetData)
    // 应用到每个视口
    Object.keys(viewports).forEach((viewName) => {
      const viewport = viewports[viewName]
      const data = presetData[viewName]

      if (data && viewport) {
        const cameraParams = {
          position: data.position,
          focalPoint: data.focalPoint,
          viewUp: data.viewUp,
          parallelScale: data.parallelScale,
          viewAngle: data.viewAngle
        }
        
        // 根据文档：设置 viewPlaneNormal
        if (data.viewPlaneNormal) {
          cameraParams.viewPlaneNormal = data.viewPlaneNormal
        }
        
        // 如果存在 viewPlane，添加到相机参数中
        if (data.viewPlane) {
          cameraParams.viewPlane = data.viewPlane
        }
        
        viewport.setCamera(cameraParams)
      }
    })

    // 重新渲染
    renderingEngineRef.renderViewports([
      viewportIdsRef.axial,
      viewportIdsRef.sagittal,
      viewportIdsRef.coronal,
    ])

    // 更新 Crosshairs 工具的中心点位置到 origin（三个视图的交点）
    await updateCrosshairsPosition(origin)

  } catch (err) {
    console.error('应用预设位置失败:', err)
    alert('应用预设位置失败: ' + err.message)
  }
}

// 更新 Crosshairs 工具的中心位置（三个视图十字交叉线的交汇点）
async function updateCrosshairsPosition(worldPoint) {
  try {
    // 获取工具组
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId)
    if (!toolGroup) {
      console.warn('⚠️ 未找到工具组 toolGroupId:', toolGroupId)
      return
    }

    // 获取 Crosshairs 工具实例
    const crosshairsTool = toolGroup.getToolInstance(CrosshairsTool.toolName)
    if (!crosshairsTool) {
      console.warn('⚠️ 未找到 Crosshairs 工具实例')
      return
    }

    // 直接设置工具的中心点
    crosshairsTool.toolCenter = [...worldPoint]
    console.log(`✅ Crosshairs 工具中心点已设置为: [${worldPoint.map(v => v.toFixed(6)).join(', ')}]`)

    // 触发重新渲染所有viewport
    if (renderingEngineRef && viewportIdsRef) {
      const viewportIds = [viewportIdsRef.axial, viewportIdsRef.sagittal, viewportIdsRef.coronal]
      renderingEngineRef.renderViewports(viewportIds)
      console.log('✅ 已触发视图重新渲染')
    }

  } catch (err) {
    console.error('更新 Crosshairs 位置失败:', err && err.message ? err.message : err)
  }
}

// 启动相机数据探针
function startCameraProbe(renderingEngine, viewportIds) {
  // 立即更新一次
  updateCameraProbe(renderingEngine, viewportIds)
  
  // 设置定时更新（每100ms更新一次，保证实时性）
  probeUpdateInterval = setInterval(() => {
    if (renderingEngineRef && viewportIdsRef) {
      updateCameraProbe(renderingEngineRef, viewportIdsRef)
    }
  }, 100)
}

// 更新相机探针数据
function updateCameraProbe(renderingEngine, viewportIds) {
  if (!renderingEngine || !viewportIds) {
    return
  }

  try {
    const viewports = {
      axial: renderingEngine.getViewport(viewportIds.axial),
      sagittal: renderingEngine.getViewport(viewportIds.sagittal),
      coronal: renderingEngine.getViewport(viewportIds.coronal),
    }

    const probeData = {}

    Object.keys(viewports).forEach((viewName) => {
      const viewport = viewports[viewName]
      
      try {
        const camera = viewport.getCamera()
        
        probeData[viewName] = {
          position: camera.position ? [...camera.position] : null,
          focalPoint: camera.focalPoint ? [...camera.focalPoint] : null,
          viewUp: camera.viewUp ? [...camera.viewUp] : null,
          parallelScale: camera.parallelScale !== undefined ? camera.parallelScale : null,
          viewAngle: camera.viewAngle !== undefined ? camera.viewAngle : null,
          parallelProjection: camera.parallelProjection !== undefined ? camera.parallelProjection : null,
        }
      } catch (err) {
        console.warn(`获取${viewName} viewport相机数据失败:`, err)
        probeData[viewName] = {
          position: null,
          focalPoint: null,
          viewUp: null,
          parallelScale: null,
          viewAngle: null,
          parallelProjection: null,
        }
      }
    })

    cameraProbeData.value = probeData
  } catch (err) {
    console.error('更新相机探针数据失败:', err)
  }
}

// 格式化向量显示
function formatVector(vector) {
  if (!vector || !Array.isArray(vector) || vector.length < 3) {
    return 'N/A'
  }
  return `[${vector[0]?.toFixed(2)}, ${vector[1]?.toFixed(2)}, ${vector[2]?.toFixed(2)}]`
}

// 格式化数字显示
function formatNumber(value) {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  return value.toFixed(2)
}

// 获取视口显示名称
function getViewportDisplayName(viewName) {
  const names = {
    axial: '轴向 (Axial)',
    sagittal: '矢状 (Sagittal)',
    coronal: '冠状 (Coronal)',
  }
  return names[viewName] || viewName
}

// 切换探针面板展开/收起
function toggleProbePanel() {
  probePanelExpanded.value = !probePanelExpanded.value
}

// 更新鼠标位置探针数据
function updateMouseProbeData(viewName, data) {
  if (!mouseProbeData.value) {
    mouseProbeData.value = {
      axial: null,
      sagittal: null,
      coronal: null,
    }
  }
  mouseProbeData.value[viewName] = data
}

// 获取像素值
function getPixelValue(imagePoint, volume) {
  if (!imagePoint || !volume) {
    return null
  }

  try {
    const [i, j, k] = imagePoint.map(Math.round)
    
    // 获取volume的维度
    const dimensions = volume.dimensions
    if (!dimensions || dimensions.length < 3) {
      return null
    }

    // 检查索引是否在有效范围内
    if (i < 0 || i >= dimensions[0] || 
        j < 0 || j >= dimensions[1] || 
        k < 0 || k >= dimensions[2]) {
      return null
    }

    // 计算线性索引
    const index = k * dimensions[0] * dimensions[1] + j * dimensions[0] + i
    
    // 获取标量数据
    const scalarData = volume.getScalarData()
    if (!scalarData || index >= scalarData.length) {
      return null
    }

    return scalarData[index]
  } catch (error) {
    console.warn('获取像素值失败:', error)
    return null
  }
}

// 格式化图像坐标显示
function formatImagePoint(imagePoint) {
  if (!imagePoint || !Array.isArray(imagePoint)) {
    return 'N/A'
  }
  
  const formatted = imagePoint.map((val, idx) => {
    if (val === null || val === undefined) {
      return 'N/A'
    }
    return Math.round(val)
  })
  
  return `[${formatted.join(', ')}]`
}

onUnmounted(() => {
  // 清理数据探针定时器
  if (probeUpdateInterval) {
    clearInterval(probeUpdateInterval)
    probeUpdateInterval = null
  }

  // 清理事件监听器
  try {
    const elements = [axialViewport.value, sagittalViewport.value, coronalViewport.value]
    elements.forEach((element) => {
      if (element && element._coordinateLoggingCleanup) {
        element._coordinateLoggingCleanup()
      }
    })
  } catch (err) {
    console.error('清理事件监听器失败:', err)
  }

  // 清理资源
  try {
    const renderingEngine = getRenderingEngine(renderingEngineId)
    if (renderingEngine) {
      renderingEngine.destroy()
    }
    ToolGroupManager.destroyToolGroup(toolGroupId)
    
    // 清理缓存
    cache.purgeCache()
  } catch (err) {
    console.error('清理资源失败:', err)
  }
})
</script>

<style scoped>
.crosshairs-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.viewport-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 4px;
  padding: 4px;
}

.viewport {
  width: 100%;
  height: 100%;
  background-color: #000;
  position: relative;
}

.viewport:nth-child(1) {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
}

.viewport:nth-child(2) {
  grid-column: 2 / 3;
  grid-row: 1 / 2;
}

.viewport:nth-child(3) {
  grid-column: 1 / 3;
  grid-row: 2 / 3;
}

.loading,
.error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  border-radius: 8px;
  z-index: 1000;
}

.error {
  background: rgba(200, 0, 0, 0.8);
}

.viewport-label {
  position: absolute;
  top: 10px;
  left: 10px;
  color: white;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10;
  pointer-events: none;
}

.control-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.7);
  padding: 12px;
  border-radius: 8px;
  backdrop-filter: blur(4px);
}

.control-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
  min-width: 120px;
}

.save-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.save-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #5568d3 0%, #653a8f 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.restore-btn {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.restore-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #e081eb 0%, #e4465b 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
}

.preset-btn {
  background: linear-gradient(135deg, #4ade80 0%, #3b82f6 100%);
}

.preset-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #22c55e 0%, #2563eb 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #666;
}

.save-info {
  font-size: 12px;
  color: #4ade80;
  text-align: center;
  padding: 4px 0;
  font-weight: 500;
}

/* 数据探针面板样式 */
.probe-panel {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 8px;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 400px;
  max-width: 600px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.probe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.probe-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: white;
}

.probe-toggle-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.probe-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.probe-content {
  padding: 12px;
  overflow-y: auto;
  max-height: calc(70vh - 60px);
}

.probe-content::-webkit-scrollbar {
  width: 6px;
}

.probe-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.probe-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.probe-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.probe-viewport-section {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.probe-viewport-section:last-child {
  margin-bottom: 0;
}

.probe-viewport-title {
  font-size: 13px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.2);
  display: flex;
  align-items: center;
  gap: 8px;
}

.probe-status-indicator {
  color: #4ade80;
  font-size: 10px;
  animation: pulse 2s ease-in-out infinite;
}

.probe-status-indicator.inactive {
  color: rgba(255, 255, 255, 0.3);
  animation: none;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.probe-section-divider {
  margin: 16px 0 12px 0;
  padding: 8px 12px;
  background: rgba(102, 126, 234, 0.15);
  border-left: 3px solid #667eea;
  font-size: 12px;
  font-weight: 600;
  color: #a5b4fc;
  border-radius: 4px;
}

.probe-section-divider:first-child {
  margin-top: 0;
}

.mouse-probe-section {
  border-left: 2px solid rgba(74, 222, 128, 0.3);
}

.probe-no-data {
  padding: 12px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  font-style: italic;
}

.probe-data-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.probe-data-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
}

.probe-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.probe-value {
  font-size: 12px;
  color: #4ade80;
  font-family: 'Courier New', monospace;
  font-weight: 600;
  padding-left: 8px;
  word-break: break-all;
}

.probe-value.highlight {
  color: #60a5fa;
  font-weight: 700;
}

.probe-value.pixel-value {
  color: #fbbf24;
  font-size: 13px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .probe-panel {
    min-width: 300px;
    max-width: calc(100vw - 20px);
  }
}
</style>

