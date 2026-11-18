// Bishop and Janbu (SPEC 6), plus T1 (closed form), T3 (slice count),
// T4 (sia vs. hand-reduced characteristic), T5 (water below the slip surface).

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSurface } from '../../core/index.js';
import { bishop } from '../../core/bishop.js';
import { janbu, janbuB1, chordAndSagitta } from '../../core/janbu.js';
import { loadBenchmark, near } from './helpers.js';

const DEG = Math.PI / 180;
const OPTS = { kh: 0, tolerance: 1e-4, maxIterations: 100 };

const slice = (o) => ({
  xLeft: 0, xRight: 1, b: 2, xm: 0, zb: 0, alpha: 0, l: 2, W: 100, zG: 0, Q: 0, u: 0, material: 'M', c: 0, phi: 0, ...o,
});

// ------------------------------------------------------------ H1 / H2 (Slide hand calculations)

test('H1 C1, 7 slices: Bishop = 2.113 (+/- 0.005)', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = analyzeSurface(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  assert.equal(r.slices.length, 7);
  near(assert, r.results.bishop.F, 2.113, 0.005, 'Bishop H1');
});

test('H2 C1, 7 slices: Bishop = 1.554 (+/- 0.005)', () => {
  const m = loadBenchmark('H2_handcalc_wet');
  const r = analyzeSurface(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  assert.equal(r.slices.length, 7);
  near(assert, r.results.bishop.F, 1.554, 0.005, 'Bishop H2');
});

test('analyzeSurface: slice table carries N\' and m_alpha, Janbu detail', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = analyzeSurface(m, m.surfaces[0]);
  for (const s of r.slices) {
    assert.equal(typeof s.Nprime, 'number');
    // m_alpha and N' belong to the calculation frame; H1 is mirrored there, so alpha changes sign
    const a = -s.alpha;
    near(assert, s.mAlpha, Math.cos(a) * (1 + (Math.tan(a) * Math.tan(s.phi)) / r.results.bishop.F), 1e-3);
  }
  const j = r.results.janbuCorrected;
  near(assert, j.F, j.f0 * j.F0, 1e-12);
  assert.equal(r.results.janbu.F, j.F0);
  assert.equal(j.b1, 0.5);
  assert.ok(j.d > 0 && j.L > j.d);
  assert.deepEqual(r.warnings, []);
});

// ------------------------------------------------------------ Bishop formula and limit cases

test('bishop: one slice with alpha = 0 equals the closed formula', () => {
  const s = slice({ c: 10, phi: 30 * DEG, W: 100, b: 2, xm: 7 });
  const circle = { xc: 10, zc: 20, R: 10 };
  const r = bishop([s], circle, OPTS);
  const expected = (10 * 2 + 100 * Math.tan(30 * DEG)) / ((100 * (10 - 7)) / 10);
  assert.equal(r.valid, true);
  near(assert, r.F, expected, 1e-9);
});

test('bishop: seismic force and surcharge enter the driving moment', () => {
  const s = slice({ c: 10, phi: 30 * DEG, W: 100, Q: 20, b: 2, xm: 7, zG: 15 });
  const circle = { xc: 10, zc: 20, R: 10 };
  const r = bishop([s], circle, { ...OPTS, kh: 0.1 });
  const num = 10 * 2 + (100 + 20) * Math.tan(30 * DEG);
  const den = (120 * 3) / 10 + (0.1 * 100 * 5) / 10;
  near(assert, r.F, num / den, 1e-9);
});

