// S-T5 (nails), S-T6 (anchors) and the further checks of order 20
// (SPEC_ETAPPE3 3.1 to 3.3 and 5, first point): intersection, slice, force T,
// governing limit, force per metre and direction of each element.
//
// Geometry (see supports-helpers.js), calculation frame:
//   circle xc=0, zc=5, R=13; entry (-12, 0), exit (5, -7); ground slope z = -7(x+8)/13.
// Hand calculation of the intersections used below:
//   N-near:  head (-10, 0), angle 0, runs left along z=0 -> circle at (-12, 0); L_v = 2.
//   N-far:   head (-1.5, -3.5), angle 45 deg (the ground at x=-1.5 is z=-3.5) runs along
//            z = x - 2 -> circle at (-5, -7) since 25 + 144 = 169; L_v = 3.5*sqrt(2) = 4.949747.
//   pile:    head (-8, 0) straight down -> circle at x=-8: z = 5 - sqrt(169 - 64) = -5.246951.
//   q = tau*pi*D = 80*pi*0.1 = 8*pi = 25.132741 kN/m.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pointToInput } from '../../core/model.js';
import { evaluateSupport, evaluateSupports, resolveSupportFactors, supportSegment } from '../../core/supports.js';
import {
  TEST_CIRCLE,
  anchorOf,
  nailFormA,
  pileOf,
  shotcreteOf,
  supportModel,
  surfaceOf,
} from './supports-helpers.js';
import { near } from './helpers.js';

const SQ2 = Math.SQRT2;
const Q_TAU = 8 * Math.PI; // 80 kPa * pi * 0.1 m
const L_FAR = 3.5 * SQ2; // length from the head (-1.5,-3.5) to (-5,-7)

/** Evaluate one element (or the list) on the test circle; mode "characteristic" unless given. */
function evalOne(support, mode = 'characteristic') {
  const { m, g } = surfaceOf(supportModel([support], mode));
  assert.equal(g.valid, true);
  return evaluateSupport(m.supports[0], m, g);
}

const nearHead = (extra = {}) => nailFormA({ x: -10, z: 0, angle: 0, length: 10, ...extra });
const farBack = (extra = {}) => nailFormA({ x: -1.5, z: -3.5, angle: 45, length: 8, ...extra });

/** One hand-calculated case: expected T and governing limit. */
function handCase(name, support, expectedT, expectedGoverns, opts = {}) {
  test(`S-T5/6 ${name}`, (t) => {
    const r = evalOne(support, opts.mode);
    assert.equal(r.intersects, true, 'must intersect');
    near(assert, r.T, expectedT, 1e-6, 'T');
    assert.equal(r.governs, expectedGoverns);
    near(assert, r.perMetre, expectedT / (support.spacing ?? 1), 1e-6, 'perMetre');
    t.diagnostic(`HAND ${name} | expected ${expectedT.toFixed(4)} | computed ${r.T.toFixed(4)} | ${r.governs}`);
  });
}

// ---------------------------------------------------------------------------
// S-T5 nails: tau/D form, q = 8*pi = 25.1327 kN/m
// ---------------------------------------------------------------------------

// near the head: L_v = 2, L_h = 8 (length 10)
//   T_back = 8*pi*8 = 201.062, T_front = 8*pi*2 = 50.265, T_rod = 150 (or 300)
handCase('nail near head, head, rod 150: min(201.06; 150) = 150', nearHead(), 150, 'tensile');
handCase('nail near head, head, rod 300: min(201.06; 300) = 201.06', nearHead({ tensile: 300 }), 64 * Math.PI, 'pulloutBack');
handCase('nail near head, no head, rod 150: min(201.06; 150; 50.27) = 50.27', nearHead({ hasHead: false }), 16 * Math.PI, 'pulloutFront');
// far back: L_v = 4.949747, L_h = 8 - 4.949747 = 3.050253 (length 8)
//   T_back = 8*pi*3.050253 = 76.6612, T_front = 8*pi*4.949747 = 124.4010
handCase('nail far back, head: min(76.66; 150) = 76.66', farBack(), Q_TAU * (8 - L_FAR), 'pulloutBack');
handCase('nail far back, no head: min(76.66; 150; 124.40) = 76.66', farBack({ hasHead: false }), Q_TAU * (8 - L_FAR), 'pulloutBack');
// rod governs
handCase('nail far back, head, rod 60: min(76.66; 60) = 60', farBack({ tensile: 60 }), 60, 'tensile');
handCase('nail far back, no head, rod 60: min(76.66; 60; 124.40) = 60', farBack({ tensile: 60, hasHead: false }), 60, 'tensile');
handCase('nail far back, no head, length 12: L_h = 7.05, T_back = 177.2, front 124.40, rod 150 -> 124.40',
  farBack({ length: 12, hasHead: false, tensile: 400 }), Q_TAU * L_FAR, 'pulloutFront');

