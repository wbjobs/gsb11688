/*
 * scene.js — 内置演示场景（纯 SVG 图形，无外部资源，保证导出文件可独立打开）
 */
(function (global) {
  'use strict';

  var W = 640, H = 400;

  function defs() {
    return '<linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#ff6a00"/><stop offset="1" stop-color="#ee0979"/></linearGradient>' +
      '<radialGradient id="rg1" cx="0.5" cy="0.5" r="0.6">' +
      '<stop offset="0" stop-color="#00c6ff"/><stop offset="1" stop-color="#0072ff"/></radialGradient>';
  }

  // 图层 A：渐变矩形 + 圆环 + 星形
  function layerA() {
    var star = starPath(320, 200, 90, 38, 5);
    return '<rect x="40" y="40" width="560" height="320" rx="24" fill="url(#lg1)"/>' +
      '<circle cx="180" cy="140" r="70" fill="none" stroke="#fff" stroke-width="14" opacity="0.85"/>' +
      '<path d="' + star + '" fill="#ffe259" stroke="#7a4d00" stroke-width="4"/>';
  }

  // 图层 B：径向渐变圆 + 网格线（用于混合模式演示）
  function layerB() {
    var lines = '';
    for (var x = 0; x <= W; x += 40) {
      lines += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="#ffffff" stroke-width="2" opacity="0.35"/>';
    }
    return '<circle cx="420" cy="220" r="150" fill="url(#rg1)"/>' + lines;
  }

  function starPath(cx, cy, outer, inner, points) {
    var d = '';
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? outer : inner;
      var a = (Math.PI / points) * i - Math.PI / 2;
      d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(1) + ' ' +
        (cy + r * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  }

  global.Scene = { W: W, H: H, defs: defs, layerA: layerA, layerB: layerB };
})(window);
