// Search (SPEC 7) and analyze() (SPEC 8), T2 for F.

import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface, ModelError } from '../../core/index.js';
import { radiiFor } from '../../core/search.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

/** V03 with a small grid so that the tests stay fast. */
function smallV03() {
  const m = loadBenchmark('V03_acads_1c');
  m.search = { grid: { xMin: 30, xMax: 40, zMin: 36, zMax: 48, nx: 5, nz: 5 }, radii: 12 };
  m.analysis.methods = ['bishop', 'janbu', 'spencer'];
  return m;
}

test('radiiFor: R_min = distance to ground line + 0.1, R_max limited by bottom and farthest point', () => {
  const ground = [[0, 10], [10, 10], [25, 17.5], [35, 17.5]];
  const m = { ground, bottom: 0 };
  const { rMin, rMax, radii } = radiiFor(m, 15, 30, 5);
  // distance of (15,30) to the slope segment (10,10)-(25,17.5)
  const dx = 15;
  const dz = 7.5;
  const t = ((15 - 10) * dx + (30 - 10) * dz) / (dx * dx + dz * dz);
  const foot = [10 + t * dx, 10 + t * dz];
  near(assert, rMin, Math.hypot(15 - foot[0], 30 - foot[1]) + 0.1, 1e-9, 'R_min');
  const far = Math.max(...ground.map((p) => Math.hypot(p[0] - 15, p[1] - 30)));
  near(assert, rMax, Math.min(far, 30 - 0), 1e-9, 'R_max');
  assert.equal(radii.length, 5);
  near(assert, radii[0], rMin, 1e-12);
  near(assert, radii[4], rMax, 1e-12);
  near(assert, radii[2], 0.5 * (rMin + rMax), 1e-12);
  // a centre too close to the bottom leaves no radius
  assert.deepEqual(radiiFor(m, 15, 5, 5).radii, []);
});

test('search: counters add up, refinement never worsens the grid minimum', () => {
  const r = analyze(smallV03());
  // SPEC 1.6: per centre 12 radii plus the valid knee radii (7.2), distances are mirror invariant, so the input frame is used
  const m = smallV03();
  const g = m.search.grid;
  let nCircles = 0;
  for (let iz = 0; iz < g.nz; iz++) for (let ix = 0; ix < g.nx; ix++) {
    const xc = g.xMin + ((g.xMax - g.xMin) * ix) / (g.nx - 1);
    const zc = g.zMin + ((g.zMax - g.zMin) * iz) / (g.nz - 1);
    const { rMin, rMax } = radiiFor(m, xc, zc, 12);
    let knees = 0;
    for (let p = 1; p < m.ground.length - 1; p++) {
      const R = Math.hypot(xc - m.ground[p][0], zc - m.ground[p][1]) - 0.0001;
      if (R >= rMin && R <= rMax) knees++;
    }
    nCircles += 12 + knees;
  }
  assert.ok(r.counts.total > 0 && r.counts.total <= 3 * nCircles);
  const invalid = Object.values(r.counts.invalid).reduce((a, b) => a + b, 0);
  assert.equal(r.counts.valid + invalid, r.counts.total);
  for (const [method, c] of Object.entries(r.countsByMethod)) {
    assert.equal(c.valid + Object.values(c.invalid).reduce((a, b) => a + b, 0), c.total, method);
  }
  for (const target of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) {
    const gridMin = Math.min(...r.grid.map((g) => g[target]).filter((v) => v !== null));
    assert.ok(r.critical[target].F <= gridMin + 1e-12, `${target}: refined ${r.critical[target].F} vs grid ${gridMin}`);
    assert.ok(r.refinementEvaluations[target] > 0);
  }
  assert.equal(r.grid.length, 25);
  assert.ok(r.searchTimeMs >= 0);
  // critical surfaces are in the input frame (V03 slope falls to the left, centre x ~ 34)
  assert.ok(r.critical.bishop.xc > 25 && r.critical.bishop.xc < 45);
  assert.ok(r.critical.bishop.entry[0] > r.critical.bishop.exit[0], 'entry (crest) lies to the right');
});

test('search: each critical surface reproduces its F with analyzeSurface', () => {
  const m = smallV03();
  const r = analyze(m);
  for (const target of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) {
    const c = r.critical[target];
    const s = analyzeSurface(m, { xc: c.xc, zc: c.zc, R: c.R });
    assert.equal(s.valid, true);
    near(assert, s.results[target].F, c.F, 1e-9, target);
  }
});

test('search: refinement may leave the grid; W_MIN_ON_GRID_EDGE when the minimum is on the grid edge', () => {
  const m = smallV03();
  m.search.grid = { xMin: 38, xMax: 44, zMin: 40, zMax: 48, nx: 4, nz: 4 }; // true minimum is near x = 34
  const r = analyze(m);
  assert.ok(r.warnings.includes('W_MIN_ON_GRID_EDGE'));
  assert.ok(r.warningDetails.some((w) => w.code === 'W_MIN_ON_GRID_EDGE' && w.method === 'bishop'));
  assert.ok(r.critical.bishop.xc < 38, `refined centre x=${r.critical.bishop.xc} left the grid`);
});

