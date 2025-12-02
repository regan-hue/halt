import { ref } from 'vue'

// 全局共享的图像列表（在模块作用域中，确保所有组件共享同一个实例）
const savedImages = ref([])

/**
 * 管理保存的医学图像
 * 注意：这个composable使用全局共享状态，所有组件都会看到同一个savedImages
 */
export function useSavedImages() {
  
  /**
   * 保存图像
   * @param {Object} imageData - 图像数据
   * @param {string} imageData.dataUrl - 图像的base64数据
   * @param {string} imageData.viewType - 视图类型（AXIAL, CORONAL, SAGITTAL, STL）
   * @param {string} imageData.title - 图像标题
   * @param {string} imageData.description - 图像描述
   * @param {string} imageData.phase - 期相（收缩期/舒张期）
   */
  function saveImage(imageData) {
    console.log('📸 saveImage 被调用:', {
      viewType: imageData.viewType,
      title: imageData.title,
      hasDataUrl: !!imageData.dataUrl,
      dataUrlLength: imageData.dataUrl?.length || 0
    })
    
    const image = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      dataUrl: imageData.dataUrl,
      viewType: imageData.viewType,
      title: imageData.title || `${imageData.viewType} 视图`,
      description: imageData.description || '',
      phase: imageData.phase || '',
      timestamp: new Date().toISOString(),
      thumbnailUrl: imageData.dataUrl // 可以生成缩略图
    }
    
    savedImages.value.push(image)
    console.log('✅ 图像已保存到全局数组:', image.title)
    console.log('📊 当前图像总数:', savedImages.value.length)
    return image
  }
  
  /**
   * 删除图像
   * @param {string} imageId - 图像ID
   */
  function deleteImage(imageId) {
    const index = savedImages.value.findIndex(img => img.id === imageId)
    if (index !== -1) {
      const deleted = savedImages.value.splice(index, 1)[0]
      console.log('图像已删除:', deleted.title)
      return true
    }
    return false
  }
  
  /**
   * 更新图像信息
   * @param {string} imageId - 图像ID
   * @param {Object} updates - 更新的字段
   */
  function updateImage(imageId, updates) {
    const image = savedImages.value.find(img => img.id === imageId)
    if (image) {
      Object.assign(image, updates)
      console.log('图像已更新:', image.title)
      return true
    }
    return false
  }
  
  /**
   * 获取所有图像
   */
  function getAllImages() {
    return savedImages.value
  }
  
  /**
   * 根据视图类型获取图像
   * @param {string} viewType - 视图类型
   */
  function getImagesByViewType(viewType) {
    return savedImages.value.filter(img => img.viewType === viewType)
  }
  
  /**
   * 清空所有图像
   */
  function clearAllImages() {
    savedImages.value = []
    console.log('所有图像已清空')
  }
  
  return {
    savedImages,
    saveImage,
    deleteImage,
    updateImage,
    getAllImages,
    getImagesByViewType,
    clearAllImages
  }
}
