/*
 * noiseWorker.js — Web Worker：在后台线程生成噪声纹理 / 执行逐像素位移，
 * 避免主线程卡顿（滤镜性能处理的一部分）。
 */

// 简单可种子化的 value-noise（多倍 feTurbulence 近似，用于 Canvas 降级与预览纹理）
function makeRandom(seed) {
  var s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise2D(rand, size) {
  var grid = new Float32Array(size * size);
  for (var i = 0; i < grid.length; i++) grid[i] = rand();
  return function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var x0 = ((xi % size) + size) % size, y0 = ((yi % size) + size) % size;
    var x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
    var v00 = grid[y0 * size + x0], v10 = grid[y0 * size + x1];
    var v01 = grid[y1 * size + x0], v11 = grid[y1 * size + x1];
    var sx = smooth(xf), sy = smooth(yf);
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };
}

function fbm(noise, x, y, octaves) {
  var sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (var o = 0; o < octaves; o++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

// 生成 RGBA 噪声纹理（R/G 通道用于位移）
function genNoise(width, height, baseFrequency, numOctaves, seed) {
  var rand = makeRandom(seed);
  var noise = valueNoise2D(rand, 64);
  var data = new Uint8ClampedArray(width * height * 4);
  var scale = Math.max(baseFrequency, 0.0001) * 8;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var nx = x / width * scale * 8;
      var ny = y / height * scale * 8;
      var i = (y * width + x) * 4;
      data[i] = fbm(noise, nx, ny, numOctaves) * 255;
      data[i + 1] = fbm(noise, nx + 31.7, ny + 17.3, numOctaves) * 255;
      data[i + 2] = fbm(noise, nx + 11.1, ny + 47.9, numOctaves) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

// 逐像素位移（Canvas 降级路径，近似 feDisplacementMap）
function displace(srcData, noiseData, width, height, scale) {
  var out = new Uint8ClampedArray(srcData.length);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var i = (y * width + x) * 4;
      var dx = (noiseData[i] / 255 - 0.5) * scale;
      var dy = (noiseData[i + 1] / 255 - 0.5) * scale;
      var sx = Math.min(width - 1, Math.max(0, Math.round(x + dx)));
      var sy = Math.min(height - 1, Math.max(0, Math.round(y + dy)));
      var si = (sy * width + sx) * 4;
      out[i] = srcData[si]; out[i + 1] = srcData[si + 1];
      out[i + 2] = srcData[si + 2]; out[i + 3] = srcData[si + 3];
    }
  }
  return out;
}

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.cmd === 'noise') {
    var t0 = Date.now();
    var buf = genNoise(msg.width, msg.height, msg.baseFrequency, msg.numOctaves, msg.seed);
    self.postMessage({ cmd: 'noise', reqId: msg.reqId, elapsed: Date.now() - t0, buffer: buf.buffer },
      [buf.buffer]);
  } else if (msg.cmd === 'displace') {
    var t1 = Date.now();
    var src = new Uint8ClampedArray(msg.srcBuffer);
    var noise = new Uint8ClampedArray(msg.noiseBuffer);
    var out = displace(src, noise, msg.width, msg.height, msg.scale);
    self.postMessage({ cmd: 'displace', reqId: msg.reqId, elapsed: Date.now() - t1, buffer: out.buffer },
      [out.buffer]);
  }
};