test('search: no W_MIN_ON_GRID_EDGE when the minimum is inside the grid', () => {
  const r = analyze(smallV03());
  assert.ok(!r.warnings.includes('W_MIN_ON_GRID_EDGE'));
});

test('analyze: warning W_CIRCLE_LAYERED (Spencer is calculated, no W_METHOD_NOT_IMPLEMENTED)', () => {
  const m = smallV03();
  m.analysis.methods = ['bishop', 'spencer'];
  m.search = null;
  const r = analyze(m);
  assert.deepEqual(r.warnings, ['W_CIRCLE_LAYERED']);
  assert.equal(r.critical, undefined);
  const h = loadBenchmark('H1_handcalc_dry');
  assert.deepEqual(analyze(h).warnings, []);
});

test('analyze: search null returns only the surfaces', () => {
  const m = loadBenchmark('H2_handcalc_wet');
  const r = analyze(m);
  assert.equal(r.critical, undefined);
  assert.equal(r.grid, undefined);
  assert.equal(r.surfaces.length, 1);
  assert.equal(r.surfaces[0].id, 'C1');
  assert.equal(r.surfaces[0].valid, true);
  near(assert, r.surfaces[0].results.bishop.F, 1.554, 0.005);
});

test('analyze: invalid model throws ModelError with the codes', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  delete m.bottom;
  assert.throws(() => analyze(m), (e) => e instanceof ModelError && e.errors[0].code === 'E_BOTTOM_MISSING');
  assert.throws(() => analyzeSurface(m, m.surfaces[0]), ModelError);
});

test('analyze does not modify the input model', () => {
  const m = smallV03();
  m.analysis.mode = 'sia';
  const before = JSON.stringify(m);
  analyze(m);
  assert.equal(JSON.stringify(m), before);
});

test('analyze: mode sia gives one check per method, no overall verdict (SPEC 8)', () => {
  const m = smallV03();
  m.analysis.mode = 'sia';
  const r = analyze(m);
  assert.equal(r.mode, 'sia');
  assert.equal(r.check.gammaR, 1.1);
  assert.deepEqual(Object.keys(r.check).sort(), ['bishop', 'gammaR', 'janbuCorrected', 'spencer']);
  for (const method of ['bishop', 'janbuCorrected', 'spencer']) {
    const F = r.critical[method].F;
    near(assert, r.check[method].utilisation, 1.1 / F, 1e-12, method);
    assert.equal(r.check[method].ok, F >= 1.1, method);
  }
  assert.equal(r.check.ok, undefined, 'no overall verdict');
  assert.equal(r.check.utilisation, undefined, 'no overall verdict');
  m.partialFactors = { R: 1.0 };
  assert.equal(analyze(m).check.gammaR, 1.0);
  m.analysis.mode = 'characteristic';
  assert.equal(analyze(m).check, undefined);
});

test('analyze: only the selected methods appear in check', () => {
  const m = smallV03();
  m.analysis.mode = 'sia';
  m.analysis.methods = ['bishop'];
  assert.deepEqual(Object.keys(analyze(m).check).sort(), ['bishop', 'gammaR']);
});

test('W_MIN_AT_BOTTOM: governing surface touches the model bottom (B4), not for V03', () => {
  const b4 = JSON.parse(readFileSync(new URL('../benchmarks/B4_undrained.json', import.meta.url), 'utf8'));
  const r = analyze(b4);
  assert.ok(r.warnings.includes('W_MIN_AT_BOTTOM'));
  const methods = r.warningDetails.filter((w) => w.code === 'W_MIN_AT_BOTTOM').map((w) => w.method);
  assert.ok(methods.includes('bishop'), methods.join(','));
  for (const w of methods) {
    const c = r.critical[w];
    assert.ok(c.zc - c.R - b4.bottom < 0.01, w);
  }
  assert.ok(!analyze(smallV03()).warnings.includes('W_MIN_AT_BOTTOM'));
});

test('T2 mirrored model: F identical on 4 digits (single surface and search)', () => {
  const a = smallV03();
  const b = mirrorModelForTest(a);
  b.search.grid = { xMin: -40, xMax: -30, zMin: 36, zMax: 48, nx: 5, nz: 5 };
  const circle = { xc: 34.43, zc: 42.74, R: 18.35 };
  const sa = analyzeSurface(a, circle);
  const sb = analyzeSurface(b, { ...circle, xc: -circle.xc });
  for (const t of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) near(assert, sa.results[t].F, sb.results[t].F, 5e-5, t);

  const ra = analyze(a);
  const rb = analyze(b);
  for (const t of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) {
    near(assert, ra.critical[t].F, rb.critical[t].F, 5e-5, `search ${t}`);
    near(assert, ra.critical[t].xc, -rb.critical[t].xc, 1e-6, `xc ${t}`);
  }
});

test('analyzeSurface: invalid surface returns the code', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = analyzeSurface(m, { xc: 15, zc: 100, R: 5 });
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_INTERSECTIONS');
});
