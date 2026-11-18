// Spencer for general slip surfaces (order 24, SPEC_ETAPPE4 4.2, 4.2.1, 4.3): the moment point does not change F, a circle as
// a polyline approaches the circle value, the independent final check works with the general moment.

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPartialFactors } from '../../core/factors.js';
import { circleToCore, normalizeModel } from '../../core/model.js';
import { buildSlicesNormalized, buildSlicesPolylineNormalized, toInputFrame, buildSlices } from '../../core/slices.js';
import { polylineToCore } from '../../core/polyline.js';
import { spencer, spencerEquilibrium } from '../../core/spencer.js';
import { evaluateSupports, withSupportSums } from '../../core/supports.js';
import { loadBenchmark, near } from './helpers.js';

const PL1 = [[45, 30], [55, 28], [70, 32], [85, 40], [97.5, 50]];

/** Model in the calculation frame, slices and solver options for a polyline given in the input frame. */
function polylineCase(model, points) {
  const info = normalizeModel(applyPartialFactors(model));
  const m = info.model;
  const g = buildSlicesPolylineNormalized(m, polylineToCore(points, info));
  const opts = { kh: m.seismic && m.seismic.kh ? m.seismic.kh : 0, tolerance: m.analysis.tolerance, maxIterations: m.analysis.maxIterations };
  return { info, m, g, opts };
}

/** Spencer with the moment point `pivot` (calculation frame); the support forces take their moments about the same point. */
function spencerAt({ m, g, opts }, pivot) {
  const slices = m.supports && m.supports.length
    ? withSupportSums(g.slices, evaluateSupports(m, g), { xc: pivot[0], zc: pivot[1] })
    : g.slices;
  return spencer(slices, { pivot }, opts);
}

/** Moment points above the ground around the slip body (calculation frame, x of the body between -97.5 and -45, z 28 to 50). */
const pivotsAround = (g) => [
  g.pivot,
  [g.pivot[0] + 20, g.pivot[1] + 20],
  [g.pivot[0] - 25, g.pivot[1] + 40],
  [g.pivot[0] + 40, g.pivot[1] + 5],
  [g.pivot[0] - 5, g.pivot[1] + 70],
];

// ------------------------------------------------------------ the moment point does not change F (SPEC_ETAPPE4 4.2)

test('moment point moved (5 points): same F without supports, tolerance analysis.tolerance (N1, B3, PL1)', () => {
  const c = polylineCase(loadBenchmark('B3_two_layers'), PL1);
  assert.equal(c.g.valid, true);
  const tol = c.m.analysis.tolerance;
  const results = pivotsAround(c.g).map((p) => spencerAt(c, p));
  for (const r of results) assert.equal(r.valid, true, r.message);
  const [ref, ...others] = results;
  near(assert, ref.F, 1.41943, 0.005, 'Slide2 value N1');
  for (const r of others) {
    near(assert, r.F, ref.F, tol, 'F at a moved moment point');
    near(assert, r.theta, ref.theta, 0.05, 'theta at a moved moment point');
  }
  console.log('F at 5 moment points (N1):', results.map((r) => r.F.toFixed(7)).join(' '));
});

test('moment point moved (5 points): same F with a support, tolerance analysis.tolerance (SL2 of S1 as a polyline of 80 points, nail)', () => {
  const model = loadBenchmark('S1_nail_head');
  const circle = model.surfaces[0];
  const { points } = arcPolyline(circle, buildSlices(model, circle), 79);
  const c = polylineCase(model, points);
  assert.equal(c.g.valid, true);
  assert.equal(c.m.supports.length, 1);
  assert.equal(evaluateSupports(c.m, c.g)[0].intersects, true);
  const tol = c.m.analysis.tolerance;
  const results = pivotsAround(c.g).map((p) => spencerAt(c, p));
  for (const r of results) assert.equal(r.valid, true, r.message);
  const [ref, ...others] = results;
  for (const r of others) near(assert, r.F, ref.F, tol, 'F at a moved moment point');
  console.log('F at 5 moment points (N3):', results.map((r) => r.F.toFixed(7)).join(' '));
});

