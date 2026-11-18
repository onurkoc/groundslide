// Spencer method (SPEC 9): mandatory test F_m(theta = 0) = Bishop, convergence of the
// solution, mirrored model, limit cases of 9.5.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSurface } from '../../core/index.js';
import { bishop } from '../../core/bishop.js';
import { spencer, spencerForTheta } from '../../core/spencer.js';
import { buildSlices } from '../../core/slices.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const TIGHT = { kh: 0, tolerance: 1e-10, maxIterations: 1000 };

// ------------------------------------------------------------ SPEC 9.3: F_m(0) = Bishop

for (const [label, make] of [
  ['H1 C1 (7 slices)', () => { const m = loadBenchmark('H1_handcalc_dry'); return [m, m.surfaces[0]]; }],
  ['H2 C1 (7 slices, water)', () => { const m = loadBenchmark('H2_handcalc_wet'); return [m, m.surfaces[0]]; }],
  ['B6 C1 (seismic)', () => { const m = loadBenchmark('B6_seismic'); return [m, m.surfaces[0]]; }],
  ['B5 C1 (surcharge)', () => { const m = loadBenchmark('B5_surcharge'); return [m, m.surfaces[0]]; }],
  ['V03 circle (three layers)', () => [loadBenchmark('V03_acads_1c'), { xc: 34.43, zc: 42.74, R: 18.35 }]],
]) {
  test(`F_m(theta = 0) equals Bishop, tolerance 1e-6 (${label})`, () => {
    const [m, circle] = make();
    const g = buildSlices(m, circle);
    assert.equal(g.valid, true);
    const opts = { ...TIGHT, kh: m.seismic.kh };
    const b = bishop(g.slices, g.circle, opts);
    const sp = spencerForTheta(g.slices, g.circle, 0, opts);
    assert.equal(b.valid, true);
    assert.equal(sp.valid, true);
    console.log(`F_m(0) ${label}: Bishop ${b.F.toFixed(8)}  Spencer ${sp.Fm.toFixed(8)}`);
    near(assert, sp.Fm, b.F, 1e-6, 'F_m(0) - Bishop');
  });
}

// ------------------------------------------------------------ solution

for (const [label, make] of [
  ['H1 C1', () => { const m = loadBenchmark('H1_handcalc_dry'); return [m, m.surfaces[0]]; }],
  ['H2 C1', () => { const m = loadBenchmark('H2_handcalc_wet'); return [m, m.surfaces[0]]; }],
  ['B1 C1', () => { const m = loadBenchmark('B1_homogeneous'); return [m, m.surfaces[0]]; }],
  ['B6 C1 (seismic)', () => { const m = loadBenchmark('B6_seismic'); return [m, m.surfaces[0]]; }],
  ['V03 circle', () => [loadBenchmark('V03_acads_1c'), { xc: 34.43, zc: 42.74, R: 18.35 }]],
]) {
  test(`solution: |F_m - F_f| < 1e-4 at theta (${label})`, () => {
    const [m, circle] = make();
    m.analysis.methods = ['bishop', 'spencer'];
    const r = analyzeSurface(m, circle);
    assert.equal(r.valid, true);
    const sp = r.results.spencer;
    assert.equal(sp.valid, true, sp.message);
    console.log(`${label}: F=${sp.F.toFixed(5)} theta=${sp.theta.toFixed(3)} deg  F_m-F_f=${(sp.Fm - sp.Ff).toExponential(2)}  Bishop ${r.results.bishop.F.toFixed(5)}`);
    assert.ok(Math.abs(sp.Fm - sp.Ff) < 1e-4, `F_m - F_f = ${sp.Fm - sp.Ff}`);
    assert.equal(sp.F, sp.Fm);
    assert.ok(sp.theta > 0 && sp.theta < 60);
  });
}

test('solution: theta bisected to 0.001 degrees (sign change of g around theta)', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const g = buildSlices(m, m.surfaces[0]);
  const opts = { kh: 0, tolerance: 1e-9, maxIterations: 500 };
  const sp = spencer(g.slices, g.circle, opts);
  assert.equal(sp.valid, true);
  const lo = spencerForTheta(g.slices, g.circle, sp.theta - 0.001, opts);
  const hi = spencerForTheta(g.slices, g.circle, sp.theta + 0.001, opts);
  assert.ok((lo.Fm - lo.Ff) * (hi.Fm - hi.Ff) <= 0, 'sign change around theta');
});

