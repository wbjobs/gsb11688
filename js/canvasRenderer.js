/*
 * canvasRenderer.js — Canvas 降级渲染器
 * 当 SVG 滤镜不可用（或用户手动切换）时：
 *  - blur / colorMatrix 用 ctx.filter 近似
 *  - turbulence / displacement 用 Web Worker 逐像素计算
 */
(function (global) {
  'use strict';

  var worker = null;
  var reqSeq = 1;
  var pending = {};

  function getWorker() {
    if (!worker) {
      worker = new Worker('js/noiseWorker.js');
      worker.onmessage = function (e) {
        var cb = pending[e.data.reqId];
        if (cb) { delete pending[e.data.reqId]; cb(null, e.data); }
      };
      worker.onerror = function (err) {
        Object.keys(pending).forEach(function (k) { pending[k](err); });
        pending = {};
      };
    }
    return worker;
  }

  function callWorker(msg, transfers) {
    return new Promise(function (resolve, reject) {
      var id = reqSeq++;
      msg.reqId = id;
      pending[id] = function (err, data) { err ? reject(err) : resolve(data); };
      getWorker().postMessage(msg, transfers || []);
    });
  }

  function genNoise(width, height, p) {
    return callWorker({
      cmd: 'noise', width: width, height: height,
      baseFrequency: p.baseFrequency, numOctaves: p.numOctaves, seed: p.seed
    }).then(function (res) { return new Uint8ClampedArray(res.buffer); });
  }

  // 把滤镜链翻译成 ctx.filter 字符串（仅 blur / colorMatrix 可近似）
  function toCSSFilter(chain) {
    var parts = [];
    chain.forEach(function (s) {
      if (!s.enabled) return;
      var p = s.params;
      if (s.type === 'blur') parts.push('blur(' + p.stdDeviation + 'px)');
      else if (s.type === 'colorMatrix') {
        if (p.ctype === 'saturate') parts.push('saturate(' + p.saturate + ')');
        else if (p.ctype === 'hueRotate') parts.push('hue-rotate(' + p.hueRotate + 'deg)');
      }
    });
    return parts.join(' ');
  }

  // sceneImage: 已解码的 Image/ImageBitmap；返回 Promise<渲染耗时ms>
  function render(canvas, sceneImage, chain, caps) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var t0 = performance.now();

    var cssFilter = caps.canvasFilter ? toCSSFilter(chain) : '';
    ctx.clearRect(0, 0, w, h);
    ctx.filter = cssFilter || 'none';
    ctx.drawImage(sceneImage, 0, 0, w, h);
    ctx.filter = 'none';

    // 位移级：交给 Worker 逐像素处理
    var dispStages = chain.filter(function (s) { return s.enabled && s.type === 'displacement'; });
    var turbStages = chain.filter(function (s) { return s.enabled && s.type === 'turbulence'; });

    var job = Promise.resolve();
    if (dispStages.length) {
      var p = dispStages[dispStages.length - 1].params;
      var src = ctx.getImageData(0, 0, w, h);
      job = genNoise(w, h, p).then(function (noise) {
        return callWorker({
          cmd: 'displace', width: w, height: h, scale: p.scale,
          srcBuffer: src.data.buffer, noiseBuffer: noise.buffer
        }, [src.data.buffer, noise.buffer]);
      }).then(function (res) {
        ctx.putImageData(new ImageData(new Uint8ClampedArray(res.buffer), w, h), 0, 0);
      });
    } else if (turbStages.length) {
      var tp = turbStages[turbStages.length - 1].params;
      job = genNoise(w, h, tp).then(function (noise) {
        ctx.putImageData(new ImageData(noise, w, h), 0, 0);
      });
    }
    return job.then(function () { return performance.now() - t0; });
  }

  global.CanvasRenderer = { render: render, toCSSFilter: toCSSFilter };
})(window);
