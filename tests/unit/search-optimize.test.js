// Search A (order 25, SPEC_ETAPPE4 5, 9): optimisation of the governing circle to a polyline. Small grids keep the tests fast.
// The reference values "without optimize" were taken from the core before order 25 (commit 837f8f0).

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface, validateModel } from '../../core/index.js';
import { governingOptimized } from '../../core/optimize.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const GRID = { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 3, nz: 3 };

/** Benchmark with a small search grid, all three methods, no single surfaces. */
function smallModel(name, optimize) {
  const m = loadBenchmark(name);
  m.surfaces = [];
  m.analysis.methods = ['bishop', 'janbu', 'spencer'];
  m.search = { grid: { ...GRID }, radii: 6 };
  if (optimize !== undefined) m.search.optimize = optimize;
  return m;
}

/** S1 (B1 with a nail, Spencer only) with a small grid around the circle SL2. */
function smallNailModel(optimize) {
  const m = loadBenchmark('S1_nail_head');
  m.surfaces = [];
  m.search = { grid: { xMin: 49, xMax: 51, zMin: 47, zMax: 49, nx: 2, nz: 2 }, radii: 4 };
  if (optimize !== undefined) m.search.optimize = optimize;
  return m;
}

const groundHeight = (ground, x) => {
  for (let i = 0; i < ground.length - 1; i++) {
    const [x0, z0] = ground[i];
    const [x1, z1] = ground[i + 1];
    if (x >= x0 && x <= x1 && x1 > x0) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return NaN;
};

const OPTIMIZED = ['janbu', 'janbuCorrected', 'spencer'];

// ------------------------------------------------------------ without optimize: as before

const BEFORE = {
  B3_two_layers: {
    bishop: [1.1408023176233817, 45.146484375, 73.18359375, 43.45538737601683],
    janbu: [1.068952929625346, 50.83984375, 62.998046875, 33.00863270952872],
    janbuCorrected: [1.1306742880756617, 48.75, 66.728515625, 36.749680407723105],
    spencer: [1.128806267912751, 45.771484375, 71.962890625, 42.175302001600194],
  },
  B6_seismic: {
    bishop: [0.9403370834630098, 38.515625, 84.27734375, 55.47891327255459],
    janbu: [0.8960374352051707, 45.830078125, 71.337890625, 41.54757682756843],
    janbuCorrected: [0.9379266356022993, 42.65625, 77.060546875, 47.62999275905907],
    spencer: [0.9409339745194241, 38.37890625, 84.462890625, 55.688824169685674],
  },
};

for (const [name, expected] of Object.entries(BEFORE)) {
  for (const optimize of [undefined, null]) {
    test(`without search.optimize (${optimize === null ? 'null' : 'missing'}) the search is as before: ${name}`, () => {
      const r = analyze(smallModel(name, optimize));
      assert.deepEqual(Object.keys(r), ['mode', 'warnings', 'warningDetails', 'critical', 'grid', 'counts', 'countsByMethod', 'refinementEvaluations', 'searchTimeMs', 'surfaces']);
      for (const [target, [F, xc, zc, R]] of Object.entries(expected)) {
        const c = r.critical[target];
        near(assert, c.F, F, 1e-9, `${target} F`);
        near(assert, c.xc, xc, 1e-9, `${target} xc`);
        near(assert, c.zc, zc, 1e-9, `${target} zc`);
        near(assert, c.R, R, 1e-9, `${target} R`);
        assert.equal('type' in c, false);
        assert.equal('points' in c, false);
        assert.equal('searchCircle' in c, false);
      }
      assert.equal('optimizeEvaluations' in r, false);
    });
  }
}

// ------------------------------------------------------------ with optimize

test('optimize B3: per target a polyline with F <= the circle; searchCircle = critical without optimize; bishop stays the circle', () => {
  const plain = analyze(smallModel('B3_two_layers'));
  const model = smallModel('B3_two_layers', { points: 11 });
  const opt = analyze(model);
  const cr = opt.critical;
  for (const target of OPTIMIZED) {
    const c = cr[target];
    const p = plain.critical[target];
    assert.equal(c.type, 'polyline', target);
    assert.ok(c.F <= p.F, `${target}: F ${c.F} must not exceed the circle ${p.F}`);
    assert.ok(c.F < p.F - 1e-6, `${target}: the optimisation lowers F here (${c.F} < ${p.F})`);
    // the circle before the optimisation: the same as `critical` without optimize
    assert.deepEqual(c.searchCircle, { F: p.F, xc: p.xc, zc: p.zc, R: p.R, entry: p.entry, exit: p.exit });
    assert.equal('xc' in c, false);
    assert.equal(c.points.length, 11);
    for (let i = 1; i < c.points.length; i++) assert.ok(c.points[i][0] > c.points[i - 1][0], `${target}: x strictly increasing at ${i}`);
    // entry and exit on the ground
    for (const q of [c.points[0], c.points[10]]) near(assert, q[1], groundHeight(model.ground, q[0]), 1e-9, `${target} end point on the ground`);
    assert.deepEqual(c.entry, c.points[10]);
    assert.deepEqual(c.exit, c.points[0]);
  }
  assert.deepEqual(cr.bishop, plain.critical.bishop);
  // fields of the methods as for a circle
  assert.ok(['theta', 'Fm', 'Ff', 'equilibrium', 'iterations'].every((k) => k in cr.spencer));
  assert.equal(typeof cr.spencer.equilibrium.moment, 'number');
  assert.ok(['F0', 'f0', 'b1', 'd', 'L', 'iterations'].every((k) => k in cr.janbu && k in cr.janbuCorrected));
  near(assert, cr.janbu.F, cr.janbu.F0, 1e-12, 'janbu F = F0');
  near(assert, cr.janbuCorrected.F, cr.janbuCorrected.f0 * cr.janbuCorrected.F0, 1e-9, 'janbuCorrected F = f0 F0');
  // grid phase and counters as without optimize; optimizeEvaluations counts the polylines of all targets
  assert.deepEqual(opt.grid, plain.grid);
  assert.deepEqual(opt.counts, plain.counts);
  assert.deepEqual(opt.countsByMethod, plain.countsByMethod);
  assert.deepEqual(opt.refinementEvaluations, plain.refinementEvaluations);
  assert.ok(Number.isInteger(opt.optimizeEvaluations) && opt.optimizeEvaluations > 3 * 11 * 2);
});

test('optimize: the number of points is taken from search.optimize.points, default 11 for { }', () => {
  // 9 points: the polyline beats the circle for every target here (with fewer points the circle may stay, see the end of this file)
  const nine = analyze(smallModel('B3_two_layers', { points: 9 }));
  assert.equal(nine.critical.spencer.points.length, 9);
  const dflt = analyze(smallModel('B3_two_layers', {}));
  assert.equal(dflt.critical.spencer.points.length, 11);
});

test('optimize: the optimised surface recalculated as a given polyline (analyzeSurface) gives the same F', () => {
  const model = smallModel('B3_two_layers', { points: 11 });
  const cr = analyze(model).critical;
  const r = analyzeSurface(model, { type: 'polyline', points: cr.spencer.points });
  assert.equal(r.valid, true);
  near(assert, r.results.spencer.F, cr.spencer.F, 1e-9, 'Spencer');
  const j = analyzeSurface(model, { type: 'polyline', points: cr.janbu.points });
  near(assert, j.results.janbu.F, cr.janbu.F, 1e-9, 'Janbu F0');
  const jc = analyzeSurface(model, { type: 'polyline', points: cr.janbuCorrected.points });
  near(assert, jc.results.janbuCorrected.F, cr.janbuCorrected.F, 1e-9, 'Janbu corrected');
});

test('optimize with supports: only Spencer is searched and optimised, the support output belongs to the polyline', () => {
  const plain = analyze(smallNailModel());
  const model = smallNailModel({ points: 11 });
  const opt = analyze(model);
  assert.deepEqual(Object.keys(opt.critical), ['spencer']);
  const c = opt.critical.spencer;
  assert.equal(c.type, 'polyline');
  assert.ok(c.F <= plain.critical.spencer.F);
  assert.equal(c.searchCircle.F, plain.critical.spencer.F);
  assert.equal(c.points.length, 11);
  assert.ok(c.supports, 'support output');
  const r = analyzeSurface(model, { type: 'polyline', points: c.points });
  near(assert, r.results.spencer.F, c.F, 1e-9, 'Spencer at the optimised polyline with the nail');
});

// ------------------------------------------------------------ input

test('E_SEARCH_INVALID: search.optimize.points 2, 2.5, "11", negative, not an object; valid: missing, null, { }, 3', () => {
  const codes = (optimize) => {
    const m = smallModel('B3_two_layers', optimize);
    return validateModel(m).errors.filter((e) => e.code === 'E_SEARCH_INVALID' && e.path === 'search.optimize');
  };
  for (const bad of [{ points: 2 }, { points: 2.5 }, { points: '11' }, { points: -3 }, { points: 0 }, { points: null }, { points: NaN }, true, 11, 'x', [11]]) {
    assert.equal(codes(bad).length, 1, JSON.stringify(bad));
    assert.equal(validateModel(smallModel('B3_two_layers', bad)).valid, false);
  }
  for (const good of [undefined, null, {}, { points: 3 }, { points: 11 }, { points: 40 }]) {
    assert.equal(codes(good).length, 0, JSON.stringify(good));
    assert.equal(validateModel(smallModel('B3_two_layers', good)).valid, true);
  }
});

// ------------------------------------------------------------ progress

test('progress: phase optimize exactly once after refine, with done 0 and total 0; none without optimize', () => {
  const phases = (model) => {
    const messages = [];
    analyze(model, { onProgress: (p) => messages.push({ ...p }) });
    return messages;
  };
  const withOpt = phases(smallModel('B3_two_layers', { points: 5 }));
  const names = withOpt.map((p) => p.phase);
  assert.equal(names.filter((n) => n === 'optimize').length, 1);
  assert.equal(names.filter((n) => n === 'refine').length, 1);
  assert.ok(names.indexOf('optimize') > names.indexOf('refine'));
  assert.deepEqual(withOpt.find((p) => p.phase === 'optimize'), { phase: 'optimize', done: 0, total: 0 });
  // the result does not depend on the callback
  const a = analyze(smallModel('B3_two_layers', { points: 5 }));
  const b = analyze(smallModel('B3_two_layers', { points: 5 }), { onProgress: () => {} });
  assert.deepEqual({ ...a, searchTimeMs: 0 }, { ...b, searchTimeMs: 0 });
  for (const optimize of [undefined, null]) {
    assert.equal(phases(smallModel('B3_two_layers', optimize)).filter((p) => p.phase === 'optimize').length, 0);
  }
  // Bishop only: nothing is optimised, no message
  const bishopOnly = smallModel('B3_two_layers', { points: 5 });
  bishopOnly.analysis.methods = ['bishop'];
  assert.equal(phases(bishopOnly).filter((p) => p.phase === 'optimize').length, 0);
});

// ------------------------------------------------------------ mirrored model, sia, warning

test('mirrored model (B3 mirrored): same F (analysis.tolerance), mirrored points, in the input frame with x increasing', () => {
  const model = smallModel('B3_two_layers', { points: 11 });
  const mirrored = mirrorModelForTest(model);
  mirrored.search.grid = { ...GRID, xMin: -GRID.xMax, xMax: -GRID.xMin };
  const a = analyze(model).critical;
  const b = analyze(mirrored).critical;
  for (const target of OPTIMIZED) {
    near(assert, b[target].F, a[target].F, model.analysis.tolerance, `${target} F`);
    assert.equal(b[target].points.length, 11);
    for (let i = 1; i < 11; i++) assert.ok(b[target].points[i][0] > b[target].points[i - 1][0], `${target} x increasing`);
    const back = a[target].points.map(([x, z]) => [-x, z]).reverse();
    for (let i = 0; i < 11; i++) {
      near(assert, b[target].points[i][0], back[i][0], 1e-6, `${target} x ${i}`);
      near(assert, b[target].points[i][1], back[i][1], 1e-6, `${target} z ${i}`);
    }
    near(assert, b[target].searchCircle.xc, -a[target].searchCircle.xc, 1e-9, `${target} circle xc mirrored`);
  }
});

test('mode sia: the check takes F of the optimised surface', () => {
  const model = smallModel('B3_two_layers', { points: 11 });
  model.analysis.mode = 'sia';
  const r = analyze(model);
  for (const method of ['janbuCorrected', 'spencer']) {
    assert.equal(r.check[method].F, r.critical[method].F, method);
    assert.equal(r.critical[method].type, 'polyline');
  }
  assert.equal(r.check.bishop.F, r.critical.bishop.F);
  assert.equal('type' in r.critical.bishop, false);
});

test('W_MIN_AT_BOTTOM is checked at the optimised surface (lowest point of the polyline)', () => {
  const nearBottom = smallModel('B3_two_layers', { points: 11 });
  nearBottom.bottom = 29.995; // the toe of the slope lies at z = 30: every surface ends less than 0.01 m above the bottom
  const r = analyze(nearBottom);
  const at = (target) => r.warningDetails.filter((w) => w.code === 'W_MIN_AT_BOTTOM' && w.method === target).length;
  for (const target of OPTIMIZED) {
    assert.equal(at(target), 1, target);
    const zMin = Math.min(...r.critical[target].points.map((p) => p[1]));
    assert.ok(zMin - 29.995 < 0.01 && zMin >= 29.995, `${target} lowest point ${zMin}`);
  }
  const deep = smallModel('B3_two_layers', { points: 11 });
  deep.bottom = 20;
  assert.equal(analyze(deep).warningDetails.filter((w) => w.code === 'W_MIN_AT_BOTTOM').length, 0);
});

// ------------------------------------------------------------ the smaller F governs (SPEC_ETAPPE4 5, after the report of order 25)

test('governingOptimized: the optimised surface only if its F is smaller than the circle; else null (the circle stays)', () => {
  const opt = { F: 1.1, points: [] };
  assert.equal(governingOptimized(1.2, opt), opt);
  assert.equal(governingOptimized(1.1, opt), null, 'equal F: the circle stays');
  assert.equal(governingOptimized(1.0, opt), null);
  assert.equal(governingOptimized(1.0, null), null, 'no optimisation possible');
});

test('3 points: the chord polyline cannot beat the circle, the circle stays the result of the target (critical as without optimize)', () => {
  const plain = analyze(smallModel('B3_two_layers'));
  const model = smallModel('B3_two_layers', { points: 3 });
  const r = analyze(model);
  for (const target of OPTIMIZED) {
    assert.deepEqual(r.critical[target], plain.critical[target], target); // no type, no points, no searchCircle
  }
  assert.ok(r.optimizeEvaluations > 0, 'the polylines count even though the circle stays');
  // an optimised target next to it would still be a polyline: 11 points beat the circle here
  assert.equal(analyze(smallModel('B3_two_layers', { points: 11 })).critical.spencer.type, 'polyline');
  // W_MIN_AT_BOTTOM at the circle
  const nearBottom = smallModel('B3_two_layers', { points: 3 });
  nearBottom.bottom = 29.995;
  const w = analyze(nearBottom).warningDetails.filter((x) => x.code === 'W_MIN_AT_BOTTOM');
  assert.deepEqual(w.map((x) => x.method).sort(), ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
});
