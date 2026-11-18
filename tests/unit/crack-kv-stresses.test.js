// Order 26 (SPEC_ETAPPE4 6, 7, 8): tension crack, vertical earthquake force k_v, stresses at the base of the slices.
// The values of Slide2 are in the benchmarks T1*, K1* and in fixtures/N1_spencer_slices_slide2.json.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyze, analyzeSurface, validateModel } from '../../core/index.js';
import { bishop } from '../../core/bishop.js';
import { spencerForTheta } from '../../core/spencer.js';
import { buildSlices } from '../../core/slices.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const C1P = loadBenchmark('T1a_crack_dry').surfaces[0]; // the circle C1 as a polyline of 25 points
const withCrack = (model, depth, waterFill) => ({ ...structuredClone(model), tensionCrack: { depth, waterFill } });
const withKv = (model, kv) => ({ ...structuredClone(model), seismic: { ...model.seismic, kv } });
const allMethods = (model) => ({ ...model, analysis: { ...model.analysis, methods: ['bishop', 'janbu', 'spencer'] } });
const noSearch = (model) => ({ ...model, search: null, surfaces: [] });

// ------------------------------------------------------------ input

test('E_TENSION_CRACK: depth 0, -1, "3", NaN, no object; waterFill -0.1, 1.1, "0.5"; valid: missing, null, 0 and 1', () => {
  const check = (tc) => validateModel({ ...structuredClone(loadBenchmark('B1_homogeneous')), tensionCrack: tc });
  const bad = [{ depth: 0, waterFill: 0 }, { depth: -1, waterFill: 0 }, { depth: '3', waterFill: 0 }, { depth: NaN, waterFill: 0 },
    { depth: 3, waterFill: -0.1 }, { depth: 3, waterFill: 1.1 }, { depth: 3, waterFill: '0.5' }, { depth: 3 }, 3, 'x', []];
  for (const tc of bad) {
    const r = check(tc);
    assert.equal(r.valid, false, JSON.stringify(tc));
    assert.ok(r.errors.some((e) => e.code === 'E_TENSION_CRACK' && e.path === 'tensionCrack'), JSON.stringify(tc));
  }
  for (const tc of [undefined, null, { depth: 3, waterFill: 0 }, { depth: 0.5, waterFill: 1 }, { depth: 3, waterFill: 0.25 }]) {
    assert.equal(check(tc).valid, true, JSON.stringify(tc));
  }
});

test('E_SEISMIC_INVALID for seismic.kv that is not a number; kv missing = 0, any number is accepted', () => {
  const check = (kv) => validateModel(withKv(loadBenchmark('B6_seismic'), kv));
  for (const kv of ['0.05', true, NaN, [0.05], {}]) {
    const r = check(kv);
    assert.equal(r.valid, false, String(kv));
    assert.ok(r.errors.some((e) => e.code === 'E_SEISMIC_INVALID' && e.path === 'seismic.kv'), String(kv));
  }
  for (const kv of [undefined, null, 0, 0.05, -0.05, 2]) assert.equal(check(kv).valid, true, String(kv));
});

// ------------------------------------------------------------ tension crack