// ------------------------------------------------------------ mirrored model

test('mirrored model gives the same F and the same theta', () => {
  const a = loadBenchmark('V03_acads_1c');
  a.analysis.methods = ['spencer'];
  const b = mirrorModelForTest(a);
  const circle = { xc: 34.43, zc: 42.74, R: 18.35 };
  const ra = analyzeSurface(a, circle).results.spencer;
  const rb = analyzeSurface(b, { ...circle, xc: -circle.xc }).results.spencer;
  assert.equal(ra.valid, true);
  near(assert, ra.F, rb.F, 5e-5, 'F');
  near(assert, ra.theta, rb.theta, 2e-3, 'theta');
});

// ------------------------------------------------------------ limit cases (SPEC 9.5)

test('I_NO_THETA: natural case from the V04 search grid (no sign change in either theta range)', () => {
  // circle of the V04 search grid (xc 45, zc 49): shallow, Bishop F = 1.498
  const m = loadBenchmark('V04_acads_1d');
  const r = analyzeSurface(m, { xc: 45, zc: 49, R: 14.966068747318506 });
  assert.equal(r.valid, true);
  assert.equal(r.results.bishop.valid, true);
  assert.equal(r.results.spencer.valid, false);
  assert.equal(r.results.spencer.code, 'I_NO_THETA');
});

test('negative theta fallback: V01 circle with no positive sign change is solved', () => {
  // This grid circle returned I_NO_THETA at 7a78978.
  const m = loadBenchmark('V01_acads_1a');
  const circle = { xc: 43.7, zc: 60.57, R: 26.434671063068173 };
  const g = buildSlices(m, circle);
  assert.equal(g.valid, true);
  const opts = { kh: 0, tolerance: m.analysis.tolerance, maxIterations: m.analysis.maxIterations };
  let previous = null;
  for (let theta = 0; theta <= 60; theta += 2.5) {
    const r = spencerForTheta(g.slices, g.circle, theta, opts);
    assert.equal(r.valid, true, r.message);
    const difference = r.Fm - r.Ff;
    assert.notEqual(difference, 0);
    if (previous !== null) assert.ok(previous * difference > 0, 'no positive sign change');
    previous = difference;
  }
  const result = spencer(g.slices, g.circle, opts);
  assert.equal(result.valid, true, result.message);
  near(assert, result.theta, -3.0325, 0.001, 'negative theta');
  near(assert, result.F, 13.8961631, 1e-5, 'F');
  assert.ok(Math.abs(result.Fm - result.Ff) < 1e-4);
  const lo = spencerForTheta(g.slices, g.circle, result.theta - 0.001, opts);
  const hi = spencerForTheta(g.slices, g.circle, result.theta + 0.001, opts);
  assert.equal(lo.valid, true);
  assert.equal(hi.valid, true);
  assert.ok((lo.Fm - lo.Ff) * (hi.Fm - hi.Ff) <= 0, 'negative solution brackets the root');

  const mirrored = mirrorModelForTest(m);
  const other = analyzeSurface(mirrored, { ...circle, xc: -circle.xc }).results.spencer;
  assert.equal(other.valid, true);
  near(assert, other.F, result.F, 1e-9, 'mirrored F');
  near(assert, other.theta, result.theta, 1e-9, 'mirrored theta');
});

test('I_MALPHA: natural case from the V24 search grid', () => {
  const m = loadBenchmark('V24_low_undrained');
  m.analysis.methods = ['bishop', 'spencer'];
  const r = analyzeSurface(m, { xc: 20, zc: 14, R: 9.366666666666667 });
  assert.equal(r.valid, true);
  assert.equal(r.results.spencer.valid, false);
  assert.equal(r.results.spencer.code, 'I_MALPHA');
  assert.equal(r.results.bishop.code, 'I_MALPHA');
});

test('I_NO_CONVERGENCE when maxIterations is too small', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  m.analysis.methods = ['spencer'];
  m.analysis.maxIterations = 2;
  const r = analyzeSurface(m, m.surfaces[0]);
  assert.equal(r.results.spencer.valid, false);
  assert.equal(r.results.spencer.code, 'I_NO_CONVERGENCE');
});