// q form: q = 30 kN/m
//   near: T_back = 240, T_front = 60; far: T_back = 30*3.050253 = 91.5076, T_front = 148.492
handCase('nail q-form near head, head, rod 150: min(240; 150) = 150', nearHead({ bond: { q: 30 } }), 150, 'tensile');
handCase('nail q-form near head, no head: min(240; 150; 60) = 60', nearHead({ bond: { q: 30 }, hasHead: false }), 60, 'pulloutFront');
handCase('nail q-form far back, head: min(91.51; 150) = 91.51', farBack({ bond: { q: 30 } }), 30 * (8 - L_FAR), 'pulloutBack');
handCase('nail q-form far back, no head: min(91.51; 150; 148.49) = 91.51', farBack({ bond: { q: 30 }, hasHead: false }), 30 * (8 - L_FAR), 'pulloutBack');
handCase('nail q-form far back, rod 60: min(91.51; 60) = 60', farBack({ bond: { q: 30 }, tensile: 60 }), 60, 'tensile');

// SPEC_ETAPPE3 3.4 (1): tie of two limits -> first in the order of the formulas in 3.2 (back, rod, front)
handCase('nail tie back = front = 60 (q 30, L_v = L_h = 2): governs pulloutBack',
  nearHead({ bond: { q: 30 }, length: 4, hasHead: false }), 60, 'pulloutBack');
handCase('nail tie back = rod = 240 (q 30, L_h = 8): governs pulloutBack',
  nearHead({ bond: { q: 30 }, tensile: 240 }), 240, 'pulloutBack');

test('S-T5 nail: intersection point, distance, slice, force per metre and direction', () => {
  const r = evalOne(farBack());
  assert.equal(r.intersects, true);
  near(assert, r.point[0], -5, 1e-9, 'x');
  near(assert, r.point[1], -7, 1e-9, 'z');
  near(assert, r.s, L_FAR, 1e-9, 's');
  // T = 76.6612 per nail, spacing 1.5 -> 51.1075 kN/m, direction (-cos45, -sin45)
  near(assert, r.perMetre, (Q_TAU * (8 - L_FAR)) / 1.5, 1e-6);
  near(assert, r.Px, -r.perMetre / SQ2, 1e-9, 'Px');
  near(assert, r.Pz, -r.perMetre / SQ2, 1e-9, 'Pz');
  assert.equal(r.id, 'N1');
  assert.equal(r.type, 'nail');
});

test('S-T5 nail near head: intersection at the entry of the slip surface, first slice', () => {
  const { g, m } = surfaceOf(supportModel([nearHead()]));
  const r = evaluateSupport(m.supports[0], m, g);
  near(assert, r.point[0], -12, 1e-9);
  near(assert, r.point[1], 0, 1e-9);
  near(assert, r.s, 2, 1e-9);
  assert.equal(r.sliceIndex, 0);
  near(assert, r.Px, -100, 1e-9); // 150 / 1.5, along -x
  near(assert, r.Pz, 0, 1e-9);
});

// ---------------------------------------------------------------------------
// S-T6 anchors: s = 4.949747 from the head to the arc
// ---------------------------------------------------------------------------

// in the free length: freeLength 6 > s -> T = P = 400
handCase('anchor cut in the free length: T = P = 400', anchorOf({ freeLength: 6, bondLength: 4 }), 400, 'anchor');
// middle of the bond body: bondLength 4, freeLength = s - 2 -> T = P*(2/4) = 200
handCase('anchor cut in the middle of the bond body: T = 0.5*P = 200',
  anchorOf({ freeLength: L_FAR - 2, bondLength: 4 }), 200, 'bondZone');
