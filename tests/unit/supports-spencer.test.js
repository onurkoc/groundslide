// Order 21: Spencer with support forces (SPEC_ETAPPE3 4, 6).
// S-T2 (element that does not cut the circle), S-T3 (theta = 0 equals a Bishop with
// the same support forces, computed by a helper in this test only), one slice by
// hand (R_i, D_i with a nail), I_SUPPORT_SPENCER_ONLY, final check with support
// forces, output fields.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface } from '../../core/index.js';
import { applyPartialFactors } from '../../core/factors.js';
import { circleToCore, normalizeModel } from '../../core/model.js';
import { buildSlicesNormalized } from '../../core/slices.js';
import { bishop } from '../../core/bishop.js';
import { spencerEquilibrium, spencerForTheta } from '../../core/spencer.js';
import { evaluateSupports, withSupportSums } from '../../core/supports.js';
import { near } from './helpers.js';
import {
  ANCHOR_S4, CIRCLE_S1, CIRCLE_S4, CIRCLE_S6, NAIL_S1,
  anchorFromTo, b1With, nailFromTo, pilesS6,
} from './supports-b1-helpers.js';

const DEG = Math.PI / 180;

/** Calculation-frame pieces of a circle: normalised model, geometry, support results, slices with force sums. */
function prepared(model, circle) {
  const info = normalizeModel(applyPartialFactors(model));
  const m = info.model;
  const g = buildSlicesNormalized(m, circleToCore(circle, info));
  assert.equal(g.valid, true);
  const results = evaluateSupports(m, g);
  return { info, m, g, results, slices: withSupportSums(g.slices, results, g.circle) };
}

const OPTS = { kh: 0, tolerance: 1e-12, maxIterations: 1000 };

/**
 * Bishop with support forces, helper of the test only (SPEC_ETAPPE3 4.4, "Pflichttest", version 0.6, V1m).
 * Passive forces enter divided by F as a vector (4.1), active ones in full; vertical equilibrium of
 * each slice with the components of 4.1 and 4.2, moments about the centre with the lever arm at the
 * intersection point (4.3). Calculation frame, kh = 0.
 *   N' (cos a + sin a tan(phi)/F) = V - U cos a - c l sin a / F + Pt_eff sin a + Pn_eff cos a
 *   T = (c l + N' tan(phi)) / F      Pt_eff = PtA + PtP / F,  Pn_eff = PnA + PnP / F
 *   sum T = M_d + M_S / R            M_d = sum V (xc - xm) / R,  M_S = sum MA + (sum MP) / F
 * F is found by bisection of f(F) = sum T - M_d - M_S / R.
 */
