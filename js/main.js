import { caps, capWarnings } from './browser.js';
import { FILTER_DEFS, BLEND_MODES, createNode, clampNode, clampChain,
         buildFilterDef, hasEnabled } from './filters.js';
import { savePreset, listPresets, deletePreset, BUILTIN_PRESETS } from './presets.js';
import { downloadBlob, buildStandaloneSVG, rasterizePreview, exportPresetsJSON } from './exporter.js';
import { renderCanvasFallback } from './canvasFallback.js';

const W = 800, H = 600;
const $ = (s) => document.querySelector(s);

const state = {
  chain: [createNode('blur'), createNode('colormatrix')],
  selectedId: null,
  layerBlend: 'normal',
  fallbackMode: false,
  sceneContent: defaultScene(),
  perfSamples: [],
};

function defaultScene() {
  return `<circle cx="240" cy="240" r="130" fill="url(#gradA)"/>
<rect x="380" y="160" width="260" height="200" rx="24" fill="url(#gradB)"/>
<path d="M400 430 l40 80 40-80 40 80 40-80" stroke="#f472b6" stroke-width="18" fill="none" stroke-linecap="round"/>
<text x="400" y="530" font-size="72" font-weight="bold" text-anchor="middle"
      font-family="Georgia, serif" fill="#0f172a">SVG FX</text>`;
}

const SHARED_DEFS = `<radialGradient id="gradA" cx="0.4" cy="0.4">
  <stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#ef4444"/>
</radialGradient>
<linearGradient id="gradB" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#7c3aed"/>
</linearGradient>`;

const BACKDROP = `<rect width="${W}" height="${H}" fill="#f8fafc"/>
<circle cx="660" cy="110" r="70" fill="#bbf7d0"/>
<circle cx="120" cy="500" r="55" fill="#bfdbfe"/>`;

// ---------- 渲染 ----------
function renderStage() {
  const t0 = performance.now();
  const svg = $('#stage');
  const blendStyle = state.layerBlend !== 'normal' && caps.mixBlendMode
    ? ` style="mix-blend-mode:${state.layerBlend}"` : '';
  const filterAttr = hasEnabled(state.chain) ? ' filter="url(#fxChain)"' : '';
  svg.innerHTML = `<defs>${SHARED_DEFS}${buildFilterDef(state.chain)}</defs>
${BACKDROP}
<g${filterAttr}${blendStyle}>${state.sceneContent}</g>`;
  // 双 rAF 测量真实渲染耗时
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ms = performance.now() - t0;
    state.perfSamples.push(ms);
    if (state.perfSamples.length > 5) state.perfSamples.shift();
    const avg = state.perfSamples.reduce((a, b) => a + b, 0) / state.perfSamples.length;
    $('#perfMs').textContent = avg.toFixed(1);
    $('#perfWarn').classList.toggle('hidden', avg < 60);
  }));
}

let fallbackTimer = null;
async function renderFallback() {
  const markup = `${SHARED_DEFS}${BACKDROP}${state.sceneContent}`;
  await renderCanvasFallback($('#fallbackCanvas'), markup, state.chain, W, H);
}

function apply() {
  if (state.fallbackMode) {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(renderFallback, 120);
  } else {
    renderStage();
  }
}

// 慢滤镜（turbulence/displacement/convolve）防抖，Safari 加大间隔
const SLOW_DEBOUNCE = caps.isSafari ? 350 : 150;
let slowTimer = null;
function applyDebouncedIfSlow(node) {
  if (node && FILTER_DEFS[node.type].slow) {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(apply, SLOW_DEBOUNCE);
  } else {
    apply();
  }
}

// ---------- 滤镜链 UI ----------
function renderChainList() {
  const ul = $('#chainList');
  ul.innerHTML = '';
  state.chain.forEach((node, i) => {
    const li = document.createElement('li');
    li.className = (node.id === state.selectedId ? 'selected ' : '') + (node.enabled ? '' : 'disabled');
    li.innerHTML = `
      <input type="checkbox" ${node.enabled ? 'checked' : ''} title="启用/停用">
      <span class="name">${FILTER_DEFS[node.type].label}</span>
      <button data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button data-act="down" ${i === state.chain.length - 1 ? 'disabled' : ''}>↓</button>
      <button data-act="del">✕</button>`;
    li.querySelector('input').addEventListener('change', (e) => {
      node.enabled = e.target.checked; renderChainList(); apply();
    });
    li.querySelectorAll('button').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'del') state.chain.splice(i, 1);
      else if (act === 'up' && i > 0) [state.chain[i-1], state.chain[i]] = [state.chain[i], state.chain[i-1]];
      else if (act === 'down' && i < state.chain.length - 1) [state.chain[i+1], state.chain[i]] = [state.chain[i], state.chain[i+1]];
      renderChainList(); apply();
    }));
    li.addEventListener('click', () => {
      state.selectedId = node.id;
      renderChainList(); renderParamForm();
    });
    ul.appendChild(li);
  });
}