// a quarter into the bond body: freeLength = s - 1 -> T = P*3/4 = 300
handCase('anchor cut a quarter into the bond body: T = 0.75*P = 300',
  anchorOf({ freeLength: L_FAR - 1, bondLength: 4 }), 300, 'bondZone');

test('S-T6 anchor: behind the end of the bond body -> no intersection', () => {
  // total length 4 < 4.949747: the anchor ends before the slip surface
  const r = evalOne(anchorOf({ freeLength: 2, bondLength: 2 }));
  assert.equal(r.intersects, false);
  assert.equal(r.T, null);
  assert.equal(r.point, null);
  assert.equal(r.governs, null);
  assert.equal(r.perMetre, null);
});

test('S-T6 anchor: s >= freeLength + bondLength -> no intersection, also when the segment still reaches the arc', () => {
  // total length 4.95 reaches the arc at s = 4.949747 only up to 1e-9 relative; 4.9497 does not reach it
  assert.equal(evalOne(anchorOf({ freeLength: 3, bondLength: 1.9497 })).intersects, false);
  assert.equal(evalOne(anchorOf({ freeLength: 3, bondLength: 1.95 })).intersects, true);
});

test('S-T6 anchor: force per metre and direction (spacing 2.5, angle 20 deg into the slope)', () => {
  // head (-10, 0) at 20 deg: reaches the circle where x^2 + (z-5)^2 = 169 along (-cos20, -sin20)
  const a = anchorOf({ x: -10, z: 0, angle: 20, freeLength: 8, bondLength: 6 });
  const r = evalOne(a);
  assert.equal(r.intersects, true);
  const c = Math.cos((20 * Math.PI) / 180);
  const s = Math.sin((20 * Math.PI) / 180);
  // solve (-10 - c*u)^2 + (-s*u - 5)^2 = 169: u^2 + 2u(10c + 5s) + 125 - 169 = 0
  const b = 10 * c + 5 * s;
  const u = -b + Math.sqrt(b * b + 44);
  near(assert, r.s, u, 1e-9, 's');
  assert.ok(u < 8, 'cut lies in the free length');
  near(assert, r.T, 400, 1e-9);
  near(assert, r.perMetre, 160, 1e-9); // 400 / 2.5
  near(assert, r.Px, -160 * c, 1e-9);
  near(assert, r.Pz, -160 * s, 1e-9);
});


// ---------------------------------------------------------------------------
// Pile
// ---------------------------------------------------------------------------

test('pile: T = shear, per metre = T / spacing, intersection straight below the head', () => {
  const r = evalOne(pileOf());
  assert.equal(r.intersects, true);
  near(assert, r.point[0], -8, 1e-12, 'x');
  near(assert, r.point[1], 5 - Math.sqrt(105), 1e-9, 'z'); // 5 - sqrt(169 - 64)
  near(assert, r.s, Math.sqrt(105) - 5, 1e-9, 's'); // head z = 0
  near(assert, r.T, 200, 1e-12);
  near(assert, r.perMetre, 100, 1e-12); // 200 / 2
  assert.equal(r.governs, 'shear');
});

test('pile too short for the arc -> no intersection', () => {
  assert.equal(evalOne(pileOf({ length: 5 })).intersects, false); // needs 5.247 m
  assert.equal(evalOne(pileOf({ length: 5.3 })).intersects, true);
});

// ---------------------------------------------------------------------------
// Shotcrete (SPEC_ETAPPE3 3.1): entry (-12, 0), exit (5, -7)
// ---------------------------------------------------------------------------

test('shotcrete with the exit in [x1, x2]: point = exit, last slice, T = tau*t = 225', () => {
  const { g, m } = surfaceOf(supportModel([shotcreteOf({ x1: 0, x2: 10 })]));
  const r = evaluateSupport(m.supports[0], m, g);
  assert.equal(r.intersects, true);
  assert.deepEqual(r.point, g.exit);
  assert.equal(r.sliceIndex, g.slices.length - 1);
  near(assert, r.T, 225, 1e-12); // 1500 * 0.15
  near(assert, r.perMetre, 225, 1e-12); // already per metre
  assert.equal(r.governs, 'shear');
  assert.equal(r.s, null);
});