test('crack base at C1P in T1: x = 90.165, z = 47.000 (Slide2: 90.1649 / 47); P_w = 11.036 kN (50 %) and 44.145 kN (100 %), dry 0', () => {
  const b1 = noSearch(loadBenchmark('B1_homogeneous'));
  for (const [fill, pw] of [[0, 0], [0.5, 11.03625], [1, 44.145]]) {
    const r = analyzeSurface(withCrack(b1, 3, fill), C1P);
    assert.equal(r.valid, true);
    near(assert, r.crack.x, 90.165, 1e-3, 'x of the crack');
    near(assert, r.entry[0], r.crack.x, 1e-12, 'entry = crack base (x)');
    near(assert, r.entry[1], 47, 1e-9, 'entry = crack base (z)');
    assert.equal(r.crack.depth, 3);
    near(assert, r.crack.Pw, pw, 1e-9, `P_w at waterFill ${fill}`);
    // the first slice begins at the crack base and carries the water force; the others carry none
    assert.equal(r.slices[0].xRight > r.slices[0].xLeft, true);
    const first = r.slices.reduce((a, s) => (s.xRight > a.xRight ? s : a)); // slides towards -x in the input frame: the first slice is the right-most
    near(assert, first.xRight, r.crack.x, 1e-9, 'the slice at the crack ends at the crack base');
    assert.equal(r.slices.filter((s) => s.Pw > 0).length, fill > 0 ? 1 : 0);
    if (fill > 0) {
      near(assert, first.Pw, pw, 1e-9, 'Pw on the first slice');
      near(assert, first.zPw, 47 + (fill * 3) / 3, 1e-9, 'height of P_w: h_w / 3 above the crack base');
    }
  }
  assert.equal(analyzeSurface(b1, C1P).crack, null);
});

test('crack at a circle: the body begins where the surface lies `depth` below the ground; the part before it is cut off', () => {
  const model = withCrack(noSearch(loadBenchmark('B1_homogeneous')), 3, 0);
  const C1 = { xc: 50, zc: 80, R: 52 };
  const without = analyzeSurface(noSearch(loadBenchmark('B1_homogeneous')), C1);
  const r = analyzeSurface(model, C1);
  assert.equal(r.valid, true);
  assert.ok(r.entry[0] < without.entry[0], 'the entry moves from the crown to the crack (towards the exit)');
  assert.equal(r.entry[1] > 30, true);
  // the ground height at the crack minus the surface height at the crack = depth (ground = 50 above x = 80)
  const groundZ = r.entry[0] >= 80 ? 50 : 30 + ((r.entry[0] - 50) * 20) / 30;
  near(assert, groundZ - r.entry[1], 3, 1e-6, 'depth below the ground at the crack base');
  near(assert, r.crack.x, r.entry[0], 1e-12);
  assert.deepEqual(r.exit, without.exit);
});

test('dry crack with depth -> 0 (1e-6): same F as without a crack (circle and polyline, all methods)', () => {
  const model = allMethods(noSearch(loadBenchmark('B3_two_layers')));
  for (const surface of [{ xc: 50, zc: 80, R: 52 }, C1P]) {
    const a = analyzeSurface(model, surface);
    const b = analyzeSurface(withCrack(model, 1e-6, 0), surface);
    for (const method of Object.keys(a.results)) {
      if (!a.results[method].valid) continue;
      near(assert, b.results[method].F, a.results[method].F, 1e-4, `${method} F`);
    }
  }
});

test('I_TENSION_CRACK: the surface does not reach the crack depth (circle and polyline); the codes before it stay', () => {
  const model = withCrack(noSearch(loadBenchmark('B1_homogeneous')), 100, 0);
  const circle = analyzeSurface(model, { xc: 50, zc: 80, R: 52 });
  assert.equal(circle.valid, false);
  assert.equal(circle.code, 'I_TENSION_CRACK');
  const poly = analyzeSurface(model, C1P);
  assert.equal(poly.valid, false);
  assert.equal(poly.code, 'I_TENSION_CRACK');
  // a circle that does not reach the ground has no section: I_INTERSECTIONS comes first
  assert.equal(analyzeSurface(model, { xc: 50, zc: 200, R: 10 }).code, 'I_INTERSECTIONS');
});

