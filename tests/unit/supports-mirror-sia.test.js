// Order 21: S-T4 (mirrored model with supports) and S-T7 (mode sia against mode
// characteristic with by-hand reduced values), plus the sia check format
// (SPEC_ETAPPE3 5).

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface } from '../../core/index.js';
import { near } from './helpers.js';
import {
  ANCHOR_S4, CIRCLE_S1, CIRCLE_S4, CIRCLE_S6, NAIL_S1, NAIL_S3_2,
  anchorFromTo, b1With, mirrorWithSupports, nailFromTo, pilesS6,
} from './supports-b1-helpers.js';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// S-T4
// ---------------------------------------------------------------------------

const t4Cases = [
  // the nail of Slide2 case S1 (built here, no benchmark file is read), anchor of S4, piles of S6
  ['S1 geometry: nail with head', () => b1With([nailFromTo('N1', ...NAIL_S1, true)]), CIRCLE_S1],
  ['S4 geometry: anchor', () => b1With([anchorFromTo(...ANCHOR_S4, 9)]), CIRCLE_S4],
  ['S6 geometry: four piles', () => b1With(pilesS6()), CIRCLE_S6],
];

for (const [name, build, circle] of t4Cases) {
  test(`S-T4 mirrored model gives the same F and the mirrored supports output, ${name}`, () => {
    const model = build();
    const mirrored = mirrorWithSupports(model);
    assert.notEqual(mirrored.analysis.direction, model.analysis.direction);
    const a = analyzeSurface(model, circle);
    const b = analyzeSurface(mirrored, { ...circle, xc: -circle.xc });
    assert.equal(a.valid, true);
    assert.equal(b.valid, true);
    near(assert, b.results.spencer.F, a.results.spencer.F, 1e-4, 'F');
    near(assert, b.results.spencer.theta, a.results.spencer.theta, 1e-3, 'theta');
    const n = a.slices.length;
    assert.equal(b.slices.length, n);
    assert.equal(b.supports.length, a.supports.length);
    a.supports.forEach((sa, i) => {
      const sb = b.supports[i];
      assert.equal(sb.id, sa.id);
      assert.equal(sb.intersects, sa.intersects);
      if (!sa.intersects) return;
      near(assert, sb.point[0], -sa.point[0], 1e-9, `${sa.id} point x`);
      near(assert, sb.point[1], sa.point[1], 1e-9, `${sa.id} point z`);
      assert.equal(sb.slice, n + 1 - sa.slice, `${sa.id} slice number is mirrored`);
      near(assert, sb.T, sa.T, 1e-9, 'T');
      assert.equal(sb.governs, sa.governs);
      near(assert, sb.perMetre, sa.perMetre, 1e-9, 'perMetre');
      near(assert, sb.applied, sa.applied, 1e-4, 'applied');
      near(assert, sb.direction[0], -sa.direction[0], 1e-9, `${sa.id} P_x is reversed`);
      near(assert, sb.direction[1], sa.direction[1], 1e-9, `${sa.id} P_z`);
    });
    // slice table: sums mirrored (the table is ordered by increasing x in the input frame)
    const ptA = a.slices.map((s) => s.sumPt);
    const ptB = b.slices.map((s) => s.sumPt).reverse();
    ptA.forEach((v, i) => near(assert, ptB[i], v, 1e-9, `sumPt slice ${i + 1}`));
    const pnA = a.slices.map((s) => s.sumPn);
    const pnB = b.slices.map((s) => s.sumPn).reverse();
    pnA.forEach((v, i) => near(assert, pnB[i], v, 1e-9, `sumPn slice ${i + 1}`));
  });
}

// ---------------------------------------------------------------------------
// S-T7: sia against characteristic with by-hand reduced values
// ---------------------------------------------------------------------------

const GC = 1.5; // gamma_c (default), gamma_phi 1.2, gamma_cu 1.5, gamma_R 1.1
const GPHI = 1.2;
const GCU = 1.5;
const GR = 1.1;