// ---------- 参数表单（实时调整 + 越界钳制） ----------
function renderParamForm() {
  const form = $('#paramForm');
  const node = state.chain.find(n => n.id === state.selectedId);
  form.innerHTML = '';
  if (!node) { form.innerHTML = '<p class="hint">选择左侧滤镜节点以编辑参数</p>'; $('#paramTitle').textContent = ''; return; }
  $('#paramTitle').textContent = `· ${FILTER_DEFS[node.type].label}`;
  const def = FILTER_DEFS[node.type];
  for (const [key, spec] of Object.entries(def.params)) {
    const label = document.createElement('label');
    label.textContent = spec.label;
    form.appendChild(label);
    let input;
    if (spec.type === 'select') {
      input = document.createElement('select');
      for (const opt of spec.options) {
        const o = document.createElement('option');
        o.value = o.textContent = opt;
        if (node.params[key] === opt) o.selected = true;
        input.appendChild(o);
      }
    } else if (spec.type === 'color') {
      input = document.createElement('input');
      input.type = 'color'; input.value = node.params[key];
    } else if (spec.type === 'text') {
      input = document.createElement('input');
      input.type = 'text'; input.value = node.params[key];
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = spec.min; input.max = spec.max; input.step = spec.step;
      input.value = node.params[key];
      const val = document.createElement('span');
      val.className = 'val'; val.textContent = node.params[key];
      label.appendChild(val);
      input.addEventListener('input', () => { val.textContent = input.value; });
    }
    input.addEventListener('input', () => {
      node.params[key] = spec.type === 'select' || spec.type === 'color' || spec.type === 'text'
        ? input.value : Number(input.value);
      applyDebouncedIfSlow(node); // 实时调整
    });
    input.addEventListener('change', () => {
      const warnings = clampNode(node); // 越界钳制
      warnings.forEach(w => toast(w));
      if (warnings.length) renderParamForm();
      apply();
    });
    form.appendChild(input);
  }
}

