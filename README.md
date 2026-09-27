# SVG FX Lab · SVG 滤镜与混合模式实验室

纯前端单页应用（无构建步骤），技术栈：SVG + Canvas + Web Worker + IndexedDB + Blob。

## 运行

```bash
python3 -m http.server 8080   # 或任意静态服务器（ES Module 需要 http 协议）
# 打开 http://localhost:8080
```

## 功能与验收标准对照

| 验收标准 | 实现 |
|---|---|
| 各滤镜正确 | `js/filters.js` 支持 feGaussianBlur / feColorMatrix（saturate、hueRotate、grayscale、sepia、invert、brightness、contrast、20 维自定义矩阵）/ feTurbulence / feDisplacementMap / feDropShadow / feBlend / feComposite / feMorphology / feConvolveMatrix，按链式 `result`/`in` 串联 |
| 混合模式正确 | 16 种 CSS `mix-blend-mode` 图层混合 + SVG `feBlend` 节点级混合 |
| 参数实时调整 | `input` 事件即时更新 SVG 属性；慢滤镜（turbulence/displacement/convolve）自动防抖（Safari 350ms，其他 150ms） |
| 预设保存恢复 | IndexedDB（`js/presets.js`）增删改查 + 5 个内置预设 + JSON 导入导出 |
| 导出 SVG 可正常打开 | `js/exporter.js` 生成含 `xmlns`/`viewBox`/`defs` 的独立文档，Blob 下载；兼容模式内嵌 PNG 位图快照（`href` + `xlink:href` 双写） |
| 浏览器差异处理 | 见下 |

## 浏览器差异与降级

- **color-interpolation-filters**：Firefox 默认 linearRGB、Chrome 默认 sRGB —— 统一显式声明 `sRGB`。
- **滤镜区域裁剪**：投影等会被默认滤镜区域裁剪，`x/y/width/height` 扩到 `-50%/200%`。
- **Safari 无 `ctx.filter`**：Canvas 降级时跳过 CSS 滤镜近似，仅保留 Worker 位移。
- **无 OffscreenCanvas**：Worker 改用 `ImageData` 传输（结构化克隆 + Transferable）。
- **无 mix-blend-mode**：检测 `CSS.supports` 并提示改用 feBlend 节点。
- **无 IndexedDB**：预设保存自动降级为 JSON 文件下载。
- **空滤镜链**：部分浏览器对无原语的 `<filter>` 渲染为空，自动省略 `filter` 属性。

## 性能

- 双 rAF 测量真实渲染耗时，滚动平均 > 60ms 时提示降级。
- 湍流/位移/卷积等重滤镜参数变化防抖。
- 「降级到 Canvas 渲染」按钮：`ctx.filter` 近似模糊/投影/颜色矩阵，位移映射在 Web Worker 中用分形值噪声逐像素计算，不阻塞主线程。

## 参数越界

所有数值参数有 min/max 钳制；NaN 重置为默认值；feColorMatrix 自定义矩阵校验必须为 20 个数字。钳制时弹出 toast 说明。

## 滤镜链顺序

左侧列表即执行顺序，↑↓ 调整顺序实时反映到 `<filter>` 中原语的先后（每步 `result="fxN"` 作为下一步 `in`）。