/** Mixed model: nails (pull-out and rod governing), anchor, piles, two shotcrete bands. */
function mixedSupports(own = {}) {
  return [
    nailFromTo('N1', ...NAIL_S1, true, { bond: { q: 5 }, tensile: 300, ...(own.nail || {}) }), // pull-out governs
    nailFromTo('N2', ...NAIL_S3_2, false, { bond: { tau: 80, diameter: 0.1 }, tensile: 20, ...(own.nail || {}) }), // rod governs
    anchorFromTo(...ANCHOR_S4, 9, { P0: 40, Rk: 100, ...(own.anchor || {}) }),
    ...pilesS6().slice(0, 2).map((p) => ({ ...p, ...(own.pile || {}) })),
    { id: 'S1', type: 'shotcrete', x1: 20, x2: 55, thickness: 0.15, tau: 1500, ...(own.shotcrete || {}) },
  ];
}

/** The same elements for mode characteristic with the resistances reduced by hand. */
function reducedByHand(sia, own = {}) {
  const gM = (own.nail && own.nail.gammaM) || 1.35;
  const gA = (own.anchor && own.anchor.gammaA) || 1.0;
  const gMp = (own.pile && own.pile.gammaM) || 1.4;
  const gCs = (own.shotcrete && own.shotcrete.gammaC) || 1.5;
  return sia.map((s) => {
    const c = structuredClone(s);
    for (const k of ['gammaM', 'gammaA', 'gammaC']) delete c[k];
    if (s.type === 'nail') {
      if (c.bond.q !== undefined) c.bond.q /= gM;
      else c.bond.tau /= gM; // q = tau pi D: dividing tau divides q
      c.tensile /= gM;
    } else if (s.type === 'anchor') {
      c.P0 = gA * s.P0;
    } else if (s.type === 'pile') {
      c.shear /= gMp;
    } else {
      c.tau /= gCs;
    }
    return c;
  });
}

const soilByHand = (model, undrained) => {
  const m = model.materials.M1;
  if (undrained) m.cu = m.cu / GCU / GR;
  else {
    m.c = m.c / GC / GR;
    m.phi = Math.atan(Math.tan(m.phi * DEG) / GPHI / GR) / DEG;
  }
};

const t7Cases = [
  ['defaults of chapter 5 (gammaM 1.35, gammaA 1.0, pile 1.4, shotcrete 1.5)', {}],
  ['own factors (nail 1.6, anchor gammaA 1.1, pile 2.0, shotcrete 2.0)', {
    nail: { gammaM: 1.6 }, anchor: { gammaA: 1.1, gammaM: 1.5 }, pile: { gammaM: 2 }, shotcrete: { gammaC: 2 },
  }],
];

for (const [name, own] of t7Cases) {
  test(`S-T7 sia = characteristic with hand-reduced soil (gamma_c, gamma_phi AND gamma_R) and supports, ${name}`, () => {
    const supports = mixedSupports(own);
    const sia = b1With(supports, 'sia');
    sia.partialFactors = { phi: GPHI, c: GC, cu: GCU, gamma: 1, G: 1, Q: 1.3, R: GR };
    const hand = b1With(reducedByHand(supports, own), 'characteristic');
    soilByHand(hand, false);
    const a = analyzeSurface(sia, CIRCLE_S6);
    const b = analyzeSurface(hand, CIRCLE_S6);
    assert.equal(a.valid, true);
    assert.equal(a.supports.filter((s) => s.intersects).length, supports.length, 'every element acts on the circle');
    near(assert, a.results.spencer.F, b.results.spencer.F, 1e-4, 'F');
    // the reduced forces are the ones of the by-hand model
    a.supports.forEach((s, i) => near(assert, s.T, b.supports[i].T, 1e-9, `${s.id} T`));
    // and they are really reduced against the plain characteristic model
    const plain = analyzeSurface(b1With(supports, 'characteristic'), CIRCLE_S6);
    assert.ok(a.supports[0].T < plain.supports[0].T, 'nail 1 pull-out reduced');
    assert.ok(a.supports[1].T < plain.supports[1].T, 'nail 2 rod reduced');
    assert.ok(a.supports.find((s) => s.id === 'S1').T < plain.supports.find((s) => s.id === 'S1').T, 'shotcrete reduced');
  });
}

