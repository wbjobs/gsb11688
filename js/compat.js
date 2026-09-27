/*
 * compat.js — 浏览器差异检测与处理策略
 */
(function (global) {
  'use strict';

  function detect() {
    var ua = navigator.userAgent;
    var isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
    var isFirefox = /firefox/i.test(ua);
    var isChrome = /chrome|chromium|edg/i.test(ua) && !isSafari;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    var caps = {
      browser: isSafari ? 'Safari' : isFirefox ? 'Firefox' : isChrome ? 'Chrome/Edge' : 'Unknown',
      isSafari: isSafari,
      isFirefox: isFirefox,
      mixBlendMode: typeof CSS !== 'undefined' && CSS.supports && CSS.supports('mix-blend-mode', 'overlay'),
      canvasFilter: !!ctx && typeof ctx.filter === 'string',
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      worker: typeof Worker !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      svgFilters: !!(window.SVGFEGaussianBlurElement)
    };
    caps.useCanvasFallback = !caps.svgFilters;
    return caps;
  }

  // 根据能力给出用户可读的差异说明与已应用的兼容策略
  function compatNotes(caps) {
    var notes = [];
    if (!caps.svgFilters) {
      notes.push('⚠ 当前浏览器不支持 SVG 滤镜，已自动降级到 Canvas 滤镜渲染。');
    }
    if (!caps.mixBlendMode) {
      notes.push('⚠ 不支持 CSS mix-blend-mode，图层混合已改用 SVG feBlend 实现。');
    }
    if (caps.isSafari) {
      notes.push('ℹ Safari：feTurbulence 的 stitchTiles="stitch" 接缝处理与 Chromium 略有差异；' +
        '滤镜区域已显式扩大 (x/y=-20%) 避免模糊被裁剪。');
    }
    if (caps.isFirefox) {
      notes.push('ℹ Firefox：feDisplacementMap 对透明边缘的处理与 Chromium 不同；' +
        '已统一 color-interpolation-filters="sRGB" 保证色彩一致。');
    }
    if (!caps.canvasFilter) {
      notes.push('ℹ 当前浏览器不支持 CanvasRenderingContext2D.filter，Canvas 降级模式仅支持位移/噪声类效果。');
    }
    if (!caps.offscreenCanvas) {
      notes.push('ℹ 不支持 OffscreenCanvas，噪声纹理将在主线程生成（Worker 仍负责计算像素数据）。');
    }
    return notes;
  }

  global.Compat = { detect: detect, compatNotes: compatNotes };
})(window);