function bishopWithSupports(slices, circle) {
  const { xc, R } = circle;
  let Md = 0;
  let MA = 0;
  let MP = 0;
  for (const s of slices) {
    Md += ((s.W + s.Q) * (xc - s.xm)) / R;
    MA += s.MA || 0;
    MP += s.MP || 0;
  }
  const f = (F) => {
    let sumT = 0;
    for (const s of slices) {
      const V = s.W + s.Q;
      const U = s.u * s.l;
      const tanP = Math.tan(s.phi);
      const PtEff = (s.PtA || 0) + (s.PtP || 0) / F;
      const PnEff = (s.PnA || 0) + (s.PnP || 0) / F;
      const m = Math.cos(s.alpha) + (Math.sin(s.alpha) * tanP) / F;
      const N = (V - U * Math.cos(s.alpha) - (s.c * s.l * Math.sin(s.alpha)) / F + PtEff * Math.sin(s.alpha) + PnEff * Math.cos(s.alpha)) / m;
      sumT += (s.c * s.l + N * tanP) / F;
    }
    return sumT - Md - (MA + MP / F) / R;
  };
  let lo = 0.3;
  let hi = 6;
  assert.ok(f(lo) * f(hi) < 0, 'bisection bracket');
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------------------
// helper check: without supports it equals the Bishop of the core
// ---------------------------------------------------------------------------

test('S-T3 helper: without supports the test Bishop equals bishop() of the core (B1, circle C1)', () => {
  const model = b1With([]);
  const { g, slices } = prepared(model, { xc: 50, zc: 80, R: 52 });
  const core = bishop(g.slices, g.circle, { kh: 0, tolerance: 1e-10, maxIterations: 1000 });
  near(assert, bishopWithSupports(slices, g.circle), core.F, 1e-6, 'helper Bishop');
});

// ---------------------------------------------------------------------------
// S-T3: theta = 0, F_m equals Bishop with the same support forces
// ---------------------------------------------------------------------------

const t3Cases = [
  ['nail (passive), circle S1', () => b1With([nailFromTo('N1', ...NAIL_S1, true)]), CIRCLE_S1, 'N1'],
  ['nail without head (passive)', () => b1With([nailFromTo('N1', ...NAIL_S1, false)]), { xc: 42.809, zc: 75.379, R: 45.943 }, 'N1'],
  ['anchor (active), circle S4', () => b1With([anchorFromTo(...ANCHOR_S4, 9)]), CIRCLE_S4, 'A1'],
  ['anchor in the bond body (active)', () => b1With([anchorFromTo(...ANCHOR_S4, 2)]), CIRCLE_S4, 'A1'],
  ['four piles (passive), circle S6', () => b1With(pilesS6()), CIRCLE_S6, 'P1'],
  ['anchor and piles together (active and passive)', () => b1With([anchorFromTo(...ANCHOR_S4, 9), ...pilesS6()]), CIRCLE_S6, 'A1'],
];

for (const [name, build, circle, firstId] of t3Cases) {
  test(`S-T3 theta = 0: F_m = Bishop with the same support forces, ${name}`, () => {
    const model = build();
    const { g, results, slices } = prepared(model, circle);
    assert.ok(results.find((r) => r.id === firstId).intersects, 'the element acts on the circle');
    const fm = spencerForTheta(slices, g.circle, 0, OPTS);
    assert.equal(fm.valid, true);
    const ref = bishopWithSupports(slices, g.circle);
    near(assert, fm.Fm, ref, 1e-5, 'F_m(0) against Bishop');
    // the supports change F (the test is not vacuous)
    const without = spencerForTheta(g.slices, g.circle, 0, OPTS);
    assert.ok(Math.abs(fm.Fm - without.Fm) > 0.005, `F_m ${fm.Fm} against ${without.Fm} without supports`);
  });
}

// ---------------------------------------------------------------------------
// S-T2: an element that does not cut the circle changes nothing
// ---------------------------------------------------------------------------

test('S-T2 an element that does not cut the circle: Spencer F identical to the model without it', () => {
  const circle = { xc: 50, zc: 80, R: 52 };
  // nail on the flat crown at x = 100, far behind the slip surface (B1 ground z = 50 for x >= 80)
  const far = nailFromTo('far', [100, 50], [110, 45]);
  const withEl = analyzeSurface(b1With([far]), circle);
  const without = analyzeSurface(b1With([]), circle);
  assert.equal(withEl.valid, true);
  assert.equal(withEl.supports.length, 1);
  assert.deepEqual(withEl.supports[0], { id: 'far', type: 'nail', intersects: false });
  assert.equal(withEl.results.spencer.F, without.results.spencer.F);
  assert.equal(withEl.results.spencer.theta, without.results.spencer.theta);
  // the slice table differs only by the two new columns (all zero)
  assert.deepEqual(withEl.slices.map((s) => s.sumPt), withEl.slices.map(() => 0));
  assert.deepEqual(withEl.slices.map((s) => s.sumPn), withEl.slices.map(() => 0));
});

// ---------------------------------------------------------------------------
// one slice by hand: R_i, D_i with a nail (SPEC_ETAPPE3 4.2)
// ---------------------------------------------------------------------------

/** One slice for the hand calculations: b = 2, alpha = 20 deg, W = 500, c = 5, phi = 30 deg, dry, kh = 0; circle R = 10 about the origin. */
function handSlice() {
  const alpha = 20 * DEG;
  const b = 2;
  const R = 10;
  const slice = { xLeft: 0, xRight: b, b, xm: -R * Math.sin(alpha), zb: 0, alpha, l: b / Math.cos(alpha), W: 500, zG: 0, Q: 0, u: 0, c: 5, phi: 30 * DEG };
  return { alpha, R, slice, circle: { xc: 0, zc: 0, R }, l: slice.l };
}
/** Intersection point on the arc straight below the slice base (radial position of alpha): there M = R * P_t. */
const radialPoint = (R, alpha) => [-R * Math.sin(alpha), -R * Math.cos(alpha)];

test('one slice by hand (V1m): nail of 60 kN/m at 40 deg on a base of 20 deg, passive force applied as the vector P/F', () => {
  const { alpha, R, slice, circle, l } = handSlice();
  // nail direction (-cos40, -sin40), force 60 kN/m: P_x = -45.96, P_z = -38.57
  const mock = [{ intersects: true, sliceIndex: 0, type: 'nail', Px: -60 * Math.cos(40 * DEG), Pz: -60 * Math.sin(40 * DEG), point: radialPoint(R, alpha) }];
  const [s] = withSupportSums([slice], mock, circle);
  // by hand, full values: P_t = 60 * (d . t) = -60 cos(60 deg) = -30 (braking), P_n = 60 sin(60 deg) = 51.9615 (pressing)
  near(assert, s.PtP, -30, 1e-9, 'P_t');
  near(assert, s.PnP, 60 * Math.sin(60 * DEG), 1e-9, 'P_n');
  near(assert, s.MP, R * -30, 1e-9, 'M at the radial point = R * P_t');
  assert.equal(s.PtA, 0);
  assert.equal(s.PnA, 0);
  // Version 0.6: both components divided by F. R_i(F) = c l + (V cos a + P_n/F) tan(phi), D_i(F) = V sin a + P_t/F.
  // F D_i = R_i  =>  a F^2 + b F + c0 = 0 with a = V sin a = 171.0101,
  // b = P_t - (c l + V cos a tan(phi)) = -30 - 281.9077 = -311.9077, c0 = -P_n tan(phi) = -30.0000
  // F = (-b + sqrt(b^2 - 4 a c0)) / (2 a) = 1.9155
  const a = 500 * Math.sin(alpha);
  const b = -30 - (5 * l + 500 * Math.cos(alpha) * Math.tan(30 * DEG));
  const c0 = -60 * Math.sin(60 * DEG) * Math.tan(30 * DEG);
  near(assert, a, 171.0101, 1e-3, 'V sin a by hand');
  near(assert, b, -311.9077, 1e-3, 'b by hand');
  near(assert, c0, -30, 1e-9, 'c0 by hand');
  const F = (-b + Math.sqrt(b * b - 4 * a * c0)) / (2 * a);
  near(assert, F, 1.9155, 1e-4, 'F by hand');
  // one slice: n_i cancels, so F_f = F_m = F for every theta (M_d = V sin a, M_S/R = P_t/F)
  for (const theta of [0, 10, 25]) {
    const r = spencerForTheta([s], circle, theta, OPTS);
    assert.equal(r.valid, true, `theta ${theta}`);
    near(assert, r.Ff, F, 1e-9, `F_f at ${theta}`);
    near(assert, r.Fm, F, 1e-9, `F_m at ${theta}`);
  }
  // at this F the applied force is exactly the vector P/F: components on the base from P_t/F and P_n/F ...
  const Pt = s.PtP / F;
  const Pn = s.PnP / F;
  near(assert, Pt * Math.cos(alpha) - Pn * Math.sin(alpha), mock[0].Px / F, 1e-9, 'P_x,eff = P_x / F');
  near(assert, -Pt * Math.sin(alpha) - Pn * Math.cos(alpha), mock[0].Pz / F, 1e-9, 'P_z,eff = P_z / F');
  // ... R_i and D_i by hand at this F reproduce F = R_i / D_i
  const Ri = 5 * l + (500 * Math.cos(alpha) + Pn) * Math.tan(30 * DEG);
  const Di = 500 * Math.sin(alpha) + Pt;
  near(assert, Ri / Di, F, 1e-9, 'R_i / D_i at the end value');
  // not the old treatment (P_t/F in R_i, P_n in full): that would give F = 1.9993
  const fOld = (5 * l + 500 * Math.cos(alpha) * Math.tan(30 * DEG) + 60 * Math.sin(60 * DEG) * Math.tan(30 * DEG) + 30) / a;
  assert.ok(Math.abs(F - fOld) > 0.05, `F ${F} against ${fOld}`);
  // without the nail: F = (c l + V cos a tan(phi)) / (V sin a) = 1.6485
  const noNail = spencerForTheta([{ ...s, PtP: 0, PnP: 0, MP: 0 }], circle, 0, OPTS);
  near(assert, noNail.Ff, (5 * l + 500 * Math.cos(alpha) * Math.tan(30 * DEG)) / a, 1e-9);
});

test('moment of the support force: lever arm at the intersection point, not P_t * R (one slice, force at an arc point that is not below the base)', () => {
  const { alpha, R, slice, circle, l } = handSlice();
  const beta = 35 * DEG; // the force acts at the arc point at 35 deg, the slice base is at 20 deg
  const point = [-R * Math.sin(beta), -R * Math.cos(beta)];
  const mock = [{ intersects: true, sliceIndex: 0, type: 'nail', Px: -60 * Math.cos(40 * DEG), Pz: -60 * Math.sin(40 * DEG), point }];
  const [s] = withSupportSums([slice], mock, circle);
  // by hand: M = P_x (z_c - z_s) - P_z (x_c - x_s) = R (P_x cos b - P_z sin b) = -60 R cos(40 + 35 deg) = -155.29;  R * P_t = -300
  near(assert, s.MP, -60 * R * Math.cos(75 * DEG), 1e-9, 'M at the intersection point');
  near(assert, s.MP, -155.2914, 1e-3, 'M by hand');
  assert.ok(Math.abs(s.MP - R * s.PtP) > 100, 'the two moments differ');
  // F_m at theta = 0 from the spec formula (4.3): F = R_i k / (M_d + M_S/R - D_i (1 - k)), all at the same F;
  // R_i = c l + (V cos a + P_n/F) tan(phi), D_i = V sin a + P_t/F, M_S = M/F, k = cos a / (cos a + sin a tan(phi)/F)
  const Md = 500 * Math.sin(alpha);
  const h = (F) => {
    const n = Math.cos(alpha) + (Math.sin(alpha) * Math.tan(30 * DEG)) / F;
    const k = Math.cos(alpha) / n;
    const Ri = 5 * l + (500 * Math.cos(alpha) + s.PnP / F) * Math.tan(30 * DEG);
    const Di = 500 * Math.sin(alpha) + s.PtP / F;
    return F * (Md + s.MP / F / R - Di * (1 - k)) - Ri * k;
  };
  let lo = 0.5;
  let hi = 5;
  assert.ok(h(lo) * h(hi) < 0);
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (h(lo) * h(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const Fspec = 0.5 * (lo + hi);
  const fm = spencerForTheta([s], circle, 0, OPTS);
  assert.equal(fm.valid, true);
  near(assert, fm.Fm, Fspec, 1e-9, 'F_m with the lever arm');
  // with M = R * P_t (the force at the radial point) F_m is another value (and equal to F_f)
  const radial = withSupportSums([slice], [{ ...mock[0], point: radialPoint(R, alpha) }], circle)[0];
  const fr = spencerForTheta([radial], circle, 0, OPTS);
  assert.ok(Math.abs(fr.Fm - fm.Fm) > 0.01, `${fr.Fm} against ${fm.Fm}`);
});

test('moment of the support force in a real case: M_S differs from R * sum P_t (S1 circle, force at the intersection point)', () => {
  const model = b1With([nailFromTo('N1', ...NAIL_S1, true)]);
  const { g, slices } = prepared(model, CIRCLE_S1);
  const MP = slices.reduce((sum, s) => sum + s.MP, 0);
  const RPt = g.circle.R * slices.reduce((sum, s) => sum + s.PtP, 0);
  assert.ok(Math.abs(MP - RPt) > 20, `M_S ${MP} against R P_t ${RPt}`); // about 31 kN m: the chord is not the arc
  near(assert, MP, 2615.25, 0.1, 'M_S, Slide2 reports 2615.16 kN m'); // calculation frame, full force
});

test('one slice by hand: anchor (active) of 40 kN/m, nothing divided by F, moment at the intersection point', () => {
  const { alpha, R, slice, circle, l } = handSlice();
  const mock = [{ intersects: true, sliceIndex: 0, type: 'anchor', Px: -40 * Math.cos(40 * DEG), Pz: -40 * Math.sin(40 * DEG), point: radialPoint(R, alpha) }];
  const [s] = withSupportSums([slice], mock, circle);
  near(assert, s.PtA, -20, 1e-9);
  near(assert, s.PnA, 40 * Math.sin(60 * DEG), 1e-9);
  near(assert, s.MA, R * -20, 1e-9);
  assert.equal(s.PtP, 0);
  assert.equal(s.MP, 0);
  // R_i = c l + (V cos a + P_n) tan(phi); D_i = V sin a + P_t = 171.010 - 20; independent of F
  const Ri = 5 * l + (500 * Math.cos(alpha) + 40 * Math.sin(60 * DEG)) * Math.tan(30 * DEG);
  const Di = 500 * Math.sin(alpha) - 20;
  const r = spencerForTheta([s], circle, 0, OPTS);
  assert.equal(r.valid, true);
  near(assert, r.Ff, Ri / Di, 1e-9);
  near(assert, r.Fm, Ri / Di, 1e-9);
});

// ---------------------------------------------------------------------------
// I_SUPPORT_SPENCER_ONLY (SPEC_ETAPPE3 4.5)
// ---------------------------------------------------------------------------

test('I_SUPPORT_SPENCER_ONLY: Bishop, Janbu and Janbu corrected give the code for every circle, Spencer calculates', () => {
  const model = b1With(pilesS6());
  model.analysis.methods = ['bishop', 'janbu', 'spencer'];
  const cut = analyzeSurface(model, CIRCLE_S6); // piles cut this circle
  const circle2 = { xc: 50, zc: 80, R: 52 };
  const none = analyzeSurface(b1With([nailFromTo('far', [100, 50], [110, 45])], 'characteristic'), circle2);
  const noneModel = b1With([nailFromTo('far', [100, 50], [110, 45])]);
  noneModel.analysis.methods = ['bishop', 'janbu', 'spencer'];
  const noCut = analyzeSurface(noneModel, circle2); // no element cuts it
  for (const r of [cut, noCut]) {
    assert.equal(r.valid, true);
    for (const k of ['bishop', 'janbu', 'janbuCorrected']) {
      assert.equal(r.results[k].valid, false, k);
      assert.equal(r.results[k].code, 'I_SUPPORT_SPENCER_ONLY', k);
    }
    assert.equal(r.results.spencer.valid, true);
  }
  assert.equal(none.results.bishop, undefined, 'methods not requested are not listed');
});

test('I_SUPPORT_SPENCER_ONLY: without supports (or []) Bishop and Janbu calculate as before', () => {
  for (const supports of [[], undefined]) {
    const model = b1With(supports);
    if (supports === undefined) delete model.supports;
    model.analysis.methods = ['bishop', 'janbu', 'spencer'];
    const r = analyzeSurface(model, { xc: 50, zc: 80, R: 52 });
    assert.equal(r.results.bishop.valid, true);
    assert.equal(r.results.janbu.valid, true);
    assert.equal(r.results.janbuCorrected.valid, true);
    assert.equal('supports' in r, false);
  }
});

test('I_SUPPORT_SPENCER_ONLY: a geometrically invalid circle keeps its geometry code (open question, order 21)', () => {
  const model = b1With(pilesS6());
  model.analysis.methods = ['bishop', 'spencer'];
  const r = analyzeSurface(model, { xc: 200, zc: 200, R: 5 });
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_INTERSECTIONS');
});

test('search with supports: only Spencer is searched, critical has Spencer with the supports list', () => {
  const model = b1With([anchorFromTo(...ANCHOR_S4, 9)]);
  model.analysis.methods = ['bishop', 'janbu', 'spencer'];
  model.search = { grid: { xMin: 40, xMax: 44, zMin: 76, zMax: 80, nx: 2, nz: 2 }, radii: 3 };
  model.surfaces = [{ id: 'SL', ...CIRCLE_S4 }];
  const r = analyze(model);
  assert.deepEqual(Object.keys(r.critical), ['spencer']);
  const c = r.critical.spencer;
  assert.ok(c && Number.isFinite(c.F));
  assert.equal(c.supports.length, 1);
  assert.equal(c.supports[0].id, 'A1');
  assert.equal(c.supports[0].applied, c.supports[0].perMetre, 'active: applied = perMetre');
  assert.equal(r.surfaces[0].supports.length, 1);
  assert.equal(r.surfaces[0].results.bishop.code, 'I_SUPPORT_SPENCER_ONLY');
});

// ---------------------------------------------------------------------------
// final check (SPEC_ETAPPE3 4.4) with support forces
// ---------------------------------------------------------------------------

test('final equilibrium check with support forces: residuals <= tolerance (nail, anchor, piles)', () => {
  const cases = [
    [b1With([nailFromTo('N1', ...NAIL_S1, true)]), CIRCLE_S1],
    [b1With([anchorFromTo(...ANCHOR_S4, 2)]), CIRCLE_S4],
    [b1With([anchorFromTo(...ANCHOR_S4, 9), ...pilesS6()]), CIRCLE_S6],
  ];
  for (const [model, circle] of cases) {
    const r = analyzeSurface(model, circle).results.spencer;
    assert.equal(r.valid, true);
    const tol = model.analysis.tolerance;
    for (const key of ['forceResidual', 'momentResidual', 'sliceResidual']) {
      assert.ok(r.equilibrium[key] <= tol, `${key} = ${r.equilibrium[key]}`);
    }
    // the same residuals computed directly at the result (the check is part of the acceptance)
    const { g, slices } = prepared(model, circle);
    const e = spencerEquilibrium(slices, g.circle, r.F, r.theta, { kh: 0, tolerance: tol });
    assert.equal(e.valid, true);
  }
});

test('the check sees the support forces: dropping them from the check makes the residual large', () => {
  const model = b1With([nailFromTo('N1', ...NAIL_S1, true)]);
  const r = analyzeSurface(model, CIRCLE_S1).results.spencer;
  const { g, slices } = prepared(model, CIRCLE_S1);
  const stripped = slices.map((s) => ({ ...s, PtA: 0, PnA: 0, PtP: 0, PnP: 0, MA: 0, MP: 0 }));
  const e = spencerEquilibrium(stripped, g.circle, r.F, r.theta, { kh: 0, tolerance: 1e-4 });
  assert.equal(e.valid, false, 'without the forces the solution is not an equilibrium');
});

// ---------------------------------------------------------------------------
// output (SPEC_ETAPPE3 6)
// ---------------------------------------------------------------------------

test('output of one circle: fields, active/passive applied, element without intersection only { id, type, intersects }', () => {
  const model = b1With([anchorFromTo(...ANCHOR_S4, 9), ...pilesS6(), nailFromTo('far', [100, 50], [110, 45])]);
  const r = analyzeSurface(model, CIRCLE_S6);
  const F = r.results.spencer.F;
  assert.equal(r.supports.length, 6);
  const byId = Object.fromEntries(r.supports.map((s) => [s.id, s]));
  assert.deepEqual(byId.far, { id: 'far', type: 'nail', intersects: false });
  for (const id of ['A1', 'P1', 'P2', 'P3', 'P4']) {
    const s = byId[id];
    assert.deepEqual(Object.keys(s), ['id', 'type', 'intersects', 'point', 'slice', 'T', 'governs', 'perMetre', 'applied', 'direction']);
    assert.equal(s.intersects, true);
    assert.equal(s.point.length, 2);
    assert.equal(s.direction.length, 2);
    near(assert, Math.hypot(s.direction[0], s.direction[1]), s.perMetre, 1e-9, `${id} |direction|`);
  }
  // active: applied = perMetre; passive: perMetre / F (final value)
  assert.equal(byId.A1.applied, byId.A1.perMetre);
  for (const id of ['P1', 'P2', 'P3', 'P4']) near(assert, byId[id].applied, byId[id].perMetre / F, 1e-12, id);
  assert.equal(byId.A1.governs, 'anchor');
  assert.equal(byId.P1.governs, 'shear');
  assert.equal(byId.P1.T, 20);
  assert.equal(byId.P1.perMetre, 20);
});

test('output: slice = 1-based number in the slice table of the result, point lies in that slice (input frame, slope falls left)', () => {
  const model = b1With(pilesS6());
  const r = analyzeSurface(model, CIRCLE_S6);
  for (const s of r.supports) {
    const sl = r.slices[s.slice - 1];
    assert.ok(sl, 'slice exists');
    assert.ok(s.point[0] >= sl.xLeft - 1e-9 && s.point[0] <= sl.xRight + 1e-9, `${s.id}: x ${s.point[0]} in [${sl.xLeft}, ${sl.xRight}]`);
  }
});

test('output: input frame direction of a nail of B1 (slope falls left): into the slope = +x, down', () => {
  const r = analyzeSurface(b1With([nailFromTo('N1', ...NAIL_S1, true)]), CIRCLE_S1);
  const s = r.supports[0];
  assert.ok(s.direction[0] > 0 && s.direction[1] < 0);
  // T = 300 kN (rod), s about 0.166 m from the head: point close to the head
  assert.equal(s.T, 300);
  assert.equal(s.governs, 'tensile');
  assert.ok(Math.hypot(s.point[0] - NAIL_S1[0][0], s.point[1] - NAIL_S1[0][1]) < 0.5);
});

test('slice table: sumPt and sumPn are effective sums at the final F (passive / F, SPEC_ETAPPE3 4.2, 6), none without supports', () => {
  // order 23a: until order 23 the passive part was output in full (old target: P_t = -Px cos(a) + Pz sin(a) from `direction`); SPEC 0.12 divides it by F
  const model = b1With([nailFromTo('N1', ...NAIL_S1, true)]);
  const r = analyzeSurface(model, CIRCLE_S1);
  const s = r.supports[0];
  const k = s.slice - 1;
  const F = r.results.spencer.F;
  // input frame (sliding to -x): P_t = -P_x cos(a) + P_z sin(a), P_n = -(P_x sin(a) + P_z cos(a)), a = alpha of the table; a nail is passive: / F
  const a = r.slices[k].alpha;
  const [Px, Pz] = s.direction;
  near(assert, r.slices[k].sumPt, (-Px * Math.cos(a) + Pz * Math.sin(a)) / F, 1e-9, 'sumPt');
  near(assert, r.slices[k].sumPn, (-(Px * Math.sin(a) + Pz * Math.cos(a))) / F, 1e-9, 'sumPn');
  near(assert, s.applied, s.perMetre / F, 1e-12, 'applied is perMetre / F, the same division');
  // (the sign of P_t depends on the base: a steep nail on a base steeper than about 38 deg pulls along it)
  r.slices.forEach((sl, i) => {
    if (i !== k) {
      assert.equal(sl.sumPt, 0);
      assert.equal(sl.sumPn, 0);
    }
  });
  const plain = analyzeSurface(b1With([]), CIRCLE_S1);
  assert.equal('sumPt' in plain.slices[0], false);
  assert.equal('sumPn' in plain.slices[0], false);
});

test('slice table: an anchor (active) gives the full values, not divided by F (order 23a)', () => {
  const model = b1With([anchorFromTo(...ANCHOR_S4, 9)]);
  const r = analyzeSurface(model, CIRCLE_S4);
  const s = r.supports[0];
  assert.equal(s.intersects, true);
  const k = s.slice - 1;
  const a = r.slices[k].alpha;
  const [Px, Pz] = s.direction;
  near(assert, r.slices[k].sumPt, -Px * Math.cos(a) + Pz * Math.sin(a), 1e-9, 'sumPt (full)');
  near(assert, r.slices[k].sumPn, -(Px * Math.sin(a) + Pz * Math.cos(a)), 1e-9, 'sumPn (full)');
  near(assert, s.applied, s.perMetre, 1e-12, 'active: applied = perMetre');
  r.slices.forEach((sl, i) => { if (i !== k) assert.equal(sl.sumPt, 0); });
});

test('slice table: an anchor and a nail on the same slice: active in full plus passive / F (order 23a)', () => {
  const nail = nailFromTo('N1', ...NAIL_S1, true);
  const anchor = anchorFromTo(NAIL_S1[0], NAIL_S1[1], 9); // same head and direction: the same intersection point, the same slice
  const r = analyzeSurface(b1With([nail, anchor]), CIRCLE_S1);
  const [sn, sa] = r.supports;
  assert.equal(sn.intersects && sa.intersects, true);
  assert.equal(sn.slice, sa.slice);
  const k = sn.slice - 1;
  const F = r.results.spencer.F;
  const a = r.slices[k].alpha;
  const pt = ([Px, Pz]) => -Px * Math.cos(a) + Pz * Math.sin(a);
  const pn = ([Px, Pz]) => -(Px * Math.sin(a) + Pz * Math.cos(a));
  near(assert, r.slices[k].sumPt, pt(sa.direction) + pt(sn.direction) / F, 1e-9, 'sumPt = active + passive / F');
  near(assert, r.slices[k].sumPn, pn(sa.direction) + pn(sn.direction) / F, 1e-9, 'sumPn = active + passive / F');
});

test('slice table, S6 at the circle of Slide2: per pile |sumPt| is the applied force (parallel to the slip surface), within 0.05 (order 23a)', () => {
  const r = analyzeSurface(b1With(pilesS6()), CIRCLE_S6);
  const F = r.results.spencer.F;
  assert.ok(r.supports.every((s) => s.intersects && s.perMetre === 20));
  for (const s of r.supports) {
    const sl = r.slices[s.slice - 1];
    near(assert, s.applied, 20 / F, 1e-12, 'applied');
    assert.ok(Math.abs(Math.abs(sl.sumPt) - s.applied) < 0.05, `${s.id}: |sumPt| ${Math.abs(sl.sumPt)} against applied ${s.applied}`);
    assert.ok(sl.sumPt < 0, 'the pile brakes (against the sliding direction)');
    assert.ok(Math.abs(sl.sumPn) < 0.2 * s.applied, 'little normal force: the pile force is parallel to the slip surface');
  }
  // the other slices carry nothing
  const used = new Set(r.supports.map((s) => s.slice - 1));
  r.slices.forEach((sl, i) => { if (!used.has(i)) assert.equal(sl.sumPt, 0); });
});

test('slice table: Spencer gives no F for the circle: sumPt and sumPn are null (fields stay), applied null (order 23a)', () => {
  const model = b1With(pilesS6());
  const r = analyzeSurface(model, { xc: 35, zc: 45, R: 35 });
  assert.equal(r.valid, true);
  assert.equal(r.results.spencer.valid, false, 'the circle is valid, Spencer has no result');
  assert.ok(r.slices.length > 0);
  for (const sl of r.slices) {
    assert.ok(Object.hasOwn(sl, 'sumPt') && Object.hasOwn(sl, 'sumPn'), 'the fields stay while the model has supports');
    assert.equal(sl.sumPt, null);
    assert.equal(sl.sumPn, null);
  }
  assert.ok(r.supports.some((s) => s.intersects && s.applied === null));
});