test('moment point moved: also with water (B2) and with the horizontal earthquake force (B6) on PL1', () => {
  for (const file of ['B2_water', 'B6_seismic']) {
    const c = polylineCase(loadBenchmark(file), PL1);
    assert.equal(c.g.valid, true, c.g.message);
    const results = pivotsAround(c.g).map((p) => spencerAt(c, p));
    for (const r of results) assert.equal(r.valid, true, `${file}: ${r.message}`);
    for (const r of results.slice(1)) near(assert, r.F, results[0].F, c.m.analysis.tolerance, `${file}: F at a moved moment point`);
    console.log(`${file} PL1: F at 5 moment points`, results.map((r) => r.F.toFixed(7)).join(' '));
  }
});

// ------------------------------------------------------------ circle: formula 4.2.1 with the moment point at the centre

test('circle slices, moment point at the centre: 4.2.1 gives the values of the pre-check (B1 1.507439, B3 1.412271, B6 1.218498)', () => {
  for (const [file, expected] of [['B1_homogeneous', 1.507439], ['B3_two_layers', 1.412271], ['B6_seismic', 1.218498]]) {
    const model = loadBenchmark(file);
    const circle = model.surfaces.find((s) => s.id === 'C1');
    const info = normalizeModel(applyPartialFactors(model));
    const g = buildSlicesNormalized(info.model, circleToCore(circle, info));
    assert.equal(g.valid, true);
    const opts = { kh: info.model.seismic.kh || 0, tolerance: info.model.analysis.tolerance, maxIterations: info.model.analysis.maxIterations };
    const centre = [g.circle.xc, g.circle.zc];
    const general = spencer(g.slices, { pivot: centre }, opts);
    const formula = spencer(g.slices, g.circle, opts); // formula of SPEC.md 9.3 for the circle (unchanged)
    near(assert, general.F, expected, 2e-6, `${file} 4.2.1`);
    // The circle formula takes N and T on the arc, 4.2.1 on the chord: every lever arm of the shear force is shorter by the
    // factor cos(d/2) (d = angle of the chord at the centre), so that F differs by at most a small multiple of 1 - cos(d/2).
    const eps = Math.max(...g.slices.map((s) => 1 - Math.cos(Math.asin(s.l / (2 * g.circle.R)))));
    const diff = formula.F - general.F;
    assert.ok(diff > 0 && diff < 4 * formula.F * eps, `${file}: circle formula ${formula.F}, 4.2.1 ${general.F}, 4 F eps = ${4 * formula.F * eps}`);
    console.log(`${file} C1: circle formula ${formula.F.toFixed(6)}, 4.2.1 at the centre ${general.F.toFixed(6)}, 4 F (1 - cos(d/2)) = ${(4 * formula.F * eps).toExponential(2)}`);
  }
});

/** The lower arc between the ends of a circle result as a polyline of n + 1 points (input frame, x ascending). */
function arcPolyline(circle, result, n) {
  const pts = [toInputFrame(result).entry, toInputFrame(result).exit].sort((a, b) => a[0] - b[0]);
  const a0 = Math.atan2(pts[0][1] - circle.zc, pts[0][0] - circle.xc);
  const a1 = Math.atan2(pts[1][1] - circle.zc, pts[1][0] - circle.xc);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([circle.xc + circle.R * Math.cos(a), circle.zc + circle.R * Math.sin(a)]);
  }
  out[0] = pts[0];
  out[n] = pts[1];
  return { points: out, step: (a1 - a0) / n };
}