test('Spencer with theta = 0 equals Bishop also with a crack (with water) and with k_v (SPEC.md 9.3)', () => {
  const tight = (m) => ({ kh: m.seismic.kh, kv: m.seismic.kv || 0, tolerance: 1e-10, maxIterations: 1000 });
  const cases = [
    ['B1, crack 3 m dry', withCrack(loadBenchmark('B1_homogeneous'), 3, 0)],
    ['B1, crack 3 m half full', withCrack(loadBenchmark('B1_homogeneous'), 3, 0.5)],
    ['B1, crack 3 m full', withCrack(loadBenchmark('B1_homogeneous'), 3, 1)],
    ['B6 (k_h), k_v +0.05', withKv(loadBenchmark('B6_seismic'), 0.05)],
    ['B6 (k_h), k_v -0.05', withKv(loadBenchmark('B6_seismic'), -0.05)],
    ['B6 (k_h), crack full and k_v +0.05', withKv(withCrack(loadBenchmark('B6_seismic'), 3, 1), 0.05)],
  ];
  for (const [label, model] of cases) {
    const g = buildSlices(model, { xc: 50, zc: 80, R: 52 });
    assert.equal(g.valid, true, label);
    const opts = tight(model);
    const b = bishop(g.slices, g.circle, opts);
    const sp = spencerForTheta(g.slices, g.circle, 0, opts);
    assert.equal(b.valid && sp.valid, true, label);
    near(assert, sp.Fm, b.F, 1e-6, `${label}: F_m(0) - Bishop`);
  }
});

test('the water force in the crack lowers F, k_v downwards/upwards changes F (Slide2 direction, B6 with k_h)', () => {
  const b1 = allMethods(noSearch(loadBenchmark('B1_homogeneous')));
  const F = (m) => analyzeSurface(m, C1P).results.spencer.F;
  const dry = F(withCrack(b1, 3, 0));
  const half = F(withCrack(b1, 3, 0.5));
  const full = F(withCrack(b1, 3, 1));
  assert.ok(dry > half && half > full, `${dry} > ${half} > ${full}`);
  // sia: P_w without a factor (SPEC_ETAPPE4 6)
  const sia = withCrack(b1, 3, 1);
  sia.analysis.mode = 'sia';
  near(assert, analyzeSurface(sia, C1P).crack.Pw, 44.145, 1e-9, 'P_w in mode sia');
  const b6 = allMethods(noSearch(loadBenchmark('B6_seismic')));
  const k0 = F(withKv(b6, 0));
  assert.ok(F(withKv(b6, 0.05)) > k0 && F(withKv(b6, -0.05)) < k0, 'k_v positive (down) raises F, negative lowers it (K1)');
});

test('k_v = 0 and k_v missing: all values unchanged (B6: surfaces and search)', () => {
  const base = loadBenchmark('B6_seismic');
  base.search = { grid: { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 3, nz: 3 }, radii: 6 };
  base.analysis.methods = ['bishop', 'janbu', 'spencer'];
  const strip = (r) => ({ ...r, searchTimeMs: 0 });
  const a = analyze(base);
  const b = analyze(withKv(base, 0));
  assert.deepEqual(strip(b), strip(a));
  // spot values of the circle search before order 26 (same as in search-optimize.test.js)
  near(assert, a.critical.spencer.F, 0.9409339745194241, 1e-9, 'Spencer');
  near(assert, a.critical.bishop.F, 0.9403370834630098, 1e-9, 'Bishop');
  near(assert, a.critical.janbu.F, 0.8960374352051707, 1e-9, 'Janbu');
});

test('Janbu corrected with a crack: L and d from the crack base to the exit', () => {
  const model = allMethods(withCrack(noSearch(loadBenchmark('B1_homogeneous')), 3, 0.5));
  const r = analyzeSurface(model, C1P);
  const j = r.results.janbuCorrected;
  near(assert, j.L, Math.hypot(r.exit[0] - r.entry[0], r.exit[1] - r.entry[1]), 1e-9, 'L = chord crack base - exit');
  assert.ok(j.d > 0 && j.d < j.L);
  const whole = analyzeSurface(allMethods(noSearch(loadBenchmark('B1_homogeneous'))), C1P).results.janbuCorrected;
  assert.ok(j.L < whole.L, 'the chord is shorter than without a crack');
});

