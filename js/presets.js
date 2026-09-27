// IndexedDB 预设存取（含降级：不支持时仅导出 JSON）
const DB_NAME = 'svg-fx-lab';
const STORE = 'presets';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && out._result !== undefined ? out._result : out);
    t.onerror = () => reject(t.error);
  });
}

export async function savePreset(name, data) {
  const db = await openDB();
  return tx(db, 'readwrite', (s) => s.put({ name, data, updatedAt: Date.now() }));
}

export async function listPresets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function deletePreset(id) {
  const db = await openDB();
  return tx(db, 'readwrite', (s) => s.delete(id));
}

export const BUILTIN_PRESETS = [
  {
    name: '霓虹发光',
    data: {
      layerBlend: 'screen',
      chain: [
        { type: 'dropshadow', params: { dx: 0, dy: 0, stdDeviation: 12, floodColor: '#22d3ee', floodOpacity: 0.9 } },
        { type: 'dropshadow', params: { dx: 0, dy: 0, stdDeviation: 30, floodColor: '#7c3aed', floodOpacity: 0.6 } },
        { type: 'colormatrix', params: { kind: 'saturate', amount: 2, angle: 90, matrix: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0' } },
      ],
    },
  },
  {
    name: '水墨溶解',
    data: {
      layerBlend: 'multiply',
      chain: [
        { type: 'displacement', params: { scale: 90, xChannelSelector: 'R', yChannelSelector: 'G', baseFrequency: 0.015, numOctaves: 3, seed: 5 } },
        { type: 'blur', params: { stdDeviation: 1.2 } },
        { type: 'colormatrix', params: { kind: 'grayscale', amount: 1, angle: 0, matrix: '' } },
      ],
    },
  },
  {
    name: '故障抖动 Glitch',
    data: {
      layerBlend: 'difference',
      chain: [
        { type: 'displacement', params: { scale: 40, xChannelSelector: 'R', yChannelSelector: 'R', baseFrequency: 0.09, numOctaves: 1, seed: 42 } },
        { type: 'colormatrix', params: { kind: 'hueRotate', amount: 1, angle: 180, matrix: '' } },
      ],
    },
  },
  {
    name: '浮雕',
    data: {
      layerBlend: 'normal',
      chain: [
        { type: 'convolve', params: { preset: 'emboss', divisor: 0 } },
        { type: 'colormatrix', params: { kind: 'grayscale', amount: 0.6, angle: 0, matrix: '' } },
      ],
    },
  },
  {
    name: '复古胶片',
    data: {
      layerBlend: 'overlay',
      chain: [
        { type: 'colormatrix', params: { kind: 'sepia', amount: 0.7, angle: 0, matrix: '' } },
        { type: 'colormatrix', params: { kind: 'contrast', amount: 1.15, angle: 0, matrix: '' } },
        { type: 'turbulence', params: { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, seed: 11, stitchTiles: 'stitch' } },
        { type: 'composite', params: { operator: 'arithmetic', k1: 0, k2: 0.9, k3: 0.15, k4: 0 } },
      ],
    },
  },
];
