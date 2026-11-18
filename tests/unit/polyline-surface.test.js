// Polyline as a single surface through the public functions (order 24, SPEC_ETAPPE4 3.1, 4.4, 4.5, 9): analyze() and
// analyzeSurface() with `type: "polyline"`, Janbu against a hand calculation (wedge of two straight pieces), Bishop gets
// I_NONCIRCULAR, the mirrored model, the nail at PL1, output fields.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface, validateModel } from '../../core/index.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const PL1 = [[45, 30], [55, 28], [70, 32], [85, 40], [97.5, 50]];
const mirrorPoints = (pts) => pts.map(([x, z]) => [-x, z]).reverse();
const withMethods = (model, methods = ['bishop', 'janbu', 'spencer']) => ({ ...structuredClone(model), analysis: { ...model.analysis, methods } });

// ------------------------------------------------------------ N1 values through analyzeSurface

test('N1: PL1 in B3 gives the Slide2 values (Spencer 1.41943, Janbu 1.35509, Janbu corrected 1.42502), tolerance 0.005', () => {
  const r = analyzeSurface(withMethods(loadBenchmark('B3_two_layers')), { type: 'polyline', points: PL1 });
  assert.equal(r.valid, true);
  near(assert, r.results.spencer.F, 1.41943, 0.005, 'Spencer');
  near(assert, r.results.janbu.F, 1.35509, 0.005, 'Janbu simplified');
  near(assert, r.results.janbuCorrected.F, 1.42502, 0.005, 'Janbu corrected');
  console.log(`N1: Spencer ${r.results.spencer.F.toFixed(5)} (1.41943), Janbu ${r.results.janbu.F.toFixed(5)} (1.35509), Janbu corrected ${r.results.janbuCorrected.F.toFixed(5)} (1.42502)`);
});

// ------------------------------------------------------------ Bishop: I_NONCIRCULAR (SPEC_ETAPPE4 4.4)

test('Bishop for a polyline: no result, code I_NONCIRCULAR with text; Janbu and Spencer calculate; circles keep Bishop', () => {
  const model = withMethods(loadBenchmark('B3_two_layers'));
  const r = analyzeSurface(model, { type: 'polyline', points: PL1 });
  assert.equal(r.results.bishop.valid, false);
  assert.equal(r.results.bishop.code, 'I_NONCIRCULAR');
  assert.equal(typeof r.results.bishop.message, 'string');
  assert.ok(r.results.bishop.message.length > 10);
  assert.equal('F' in r.results.bishop, false);
  assert.equal(r.results.janbu.valid && r.results.spencer.valid, true);
  const c = analyzeSurface(model, { xc: 50, zc: 80, R: 52 });
  assert.equal(c.results.bishop.valid, true);
});

test('with supports only Spencer: a polyline gets Bishop I_NONCIRCULAR and Janbu I_SUPPORT_SPENCER_ONLY', () => {
  const model = withMethods(loadBenchmark('S1_nail_head'));
  const r = analyzeSurface(model, { type: 'polyline', points: PL1 });
  assert.equal(r.valid, true);
  assert.equal(r.results.bishop.code, 'I_NONCIRCULAR');
  assert.equal(r.results.janbu.code, 'I_SUPPORT_SPENCER_ONLY');
  assert.equal(r.results.janbuCorrected.code, 'I_SUPPORT_SPENCER_ONLY');
  assert.equal(r.results.spencer.valid, true);
  assert.equal(r.supports.length, 1);
});

// ------------------------------------------------------------ nail at PL1 (SPEC_ETAPPE4 4.5; control values of the Slide2 comparison)