// ---------- 预设 ----------
async function refreshPresets() {
  const ul = $('#presetList');
  ul.innerHTML = '';
  const addItem = (name, tag, onApply, onDelete) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${name}</span><span class="tag">${tag}</span>`;
    const applyBtn = document.createElement('button');
    applyBtn.textContent = '应用';
    applyBtn.onclick = onApply;
    li.appendChild(applyBtn);
    if (onDelete) {
      const del = document.createElement('button');
      del.textContent = '删除'; del.className = 'del';
      del.onclick = onDelete;
      li.appendChild(del);
    }
    ul.appendChild(li);
  };
  for (const p of BUILTIN_PRESETS) addItem(p.name, '内置', () => applyPresetData(p.data));
  if (caps.indexedDB) {
    try {
      const saved = await listPresets();
      for (const p of saved) {
        addItem(p.name, new Date(p.updatedAt).toLocaleDateString(),
          () => applyPresetData(p.data),
          async () => { await deletePreset(p.id); refreshPresets(); toast(`已删除预设「${p.name}」`, true); });
      }
    } catch (e) { toast('读取预设失败：' + e.message); }
  }
}

function applyPresetData(data) {
  state.chain = data.chain.map(item => {
    const node = createNode(item.type);
    Object.assign(node.params, item.params);
    return node;
  });
  state.layerBlend = data.layerBlend || 'normal';
  $('#layerBlend').value = state.layerBlend;
  const warnings = clampChain(state.chain);
  warnings.forEach(w => toast(w));
  state.selectedId = null;
  renderChainList(); renderParamForm(); apply();
  toast('预设已应用', true);
}

// ---------- 导出 ----------
async function exportSVG(compat) {
  let rasterDataURL = null;
  if (compat) {
    try { rasterDataURL = await rasterizePreview($('#stage'), W, H); }
    catch (e) { toast('栅格化失败，改为实时滤镜导出：' + e.message); }
  }
  const svg = buildStandaloneSVG({
    width: W, height: H,
    sceneMarkup: state.sceneContent,
    chain: state.chain,
    blendMode: state.layerBlend,
    rasterDataURL,
    backdropMarkup: BACKDROP, sharedDefs: SHARED_DEFS,
  });
  downloadBlob(svg, compat ? 'svg-fx-compat.svg' : 'svg-fx.svg', 'image/svg+xml;charset=utf-8');
  toast('SVG 已导出', true);
}

// ---------- 提示 ----------
function toast(msg, info = false) {
  const div = document.createElement('div');
  div.className = 'toast' + (info ? ' info' : '');
  div.textContent = msg;
  $('#toasts').appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// ---------- 初始化 ----------
function init() {
  // 能力徽章
  const badges = $('#capBadges');
  const items = [
    ['ctx.filter', caps.canvasFilter], ['OffscreenCanvas', caps.offscreenCanvas],
    ['Worker', caps.worker], ['IndexedDB', caps.indexedDB], ['mix-blend', caps.mixBlendMode],
  ];
  badges.innerHTML = items.map(([n, ok]) =>
    `<span class="badge ${ok ? 'ok' : 'no'}">${n} ${ok ? '✓' : '✗'}</span>`).join('');
  capWarnings().forEach(w => toast(w));
  if (!caps.mixBlendMode) $('#blendHint').textContent = '当前浏览器不支持 mix-blend-mode，请改用滤镜链中的 feBlend 节点。';

  // 添加滤镜
  const sel = $('#addFilterType');
  for (const [type, def] of Object.entries(FILTER_DEFS)) {
    const o = document.createElement('option');
    o.value = type; o.textContent = def.label;
    sel.appendChild(o);
  }
  $('#addFilterBtn').onclick = () => {
    const node = createNode(sel.value);
    state.chain.push(node);
    state.selectedId = node.id;
    renderChainList(); renderParamForm(); apply();
  };

  // 图层混合
  const blendSel = $('#layerBlend');
  for (const m of BLEND_MODES) {
    const o = document.createElement('option');
    o.value = o.textContent = m;
    blendSel.appendChild(o);
  }
  blendSel.onchange = () => { state.layerBlend = blendSel.value; apply(); };

  // 渲染模式切换（SVG ↔ Canvas 降级）
  $('#modeToggle').onclick = () => {
    state.fallbackMode = !state.fallbackMode;
    $('#stage').classList.toggle('hidden', state.fallbackMode);
    $('#fallbackCanvas').classList.toggle('hidden', !state.fallbackMode);
    $('#modeToggle').textContent = state.fallbackMode ? '切回 SVG 渲染' : '降级到 Canvas 渲染';
    apply();
    toast(state.fallbackMode ? '已切换到 Canvas 降级渲染（Worker 处理位移）' : '已切回 SVG 原生滤镜', true);
  };

  // 图像上传
  $('#imgUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.sceneContent = `<image href="${reader.result}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
      apply();
    };
    reader.readAsDataURL(file);
  });
  $('#resetScene').onclick = () => { state.sceneContent = defaultScene(); apply(); };

  // 预设
  $('#savePreset').onclick = async () => {
    const name = $('#presetName').value.trim() || `预设 ${new Date().toLocaleTimeString()}`;
    const data = {
      layerBlend: state.layerBlend,
      chain: state.chain.map(n => ({ type: n.type, params: { ...n.params } })),
    };
    if (!caps.indexedDB) {
      downloadBlob(JSON.stringify({ name, data }, null, 2), `${name}.json`, 'application/json');
      toast('浏览器不支持 IndexedDB，已改为导出 JSON 文件');
      return;
    }
    await savePreset(name, data);
    $('#presetName').value = '';
    refreshPresets();
    toast(`预设「${name}」已保存`, true);
  };
  $('#exportPresets').onclick = async () => {
    if (!caps.indexedDB) return toast('IndexedDB 不可用');
    exportPresetsJSON(await listPresets());
  };
  $('#importPresets').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const list = JSON.parse(await file.text());
      const arr = Array.isArray(list) ? list : [list];
      for (const p of arr) {
        if (p.name && p.data) await savePreset(p.name, p.data);
        else if (p.name && p.chain) await savePreset(p.name, p);
      }
      refreshPresets();
      toast(`已导入 ${arr.length} 个预设`, true);
    } catch (err) { toast('导入失败：' + err.message); }
  });

  // 导出
  $('#exportSVG').onclick = () => exportSVG(false);
  $('#exportCompat').onclick = () => exportSVG(true);

  renderChainList();
  renderParamForm();
  refreshPresets();
  apply();
}

init();