test('mirrored model with crack and k_v: same F (Spencer, Janbu), mirrored crack x and slice stresses', () => {
  const model = allMethods(withKv(withCrack(noSearch(loadBenchmark('B6_seismic')), 3, 0.5), 0.05));
  const mirrored = mirrorModelForTest(model);
  const pts = C1P.points.map(([x, z]) => [-x, z]).reverse();
  const a = analyzeSurface(model, C1P);
  const b = analyzeSurface(mirrored, { type: 'polyline', points: pts });
  assert.equal(a.valid && b.valid, true);
  for (const method of ['janbu', 'janbuCorrected', 'spencer']) near(assert, b.results[method].F, a.results[method].F, model.analysis.tolerance, method);
  near(assert, b.crack.x, -a.crack.x, 1e-9, 'crack x mirrored');
  near(assert, b.crack.Pw, a.crack.Pw, 1e-12, 'P_w');
  assert.equal(a.slices.length, b.slices.length);
  for (let i = 0; i < a.slices.length; i++) {
    const s = a.slices[i];
    const t = b.slices[b.slices.length - 1 - i];
    near(assert, t.tauMob, s.tauMob, 1e-3, `tauMob of slice ${i}`);
    near(assert, t.sigmaNEff, s.sigmaNEff, 1e-3, `sigmaNEff of slice ${i}`);
  }
  // circle as well
  const circle = { xc: 50, zc: 80, R: 52 };
  near(assert, analyzeSurface(mirrored, { xc: -50, zc: 80, R: 52 }).results.spencer.F, analyzeSurface(model, circle).results.spencer.F, model.analysis.tolerance, 'circle');
});

test('search with a crack: every circle and every optimised surface carries the crack; without a crack `crack` is null', () => {
  const model = loadBenchmark('B1_homogeneous');
  model.surfaces = [];
  model.analysis.methods = ['bishop', 'janbu', 'spencer'];
  model.search = { grid: { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 2, nz: 2 }, radii: 5, optimize: { points: 11 } };
  const plain = analyze(model);
  for (const t of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) assert.equal(plain.critical[t].crack, null, t);
  const cracked = analyze(withCrack(model, 3, 0.5));
  for (const t of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) {
    const c = cracked.critical[t];
    assert.equal(c.crack.depth, 3, t);
    near(assert, c.crack.Pw, 11.03625, 1e-9, `${t} P_w`);
    near(assert, c.entry[0], c.crack.x, 1e-12, `${t} entry = crack base`);
    // ground (x > 80: 50, between 50 and 80: slope) minus the surface height at the crack base is the depth
    const groundZ = c.crack.x >= 80 ? 50 : 30 + ((c.crack.x - 50) * 20) / 30;
    near(assert, groundZ - c.entry[1], 3, 1e-6, `${t} depth at the crack base`);
  }
  assert.ok(cracked.critical.spencer.F > 0 && cracked.critical.bishop.F > 0);
  // the optimisation starts on the ground at the entry of the circle, so that the crack can cut the polyline: it is not rejected
  for (const t of ['janbu', 'janbuCorrected', 'spencer']) {
    assert.equal(cracked.critical[t].type, 'polyline', t);
    assert.ok(cracked.critical[t].F < cracked.critical[t].searchCircle.F, `${t}: the polyline beats the circle`);
  }
  assert.ok(cracked.optimizeEvaluations > 3);
});

// ------------------------------------------------------------ stresses at the base

test('stresses: tauMob = tauF / F in every slice, sigmaN = sigmaNEff + u, null without Spencer', () => {
  const model = allMethods(noSearch(loadBenchmark('B2_water')));
  const circle = loadBenchmark('B2_water').surfaces[0];
  const r = analyzeSurface(model, circle);
  const F = r.results.spencer.F;
  assert.ok(r.slices.some((s) => s.u > 0), 'a model with pore water');
  for (const s of r.slices) {
    near(assert, s.tauMob, s.tauF / F, 1e-6, 'tauMob = tauF / F');
    near(assert, s.sigmaN - s.sigmaNEff, s.u, 1e-9, 'sigmaN - sigmaNEff = u');
    assert.ok([s.tauMob, s.tauF, s.sigmaN, s.sigmaNEff].every(Number.isFinite));
  }
  // tauF from the effective stress (c' + sigma'_n tan phi')
  const s = r.slices[Math.floor(r.slices.length / 2)];
  near(assert, s.tauF, s.c + s.sigmaNEff * Math.tan(s.phi), 1e-9, 'tauF');
  // without Spencer: null
  const noSpencer = { ...model, analysis: { ...model.analysis, methods: ['bishop', 'janbu'] } };
  for (const sl of analyzeSurface(noSpencer, circle).slices) {
    assert.deepEqual([sl.tauMob, sl.tauF, sl.sigmaN, sl.sigmaNEff], [null, null, null, null]);
  }
});