test('nail of S1 at PL1 in B1: intersection (72.73 / 33.46), 9.76 m in front, 5.24 m behind, pull-out at the back governs: 5.24 * 50 = 262 kN', () => {
  const r = analyzeSurface(loadBenchmark('S1_nail_head'), { type: 'polyline', points: PL1 });
  assert.equal(r.valid, true);
  const s = r.supports[0];
  assert.equal(s.intersects, true);
  near(assert, s.point[0], 72.73, 0.005);
  near(assert, s.point[1], 33.46, 0.005);
  assert.equal(s.governs, 'pulloutBack');
  near(assert, s.T, 262, 0.1);
  const head = [66.7124382544835, 41.141625502989];
  const front = Math.hypot(s.point[0] - head[0], s.point[1] - head[1]);
  near(assert, front, 9.76, 0.005, 'length in front');
  near(assert, 15 - front, 5.24, 0.005, 'length behind');
  assert.equal(r.type, 'polyline');
  // passive: applied = T / F (SPEC_ETAPPE3 4.1)
  near(assert, s.applied, s.perMetre / r.results.spencer.F, 1e-9);
});

// ------------------------------------------------------------ wedge of two straight pieces: Janbu against a hand calculation

test('wedge of two straight pieces: Janbu simplified and corrected against the hand calculation (force equilibrium, one slice per piece)', () => {
  const model = {
    meta: { name: 'wedge', units: 'SI' },
    ground: [[0, 10], [10, 10], [25, 0], [40, 0]],
    bottom: -10,
    layers: [{ material: 'M1', top: null }],
    materials: { M1: { name: 'Soil', gamma: 19, gammaSat: 20, model: 'drained', c: 5, phi: 30 } },
    water: null,
    loads: [],
    seismic: { kh: 0 },
    analysis: { mode: 'characteristic', methods: ['janbu', 'spencer'], direction: 'right', slices: 50, tolerance: 1e-10, maxIterations: 200 },
  };
  const points = [[5, 10], [12, 3], [25, 0]];
  const r = analyzeSurface(model, { type: 'polyline', points });
  assert.equal(r.valid, true, r.message);

  // hand calculation: two pieces; the area between the ground and the piece is exact (both are linear between the breakpoints)
  const ground = (x) => (x <= 10 ? 10 : 10 - ((x - 10) * 10) / 15);
  const surface = (x) => (x <= 12 ? 10 - (x - 5) : 3 - ((x - 12) * 3) / 13);
  const area = (xs) => {
    let a = 0;
    for (let i = 0; i < xs.length - 1; i++) a += ((ground(xs[i]) - surface(xs[i]) + ground(xs[i + 1]) - surface(xs[i + 1])) * (xs[i + 1] - xs[i])) / 2;
    return a;
  };
  const pieces = [
    { b: 7, alpha: Math.atan2(7, 7), W: 19 * area([5, 10, 12]) },
    { b: 13, alpha: Math.atan2(3, 13), W: 19 * area([12, 25]) },
  ];
  near(assert, pieces[0].W / 19, 23.1666666667, 1e-9, 'area of the first piece');
  near(assert, pieces[1].W / 19, 36.8333333333, 1e-9, 'area of the second piece');
  const tanPhi = Math.tan((30 * Math.PI) / 180);
  const den = pieces.reduce((s, p) => s + p.W * Math.tan(p.alpha), 0);
  let F = 1;
  for (let it = 0; it < 200; it++) {
    let num = 0;
    for (const p of pieces) {
      const m = Math.cos(p.alpha) * (1 + (Math.tan(p.alpha) * tanPhi) / F);
      num += (5 * p.b + p.W * tanPhi) / (Math.cos(p.alpha) * m);
    }
    const next = num / den;
    if (Math.abs(next - F) < 1e-14) { F = next; break; }
    F = next;
  }
  near(assert, r.results.janbu.F, F, 1e-8, 'Janbu simplified');
  // correction: L = chord entry - exit, d = largest distance of the polyline from it (the vertex), b1 = 0.5 (c and phi)
  const L = Math.hypot(20, 10);
  const d = Math.abs(20 * -7 - -10 * 7) / L;
  const f0 = 1 + 0.5 * (d / L - 1.4 * (d / L) ** 2);
  near(assert, r.results.janbuCorrected.L, L, 1e-12, 'L');
  near(assert, r.results.janbuCorrected.d, d, 1e-12, 'd');
  near(assert, r.results.janbuCorrected.f0, f0, 1e-12, 'f0');
  near(assert, r.results.janbuCorrected.F, f0 * F, 1e-8, 'Janbu corrected');
  console.log(`wedge: F0 hand ${F.toFixed(8)}, GroundSlide ${r.results.janbu.F.toFixed(8)}; f0 ${f0.toFixed(6)}; Spencer ${r.results.spencer.F.toFixed(6)}`);
  // Spencer is valid and its independent final check holds
  assert.equal(r.results.spencer.valid, true);
  assert.equal(r.results.spencer.equilibrium.valid, true);
});