test('shotcrete with the entry in [x1, x2]: point = entry, first slice', () => {
  const { g, m } = surfaceOf(supportModel([shotcreteOf({ x1: -15, x2: -10 })]));
  const r = evaluateSupport(m.supports[0], m, g);
  assert.equal(r.intersects, true);
  assert.deepEqual(r.point, g.entry);
  assert.equal(r.sliceIndex, 0);
});

test('shotcrete with entry and exit both in [x1, x2]: the exit (foot) counts', () => {
  const { g, m } = surfaceOf(supportModel([shotcreteOf({ x1: -15, x2: 10 })]));
  const r = evaluateSupport(m.supports[0], m, g);
  assert.deepEqual(r.point, g.exit);
  assert.equal(r.sliceIndex, g.slices.length - 1);
});

test('shotcrete with neither entry nor exit in [x1, x2] -> no intersection', () => {
  const r = evalOne(shotcreteOf({ x1: -5, x2: 0 }));
  assert.equal(r.intersects, false);
  assert.equal(r.T, null);
  assert.equal(r.Px, null);
});

test('shotcrete: [x1, x2] includes its end points', () => {
  assert.equal(evalOne(shotcreteOf({ x1: 5, x2: 9 })).intersects, true); // exit x = 5
  assert.equal(evalOne(shotcreteOf({ x1: -20, x2: -12 })).intersects, true); // entry x = -12
  assert.equal(evalOne(shotcreteOf({ x1: 5.001, x2: 9 })).intersects, false);
});

// ---------------------------------------------------------------------------
// Head outside the slip body, element not reaching the arc
// ---------------------------------------------------------------------------

test('head outside the slip body -> no intersection (right of the exit, left of the entry, above, below the arc)', () => {
  // right of the exit (x = 10 > 5), on the ground there
  assert.equal(evalOne(nailFormA({ x: 10, z: -9.69, angle: 0, length: 30 })).intersects, false);
  // left of the entry (x = -20 < -12)
  assert.equal(evalOne(nailFormA({ x: -20, z: 0, angle: 10, length: 30 })).intersects, false);
  // above the ground by 0.5 m (more than the tolerance 0.01)
  assert.equal(evalOne(nailFormA({ x: -10, z: 0.5, angle: 0, length: 10 })).intersects, false);
  // below the arc (arc at x=-1.5 is z = -7.913): the rod points up and would cross the arc, but the head is not in the body
  assert.equal(evalOne(nailFormA({ x: -1.5, z: -9, angle: -45, length: 12 })).intersects, false);
  // pile below the arc
  assert.equal(evalOne(pileOf({ x: -8, z: -6, length: 12 })).intersects, false);
});

test('head slightly above the ground (0.005 m, inside the tolerance) is a head in the body', () => {
  assert.equal(evalOne(nailFormA({ x: -10, z: 0.005, angle: 10, length: 10 })).intersects, true);
});

test('element inside the body that does not reach the arc -> no intersection', () => {
  // from (-10, 0) horizontally, 1.9 m reaches x = -11.9; the arc is at x = -12
  assert.equal(evalOne(nailFormA({ x: -10, z: 0, angle: 0, length: 1.9 })).intersects, false);
  assert.equal(evalOne(nailFormA({ x: -10, z: 0, angle: 0, length: 2.1 })).intersects, true);
});

test('the first intersection from the head counts (head left of the lowest point, rod runs into the slope)', () => {
  // from (-1.5, -3.5) at 45 deg the ray leaves the circle once, at (-5,-7)
  const r = evalOne(farBack({ length: 30 }));
  near(assert, r.point[0], -5, 1e-9);
  near(assert, r.s, L_FAR, 1e-9);
});

test('invalid geometry (valid: false) -> no intersection, no exception', () => {
  const { m } = surfaceOf(supportModel([nailFormA()]));
  const r = evaluateSupport(m.supports[0], m, { valid: false, code: 'I_INTERSECTIONS' });
  assert.equal(r.intersects, false);
});

// ---------------------------------------------------------------------------
// Slice assignment: x_left <= x_s < x_right, right end: last slice
// ---------------------------------------------------------------------------

test('slice: x_left <= x_s < x_right for a point inside a slice', () => {
  const { g, m } = surfaceOf(supportModel([farBack()]));
  const r = evaluateSupport(m.supports[0], m, g);
  const sl = g.slices[r.sliceIndex];
  assert.ok(sl.xLeft <= r.point[0] && r.point[0] < sl.xRight, `${sl.xLeft} <= ${r.point[0]} < ${sl.xRight}`);
  assert.ok(r.sliceIndex > 0 && r.sliceIndex < g.slices.length - 1);
});

