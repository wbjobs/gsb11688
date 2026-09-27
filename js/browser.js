// 浏览器能力检测与差异适配
export const caps = detectCaps();

function detectCaps() {
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isChrome = /chrome|chromium|edg\//i.test(ua) && !/edg\//i.test(ua) ? true : /chrom(e|ium)/i.test(ua);

  // Canvas 2D filter 支持（Safari < 18 不支持 ctx.filter）
  let canvasFilter = false;
  try {
    const c = document.createElement('canvas').getContext('2d');
    canvasFilter = typeof c.filter === 'string';
    if (canvasFilter) {
      c.filter = 'blur(2px)';
      canvasFilter = c.filter === 'blur(2px)'; // Safari 上赋值不生效
    }
  } catch (e) { canvasFilter = false; }

  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined' &&
    (() => { try { return !!new OffscreenCanvas(1, 1).getContext('2d'); } catch (e) { return false; } })();

  const worker = typeof Worker !== 'undefined';
  const indexedDB = typeof window.indexedDB !== 'undefined';
  const mixBlendMode = typeof CSS !== 'undefined' && CSS.supports &&
    CSS.supports('mix-blend-mode', 'multiply');
  const svgFilterOnHtml = !isSafari || true; // Safari 支持但性能差，仅提示
  const transferControlToOffscreen = offscreenCanvas;

  return {
    isSafari, isFirefox, isChrome,
    canvasFilter, offscreenCanvas, worker, indexedDB,
    mixBlendMode, svgFilterOnHtml, transferControlToOffscreen,
  };
}

// 生成人类可读的差异提示
export function capWarnings() {
  const list = [];
  if (!caps.canvasFilter) list.push('当前浏览器不支持 Canvas ctx.filter（如旧版 Safari），Canvas 降级将跳过 CSS 滤镜近似，仅保留 Worker 位移。');
  if (!caps.offscreenCanvas) list.push('不支持 OffscreenCanvas，Worker 重计算将回退到主线程（可能卡顿）。');
  if (!caps.mixBlendMode) list.push('不支持 CSS mix-blend-mode，图层混合将改用 SVG feBlend 实现。');
  if (!caps.indexedDB) list.push('不支持 IndexedDB，预设只能导出/导入 JSON，无法本地保存。');
  if (caps.isFirefox) list.push('Firefox 的 color-interpolation-filters 默认与 Chrome 不同，已统一强制 sRGB。');
  if (caps.isSafari) list.push('Safari 对 feTurbulence 渲染较慢，已自动加大防抖间隔。');
  return list;
}
