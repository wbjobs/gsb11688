// Web Worker：在 OffscreenCanvas / ImageData 上做分形噪声位移，避免阻塞主线程
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, octaves, seed) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
    freq *= 2; amp *= 0.5;
  }
  return sum; // ~[0,1)
}

self.onmessage = (e) => {
  const { type, width, height, imageData, scale, baseFrequency, numOctaves, seed, jobId } = e.data;
  if (type !== 'displace') return;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);
  const chanX = 0, chanY = 1; // 用两层不同 seed 的噪声近似 R/G 通道
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = fbm(x * baseFrequency, y * baseFrequency, numOctaves, seed);
      const ny = fbm(x * baseFrequency, y * baseFrequency, numOctaves, seed + 977);
      let sx = Math.round(x + (nx - 0.5) * 2 * scale * (chanX === 0 ? 1 : 1));
      let sy = Math.round(y + (ny - 0.5) * 2 * scale * (chanY === 1 ? 1 : 1));
      sx = sx < 0 ? 0 : (sx >= width ? width - 1 : sx);
      sy = sy < 0 ? 0 : (sy >= height ? height - 1 : sy);
      const di = (y * width + x) * 4, si = (sy * width + sx) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  const result = new ImageData(out, width, height);
  self.postMessage({ type: 'displace-done', jobId, imageData: result }, [result.data.buffer]);
};