test('slice: a point exactly on a slice boundary belongs to the slice on its right', () => {
  // the ground vertex x = -8 is a mandatory slice boundary
  const { g, m } = surfaceOf(supportModel([pileOf()]));
  const r = evaluateSupport(m.supports[0], m, g);
  const k = r.sliceIndex;
  assert.equal(g.slices[k].xLeft, -8);
  assert.ok(k > 0);
  assert.equal(g.slices[k - 1].xRight, -8);
  assert.ok(r.point[0] >= g.slices[k].xLeft && r.point[0] < g.slices[k].xRight);
});

test('slice: left end -> first slice, right end of the slip surface -> last slice', () => {
  const { g, m } = surfaceOf(supportModel([shotcreteOf({ x1: -15, x2: -10, id: 'a' }), shotcreteOf({ x1: 0, x2: 10, id: 'b' })]));
  const [a, b] = evaluateSupports(m, g);
  assert.equal(a.sliceIndex, 0);
  assert.equal(b.sliceIndex, g.slices.length - 1);
  assert.equal(g.slices[g.slices.length - 1].xRight, g.exit[0]);
});

// ---------------------------------------------------------------------------
// Direction (SPEC_ETAPPE3 3.3), calculation frame
// ---------------------------------------------------------------------------

test('direction nail: along the rod into the slope, P_x < 0 and P_z < 0 for a rod pointing down', () => {
  const r = evalOne(farBack());
  assert.ok(r.Px < 0 && r.Pz < 0);
  near(assert, Math.hypot(r.Px, r.Pz), r.perMetre, 1e-9, '|P|');
});

test('direction nail with a negative angle (rod points up into the slope): P_x < 0, P_z > 0', () => {
  // head (-10, 0), angle -30 deg: rises into the slope, so it leaves the body through the
  // ground first. SPEC_ETAPPE3 3.4 (9): only the first ARC intersection counts, no ground check.
  const seg = supportSegment(nailFormA({ angle: -30 }));
  assert.ok(seg.dx < 0 && seg.dz > 0);
  near(assert, Math.hypot(seg.dx, seg.dz), 1, 1e-12);
});

test('direction anchor: along the rod, from the intersection towards the end', () => {
  const r = evalOne(anchorOf());
  assert.ok(r.Px < 0 && r.Pz < 0);
  near(assert, r.Px, r.Pz, 1e-9); // 45 deg
});

test('direction pile left of the circle centre: tangent against the sliding direction, P_x < 0, P_z > 0', () => {
  // intersection (-8, -5.247); tangent (zc - zs, xs - xc)/R = (10.247, -8)/13 along the slip, force opposite
  const r = evalOne(pileOf());
  const p = 100;
  near(assert, r.Px, (-p * Math.sqrt(105)) / 13, 1e-9, 'Px'); // zc - zs = 5 - (5 - sqrt(105))
  near(assert, r.Pz, (p * 8) / 13, 1e-9, 'Pz');
  assert.ok(r.Px < 0 && r.Pz > 0);
});

test('direction pile right of the circle centre: P_x < 0, P_z < 0', () => {
  // head on the ground at x = 3 (z = -77/13), intersection at z = 5 - sqrt(160)
  const r = evalOne(pileOf({ x: 3, z: -77 / 13, length: 5 }));
  assert.equal(r.intersects, true);
  const zs = 5 - Math.sqrt(160);
  near(assert, r.point[1], zs, 1e-9);
  near(assert, r.Px, (-100 * (5 - zs)) / 13, 1e-9, 'Px');
  near(assert, r.Pz, (-100 * 3) / 13, 1e-9, 'Pz');
  assert.ok(r.Px < 0 && r.Pz < 0);
});

