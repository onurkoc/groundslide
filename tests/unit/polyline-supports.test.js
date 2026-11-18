// Supports at a polyline as the slip surface (order 24, SPEC_ETAPPE4 4.5, SPEC_ETAPPE3 3): first intersection with the polyline,
// direction of a pile or shotcrete force along the straight piece, pile exactly on a vertex, moment point with supports.
//
// Geometry in the calculation frame (slope falls to the right, see supports-helpers.js):
//   ground (-30,0) (-8,0) (18,-14) (40,-14); slope z = -7 (x + 8) / 13
//   polyline PLC: (-12,0) (-4,-6) (1,-7.5) (5,-7); entry (-12,0) on the crown, exit (5,-7) on the slope, vertices at x = -4 and 1

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPartialFactors } from '../../core/factors.js';
import { normalizeModel } from '../../core/model.js';
import { buildSlicesPolylineNormalized } from '../../core/slices.js';
import { spencer } from '../../core/spencer.js';
import { evaluateSupport, evaluateSupports, withSupportSums } from '../../core/supports.js';
import { anchorOf, nailFormA, pileOf, shotcreteOf, supportModel } from './supports-helpers.js';
import { near } from './helpers.js';

const PLC = [[-12, 0], [-4, -6], [1, -7.5], [5, -7]];
const slopeZ = (x) => (-7 * (x + 8)) / 13;

function polylineCase(supports, points = PLC) {
  const info = normalizeModel(applyPartialFactors(supportModel(supports)));
  const m = info.model;
  const g = buildSlicesPolylineNormalized(m, points);
  assert.equal(g.valid, true, g.message);
  const opts = { kh: 0, tolerance: m.analysis.tolerance, maxIterations: m.analysis.maxIterations };
  return { m, g, opts };
}

const unit = (dx, dz) => { const l = Math.hypot(dx, dz); return [dx / l, dz / l]; };

test('geometry of the test polyline: valid, 20 slices requested, vertices are slice boundaries', () => {
  const { g } = polylineCase([]);
  assert.deepEqual(g.entry, [-12, 0]);
  assert.deepEqual(g.exit, [5, -7]);
  assert.equal(g.points.length, 4);
  const bounds = g.slices.map((s) => s.xLeft);
  for (const x of [-4, 1, -8]) assert.ok(bounds.some((b) => Math.abs(b - x) < 1e-12), `boundary at ${x}`); // -8: kink of the ground
});

// ------------------------------------------------------------ pile: force along the straight piece (SPEC_ETAPPE4 4.5)

test('pile in the middle of a piece: the force runs along that piece, against the sliding direction', () => {
  // x = -8 lies on the first piece (-12,0) -> (-4,-6): the polyline is at z = -3 there
  const { m, g } = polylineCase([pileOf({ x: -8, z: 0, length: 12, spacing: 2, shear: 200 })]);
  const r = evaluateSupport(m.supports[0], m, g);
  assert.equal(r.intersects, true);
  near(assert, r.point[0], -8, 1e-12);
  near(assert, r.point[1], -3, 1e-12);
  assert.equal(r.perMetre, 100);
  const [tx, tz] = unit(8, -6);
  near(assert, r.Px, -100 * tx, 1e-9);
  near(assert, r.Pz, -100 * tz, 1e-9);
});

test('pile exactly on a vertex: the piece after it in sliding direction (towards +x in the calculation frame)', () => {
  const { m, g } = polylineCase([pileOf({ x: -4, z: slopeZ(-4), length: 12, spacing: 2, shear: 200 })]);
  const r = evaluateSupport(m.supports[0], m, g);
  assert.equal(r.intersects, true);
  near(assert, r.point[0], -4, 1e-9);
  near(assert, r.point[1], -6, 1e-9);
  const after = unit(5, -1.5); // (-4,-6) -> (1,-7.5)
  const before = unit(8, -6); // (-12,0) -> (-4,-6)
  near(assert, r.Px, -100 * after[0], 1e-9, 'Px along the piece after the vertex');
  near(assert, r.Pz, -100 * after[1], 1e-9, 'Pz along the piece after the vertex');
  assert.ok(Math.abs(r.Px - -100 * before[0]) > 1, 'not the piece before the vertex');
  // the force lies in the base of the slice that begins at the vertex: P_n = 0, P_t = -p (SPEC_ETAPPE3 4.2)
  const slices = withSupportSums(g.slices, evaluateSupports(m, g), { xc: g.pivot[0], zc: g.pivot[1] });
  const i = r.sliceIndex;
  near(assert, g.slices[i].xLeft, -4, 1e-9, 'the slice starts at the vertex');
  near(assert, slices[i].PtP, -100, 1e-9, 'P_t');
  near(assert, slices[i].PnP, 0, 1e-9, 'P_n');
});

test('pile next to a vertex: the force follows the piece that holds the intersection (continuous change at the vertex)', () => {
  const hit = (x) => {
    const c = polylineCase([pileOf({ x, z: slopeZ(x), length: 12, spacing: 2, shear: 200 })]);
    return evaluateSupport(c.m.supports[0], c.m, c.g);
  };
  const left = hit(-4.001);
  const right = hit(-3.999);
  const before = unit(8, -6);
  const after = unit(5, -1.5);
  near(assert, left.Px, -100 * before[0], 1e-9);
  near(assert, right.Px, -100 * after[0], 1e-9);
});

