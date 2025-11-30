# less_points 平面原理详解文档

## 概述

在 `CrosshairsViewer.vue` 组件中，`less_points` 是一个包含20个三维坐标点的数组，用于定义一个自定义平面。该平面用于重建三正交的MPR（Multi-Planar Reconstruction，多平面重建）视图，而不是标准的轴向、矢状和冠状平面。

## less_points 数据结构

```javascript
const less_points = [
  [31.50214385986328, -140.07765197753906, 859.3524780273438],
  [34.58005028416463, -141.6882029085106, 862.7489221061926],
  // ... 其他18个点
  [31.50214385986328, -140.07765197753906, 859.3524780273438]  // 闭合点
]
```

- **数据类型**: 数组的数组，每个子数组包含三个数字 `[x, y, z]`，代表三维坐标。
- **点数量**: 20个点，最后一个点与第一个点相同，形成闭合环。
- **几何形状**: 这些点在三维空间中形成一个椭圆形或圆形的闭合曲线。

## 平面确定原理

### 1. 点集合的几何意义

这些点定义了一个平面上的闭合曲线。通过这些点，我们可以：

- 计算平面的位置和方向
- 确定平面的法向量
- 基于该平面重建正交视图

### 2. 计算点的中心（原点）

```javascript
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
```

- **原理**: 计算所有点的算术平均值，作为平面的参考点。
- **作用**: 该点作为相机焦点（focalPoint）和视图的中心。

### 3. 使用三点法计算平面法向量

```javascript
const p1 = less_points[0]
const p2 = less_points[Math.floor(less_points.length / 3)]  // 第7个点
const p3 = less_points[Math.floor(less_points.length * 2 / 3)]  // 第14个点

const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]
const normal_raw = crossProductVec(v1, v2)
const n_plane = normalizeVec(normal_raw)
```

- **三点法原理**: 
  - 选择三个不共线的点 P1, P2, P3
  - 计算向量 V1 = P2 - P1, V2 = P3 - P1
  - 平面法向量 N = V1 × V2（叉积）
  - 归一化得到单位法向量

- **数学基础**:
  - 叉积公式: N = (V1y*V2z - V1z*V2y, V1z*V2x - V1x*V2z, V1x*V2y - V1y*V2x)
  - 归一化: N_unit = N / ||N||

### 4. 重建三正交视图

基于计算出的平面法向量 `n_plane`，代码重建三个正交的MPR视图：

#### 4.1 新轴向视图法向量 (n_axial)

```javascript
let n_axial = [...n_plane]
// 保持与原轴向视图方向一致
if (dotProductVec(n_axial, axialPreferredNormal) < 0) {
  n_axial = [-n_axial[0], -n_axial[1], -n_axial[2]]
}
```

- **原理**: 直接使用平面法向量作为新轴向视图的法向量
- **方向调整**: 通过点积判断是否需要反转方向，保持临床习惯

#### 4.2 新矢状视图法向量 (n_sagittal)

```javascript
const sagProjLen = dotProductVec(sagittalPreferredNormal, n_axial)
const sagProjOnAxial = [n_axial[0] * sagProjLen, n_axial[1] * sagProjLen, n_axial[2] * sagProjLen]
let n_sagittal_raw = subtractVec(sagittalPreferredNormal, sagProjOnAxial)
// ... 归一化和方向调整
```

- **原理**: 将标准矢状法向量投影到新轴向法向量的正交平面
- **数学**: 使用向量投影公式: proj_v(u) = (u·v / ||v||²) * v

#### 4.3 新冠状视图法向量 (n_coronal)

```javascript
let n_coronal_raw = crossProductVec(n_axial, n_sagittal)
let n_coronal = normalizeVec(n_coronal_raw)
// 方向调整
```

- **原理**: 新冠状法向量是新轴向和矢状法向量的叉积，确保三者正交

### 5. 计算ViewUp向量

```javascript
const computeViewUpVector = (normal, preferredUp) => {
  const n = normalizeVec(normal)
  const pu = normalizeVec(preferredUp)
  const projLen = dotProductVec(pu, n)
  const proj = [n[0] * projLen, n[1] * projLen, n[2] * projLen]
  let tangent = subtractVec(pu, proj)
  // ... 处理退化情况
  return normalizeVec(tangent)
}
```

- **原理**: 将首选的viewUp向量投影到法向量的正交平面
- **作用**: 确保视图方向与临床习惯一致

### 6. 相机位置计算

```javascript
const axialPosition = [
  origin[0] + n_axial[0] * cameraDistance,
  origin[1] + n_axial[1] * cameraDistance,
  origin[2] + n_axial[2] * cameraDistance
]
```

- **原理**: 从原点沿法向量方向移动指定距离
- **作用**: 设置相机位置，使其看向原点

### 7. 边界框和缩放计算

```javascript
// 计算点的边界框
let minX = Infinity, maxX = -Infinity
// ... 计算min/max
const maxRange = Math.max(rangeX, rangeY, rangeZ)
const parallelScale = maxRange * 1.5
```

- **原理**: 计算所有点的包围盒，确定合适的视图缩放比例

### 8. ViewPlaneNormal计算

```javascript
const calculateViewPlaneNormal = (position, focalPoint) => {
  return normalizeVec(subtractVec(focalPoint, position))
}
```

- **原理**: viewPlaneNormal = normalize(focalPoint - position)
- **作用**: 定义相机的观察方向

## 应用场景

这种基于点集合确定平面的方法适用于：

1. **自定义MPR**: 根据用户选择的感兴趣区域重建平面
2. **非标准解剖平面**: 如心脏长轴、血管走行等
3. **动态重建**: 实时根据点集调整视图

## 数学基础总结

- **平面方程**: ax + by + cz + d = 0
- **法向量**: N = (a, b, c)
- **点到平面距离**: |ax+by+cz+d| / sqrt(a²+b²+c²)
- **向量叉积**: 用于计算法向量
- **向量投影**: 用于方向调整
- **正交化**: 确保三个视图法向量相互垂直

## 代码实现要点

1. **数值稳定性**: 使用归一化向量，避免浮点误差
2. **退化处理**: 当向量接近零时使用fallback方案
3. **方向一致性**: 通过点积判断并调整方向
4. **临床习惯**: 保持与标准MPR视图的相对方向

此方法通过几何计算将用户定义的点集转换为精确的平面定义，为医学图像的三维重建提供了灵活的解决方案。