test('bishop: I_NO_DRIVING when the driving moment is not positive', () => {
  const r = bishop([slice({ xm: 15, c: 10 })], { xc: 10, zc: 20, R: 10 }, OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_NO_DRIVING');
});

test('bishop: I_MALPHA when m_alpha < 0.2 at the end', () => {
  // steep adverse base: m_alpha = cos(a) (1 + tan(a) tan(phi) / F) < 0.2
  const s = slice({ alpha: -70 * DEG, phi: 40 * DEG, c: 0, W: 100, b: 2, xm: 0 });
  const r = bishop([s], { xc: 10, zc: 20, R: 5 }, OPTS); // converges to F = 3.53, m_alpha = 0.12
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_MALPHA');
});

test('bishop: I_NO_CONVERGENCE when maxIterations is too small', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  m.analysis.maxIterations = 1;
  const r = analyzeSurface(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  assert.equal(r.results.bishop.valid, false);
  assert.equal(r.results.bishop.code, 'I_NO_CONVERGENCE');
});

test('bishop: negative effective normal force is counted, not corrected', () => {
  const m = loadBenchmark('H2_handcalc_wet');
  m.materials.M1.c = 0;
  const r = analyzeSurface(m, m.surfaces[0]);
  const neg = r.slices.filter((s) => s.Nprime < 0).length;
  assert.equal(r.results.bishop.negativeN, neg);
});

// ------------------------------------------------------------ Janbu

test('janbu: one slice, alpha = 0, only the seismic force drives', () => {
  const s = slice({ c: 10, phi: 30 * DEG, W: 100, b: 2 });
  const circle = { xc: 0, zc: 10, R: 10 };
  const r = janbu([s], circle, [-3, 0], [3, 0], { ...OPTS, kh: 0.1 });
  const expected = (10 * 2 + 100 * Math.tan(30 * DEG)) / (0.1 * 100);
  assert.equal(r.valid, true);
  near(assert, r.F0, expected, 1e-9);
  assert.equal(r.b1, 0.5);
  near(assert, r.F, r.f0 * r.F0, 1e-12);
});

test('janbu: I_NO_DRIVING without driving force', () => {
  const r = janbu([slice({ c: 10 })], { xc: 0, zc: 10, R: 10 }, [-3, 0], [3, 0], OPTS);
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_NO_DRIVING');
});

test('janbuB1: only c 0.69, only phi 0.31, c and phi or mixed 0.50', () => {
  const c = slice({ c: 10, phi: 0 });
  const p = slice({ c: 0, phi: 30 * DEG });
  const cp = slice({ c: 5, phi: 30 * DEG });
  assert.equal(janbuB1([c, c]), 0.69);
  assert.equal(janbuB1([p, p]), 0.31);
  assert.equal(janbuB1([cp, cp]), 0.5);
  assert.equal(janbuB1([c, cp]), 0.5);
  assert.equal(janbuB1([c, p]), 0.5);
});

test('janbu: b1 follows the base materials (undrained = only c)', () => {
  const m = loadBenchmark('B4_undrained');
  const r = analyzeSurface(m, m.surfaces[0]);
  const types = new Set(r.slices.map((s) => `${s.c > 0}/${s.phi > 0}`));
  console.log(`B4 C1 base parameter types (c>0/phi>0): ${[...types].join(', ')}; b1 = ${r.results.janbuCorrected.b1}`);
  assert.ok([0.69, 0.31, 0.5].includes(r.results.janbuCorrected.b1));
});

test('chordAndSagitta: horizontal chord, inclined chord against dense sampling', () => {
  const c1 = chordAndSagitta({ xc: 0, zc: 0, R: 5 }, [-3, -4], [3, -4]);
  near(assert, c1.L, 6, 1e-12);
  near(assert, c1.d, 1, 1e-12);

  const circle = { xc: 0, zc: 0, R: 5 };
  const E = [-4, -3];
  const X = [3, -4];
  const c2 = chordAndSagitta(circle, E, X);
  near(assert, c2.L, Math.hypot(7, 1), 1e-12);
  // reference: largest perpendicular distance of the lower arc between E and X
  const L = Math.hypot(X[0] - E[0], X[1] - E[1]);
  let best = 0;
  for (let i = 0; i <= 200000; i++) {
    const x = E[0] + ((X[0] - E[0]) * i) / 200000;
    const z = -Math.sqrt(25 - x * x);
    best = Math.max(best, Math.abs(((x - E[0]) * (X[1] - E[1]) - (z - E[1]) * (X[0] - E[0])) / L));
  }
  near(assert, c2.d, best, 1e-4);
});

test('H1: Janbu correction f0 = 1 + b1 (d/L - 1.4 (d/L)^2), b1 = 0.5', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const j = analyzeSurface(m, m.surfaces[0]).results.janbuCorrected;
  near(assert, j.f0, 1 + 0.5 * (j.d / j.L - 1.4 * (j.d / j.L) ** 2), 1e-12);
});

// ------------------------------------------------------------ T1: closed form for phi = 0

test('T1 homogeneous, phi = 0: Bishop against the closed form of the circle segment (200 slices)', () => {
  const cu = 40;
  const gamma = 19;
  const m = {
    ground: [[-40, 40], [80, -20]], // straight line z = 20 - x / 2, falls to the right
    bottom: -30,
    layers: [{ material: 'U', top: null }],
    materials: { U: { name: '', gamma, gammaSat: gamma, model: 'undrained', cu } },
    water: null,
    loads: [],
    seismic: { kh: 0 },
    analysis: { mode: 'characteristic', methods: ['bishop'], direction: 'auto', slices: 200, tolerance: 1e-8, maxIterations: 200 },
  };
  const circle = { xc: 12, zc: 30, R: 18 };
  const r = analyzeSurface(m, circle);
  assert.equal(r.valid, true);

  // analytic segment between the ground line and the circle
  const nLen = Math.hypot(0.5, 1);
  const s = (0.5 * circle.xc + circle.zc - 20) / nLen; // distance centre - line
  const foot = [circle.xc - (s * 0.5) / nLen, circle.zc - (s * 1) / nLen];
  const half = Math.sqrt(circle.R ** 2 - s ** 2);
  const theta = 2 * Math.asin(half / circle.R);
  const area = (circle.R ** 2 * (theta - Math.sin(theta))) / 2;
  const dG = (4 * circle.R * Math.sin(theta / 2) ** 3) / (3 * (theta - Math.sin(theta))); // centre -> centroid
  const ux = (foot[0] - circle.xc) / s;
  const gx = circle.xc + dG * ux;
  const arm = circle.xc - gx;
  const F = (cu * circle.R * circle.R * theta) / (gamma * area * arm);

  const rel = Math.abs(r.results.bishop.F - F) / F;
  console.log(`T1: closed form ${F.toFixed(5)}, Bishop ${r.results.bishop.F.toFixed(5)}, deviation ${(rel * 100).toFixed(4)} %`);
  assert.ok(rel < 0.005, `deviation ${rel}`);
});

