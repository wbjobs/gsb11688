// 滤镜链模型：定义、参数边界、SVG 生成、Canvas 近似
let uid = 0;
export const nextId = () => `n${Date.now().toString(36)}_${(uid++).toString(36)}`;

export const BLEND_MODES = ['normal','multiply','screen','overlay','darken','lighten',
  'color-dodge','color-burn','hard-light','soft-light','difference','exclusion',
  'hue','saturation','color','luminosity'];

export const FILTER_DEFS = {
  blur: {
    label: '高斯模糊 feGaussianBlur',
    params: {
      stdDeviation: { label: '模糊半径', min: 0, max: 100, step: 0.1, def: 4 },
    },
  },
  dropshadow: {
    label: '投影 feDropShadow',
    params: {
      dx: { label: '偏移 X', min: -100, max: 100, step: 0.5, def: 6 },
      dy: { label: '偏移 Y', min: -100, max: 100, step: 0.5, def: 6 },
      stdDeviation: { label: '模糊', min: 0, max: 100, step: 0.1, def: 8 },
      floodColor: { label: '颜色', type: 'color', def: '#7c3aed' },
      floodOpacity: { label: '不透明度', min: 0, max: 1, step: 0.01, def: 0.8 },
    },
  },
  colormatrix: {
    label: '颜色矩阵 feColorMatrix',
    params: {
      kind: { label: '类型', type: 'select', options: ['saturate','hueRotate','grayscale','sepia','invert','brightness','contrast','matrix'], def: 'saturate' },
      amount: { label: '强度', min: 0, max: 4, step: 0.01, def: 1.5 },
      angle: { label: '色相角度', min: 0, max: 360, step: 1, def: 90 },
      matrix: { label: '20 维矩阵', type: 'text', def: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0' },
    },
  },
  turbulence: {
    label: '湍流噪声 feTurbulence',
    slow: true,
    params: {
      type: { label: '噪声类型', type: 'select', options: ['fractalNoise','turbulence'], def: 'fractalNoise' },
      baseFrequency: { label: '基础频率', min: 0, max: 1, step: 0.001, def: 0.02 },
      numOctaves: { label: '倍频数', min: 1, max: 5, step: 1, def: 3 },
      seed: { label: '随机种子', min: 0, max: 9999, step: 1, def: 7 },
      stitchTiles: { label: '平铺缝合', type: 'select', options: ['noStitch','stitch'], def: 'stitch' },
    },
  },
  displacement: {
    label: '位移映射 feDisplacementMap',
    slow: true,
    params: {
      scale: { label: '位移强度', min: 0, max: 500, step: 1, def: 60 },
      xChannelSelector: { label: 'X 通道', type: 'select', options: ['R','G','B','A'], def: 'R' },
      yChannelSelector: { label: 'Y 通道', type: 'select', options: ['R','G','B','A'], def: 'G' },
      baseFrequency: { label: '噪声频率', min: 0.001, max: 1, step: 0.001, def: 0.03 },
      numOctaves: { label: '倍频数', min: 1, max: 5, step: 1, def: 2 },
      seed: { label: '随机种子', min: 0, max: 9999, step: 1, def: 3 },
    },
  },
  blend: {
    label: '混合 feBlend',
    params: {
      mode: { label: '混合模式', type: 'select', options: BLEND_MODES.filter(m => m !== 'normal'), def: 'multiply' },
      in2: { label: '混合对象', type: 'select', options: ['SourceGraphic','BackgroundImage','SourceAlpha'], def: 'SourceGraphic' },
    },
  },
  composite: {
    label: '合成 feComposite',
    params: {
      operator: { label: '算子', type: 'select', options: ['over','in','out','atop','xor','lighter','arithmetic'], def: 'arithmetic' },
      k1: { label: 'k1', min: -4, max: 4, step: 0.01, def: 0 },
      k2: { label: 'k2', min: -4, max: 4, step: 0.01, def: 0.5 },
      k3: { label: 'k3', min: -4, max: 4, step: 0.01, def: 0.5 },
      k4: { label: 'k4', min: -4, max: 4, step: 0.01, def: 0 },
    },
  },
  morphology: {
    label: '形态学 feMorphology',
    params: {
      operator: { label: '算子', type: 'select', options: ['erode','dilate'], def: 'dilate' },
      radius: { label: '半径', min: 0, max: 50, step: 0.1, def: 2 },
    },
  },
  convolve: {
    label: '卷积 feConvolveMatrix',
    slow: true,
    params: {
      preset: { label: '卷积核', type: 'select', options: ['sharpen','emboss','edgeDetect','boxBlur'], def: 'emboss' },
      divisor: { label: '除数(0=自动)', min: 0, max: 100, step: 0.1, def: 0 },
    },
  },
};

const CONVOLVE_KERNELS = {
  sharpen:    [0,-1,0, -1,5,-1, 0,-1,0],
  emboss:     [-2,-1,0, -1,1,1, 0,1,2],
  edgeDetect: [-1,-1,-1, -1,8,-1, -1,-1,-1],
  boxBlur:    [1,1,1, 1,1,1, 1,1,1],
};

export function createNode(type) {
  const def = FILTER_DEFS[type];
  const params = {};
  for (const [k, p] of Object.entries(def.params)) params[k] = p.def;
  return { id: nextId(), type, enabled: true, params };
}

// 参数越界钳制：返回 {node, warnings[]}
export function clampNode(node) {
  const def = FILTER_DEFS[node.type];
  const warnings = [];
  for (const [key, spec] of Object.entries(def.params)) {
    if (spec.type === 'select' || spec.type === 'color') continue;
    if (spec.type === 'text') {
      if (node.type === 'colormatrix' && key === 'matrix') {
        const nums = String(node.params.matrix).trim().split(/[\s,]+/).map(Number);
        if (nums.length !== 20 || nums.some(Number.isNaN)) {
          node.params.matrix = spec.def;
          warnings.push(`feColorMatrix 矩阵需为 20 个数字，已重置为默认值`);
        } else {
          node.params.matrix = nums.join(' ');
        }
      }
      continue;
    }
    let v = Number(node.params[key]);
    if (Number.isNaN(v)) {
      warnings.push(`${def.label} · ${spec.label}: 非法数值，已重置为 ${spec.def}`);
      v = spec.def;
    } else if (v < spec.min) {
      warnings.push(`${def.label} · ${spec.label}: ${v} 越界，已钳制到 ${spec.min}`);
      v = spec.min;
    } else if (v > spec.max) {
      warnings.push(`${def.label} · ${spec.label}: ${v} 越界，已钳制到 ${spec.max}`);
      v = spec.max;
    }
    node.params[key] = v;
  }
  return warnings;
}

export function clampChain(chain) {
  const all = [];
  for (const n of chain) all.push(...clampNode(n));
  return all;
}

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

// 按链顺序生成 <filter> 内部原语（顺序即滤镜链顺序）
export function buildFilterPrimitives(chain) {
  const parts = [];
  let prev = 'SourceGraphic';
  let step = 0;
  for (const node of chain) {
    if (!node.enabled) continue;
    const r = `fx${step++}`;
    const p = node.params;
    switch (node.type) {
      case 'blur':
        parts.push(`<feGaussianBlur in="${prev}" stdDeviation="${p.stdDeviation}" result="${r}"/>`);
        break;
      case 'dropshadow':
        parts.push(`<feDropShadow in="${prev}" dx="${p.dx}" dy="${p.dy}" stdDeviation="${p.stdDeviation}" flood-color="${esc(p.floodColor)}" flood-opacity="${p.floodOpacity}" result="${r}"/>`);
        break;
      case 'colormatrix': {
        let type = p.kind, values = '';
        if (p.kind === 'saturate') { values = ` values="${p.amount}"`; }
        else if (p.kind === 'hueRotate') { values = ` values="${p.angle}"`; }
        else if (p.kind === 'matrix') { values = ` values="${esc(p.matrix)}"`; }
        else { type = 'matrix'; values = ` values="${colorPresetMatrix(p.kind, p.amount)}"`; }
        parts.push(`<feColorMatrix in="${prev}" type="${type}"${values} result="${r}"/>`);
        break;
      }
      case 'turbulence':
        parts.push(`<feTurbulence type="${p.type}" baseFrequency="${p.baseFrequency}" numOctaves="${p.numOctaves}" seed="${p.seed}" stitchTiles="${p.stitchTiles}" result="${r}"/>`);
        break;
      case 'displacement': {
        const noise = `${r}_noise`;
        parts.push(`<feTurbulence type="fractalNoise" baseFrequency="${p.baseFrequency}" numOctaves="${p.numOctaves}" seed="${p.seed}" result="${noise}"/>`);
        parts.push(`<feDisplacementMap in="${prev}" in2="${noise}" scale="${p.scale}" xChannelSelector="${p.xChannelSelector}" yChannelSelector="${p.yChannelSelector}" result="${r}"/>`);
        break;
      }
      case 'blend':
        parts.push(`<feBlend in="${prev}" in2="${p.in2}" mode="${p.mode}" result="${r}"/>`);
        break;
      case 'composite':
        parts.push(`<feComposite in="${prev}" in2="SourceGraphic" operator="${p.operator}" k1="${p.k1}" k2="${p.k2}" k3="${p.k3}" k4="${p.k4}" result="${r}"/>`);
        break;
      case 'morphology':
        parts.push(`<feMorphology in="${prev}" operator="${p.operator}" radius="${p.radius}" result="${r}"/>`);
        break;
      case 'convolve': {
        const k = CONVOLVE_KERNELS[p.preset] || CONVOLVE_KERNELS.sharpen;
        const sum = k.reduce((a, b) => a + b, 0);
        const divisor = p.divisor > 0 ? p.divisor : (sum === 0 ? 1 : sum);
        parts.push(`<feConvolveMatrix in="${prev}" order="3" kernelMatrix="${k.join(' ')}" divisor="${divisor}" preserveAlpha="true" result="${r}"/>`);
        break;
      }
    }
    prev = r;
  }
  return parts.join('\n    ');
}

function colorPresetMatrix(kind, amount) {
  const a = Number(amount);
  const I = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0];
  const mix = (m) => I.map((iv, i) => +(iv + (m[i] - iv) * a).toFixed(4)).join(' ');
  switch (kind) {
    case 'grayscale': return mix([0.2126,0.7152,0.0722,0,0, 0.2126,0.7152,0.0722,0,0, 0.2126,0.7152,0.0722,0,0, 0,0,0,1,0]);
    case 'sepia': return mix([0.393,0.769,0.189,0,0, 0.349,0.686,0.168,0,0, 0.272,0.534,0.131,0,0, 0,0,0,1,0]);
    case 'invert': return mix([-1,0,0,0,1, 0,-1,0,0,1, 0,0,-1,0,1, 0,0,0,1,0]);
    case 'brightness': return [a,0,0,0,0, 0,a,0,0,0, 0,0,a,0,0, 0,0,0,1,0].join(' ');
    case 'contrast': { const t = 0.5 * (1 - a); return [a,0,0,0,t, 0,a,0,0,t, 0,0,a,0,t, 0,0,0,1,0].join(' '); }
    default: return I.join(' ');
  }
}

