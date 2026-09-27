// Canvas 降级渲染：ctx.filter 近似 + Worker 噪声位移
import { caps } from './browser.js';
import { chainToCanvasFilter, findDisplacement } from './filters.js';

let worker = null;
let jobSeq = 0;
let pending = null;

function getWorker() {
  if (!worker) worker = new Worker('js/worker.js');
  return worker;
}

// 在 Worker 中执行位移；无 Worker/OffscreenCanvas 时回退主线程
function displaceAsync(imageData, params) {
  const w = caps.worker ? getWorker() : null;
  if (!w) return Promise.resolve(imageData);
  return new Promise((resolve) => {
    const jobId = ++jobSeq;
    pending = jobId;
    const handler = (e) => {
      if (e.data.type === 'displace-done' && e.data.jobId === jobId) {
        w.removeEventListener('message', handler);
        resolve(e.data.imageData);
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({
      type: 'displace', jobId,
      width: imageData.width, height: imageData.height,
      imageData,
      scale: params.scale,
      baseFrequency: params.baseFrequency,
      numOctaves: params.numOctaves,
      seed: params.seed,
    }, [imageData.data.buffer]);
  });
}

// 把源 SVG 场景画到 canvas，再应用降级滤镜链
export async function renderCanvasFallback(canvas, sceneSVGMarkup, chain, width, height) {
  const ctx = canvas.getContext('2d');
  canvas.width = width; canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${sceneSVGMarkup}</svg>`], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });

  if (caps.canvasFilter) {
    ctx.filter = chainToCanvasFilter(chain) || 'none';
  }
  ctx.drawImage(img, 0, 0, width, height);
  ctx.filter = 'none';
  URL.revokeObjectURL(url);

  const disp = findDisplacement(chain);
  if (disp) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const out = await displaceAsync(imageData, disp.params);
    ctx.putImageData(out, 0, 0);
  }
}