// ------------------------------------------------------------ T3: number of slices

for (const [label, make] of [
  ['B1 C1', () => { const m = loadBenchmark('B1_homogeneous'); return [m, m.surfaces[0]]; }],
  ['V03 circle', () => [loadBenchmark('V03_acads_1c'), { xc: 34.43, zc: 42.74, R: 18.35 }]],
  ['H2 C1 (water)', () => { const m = loadBenchmark('H2_handcalc_wet'); return [m, m.surfaces[0]]; }],
]) {
  test(`T3 slices 25 / 50 / 100 (${label}): difference 50 -> 100 < 0.5 %`, () => {
    const F = {};
    for (const n of [25, 50, 100]) {
      const [m, circle] = make();
      m.analysis.slices = n;
      const r = analyzeSurface(m, circle);
      assert.equal(r.valid, true);
      F[n] = r.results;
    }
    for (const method of ['bishop', 'janbu', 'janbuCorrected']) {
      const rel = Math.abs(F[100][method].F - F[50][method].F) / F[100][method].F;
      console.log(`T3 ${label} ${method}: 25 ${F[25][method].F.toFixed(4)}  50 ${F[50][method].F.toFixed(4)}  100 ${F[100][method].F.toFixed(4)}`);
      assert.ok(rel < 0.005, `${method}: ${rel}`);
    }
  });
}

// ------------------------------------------------------------ T4: sia against hand-reduced values

function reducedByHand(m) {
  const h = structuredClone(m);
  h.analysis.mode = 'characteristic';
  for (const mat of Object.values(h.materials)) {
    if (mat.model === 'drained') {
      mat.c = mat.c / 1.5;
      mat.phi = Math.atan(Math.tan(mat.phi * DEG) / 1.2) / DEG;
    } else {
      mat.cu = mat.cu / 1.5;
    }
  }
  h.loads = h.loads.map((l) => ({ ...l, q: l.type === 'Q' ? l.q * 1.3 : l.q * 1.0 }));
  return h;
}

for (const [label, make] of [
  ['V03 with loads G and Q', () => {
    const m = loadBenchmark('V03_acads_1c');
    m.loads = [{ x1: 40, x2: 43, q: 15, type: 'G' }, { x1: 44, x2: 49, q: 30, type: 'Q' }];
    m.seismic = { kh: 0.05 };
    return [m, { xc: 34.43, zc: 42.74, R: 18.35 }];
  }],
  ['B4 undrained', () => { const m = loadBenchmark('B4_undrained'); return [m, m.surfaces[0]]; }],
]) {
  test(`T4 mode sia against hand-reduced characteristic (${label})`, () => {
    const [m, circle] = make();
    m.analysis.mode = 'sia';
    delete m.partialFactors; // defaults of SPEC 2.2
    const a = analyzeSurface(m, circle);
    const b = analyzeSurface(reducedByHand(m), circle);
    assert.equal(a.valid, true);
    assert.equal(a.mode, 'sia');
    for (const method of ['bishop', 'janbu', 'janbuCorrected']) {
      near(assert, a.results[method].F, b.results[method].F, 5e-5, method);
    }
  });
}

// ------------------------------------------------------------ T5: water below the slip surface

test('T5 dry model against water line below the slip surface: F identical', () => {
  const dry = loadBenchmark('B1_homogeneous');
  const wet = loadBenchmark('B1_homogeneous');
  wet.water = [[0, 5], [130, 5]]; // lowest point of C1 is at z = 28
  const a = analyzeSurface(dry, dry.surfaces[0]);
  const b = analyzeSurface(wet, wet.surfaces[0]);
  for (const method of ['bishop', 'janbu', 'janbuCorrected']) {
    near(assert, a.results[method].F, b.results[method].F, 1e-12, method);
  }
});