// 完整 <filter> 定义。显式 sRGB 统一 Firefox/Chrome 差异；扩大滤镜区域防止投影被裁剪。
export function buildFilterDef(chain, id = 'fxChain') {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
    ${buildFilterPrimitives(chain)}
  </filter>`;
}

// Canvas ctx.filter 近似（降级路径用；turbulence/displacement 由 Worker 处理）
export function chainToCanvasFilter(chain) {
  const parts = [];
  for (const n of chain) {
    if (!n.enabled) continue;
    const p = n.params;
    if (n.type === 'blur') parts.push(`blur(${p.stdDeviation}px)`);
    else if (n.type === 'dropshadow') parts.push(`drop-shadow(${p.dx}px ${p.dy}px ${p.stdDeviation}px ${p.floodColor})`);
    else if (n.type === 'colormatrix') {
      if (p.kind === 'saturate') parts.push(`saturate(${p.amount})`);
      else if (p.kind === 'hueRotate') parts.push(`hue-rotate(${p.angle}deg)`);
      else if (p.kind === 'grayscale') parts.push(`grayscale(${Math.min(1, p.amount)})`);
      else if (p.kind === 'sepia') parts.push(`sepia(${Math.min(1, p.amount)})`);
      else if (p.kind === 'invert') parts.push(`invert(${Math.min(1, p.amount)})`);
      else if (p.kind === 'brightness') parts.push(`brightness(${p.amount})`);
      else if (p.kind === 'contrast') parts.push(`contrast(${p.amount})`);
    }
  }
  return parts.join(' ');
}

export function findDisplacement(chain) {
  return chain.find(n => n.enabled && n.type === 'displacement') || null;
}

// 空滤镜（无启用节点）在部分浏览器中会导致整组不渲染，需跳过 filter 属性
export function hasEnabled(chain) {
  return chain.some(n => n.enabled);
}
