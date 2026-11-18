// Knee radii and foot circles (SPEC 7.2, 7.4 points 5-8, 10.2 additional criterion "Fusskreise").

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../core/index.js';
import { kneeRadiiFor, radiiFor, KNEE_RADIUS_OFFSET } from '../../core/search.js';
import { loadBenchmark, near } from './helpers.js';

test('knee radii: R_P = |M - P| - 0.0001 for inner ground points inside R_min..R_max, none for the end points', () => {
  const ground = [[0, 10], [10, 10], [25, 17.5], [35, 17.5]];
  assert.equal(KNEE_RADIUS_OFFSET, 0.0001);

  // bottom 0: R_max = 25 (farthest ground point), both inner points (toe, crest) give a radius
  const wide = { ground, bottom: 0 };
  const knees = kneeRadiiFor(wide, 15, 30);
  assert.deepEqual(knees.map((k) => k.point), [1, 2]);
  near(assert, knees[0].R, Math.hypot(15 - 10, 30 - 10) - 0.0001, 1e-12, 'toe');
  near(assert, knees[1].R, Math.hypot(15 - 25, 30 - 17.5) - 0.0001, 1e-12, 'crest');
  const { rMin, rMax } = radiiFor(wide, 15, 30, 5);
  for (const k of knees) assert.ok(k.R >= rMin && k.R <= rMax);
  // the end points (0,10) and (35,17.5) are at distance 25 and 23.585: no knee radius for them
  const endRadii = [Math.hypot(15, 20) - 0.0001, Math.hypot(20, 12.5) - 0.0001];
  for (const k of knees) for (const e of endRadii) assert.ok(Math.abs(k.R - e) > 1e-6);

  // bottom 10: R_max = 20; toe radius (20.6154) is outside, crest radius (16.0079) inside
  const shallow = { ground, bottom: 10 };
  const k2 = kneeRadiiFor(shallow, 15, 30);
  assert.deepEqual(k2.map((k) => k.point), [2]);
  near(assert, k2[0].R, Math.hypot(15 - 25, 30 - 17.5) - 0.0001, 1e-12);
  assert.ok(radiiFor(shallow, 15, 30, 5).rMax < Math.hypot(15 - 10, 30 - 10) - 0.0001);

  // a centre without any admissible radius has no knee radius
  assert.deepEqual(kneeRadiiFor(wide, 15, 5), []);
});

// SPEC 10.2: search minimum of B1, B3, B5, B6 at most Slide2 + 0.001 (B6 Spencer + 0.002); lower is allowed.
const CASES = ['B1_homogeneous', 'B3_two_layers', 'B5_surcharge', 'B6_seismic'];
const TARGETS = ['bishop', 'janbu', 'janbuCorrected', 'spencer'];
for (const name of CASES) {
  test(`foot circles (SPEC 10.2): ${name} search minimum <= Slide2 + 0.001`, () => {
    const m = loadBenchmark(name);
    const expected = m.expected?.search ?? {};
    m.analysis.methods = ['bishop', 'janbu', 'spencer'];
    const r = analyze(m);
    for (const t of TARGETS) {
      const F = r.critical[t].F;
      const slide = expected[t];
      if (slide === null || slide === undefined) {
        console.log(`foot circles ${name} ${t}: F = ${F} (Slide2 value pending)`);
        continue;
      }
      const tol = name === 'B6_seismic' && t === 'spencer' ? 0.002 : 0.001;
      assert.ok(F <= slide + tol, `${name} ${t}: ${F} > Slide2 ${slide} + ${tol}`);
    }
  });
}