test('circle as a polyline of 200 points, moment point at the centre: F near the circle value, tolerance from the chord error', () => {
  for (const file of ['B1_homogeneous', 'B3_two_layers', 'B6_seismic']) {
    const model = loadBenchmark(file);
    model.analysis.slices = 400; // fine slices of the circle: its own chord error is then small too
    const circle = model.surfaces.find((s) => s.id === 'C1');
    const reference = buildSlices(model, circle);
    const info = normalizeModel(applyPartialFactors(model));
    const opts = { kh: info.model.seismic.kh || 0, tolerance: info.model.analysis.tolerance, maxIterations: info.model.analysis.maxIterations };
    const exact = spencer(reference.slices, reference.circle, opts);
    const { points, step } = arcPolyline(circle, reference, 200);
    const c = polylineCase(model, points);
    assert.equal(c.g.valid, true, c.g.message);
    const centre = [reference.circle.xc, reference.circle.zc];
    const poly = spencerAt(c, centre);
    // chord error of the polyline: sagitta R (1 - cos(step / 2)); the slices of the circle have the sagitta of their chords
    const epsPoly = 1 - Math.cos(Math.abs(step) / 2);
    const epsSlices = Math.max(...reference.slices.map((s) => 1 - Math.cos(Math.asin(s.l / (2 * circle.R)))));
    const tol = 4 * exact.F * Math.max(epsPoly, epsSlices);
    assert.ok(Math.abs(poly.F - exact.F) <= tol, `${file}: polyline ${poly.F}, circle ${exact.F}, tolerance ${tol}`);
    console.log(`${file}: circle (400 slices) ${exact.F.toFixed(6)}, polyline 200 points ${poly.F.toFixed(6)}, dF ${(poly.F - exact.F).toExponential(2)}, tolerance ${tol.toExponential(2)}`);
  }
});

// ------------------------------------------------------------ independent final check (SPEC.md 9.5, general moment)

test('final check with the general moment: accepts the solution, rejects a F that is 1 % off, reports the moment residual', () => {
  const c = polylineCase(loadBenchmark('B3_two_layers'), PL1);
  const r = spencerAt(c, c.g.pivot);
  assert.equal(r.valid, true);
  const eq = r.equilibrium;
  assert.equal(eq.valid, true);
  assert.ok(eq.momentResidual <= c.m.analysis.tolerance && eq.forceResidual <= c.m.analysis.tolerance && eq.sliceResidual <= c.m.analysis.tolerance);
  assert.equal(typeof eq.moment, 'number'); // the moment itself (kN m per metre) instead of momentOverR
  assert.equal('momentOverR' in eq, false);
  const off = spencerEquilibrium(c.g.slices, { pivot: c.g.pivot }, r.F * 1.01, r.theta, c.opts);
  assert.equal(off.valid, false);
  assert.equal(off.reason, 'equilibrium_residual');
  // the same equilibrium holds about another moment point (N is not through the centre, the lever arms change with the point)
  const other = spencerEquilibrium(c.g.slices, { pivot: [c.g.pivot[0] + 20, c.g.pivot[1] + 20] }, r.F, r.theta, c.opts);
  assert.equal(other.valid, true, other.reason);
  // theta of the solution makes the interslice forces consistent: Fm = Ff
  near(assert, r.Fm, r.Ff, c.m.analysis.tolerance);
});

test('circle unchanged: the circle formula (SPEC.md 9.3) still has the keys momentOverR and no pivot', () => {
  const model = loadBenchmark('B1_homogeneous');
  const circle = model.surfaces.find((s) => s.id === 'C1');
  const info = normalizeModel(applyPartialFactors(model));
  const g = buildSlicesNormalized(info.model, circleToCore(circle, info));
  const r = spencer(g.slices, g.circle, { kh: 0, tolerance: info.model.analysis.tolerance, maxIterations: info.model.analysis.maxIterations });
  assert.equal(r.valid, true);
  assert.equal(typeof r.equilibrium.momentOverR, 'number');
  assert.equal('moment' in r.equilibrium, false);
  near(assert, r.F, 1.507579, 1e-6, 'F of C1 in B1 (circle formula)');
});
