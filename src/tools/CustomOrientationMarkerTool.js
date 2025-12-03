import { AnnotationTool } from '@cornerstonejs/tools';
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';

/**
 * 自定义方向标记工具
 * 使用Human.stl模型在每个视口的左下角显示解剖方向
 */
class CustomOrientationMarkerTool extends AnnotationTool {
  static toolName = 'CustomOrientationMarker';

  constructor(toolProps = {}, defaultToolProps = {}) {
    super(toolProps, defaultToolProps);
    
    // 存储每个元素的渲染器信息
    this.orientationWidgets = new Map();
  }

  /**
   * 当工具添加到元素时调用
   */
  addNewAnnotation() {
    // OrientationMarker不需要创建新的注解
    return null;
  }

  /**
   * 取消注解
   */
  cancel() {
    // 不需要实现
  }

  /**
   * 处理注解完成
   */
  handleSelectedCallback() {
    // 不需要实现
  }

  /**
   * 渲染注解 - 这是关键方法
   */
  renderAnnotation(enabledElement, svgDrawingHelper) {
    const { viewport } = enabledElement;
    const element = viewport.element;

    // 如果这个元素还没有方向标记，创建一个
    if (!this.orientationWidgets.has(element)) {
      this.createOrientationWidget(element, viewport);
    }

    // 更新方向标记的相机方向和位置
    this.updateOrientationWidget(element, viewport);

    return true;
  }

  /**
   * 为元素创建方向标记widget
   */
  async createOrientationWidget(element, viewport) {
    try {
      console.log('为元素创建方向标记widget');

      // 创建容器
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.bottom = '10px';
      container.style.left = '10px';
      container.style.width = '120px';
      container.style.height = '120px';
    //   container.style.border = '1px solid rgba(255, 255, 255, 1)';
      container.style.borderRadius = '4px';
      container.style.backgroundColor = 'rgba(0, 0, 0, 0)';
      container.style.overflow = 'hidden';
      container.style.zIndex = '1000';
      container.style.pointerEvents = 'none';

      // 将容器添加到元素的父容器中
      if (element.parentElement) {
        element.parentElement.style.position = 'relative';
        element.parentElement.appendChild(container);
      } else {
        element.style.position = 'relative';
        element.appendChild(container);
      }

      // 创建VTK渲染管线
      const renderWindow = vtkRenderWindow.newInstance();
      const renderer = vtkRenderer.newInstance();
      renderer.setBackground(0, 0, 0);
      renderWindow.addRenderer(renderer);

      const openglRenderWindow = vtkOpenGLRenderWindow.newInstance();
      renderWindow.addView(openglRenderWindow);
      openglRenderWindow.setContainer(container);

      const { width, height } = container.getBoundingClientRect();
      openglRenderWindow.setSize(width, height);

      const interactor = vtkRenderWindowInteractor.newInstance();
      interactor.setView(openglRenderWindow);
      interactor.initialize();

      const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(interactorStyle);

      // 加载STL模型
      const stlPath = '/Human.stl';
      const response = await fetch(stlPath);
      
      if (!response.ok) {
        throw new Error(`无法加载STL文件: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      const stlReader = vtkSTLReader.newInstance();
      stlReader.parseAsArrayBuffer(arrayBuffer);

      const mapper = vtkMapper.newInstance({ scalarVisibility: false });
      mapper.setInputData(stlReader.getOutputData());

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);

      const property = actor.getProperty();
      property.setColor(0.8, 0.85, 0.9);
      property.setAmbient(0.3);
      property.setDiffuse(0.6);
      property.setSpecular(0.3);
      property.setSpecularPower(20);
      property.setOpacity(0.95);

      renderer.addActor(actor);
      renderer.resetCamera();
      renderWindow.render();

      // 保存引用
      this.orientationWidgets.set(element, {
        container,
        renderWindow,
        renderer,
        actor,
        openglRenderWindow
      });

      console.log('方向标记widget创建成功');
    } catch (error) {
      console.error('创建方向标记widget失败:', error);
    }
  }

  /**
   * 更新方向标记的相机方向以匹配主视口
   */
  updateOrientationWidget(element, viewport) {
    const widget = this.orientationWidgets.get(element);
    if (!widget) return;

    try {
      // 检查元素的可见性和尺寸
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      
      // 如果元素不可见或太小，隐藏方向标记
      if (!isVisible || rect.width < 100 || rect.height < 100) {
        widget.container.style.display = 'none';
        return;
      } else {
        widget.container.style.display = 'block';
      }

      // 根据窗口大小调整方向标记的尺寸
      const containerSize = this.calculateContainerSize(rect);
      if (widget.container.style.width !== `${containerSize}px`) {
        widget.container.style.width = `${containerSize}px`;
        widget.container.style.height = `${containerSize}px`;
        widget.openglRenderWindow.setSize(containerSize, containerSize);
      }

      const camera = viewport.getCamera();
      const widgetCamera = widget.renderer.getActiveCamera();

      if (camera && widgetCamera) {
        // 同步相机方向
        widgetCamera.setPosition(...camera.position);
        widgetCamera.setFocalPoint(...camera.focalPoint);
        widgetCamera.setViewUp(...camera.viewUp);

        widget.renderer.resetCamera();
        widget.renderWindow.render();
      }
    } catch (error) {
      // 静默失败，避免在控制台产生过多噪音
    }
  }

  /**
   * 根据视口大小计算方向标记容器的合适尺寸
   */
  calculateContainerSize(rect) {
    const minSize = 100;
    const maxSize = 200;
    const ratio = 0.15; // 占视口宽度的15%
    
    const calculatedSize = Math.min(rect.width, rect.height) * ratio;
    return Math.max(minSize, Math.min(maxSize, calculatedSize));
  }

  /**
   * 当工具被移除时清理资源
   */
  onSetToolDisabled() {
    // 清理所有widget
    this.orientationWidgets.forEach((widget, element) => {
      if (widget.container && widget.container.parentElement) {
        widget.container.parentElement.removeChild(widget.container);
      }

      if (widget.renderer && widget.actor) {
        widget.renderer.removeActor(widget.actor);
      }
    });

    this.orientationWidgets.clear();
    console.log('CustomOrientationMarkerTool 已禁用并清理资源');
  }
}

export default CustomOrientationMarkerTool;