// ------------------------------------------------------------ nail: first intersection with the polyline

test('nail: first intersection with the polyline, force along the rod from the intersection to its end', () => {
  const angle = 30;
  const head = { x: 0, z: slopeZ(0) };
  const { m, g } = polylineCase([nailFormA({ id: 'N1', x: head.x, z: head.z, angle, length: 10, spacing: 1.5 })]);
  const r = evaluateSupport(m.supports[0], m, g);
  assert.equal(r.intersects, true);
  // rod: (x, z) = head + s (-cos a, -sin a); the second piece: z = -6 - 0.3 (x + 4); the point must lie on both
  const c = Math.cos((angle * Math.PI) / 180);
  const s = Math.sin((angle * Math.PI) / 180);
  const x = r.point[0];
  const z = r.point[1];
  near(assert, z, -6 - 0.3 * (x + 4), 1e-9, 'the point lies on the second piece');
  near(assert, x, head.x - c * r.s, 1e-9, 'the point lies on the rod');
  near(assert, z, head.z - s * r.s, 1e-9, 'the point lies on the rod');
  assert.ok(x > -4 && x < 1);
  // direction: along the rod into the slope
  near(assert, r.Px, r.perMetre * -c, 1e-9);
  near(assert, r.Pz, r.perMetre * -s, 1e-9);
});

test('a nail whose head lies below the polyline (outside the slip body) has no effect', () => {
  const { m, g } = polylineCase([nailFormA({ x: 0, z: -8, angle: 30, length: 10 })]);
  assert.equal(evaluateSupport(m.supports[0], m, g).intersects, false);
});

test('a nail that does not reach the polyline has no effect', () => {
  const { m, g } = polylineCase([nailFormA({ x: 0, z: slopeZ(0), angle: 30, length: 3 })]);
  assert.equal(evaluateSupport(m.supports[0], m, g).intersects, false);
});

// ------------------------------------------------------------ shotcrete: exit or entry of the polyline

test('shotcrete: the exit of the polyline in the range counts, the force along the last piece; else the entry, along the first', () => {
  const T = (1500 / 1) * 0.15; // tau * thickness, characteristic mode
  const atExit = polylineCase([shotcreteOf({ x1: 0, x2: 10 })]);
  const a = evaluateSupport(atExit.m.supports[0], atExit.m, atExit.g);
  assert.equal(a.intersects, true);
  assert.deepEqual(a.point, [5, -7]);
  const last = unit(4, 0.5); // (1,-7.5) -> (5,-7)
  near(assert, a.Px, -T * last[0], 1e-9);
  near(assert, a.Pz, -T * last[1], 1e-9);

  const atEntry = polylineCase([shotcreteOf({ x1: -14, x2: -10 })]);
  const b = evaluateSupport(atEntry.m.supports[0], atEntry.m, atEntry.g);
  assert.equal(b.intersects, true);
  assert.deepEqual(b.point, [-12, 0]);
  const first = unit(8, -6);
  near(assert, b.Px, -T * first[0], 1e-9);
  near(assert, b.Pz, -T * first[1], 1e-9);

  const none = polylineCase([shotcreteOf({ x1: 10, x2: 20 })]);
  assert.equal(evaluateSupport(none.m.supports[0], none.m, none.g).intersects, false);
});

// ------------------------------------------------------------ moment point with all kinds of supports

test('all four kinds of supports on a polyline: F does not depend on the moment point (the moments of the support forces are about the same point)', () => {
  const supports = [
    nailFormA({ id: 'N1', x: 0, z: slopeZ(0), angle: 30, length: 10, spacing: 1.5 }),
    anchorOf({ id: 'A1', x: -3, z: slopeZ(-3), angle: 40, freeLength: 6, bondLength: 4, spacing: 2.5, P0: 150 }),
    pileOf({ id: 'P1', x: -8, z: 0, length: 12, spacing: 2, shear: 60 }),
    shotcreteOf({ id: 'S1', x1: 0, x2: 10, thickness: 0.1, tau: 400 }),
  ];
  const { m, g, opts } = polylineCase(supports);
  const found = evaluateSupports(m, g);
  assert.deepEqual(found.map((r) => r.intersects), [true, true, true, true]);
  const pivots = [g.pivot, [g.pivot[0] + 10, g.pivot[1] + 20], [g.pivot[0] - 15, g.pivot[1] + 5], [g.pivot[0] + 30, g.pivot[1] + 40], [g.pivot[0], g.pivot[1] + 60]];
  const results = pivots.map((p) => spencer(withSupportSums(g.slices, found, { xc: p[0], zc: p[1] }), { pivot: p }, opts));
  for (const r of results) assert.equal(r.valid, true, r.message);
  for (const r of results.slice(1)) near(assert, r.F, results[0].F, opts.tolerance, 'F at a moved moment point');
  console.log('F with nail, anchor, pile and shotcrete at 5 moment points:', results.map((r) => r.F.toFixed(7)).join(' '));
  // the supports change F (otherwise the test would show nothing)
  const without = polylineCase([]);
  const f0 = spencer(without.g.slices, { pivot: without.g.pivot }, without.opts);
  assert.ok(results[0].F > f0.F + 0.01, `F with supports ${results[0].F}, without ${f0.F}`);
});
