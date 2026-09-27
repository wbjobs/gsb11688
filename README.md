# SVG 滤镜实验室

纯静态 Web 应用，可视化组合 SVG 滤镜原语与混合模式，支持参数实时调整、预设持久化与自包含 SVG 导出。

## 运行

```bash
cd A && python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> 需要通过 HTTP 访问（Web Worker 与 IndexedDB 在 file:// 下受限）。

## 测试

```bash
node test/engine.test.js   # 滤镜引擎单元测试（钳制 / 链顺序 / 性能评分）
```

## 功能与验收对照

| 验收项 | 实现 |
| --- | --- |
| 各滤镜正确 | `js/filterEngine.js` 将滤镜链序列化为 feGaussianBlur / feColorMatrix / feTurbulence / feDisplacementMap / feBlend，逐级 `result` 串联 |
| 混合模式正确 | 图层间用 CSS `mix-blend-mode`（16 种），链内用 `feBlend`；不支持时自动降级并提示 |
| 参数实时调整 | 滑杆/下拉/文本输入，rAF 节流重渲染，拖动不卡顿 |
| 参数越界 | `clampStage` 统一钳制（范围/整数/枚举/20 值矩阵校验），toast 提示 |
| 滤镜链顺序 | 链面板支持 ↑↓ 调整、启停、删除；顺序即原语顺序 |
| 预设保存恢复 | IndexedDB（`js/db.js`）保存/载入/删除/覆盖，另含 4 个内置预设 |
| 导出 SVG | `js/exporter.js` 生成自包含 SVG（内联渐变与滤镜、双 xmlns、viewBox），Blob 下载或复制源码 |
| 浏览器差异 | `js/compat.js` 检测 Safari/Firefox/Chrome 差异与能力（mix-blend-mode、ctx.filter、OffscreenCanvas），统一 `color-interpolation-filters="sRGB"`，滤镜区域扩大防裁剪 |
| 滤镜性能 | 渲染耗时 + FPS + 开销评分面板，高开销时给出优化建议 |
| Canvas 降级 | `js/canvasRenderer.js`：blur/colorMatrix 用 `ctx.filter` 近似，turbulence/displacement 由 Web Worker 逐像素计算 |

## 技术栈

- **SVG**：滤镜链渲染与导出
- **Canvas**：降级渲染路径（`ctx.filter` + `getImageData`）
- **Web Worker**（`js/noiseWorker.js`）：后台生成噪声纹理、执行逐像素位移，避免主线程卡顿
- **IndexedDB**（`js/db.js`）：预设持久化
- **Blob**：SVG 文件导出与场景图像序列化

## 已知浏览器差异说明

- Safari：`stitchTiles="stitch"` 接缝与 Chromium 略有差异；模糊边缘需扩大滤镜区域。
- Firefox：feDisplacementMap 透明边缘处理不同；旧版本不支持 `ctx.filter`（自动检测并提示）。
- 各浏览器默认色彩插值空间不同，已统一为 `sRGB`。