test('stresses with supports (nail), crack and k_v: tauMob = tauF / F; undrained clay gives c_u', () => {
  const nail = noSearch(loadBenchmark('S1_nail_head'));
  const r = analyzeSurface(nail, nail.surfaces?.[0] ?? { xc: 50.032, zc: 48.297, R: 18.296 });
  assert.equal(r.valid, true);
  const F = r.results.spencer.F;
  for (const s of r.slices) near(assert, s.tauMob, s.tauF / F, 1e-6, 'nail: tauMob = tauF / F');
  const cracked = withKv(withCrack(nail, 2, 1), 0.03);
  const rc = analyzeSurface(cracked, { xc: 50.032, zc: 48.297, R: 18.296 });
  assert.equal(rc.valid, true);
  for (const s of rc.slices) near(assert, s.tauMob, s.tauF / rc.results.spencer.F, 1e-6, 'nail, crack, k_v');
  // B4: undrained soft clay (c_u = 30) under a drained fill: tauF = c_u in the clay, c' + sigma'_n tan(phi') in the fill
  const u = noSearch(loadBenchmark('B4_undrained'));
  const ru = analyzeSurface(allMethods(u), loadBenchmark('B4_undrained').surfaces[0]);
  assert.ok(ru.slices.some((s) => s.material === 'M2') && ru.slices.some((s) => s.material === 'M1'));
  for (const s of ru.slices) {
    if (s.material === 'M2') near(assert, s.tauF, 30, 1e-9, 'tauF = c_u');
    else near(assert, s.tauF, 5 + s.sigmaNEff * Math.tan((35 * Math.PI) / 180), 1e-9, 'tauF = c + sigma tan phi');
    near(assert, s.tauMob, s.tauF / ru.results.spencer.F, 1e-6, 'tauMob = tauF / F');
  }
});

test('N1 stresses of Slide2 (Spencer, PL1): the 27 slices with equal boundaries within max(1 %; 0.5 kPa)', () => {
  const fixture = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'N1_spencer_slices_slide2.json'), 'utf8'));
  const model = loadBenchmark('N1_polyline_B3');
  const r = analyzeSurface(model, model.surfaces[0]);
  assert.equal(r.valid, true);
  assert.equal(fixture.slices.length, 50);
  let compared = 0;
  let worst = 0;
  for (const row of fixture.slices) {
    if (!row.same) continue;
    const s = r.slices.find((x) => Math.abs(x.xLeft - row.xLeft) < 1e-3 && Math.abs(x.xRight - (row.xLeft + row.b)) < 1e-3);
    assert.ok(s, `slice ${row.nr} with the same boundaries`);
    compared++;
    // u = 0 in N1, so the total and the effective normal stress are the same value
    for (const [key, ref] of [['tauMob', row.tauMob], ['tauF', row.tauF], ['sigmaN', row.sigmaN], ['sigmaNEff', row.sigmaN]]) {
      const d = Math.abs(s[key] - ref);
      worst = Math.max(worst, d / Math.abs(ref));
      assert.ok(d <= Math.max(0.01 * Math.abs(ref), 0.5), `slice ${row.nr} ${key}: ${s[key]} against ${ref}`);
    }
  }
  assert.equal(compared, 27);
  console.log(`N1 stresses: ${compared} slices compared, largest relative deviation ${(worst * 100).toFixed(3)} %`);
});