// ------------------------------------------------------------ mirrored model

test('mirrored model: the same surface mirrored gives the same F (Spencer, Janbu) and the mirrored output', () => {
  const model = withMethods(loadBenchmark('B3_two_layers'));
  const mirrored = withMethods(mirrorModelForTest(loadBenchmark('B3_two_layers')));
  const a = analyzeSurface(model, { type: 'polyline', points: PL1 });
  const b = analyzeSurface(mirrored, { type: 'polyline', points: mirrorPoints(PL1) });
  assert.equal(a.valid && b.valid, true);
  for (const k of ['spencer', 'janbu', 'janbuCorrected']) near(assert, a.results[k].F, b.results[k].F, 1e-9, k);
  assert.deepEqual(b.points, mirrorPoints(PL1));
  assert.deepEqual(a.points, PL1);
  // entry is the higher end; in the mirrored output x is mirrored
  near(assert, a.entry[0], -b.entry[0], 1e-9);
  near(assert, a.exit[0], -b.exit[0], 1e-9);
  // slices by increasing x in both, alpha with the opposite sign (SPEC.md 3)
  for (const r of [a, b]) for (let i = 1; i < r.slices.length; i++) assert.ok(r.slices[i].xm > r.slices[i - 1].xm);
  near(assert, a.slices[0].alpha, -b.slices.at(-1).alpha, 1e-12);
});

test('mirrored model with a nail: the same F, the force direction mirrored, the slice number counted from the other side', () => {
  const s1 = withMethods(loadBenchmark('S1_nail_head'), ['spencer']);
  const mirrored = withMethods(mirrorModelForTest(loadBenchmark('S1_nail_head')), ['spencer']);
  mirrored.supports = mirrored.supports.map((s) => ({ ...s, x: -s.x })); // the angle stays: it is measured into the slope (SPEC_ETAPPE3 2.2)
  const a = analyzeSurface(s1, { type: 'polyline', points: PL1 });
  const b = analyzeSurface(mirrored, { type: 'polyline', points: mirrorPoints(PL1) });
  assert.equal(a.valid && b.valid, true);
  near(assert, a.results.spencer.F, b.results.spencer.F, 1e-9, 'F');
  const [sa, sb] = [a.supports[0], b.supports[0]];
  assert.equal(sa.intersects && sb.intersects, true);
  near(assert, sa.point[0], -sb.point[0], 1e-9);
  near(assert, sa.T, sb.T, 1e-9);
  near(assert, sa.applied, sb.applied, 1e-9);
  near(assert, sa.direction[0], -sb.direction[0], 1e-9);
  near(assert, sa.direction[1], sb.direction[1], 1e-9);
  assert.equal(sa.slice + sb.slice, a.slices.length + 1);
});

// ------------------------------------------------------------ input and output