test('direction shotcrete at the exit (foot, right side): P_x < 0, P_z < 0; at the entry: P_x < 0, P_z > 0', () => {
  // p = 225. Exit (5,-7): tangent along the slip (12, 5)/13 -> force (-12, -5)/13 * 225
  const exit = evalOne(shotcreteOf({ x1: 0, x2: 10 }));
  near(assert, exit.Px, (-12 / 13) * 225, 1e-9, 'Px exit');
  near(assert, exit.Pz, (-5 / 13) * 225, 1e-9, 'Pz exit');
  // Entry (-12, 0): tangent along the slip (5, -12)/13 -> force (-5, 12)/13 * 225
  const entry = evalOne(shotcreteOf({ x1: -15, x2: -10 }));
  near(assert, entry.Px, (-5 / 13) * 225, 1e-9, 'Px entry');
  near(assert, entry.Pz, (12 / 13) * 225, 1e-9, 'Pz entry');
  for (const r of [exit, entry]) near(assert, Math.hypot(r.Px, r.Pz), 225, 1e-9, '|P|');
});

// ---------------------------------------------------------------------------
// Mode sia (SPEC_ETAPPE3 5, first point): defaults and own factors
// ---------------------------------------------------------------------------

test('resolveSupportFactors: characteristic = 1, sia = default or own value', () => {
  assert.deepEqual(resolveSupportFactors(nailFormA({ gammaM: 2 }), 'characteristic'), { gammaM: 1 });
  assert.deepEqual(resolveSupportFactors(nailFormA(), 'sia'), { gammaM: 1.35 });
  assert.deepEqual(resolveSupportFactors(nailFormA({ gammaM: 2 }), 'sia'), { gammaM: 2 });
  assert.deepEqual(resolveSupportFactors(anchorOf(), 'sia'), { gammaA: 1.0 });
  assert.deepEqual(resolveSupportFactors(anchorOf({ gammaA: 1.1 }), 'sia'), { gammaA: 1.1 });
  assert.deepEqual(resolveSupportFactors(anchorOf({ gammaA: 1.1 }), 'characteristic'), { gammaA: 1 });
  assert.deepEqual(resolveSupportFactors(pileOf(), 'sia'), { gammaM: 1.4 });
  assert.deepEqual(resolveSupportFactors(shotcreteOf(), 'sia'), { gammaC: 1.5 });
});

// nail near head, q form 30 kN/m, rod 150, length 10 (L_v = 2, L_h = 8)
//   gammaM 1.35: q = 22.222, rod = 111.111: T_back = 177.78, T_front = 44.44
//   gammaM 1.5:  q = 20,     rod = 100:     T_back = 160,    T_front = 40
handCase('sia nail, defaults gammaM 1.35, head: min(177.78; 111.11) = 111.11',
  nearHead({ bond: { q: 30 } }), 150 / 1.35, 'tensile', { mode: 'sia' });
handCase('sia nail, defaults gammaM 1.35, no head: min(177.78; 111.11; 44.44) = 44.44',
  nearHead({ bond: { q: 30 }, hasHead: false }), (30 / 1.35) * 2, 'pulloutFront', { mode: 'sia' });
handCase('sia nail, own gammaM 1.5, head: min(160; 100) = 100',
  nearHead({ bond: { q: 30 }, gammaM: 1.5 }), 100, 'tensile', { mode: 'sia' });
handCase('sia nail, own gammaM 1.5, no head: 40', nearHead({ bond: { q: 30 }, gammaM: 1.5, hasHead: false }), 40, 'pulloutFront', { mode: 'sia' });
handCase('sia nail tau/D form, far back, gammaM 1.35: T_back = 8*pi/1.35*3.050253 = 56.78',
  farBack(), (Q_TAU / 1.35) * (8 - L_FAR), 'pulloutBack', { mode: 'sia' });
handCase('characteristic ignores gammaM of the nail', nearHead({ bond: { q: 30 }, gammaM: 2, hasHead: false }), 60, 'pulloutFront');

// anchor P = gammaA * P0: default 1.0 -> 400; gammaA 1.1 -> 440 (Rk 600, 1.1*400 <= 600/1.35 = 444.4)
handCase('sia anchor, default gammaA 1.0, free length: T = 400', anchorOf(), 400, 'anchor', { mode: 'sia' });
handCase('sia anchor, gammaA 1.1, free length: T = 440', anchorOf({ gammaA: 1.1 }), 440, 'anchor', { mode: 'sia' });
handCase('sia anchor, gammaA 1.1, middle of the bond body: T = 220',
  anchorOf({ gammaA: 1.1, freeLength: L_FAR - 2, bondLength: 4 }), 220, 'bondZone', { mode: 'sia' });
