/*
 * main.js — UI 控制器：滤镜链编辑、实时预览（rAF 节流）、预设、导出、性能面板
 */
(function () {
  'use strict';

  var caps = Compat.detect();

  // ---------- 内置预设 ----------
  var BUILTIN_PRESETS = [
    { name: '柔光梦境', blendMode: 'screen', opacity: 0.9, chain: [
      { type: 'blur', params: { stdDeviation: 6 } },
      { type: 'colorMatrix', params: { ctype: 'saturate', saturate: 1.8, hueRotate: 90, matrix: '' } }
    ]},
    { name: '液态扭曲', blendMode: 'normal', opacity: 1, chain: [
      { type: 'displacement', params: { scale: 80, xChannel: 'R', yChannel: 'G', baseFrequency: 0.015, numOctaves: 2, seed: 5 } },
      { type: 'blur', params: { stdDeviation: 1 } }
    ]},
    { name: '噪点风暴', blendMode: 'overlay', opacity: 0.8, chain: [
      { type: 'turbulence', params: { baseFrequency: 0.4, numOctaves: 4, seed: 7, ttype: 'fractalNoise', stitchTiles: 'stitch' } },
      { type: 'colorMatrix', params: { ctype: 'saturate', saturate: 0, hueRotate: 90, matrix: '' } }
    ]},
    { name: '复古色相', blendMode: 'multiply', opacity: 1, chain: [
      { type: 'colorMatrix', params: { ctype: 'hueRotate', saturate: 1, hueRotate: 200, matrix: '' } },
      { type: 'blur', params: { stdDeviation: 0.5 } }
    ]}
  ];

  // ---------- 应用状态 ----------
  var state = {
    chain: [FilterEngine.createStage('blur'), FilterEngine.createStage('colorMatrix')],
    blendMode: 'normal',
    opacity: 1,
    renderMode: caps.useCanvasFallback ? 'canvas' : 'svg',
    currentPresetId: null
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var previewSvg = $('#previewSvg');
  var filterDefs = $('#filterDefs');
  var layerA = $('#layerA');
  var layerB = $('#layerB');
  var canvas = $('#previewCanvas');

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg, isWarn) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (isWarn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 3200);
  }

  // ---------- 渲染（rAF 节流，避免滑杆拖动时卡顿） ----------
  var renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      render();
    });
  }

  var lastRenderMs = 0;
  function render() {
    var t0 = performance.now();
    var result = FilterEngine.buildFilter(state.chain, 'fx');
    result.warnings.forEach(function (w) { toast(w, true); });

    if (state.renderMode === 'svg') {
      previewSvg.style.display = '';
      canvas.style.display = 'none';
      filterDefs.innerHTML = Scene.defs() + result.svg;
      layerA.innerHTML = Scene.layerA();
      layerA.setAttribute('filter', 'url(#fx)');
      layerB.innerHTML = Scene.layerB();
      layerB.style.mixBlendMode = caps.mixBlendMode ? state.blendMode : 'normal';
      layerB.style.opacity = state.opacity;
      lastRenderMs = performance.now() - t0;
      updatePerfPanel(result);
    } else {
      // Canvas 降级渲染
      previewSvg.style.display = 'none';
      canvas.style.display = '';
      renderCanvasFallback(result);
    }
  }

  var sceneImageCache = null;
  function getSceneImage() {
    if (sceneImageCache) return Promise.resolve(sceneImageCache);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Scene.W + '" height="' + Scene.H + '">' +
      '<defs>' + Scene.defs() + '</defs>' + Scene.layerA() + '</svg>';
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); sceneImageCache = img; resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function renderCanvasFallback(result) {
    canvas.width = Scene.W; canvas.height = Scene.H;
    getSceneImage().then(function (img) {
      return CanvasRenderer.render(canvas, img, result.chain, caps);
    }).then(function (ms) {
      lastRenderMs = ms;
      updatePerfPanel(result);
    }).catch(function (err) {
      toast('Canvas 渲染失败: ' + err.message, true);
    });
  }

  // ---------- 性能面板 ----------
  function updatePerfPanel(result) {
    var cost = FilterEngine.estimateCost(result.chain, Scene.W * Scene.H);
    $('#perfTime').textContent = lastRenderMs.toFixed(1) + ' ms';
    $('#perfCost').textContent = cost.toFixed(1);
    var hint = $('#perfHint');
    if (cost > 60) {
      hint.textContent = '⚠ 滤镜链开销较高，可能造成掉帧。建议降低模糊半径或湍流倍频数。';
      hint.className = 'hint warn';
    } else if (cost > 25) {
      hint.textContent = '开销中等，低端设备可能卡顿。';
      hint.className = 'hint';
    } else {
      hint.textContent = '开销良好。';
      hint.className = 'hint ok';
    }
  }

  // FPS 计量
  (function fpsLoop() {
    var frames = 0, last = performance.now();
    function tick(now) {
      frames++;
      if (now - last >= 1000) {
        $('#perfFps').textContent = frames + ' fps';
        frames = 0; last = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  // ---------- 滤镜链 UI ----------
  function stageLabel(s) { return FilterEngine.FILTER_TYPES[s.type].label; }

  function renderChainUI() {
    var host = $('#chainList');
    host.innerHTML = '';
    state.chain.forEach(function (stage, idx) {
      var card = document.createElement('div');
      card.className = 'stage' + (stage.enabled ? '' : ' disabled');

      var head = document.createElement('div');
      head.className = 'stage-head';
      head.innerHTML =
        '<label class="stage-toggle"><input type="checkbox" ' + (stage.enabled ? 'checked' : '') +
        ' data-act="toggle"> ' + stageLabel(stage) + '</label>' +
        '<span class="stage-btns">' +
        '<button data-act="up" title="上移" ' + (idx === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button data-act="down" title="下移" ' + (idx === state.chain.length - 1 ? 'disabled' : '') + '>↓</button>' +
        '<button data-act="del" title="删除">✕</button></span>';
      card.appendChild(head);

      var body = document.createElement('div');
      body.className = 'stage-body';
      var schema = FilterEngine.FILTER_TYPES[stage.type].params;
      Object.keys(schema).forEach(function (key) {
        var spec = schema.params[key];
        // colorMatrix 只显示当前类型相关参数
        if (stage.type === 'colorMatrix') {
          if (key === 'saturate' && stage.params.ctype !== 'saturate') return;
          if (key === 'hueRotate' && stage.params.ctype !== 'hueRotate') return;
          if (key === 'matrix' && stage.params.ctype !== 'matrix') return;
        }
        var row = document.createElement('div');
        row.className = 'param-row';
        if (spec.type === 'enum') {
          row.innerHTML = '<label>' + spec.label + '</label>';
          var sel = document.createElement('select');
          sel.dataset.key = key;
          spec.options.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = o; opt.textContent = o;
            if (stage.params[key] === o) opt.selected = true;
            sel.appendChild(opt);
          });
          row.appendChild(sel);
        } else if (spec.type === 'text') {
          row.innerHTML = '<label>' + spec.label + '</label>';
          var ta = document.createElement('textarea');
          ta.dataset.key = key; ta.rows = 2; ta.value = stage.params[key];
          row.appendChild(ta);
        } else {
          row.innerHTML = '<label>' + spec.label +
            ' <output>' + stage.params[key] + '</output></label>';
          var input = document.createElement('input');
          input.type = 'range'; input.dataset.key = key;
          input.min = spec.min; input.max = spec.max; input.step = spec.step;
          input.value = stage.params[key];
          row.appendChild(input);
        }
        body.appendChild(row);
      });
      card.appendChild(body);

      card.addEventListener('input', function (e) { onStageInput(e, stage); });
      card.addEventListener('click', function (e) { onStageAction(e, idx); });
      host.appendChild(card);
    });
  }

  function onStageInput(e, stage) {
    var key = e.target.dataset.key;
    if (e.target.dataset.act === 'toggle') {
      stage.enabled = e.target.checked;
      renderChainUI(); scheduleRender();
      return;
    }
    if (!key) return;
    var raw = e.target.type === 'range' || e.target.tagName === 'SELECT'
      ? (e.target.type === 'range' ? Number(e.target.value) : e.target.value)
      : e.target.value;
    // 越界钳制 + 提示
    var trial = { id: stage.id, type: stage.type, enabled: stage.enabled, params: Object.assign({}, stage.params) };
    trial.params[key] = raw;
    var clamped = FilterEngine.clampStage(trial);
    clamped.warnings.forEach(function (w) { toast(w, true); });
    stage.params = clamped.stage.params;
    var out = e.target.closest('.param-row');
    if (out) { var o = out.querySelector('output'); if (o) o.textContent = stage.params[key]; }
    if (e.target.tagName === 'SELECT') renderChainUI(); // enum 切换可能影响可见参数
    scheduleRender();
  }

  function onStageAction(e, idx) {
    var act = e.target.dataset.act;
    if (!act) return;
    if (act === 'del') state.chain.splice(idx, 1);
    else if (act === 'up' && idx > 0) {
      var t = state.chain[idx - 1]; state.chain[idx - 1] = state.chain[idx]; state.chain[idx] = t;
    } else if (act === 'down' && idx < state.chain.length - 1) {
      var t2 = state.chain[idx + 1]; state.chain[idx + 1] = state.chain[idx]; state.chain[idx] = t2;
    } else return;
    renderChainUI(); scheduleRender();
  }

  // 添加滤镜
  $('#addFilter').addEventListener('click', function () {
    var type = $('#filterType').value;
    state.chain.push(FilterEngine.createStage(type));
    renderChainUI(); scheduleRender();
  });

  // ---------- 混合模式与图层 ----------
  (function initBlend() {
    var sel = $('#blendMode');
    FilterEngine.CSS_BLEND_MODES.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m; o.textContent = m;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.blendMode = sel.value; scheduleRender(); });
    $('#layerOpacity').addEventListener('input', function (e) {
      state.opacity = Number(e.target.value);
      $('#opacityOut').textContent = state.opacity;
      scheduleRender();
    });
  })();

  // ---------- 渲染模式 ----------
  (function initRenderMode() {
    var sel = $('#renderMode');
    sel.value = state.renderMode;
    if (!caps.svgFilters) {
      var opt = sel.querySelector('option[value="svg"]');
      if (opt) opt.disabled = true;
    }
    sel.addEventListener('change', function () {
      state.renderMode = sel.value;
      scheduleRender();
    });
  })();

  // ---------- 预设：保存 / 恢复（IndexedDB） ----------
  function snapshot() {
    return {
      name: '', chain: JSON.parse(JSON.stringify(state.chain)),
      blendMode: state.blendMode, opacity: state.opacity
    };
  }

  function applyPreset(p) {
    state.chain = p.chain.map(function (s) {
      var stage = FilterEngine.createStage(s.type);
      stage.enabled = s.enabled !== false;
      stage.params = Object.assign(stage.params, s.params);
      return FilterEngine.clampStage(stage).stage;
    });
    state.blendMode = p.blendMode || 'normal';
    state.opacity = p.opacity != null ? p.opacity : 1;
    $('#blendMode').value = state.blendMode;
    $('#layerOpacity').value = state.opacity;
    $('#opacityOut').textContent = state.opacity;
    renderChainUI(); scheduleRender();
  }

  function refreshPresetList() {
    if (!caps.indexedDB) return;
    PresetDB.list().then(function (items) {
      var host = $('#presetList');
      host.innerHTML = '';
      items.sort(function (a, b) { return b.createdAt - a.createdAt; }).forEach(function (p) {
        var li = document.createElement('li');
        li.innerHTML = '<span>' + p.name + '</span>' +
          '<span class="preset-btns"><button data-act="load">载入</button>' +
          '<button data-act="del">删除</button></span>';
        li.addEventListener('click', function (e) {
          var act = e.target.dataset.act;
          if (act === 'load') { applyPreset(p); state.currentPresetId = p.id; toast('已载入预设「' + p.name + '」'); }
          else if (act === 'del') { PresetDB.remove(p.id).then(refreshPresetList); }
        });
        host.appendChild(li);
      });
      if (!items.length) host.innerHTML = '<li class="empty">暂无保存的预设</li>';
    }).catch(function (err) { toast('读取预设失败: ' + err.message, true); });
  }

  $('#savePreset').addEventListener('click', function () {
    if (!caps.indexedDB) { toast('当前浏览器不支持 IndexedDB，无法保存预设', true); return; }
    var name = $('#presetName').value.trim() || ('预设 ' + new Date().toLocaleTimeString());
    var p = snapshot();
    p.name = name;
    if (state.currentPresetId != null && $('#overwritePreset').checked) p.id = state.currentPresetId;
    PresetDB.save(p).then(function (id) {
      state.currentPresetId = id;
      toast('预设「' + name + '」已保存');
      refreshPresetList();
    }).catch(function (err) { toast('保存失败: ' + err.message, true); });
  });

  (function initBuiltin() {
    var sel = $('#builtinPreset');
    BUILTIN_PRESETS.forEach(function (p, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = p.name;
      sel.appendChild(o);
    });
    $('#applyBuiltin').addEventListener('click', function () {
      var p = BUILTIN_PRESETS[Number(sel.value)];
      if (p) { applyPreset(p); state.currentPresetId = null; toast('已应用内置预设「' + p.name + '」'); }
    });
  })();

  // ---------- 导出 ----------
  $('#exportSvg').addEventListener('click', function () {
    Exporter.download(state, 'filter-lab-' + Date.now() + '.svg');
    toast('SVG 已导出（自包含，可直接用浏览器打开）');
  });
  $('#copySvg').addEventListener('click', function () {
    var svg = Exporter.buildDocument(state);
    navigator.clipboard.writeText(svg).then(
      function () { toast('SVG 源码已复制到剪贴板'); },
      function () { toast('复制失败，请检查剪贴板权限', true); });
  });

  // ---------- 浏览器差异提示 ----------
  (function showCompat() {
    var notes = Compat.compatNotes(caps);
    var el = $('#compatInfo');
    el.innerHTML = '<strong>' + caps.browser + '</strong> 能力检测：' +
      'SVG滤镜 ' + yn(caps.svgFilters) + ' · mix-blend-mode ' + yn(caps.mixBlendMode) +
      ' · Canvas filter ' + yn(caps.canvasFilter) + ' · Worker ' + yn(caps.worker) +
      ' · IndexedDB ' + yn(caps.indexedDB) +
      (notes.length ? '<ul>' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' : '');
    function yn(v) { return v ? '✓' : '✗'; }
  })();

  // ---------- 启动 ----------
  renderChainUI();
  refreshPresetList();
  render();
})();