test('S-T7 undrained soil: cu / gamma_cu / gamma_R, with supports', () => {
  const supports = [...pilesS6().slice(0, 2), nailFromTo('N1', ...NAIL_S1, true, { bond: { q: 5 } })];
  const mk = (mode) => {
    const m = b1With(supports, mode);
    m.materials.M1 = { name: 'clay', gamma: 19, gammaSat: 20, model: 'undrained', cu: 40 };
    return m;
  };
  const sia = mk('sia');
  const hand = b1With(reducedByHand(supports, {}), 'characteristic');
  hand.materials.M1 = { name: 'clay', gamma: 19, gammaSat: 20, model: 'undrained', cu: 40 };
  soilByHand(hand, true);
  const a = analyzeSurface(sia, CIRCLE_S6);
  const b = analyzeSurface(hand, CIRCLE_S6);
  assert.equal(a.valid, true);
  near(assert, a.results.spencer.F, b.results.spencer.F, 1e-4, 'F');
});

test('S-T7 without supports mode sia keeps SPEC 2.4 (gamma_R not applied to the soil): characteristic with c/1.5, tan(phi)/1.2 gives the same F', () => {
  const sia = b1With([], 'sia');
  const hand = b1With([], 'characteristic');
  hand.materials.M1.c = hand.materials.M1.c / 1.5;
  hand.materials.M1.phi = Math.atan(Math.tan(30 * DEG) / 1.2) / DEG;
  const a = analyzeSurface(sia, { xc: 50, zc: 80, R: 52 });
  const b = analyzeSurface(hand, { xc: 50, zc: 80, R: 52 });
  near(assert, a.results.spencer.F, b.results.spencer.F, 1e-6);
});

// ---------------------------------------------------------------------------
// verification format in mode sia
// ---------------------------------------------------------------------------

const smallSearch = { grid: { xMin: 40, xMax: 44, zMin: 76, zMax: 80, nx: 2, nz: 2 }, radii: 3 };

test('sia check with supports: F_d >= 1.0, utilisation = 1 / F_d, marked withSupports (open question, order 21)', () => {
  const model = b1With([anchorFromTo(...ANCHOR_S4, 9, { Rk: 100 })], 'sia'); // Rk 100: SIA 267 eq. 60 holds
  model.search = smallSearch;
  const r = analyze(model);
  const F = r.critical.spencer.F;
  assert.equal(r.check.withSupports, true);
  assert.equal(r.check.required, 1);
  assert.equal(r.check.gammaR, 1.1);
  assert.equal(r.check.spencer.F, F);
  near(assert, r.check.spencer.utilisation, 1 / F, 1e-12);
  assert.equal(r.check.spencer.ok, F >= 1);
  assert.equal('bishop' in r.check, false);
});

test('sia check without supports: unchanged format, F_d >= gamma_R, utilisation = gamma_R / F_d', () => {
  const model = b1With([], 'sia');
  model.analysis.methods = ['bishop', 'spencer'];
  model.search = smallSearch;
  const r = analyze(model);
  assert.deepEqual(Object.keys(r.check).sort(), ['bishop', 'gammaR', 'spencer']);
  for (const k of ['bishop', 'spencer']) {
    near(assert, r.check[k].utilisation, 1.1 / r.check[k].F, 1e-12, k);
    assert.equal(r.check[k].ok, r.check[k].F >= 1.1);
  }
});
