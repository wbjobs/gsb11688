// SVG 导出（Blob 下载），含位图回退兼容模式
import { buildFilterDef, hasEnabled } from './filters.js';

export function downloadBlob(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 组装独立可打开的 SVG 文档
export function buildStandaloneSVG({ width, height, sceneMarkup, chain, blendMode, rasterDataURL, backdropMarkup = '', sharedDefs = '' }) {
  const filterDef = buildFilterDef(chain, 'fxChain');
  const blendStyle = blendMode && blendMode !== 'normal'
    ? ` style="mix-blend-mode:${blendMode}"` : '';
  const filterAttr = hasEnabled(chain) ? ' filter="url(#fxChain)"' : '';
  let body;
  if (rasterDataURL) {
    // 兼容模式：嵌入位图快照，同时保留矢量+滤镜版本（查看器不支持滤镜时仍可见位图）
    body = `  <image href="${rasterDataURL}" xlink:href="${rasterDataURL}" x="0" y="0" width="${width}" height="${height}"/>
  <g${filterAttr}${blendStyle} opacity="0">
${sceneMarkup}
  </g>`;
  } else {
    body = `  <g${filterAttr}${blendStyle}>
${sceneMarkup}
  </g>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <desc>Exported by SVG FX Lab · color-interpolation-filters=sRGB 保证跨浏览器一致</desc>
  <defs>
    ${sharedDefs}
    ${filterDef}
  </defs>
${backdropMarkup}
${body}
</svg>`;
}

// 把当前预览栅格化为 PNG dataURL（兼容模式导出用）
export function rasterizePreview(svgEl, width, height) {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function exportPresetsJSON(presets) {
  downloadBlob(JSON.stringify(presets, null, 2), 'svg-fx-presets.json', 'application/json');
}
