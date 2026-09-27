// 简单断言测试：node test/engine.test.js
const FE = require('../js/filterEngine.js');
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

console.log('[1] 参数越界钳制');
let stage = FE.createStage('blur');
stage.params.stdDeviation = 500;
let r = FE.clampStage(stage);
ok(r.stage.params.stdDeviation === 100, 'stdDeviation 500 -> 钳制到 100');
ok(r.warnings.length === 1, '产生越界警告');

stage = FE.createStage('turbulence');
stage.params.numOctaves = 0;
r = FE.clampStage(stage);
ok(r.stage.params.numOctaves === 1, 'numOctaves 0 -> 钳制到 1');

stage = FE.createStage('colorMatrix');
stage.params.ctype = 'matrix';
stage.params.matrix = '1 2 3';
r = FE.clampStage(stage);
ok(r.warnings.length > 0 && r.stage.params.matrix.split(' ').length === 20, '非法矩阵回退为单位矩阵');

stage = FE.createStage('blend');
stage.params.mode = 'bogus';
r = FE.clampStage(stage);
ok(r.stage.params.mode === 'multiply', '非法混合模式回退为 multiply');

console.log('[2] 滤镜链顺序');
const chain = [
  Object.assign(FE.createStage('blur'), { params: { stdDeviation: 5 } }),
  Object.assign(FE.createStage('displacement'), { params: { scale: 30, xChannel: 'R', yChannel: 'G', baseFrequency: 0.02, numOctaves: 2, seed: 1 } }),
  Object.assign(FE.createStage('blend'), { params: { mode: 'multiply', in2: 'SourceGraphic' } })
];
const built = FE.buildFilter(chain, 'fx');
ok(built.svg.indexOf('feGaussianBlur') < built.svg.indexOf('feDisplacementMap'), 'blur 在 displacement 之前');
ok(built.svg.indexOf('feDisplacementMap') < built.svg.indexOf('feBlend'), 'displacement 在 blend 之前');
ok(/in="r0"/.test(built.svg), '第二级输入引用第一级 result (r0)');
ok(/in="r1"/.test(b2chain(built)) || /in="r1"/.test(built.svg), '第三级输入引用第二级 result (r1)');
ok(built.svg.includes('color-interpolation-filters="sRGB"'), '统一 sRGB 色彩插值（浏览器差异处理）');
ok(built.svg.includes('x="-20%"'), '滤镜区域扩大防裁剪');
function b2chain(b) { return b.svg; }

console.log('[3] 禁用级跳过');
chain[0].enabled = false;
const b2 = FE.buildFilter(chain, 'fx');
ok(!b2.svg.includes('feGaussianBlur'), '禁用的 blur 不出现在输出中');

console.log('[4] 性能评分');
const cheap = FE.estimateCost([Object.assign(FE.createStage('blur'), { params: { stdDeviation: 1 } })], 640 * 400);
const heavy = FE.estimateCost([Object.assign(FE.createStage('blur'), { params: { stdDeviation: 80 } })], 640 * 400);
ok(heavy > cheap * 100, '大模糊半径开销显著更高');

console.log(failures ? `\n${failures} 个断言失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