test('analyze(): circles and polylines in `surfaces`, `type: "circle"` equals a circle without type, output type and points', () => {
  const model = withMethods(loadBenchmark('B3_two_layers'), ['janbu', 'spencer']);
  model.search = null; // single surfaces only
  model.surfaces = [
    { id: 'C1', xc: 50, zc: 80, R: 52 },
    { id: 'C1t', type: 'circle', xc: 50, zc: 80, R: 52 },
    { id: 'PL1', type: 'polyline', points: PL1 },
    { id: 'BAD', type: 'polyline', points: [[10, 10]] },
  ];
  const res = analyze(model);
  const byId = Object.fromEntries(res.surfaces.map((s) => [s.id, s]));
  assert.equal(byId.C1.valid, true);
  assert.equal(byId.C1.type, 'circle');
  assert.deepEqual(byId.C1.circle, { xc: 50, zc: 80, R: 52 });
  assert.deepEqual(byId.C1t.results, byId.C1.results);
  assert.deepEqual(byId.C1t.slices, byId.C1.slices);
  assert.equal(byId.PL1.valid, true);
  assert.equal(byId.PL1.type, 'polyline');
  assert.deepEqual(byId.PL1.points, PL1);
  assert.equal('circle' in byId.PL1, false);
  assert.ok(byId.PL1.entry && byId.PL1.exit && byId.PL1.slices.length === 50);
  assert.deepEqual(Object.keys(byId.PL1.results).sort(), ['janbu', 'janbuCorrected', 'spencer']);
  // E_SURFACE_POINTS: invalid result of that surface only, no exception, the others stay
  assert.equal(byId.BAD.valid, false);
  assert.equal(byId.BAD.code, 'E_SURFACE_POINTS');
  assert.equal(byId.BAD.type, 'polyline');
  assert.equal(validateModel(model).valid, true);
});

test('a polyline in `surfaces` does not change the search (the search stays circular)', () => {
  const model = withMethods(loadBenchmark('B1_homogeneous'), ['bishop']);
  model.search = { grid: { xMin: 40, xMax: 60, zMin: 60, zMax: 80, nx: 3, nz: 3 }, radii: 3 };
  const a = analyze(model);
  model.surfaces = [{ id: 'PL', type: 'polyline', points: PL1 }];
  const b = analyze(model);
  assert.deepEqual(b.critical, a.critical);
  assert.equal(b.surfaces[0].valid, true);
  assert.equal(b.surfaces[0].results.bishop.code, 'I_NONCIRCULAR');
});

test('mode sia with a polyline: partial factors act as for a circle (soil values), the result is valid', () => {
  const model = withMethods(loadBenchmark('B3_two_layers'), ['janbu', 'spencer']);
  const sia = { ...model, analysis: { ...model.analysis, mode: 'sia' } };
  const c = analyzeSurface(model, { type: 'polyline', points: PL1 });
  const s = analyzeSurface(sia, { type: 'polyline', points: PL1 });
  assert.equal(s.valid, true);
  assert.equal(s.mode, 'sia');
  assert.ok(s.results.spencer.F < c.results.spencer.F, 'design values give a smaller F');
});

test('output of a polyline (SPEC_ETAPPE4 9): points as entered, not cut to entry-exit; equilibrium.moment instead of momentOverR', () => {
  const model = withMethods(loadBenchmark('B3_two_layers'), ['janbu', 'spencer']);
  const points = [[40, 34], ...PL1, [110, 60]]; // both ends above the ground
  const r = analyzeSurface(model, { id: 'PLX', type: 'polyline', points });
  assert.equal(r.valid, true);
  assert.deepEqual(r.points, points);
  const eq = r.results.spencer.equilibrium;
  assert.equal(eq.valid, true);
  assert.equal(typeof eq.moment, 'number');
  assert.equal('momentOverR' in eq, false);
  // the cut-off parts change nothing in F
  near(assert, r.results.spencer.F, analyzeSurface(model, { id: 'PL1', type: 'polyline', points: PL1 }).results.spencer.F, 1e-9, 'F');
});