handCase('characteristic anchor ignores gammaA: T = P0 = 400', anchorOf({ gammaA: 1.1 }), 400, 'anchor');

// pile: 200 / 1.4 = 142.857; gammaM 2 -> 100
handCase('sia pile, default gammaM 1.4: T = 142.857', pileOf(), 200 / 1.4, 'shear', { mode: 'sia' });
handCase('sia pile, gammaM 2: T = 100', pileOf({ gammaM: 2 }), 100, 'shear', { mode: 'sia' });
// shotcrete: 1500 / 1.5 * 0.15 = 150; gammaC 2 -> 112.5
handCase('sia shotcrete, default gammaC 1.5: T = 150', shotcreteOf({ x1: 0, x2: 10 }), 150, 'shear', { mode: 'sia' });
handCase('sia shotcrete, gammaC 2: T = 112.5', shotcreteOf({ x1: 0, x2: 10, gammaC: 2 }), 112.5, 'shear', { mode: 'sia' });

test('sia: force per metre and direction use the reduced T', () => {
  const r = evalOne(pileOf({ gammaM: 2 }), 'sia'); // T = 100, spacing 2 -> 50 kN/m
  near(assert, r.perMetre, 50, 1e-12);
  near(assert, Math.hypot(r.Px, r.Pz), 50, 1e-9);
});

// ---------------------------------------------------------------------------
// Mirrored model: same T, same intersection point (mirrored)
// ---------------------------------------------------------------------------

function mirroredInput(model) {
  const c = structuredClone(model);
  c.ground = c.ground.map(([x, z]) => [-x, z]).reverse();
  c.analysis.direction = 'left';
  c.supports = c.supports.map((s) => (s.type === 'shotcrete' ? { ...s, x1: -s.x2, x2: -s.x1 } : { ...s, x: -s.x }));
  return c;
}

test('mirrored model: same T, governs, slice and force; intersection point mirrored in the input frame', () => {
  const list = [
    nailFormA({ id: 'n1', x: -10, bond: { q: 30 }, hasHead: false }),
    farBack({ id: 'n2' }),
    anchorOf({ id: 'a1', freeLength: L_FAR - 2, bondLength: 4 }),
    pileOf({ id: 'p1' }),
    shotcreteOf({ id: 's1', x1: 0, x2: 10 }),
    shotcreteOf({ id: 's2', x1: -15, x2: -10 }),
    farBack({ id: 'out', x: 10, z: -9.69 }),
  ];
  for (const mode of ['characteristic', 'sia']) {
    const right = surfaceOf(supportModel(list, mode));
    const leftModel = mirroredInput(supportModel(list, mode));
    const left = surfaceOf(leftModel, { xc: 0 - TEST_CIRCLE.xc, zc: TEST_CIRCLE.zc, R: TEST_CIRCLE.R });
    assert.equal(left.info.mirrored, true);
    const a = evaluateSupports(right.m, right.g);
    const b = evaluateSupports(left.m, left.g);
    assert.equal(a.filter((r) => r.intersects).length, 6);
    assert.deepEqual(b, a, mode);
    // back in the input frame the points sit at -x
    for (let i = 0; i < a.length; i++) {
      if (!a[i].intersects) continue;
      assert.deepEqual(pointToInput(b[i].point, left.info), [0 - a[i].point[0], a[i].point[1]]);
    }
  }
});

test('evaluateSupports: order and ids of the list; no supports -> empty list', () => {
  const { m, g } = surfaceOf(supportModel([pileOf({ id: 'b' }), nailFormA({ id: 'a' })]));
  assert.deepEqual(evaluateSupports(m, g).map((r) => r.id), ['b', 'a']);
  const plain = surfaceOf(supportModel([]));
  assert.deepEqual(evaluateSupports(plain.m, plain.g), []);
  delete plain.m.supports;
  assert.deepEqual(evaluateSupports(plain.m, plain.g), []);
});

test('evaluateSupport does not modify the model or the geometry', () => {
  const { m, g } = surfaceOf(supportModel([nailFormA(), anchorOf(), pileOf(), shotcreteOf()], 'sia'));
  const before = JSON.stringify({ m, g });
  evaluateSupports(m, g);
  assert.equal(JSON.stringify({ m, g }), before);
});
