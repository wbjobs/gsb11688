/*
 * filterEngine.js — 纯函数滤镜链引擎（不依赖 DOM，可在 Node 中测试）
 * 负责：参数定义、越界钳制、滤镜链 -> SVG <filter> 序列化
 */
(function (global) {
  'use strict';

  // ---------- 滤镜类型与参数 schema ----------
  var FILTER_TYPES = {
    blur: {
      label: '高斯模糊 feGaussianBlur',
      params: {
        stdDeviation: { label: '标准差', min: 0, max: 100, def: 4, step: 0.1 }
      }
    },
    colorMatrix: {
      label: '颜色矩阵 feColorMatrix',
      params: {
        ctype: { label: '类型', type: 'enum', options: ['saturate', 'hueRotate', 'luminanceToAlpha', 'matrix'], def: 'saturate' },
        saturate: { label: '饱和度', min: 0, max: 10, def: 1, step: 0.05 },
        hueRotate: { label: '色相旋转°', min: 0, max: 360, def: 90, step: 1 },
        matrix: { label: '矩阵(20值)', type: 'text', def: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0' }
      }
    },
    turbulence: {
      label: '湍流噪声 feTurbulence',
      params: {
        baseFrequency: { label: '基础频率', min: 0, max: 1, def: 0.02, step: 0.001 },
        numOctaves: { label: '倍频数', min: 1, max: 8, def: 3, step: 1, int: true },
        seed: { label: '随机种子', min: 0, max: 999, def: 2, step: 1, int: true },
        ttype: { label: '类型', type: 'enum', options: ['fractalNoise', 'turbulence'], def: 'fractalNoise' },
        stitchTiles: { label: '平铺拼接', type: 'enum', options: ['stitch', 'noStitch'], def: 'stitch' }
      }
    },
    displacement: {
      label: '位移映射 feDisplacementMap',
      params: {
        scale: { label: '位移强度', min: 0, max: 500, def: 30, step: 1 },
        xChannel: { label: 'X 通道', type: 'enum', options: ['R', 'G', 'B', 'A'], def: 'R' },
        yChannel: { label: 'Y 通道', type: 'enum', options: ['R', 'G', 'B', 'A'], def: 'G' },
        baseFrequency: { label: '噪声频率', min: 0, max: 1, def: 0.02, step: 0.001 },
        numOctaves: { label: '倍频数', min: 1, max: 8, def: 2, step: 1, int: true },
        seed: { label: '随机种子', min: 0, max: 999, def: 5, step: 1, int: true }
      }
    },
    blend: {
      label: '混合 feBlend',
      params: {
        mode: {
          label: '混合模式', type: 'enum',
          options: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
            'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
            'exclusion', 'hue', 'saturation', 'color', 'luminosity'],
          def: 'multiply'
        },
        in2: { label: '第二输入', type: 'enum', options: ['SourceGraphic', 'BackgroundImage'], def: 'SourceGraphic' }
      }
    }
  };

  var CSS_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
    'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

  var uid = 1;

  function createStage(type) {
    var schema = FILTER_TYPES[type];
    if (!schema) throw new Error('未知滤镜类型: ' + type);
    var params = {};
    Object.keys(schema.params).forEach(function (k) {
      params[k] = schema.params[k].def;
    });
    return { id: 's' + (uid++) + '_' + Date.now().toString(36), type: type, enabled: true, params: params };
  }

  // ---------- 参数越界钳制 ----------
  // 返回 { stage: 钳制后的副本, warnings: [...] }
  function clampStage(stage) {
    var schema = FILTER_TYPES[stage.type];
    var warnings = [];
    var params = {};
    Object.keys(schema.params).forEach(function (key) {
      var spec = schema.params[key];
      var v = stage.params[key];
      if (spec.type === 'enum') {
        if (spec.options.indexOf(v) === -1) {
          warnings.push(stage.type + '.' + key + ': 非法枚举值 "' + v + '"，已回退为 ' + spec.def);
          v = spec.def;
        }
      } else if (spec.type === 'text') {
        if (key === 'matrix') {
          var nums = String(v).trim().split(/[\s,]+/).filter(Boolean).map(Number);
          if (nums.length !== 20 || nums.some(isNaN)) {
            warnings.push('feColorMatrix 矩阵必须是 20 个数字，已回退为单位矩阵');
            nums = String(spec.def).trim().split(/[\s,]+/).filter(Boolean).map(Number);
          }
          v = nums.join(' ');
        }
      } else {
        v = Number(v);
        if (isNaN(v)) {
          warnings.push(stage.type + '.' + key + ': 非数字，已回退为 ' + spec.def);
          v = spec.def;
        } else {
          if (spec.int) v = Math.round(v);
          if (v < spec.min) { warnings.push(stage.type + '.' + key + ': ' + v + ' 低于下限 ' + spec.min + '，已钳制'); v = spec.min; }
          if (v > spec.max) { warnings.push(stage.type + '.' + key + ': ' + v + ' 超过上限 ' + spec.max + '，已钳制'); v = spec.max; }
        }
      }
      params[key] = v;
    });
    return { stage: { id: stage.id, type: stage.type, enabled: !!stage.enabled, params: params }, warnings: warnings };
  }

  function clampChain(chain) {
    var warnings = [];
    var out = chain.map(function (s) {
      var r = clampStage(s);
      warnings = warnings.concat(r.warnings);
      return r.stage;
    });
    return { chain: out, warnings: warnings };
  }

  // ---------- 滤镜链 -> SVG ----------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  // 生成 <filter> 内部原语序列。链顺序 = 数组顺序，逐级 result 串联。
  function buildPrimitives(chain) {
    var xml = [];
    var prev = 'SourceGraphic';
    chain.forEach(function (s, i) {
      if (!s.enabled) return;
      var name = 'r' + i;
      var p = s.params;
      switch (s.type) {
        case 'blur':
          xml.push('<feGaussianBlur in="' + prev + '" stdDeviation="' + p.stdDeviation + '" result="' + name + '"/>');
          break;
        case 'colorMatrix': {
          var values;
          if (p.ctype === 'saturate') values = p.saturate;
          else if (p.ctype === 'hueRotate') values = p.hueRotate;
          else if (p.ctype === 'matrix') values = p.matrix;
          else values = '';
          xml.push('<feColorMatrix in="' + prev + '" type="' + p.ctype + '"' +
            (values !== '' ? ' values="' + esc(values) + '"' : '') + ' result="' + name + '"/>');
          break;
        }
        case 'turbulence':
          xml.push('<feTurbulence type="' + p.ttype + '" baseFrequency="' + p.baseFrequency +
            '" numOctaves="' + p.numOctaves + '" seed="' + p.seed + '" stitchTiles="' + p.stitchTiles +
            '" result="' + name + '"/>');
          break;
        case 'displacement':
          // 每个位移级自带湍流噪声源，保证链内任意位置都可用
          xml.push('<feTurbulence type="fractalNoise" baseFrequency="' + p.baseFrequency +
            '" numOctaves="' + p.numOctaves + '" seed="' + p.seed + '" stitchTiles="stitch" result="' + name + '_noise"/>');
          xml.push('<feDisplacementMap in="' + prev + '" in2="' + name + '_noise" scale="' + p.scale +
            '" xChannelSelector="' + p.xChannel + '" yChannelSelector="' + p.yChannel + '" result="' + name + '"/>');
          break;
        case 'blend':
          xml.push('<feBlend in="' + prev + '" in2="' + p.in2 + '" mode="' + p.mode + '" result="' + name + '"/>');
          break;
      }
      prev = name;
    });
    return { xml: xml.join('\n    '), lastResult: prev };
  }

  // 完整 <filter> 元素。color-interpolation-filters="sRGB" 统一各浏览器色彩插值差异。
  function buildFilter(chain, id) {
    var clamped = clampChain(chain);
    var prim = buildPrimitives(clamped.chain);
    var svg = '<filter id="' + esc(id) + '" x="-20%" y="-20%" width="140%" height="140%" ' +
      'filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">\n    ' +
      prim.xml + '\n  </filter>';
    return { svg: svg, warnings: clamped.warnings, chain: clamped.chain };
  }

  // ---------- 性能评估 ----------
  // 粗略代价评分：模糊随 stdDeviation 平方增长，湍流随倍频指数增长
  function estimateCost(chain, area) {
    var cost = 0;
    chain.forEach(function (s) {
      if (!s.enabled) return;
      var p = s.params;
      switch (s.type) {
        case 'blur': cost += Math.pow(p.stdDeviation, 1.6) * 4; break;
        case 'turbulence': cost += Math.pow(2, p.numOctaves) * 30; break;
        case 'displacement': cost += Math.pow(2, p.numOctaves) * 30 + p.scale * 0.5; break;
        case 'colorMatrix': cost += 10; break;
        case 'blend': cost += 8; break;
      }
    });
    return cost * (area || 1) / 100000;
  }

  var api = {
    FILTER_TYPES: FILTER_TYPES,
    CSS_BLEND_MODES: CSS_BLEND_MODES,
    createStage: createStage,
    clampStage: clampStage,
    clampChain: clampChain,
    buildPrimitives: buildPrimitives,
    buildFilter: buildFilter,
    estimateCost: estimateCost
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FilterEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
