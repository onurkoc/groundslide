// Supports on a circular slip surface (SPEC_ETAPPE3 chapters 3 and 5, first point):
// intersection with the slip surface, slice, force T, governing limit, force
// per metre and direction for every element.
// Pure functions, no DOM or browser access.
//
// Frame: the calculation frame (slope falls to the right, sliding towards +x,
// z upwards). The model must be normalised (normalizeModel) and the geometry
// is the result of buildSlicesNormalized() for a circle in that frame.
// Also: force sums per slice for Spencer (SPEC_ETAPPE3 4.2) and the output
// list of a circle in the input frame (SPEC_ETAPPE3 6).
// The slip surface may be a polyline (g.type === 'polyline', SPEC_ETAPPE4 4.5): the intersection is the first one with the
// polyline, the direction of a pile or shotcrete force is the straight piece that holds the intersection.

import { arcHeight, circleSegmentIntersections, heightAt } from './geometry.js';
import { polylineHeight } from './polyline.js';
import { DEFAULT_SUPPORT_FACTORS, SUPPORT_HEAD_TOL, pointToInput } from './model.js';

const DEG = Math.PI / 180;
const EPS = 1e-9;

/**
 * Partial factors that divide the resistances of one element (SPEC_ETAPPE3 5).
 * Mode "characteristic": all 1. Mode "sia": the value of the element, or the
 * default of its type. Returns { gammaM } (nail, pile), { gammaA } (anchor:
 * P = gammaA * P0) or { gammaC } (shotcrete).
 */
export function resolveSupportFactors(support, mode) {
  const def = DEFAULT_SUPPORT_FACTORS[support.type];
  const pick = (key) => (mode === 'sia' ? (support[key] === undefined ? def[key] : support[key]) : 1);
  if (support.type === 'anchor') return { gammaA: pick('gammaA') };
  if (support.type === 'shotcrete') return { gammaC: pick('gammaC') };
  return { gammaM: pick('gammaM') };
}

/**
 * Segment of a nail, anchor or pile from its head point (calculation frame).
 * Nail and anchor run into the slope, direction (-cos a, -sin a); the pile
 * runs vertically down. Returns { x0, z0, dx, dz, length } with (dx, dz) a unit vector.
 */
export function supportSegment(support) {
  if (support.type === 'pile') {
    return { x0: support.x, z0: support.z, dx: 0, dz: -1, length: support.length };
  }
  const a = support.angle * DEG;
  const length = support.type === 'anchor' ? support.freeLength + support.bondLength : support.length;
  return { x0: support.x, z0: support.z, dx: -Math.cos(a), dz: -Math.sin(a), length };
}

const noEffect = (support) => ({
  id: support.id,
  type: support.type,
  intersects: false,
  point: null,
  sliceIndex: null,
  s: null,
  T: null,
  governs: null,
  perMetre: null,
  Px: null,
  Pz: null,
});

/** Index of the slice with xLeft <= x < xRight; at the right end the last slice (SPEC_ETAPPE3 3.1). */
function sliceIndexAt(slices, x) {
  for (let i = 0; i < slices.length; i++) {
    if (x >= slices[i].xLeft && x < slices[i].xRight) return i;
  }
  return x < slices[0].xLeft ? 0 : slices.length - 1;
}

/**
 * Starting point of a nail, anchor or pile lies in the slip body: between the
 * ground line and the arc, over the x range of the slip surface.
 * SPEC_ETAPPE3 3.4 (2): a head exactly on the arc counts as inside
 * (distance 0); the ground side uses the head tolerance of the validation.
 */
function headInBody(m, g, x, z) {
  const xIn = g.entry[0];
  const xOut = g.exit[0];
  if (x < xIn - EPS || x > xOut + EPS) return false;
  const zArc = g.type === 'polyline' ? polylineHeight(g.points, x) : arcHeight(g.circle, x);
  if (Number.isNaN(zArc)) return false;
  const zGround = heightAt(m.ground, x, 'max');
  if (Number.isNaN(zGround)) return false;
  return z >= zArc - EPS && z <= zGround + SUPPORT_HEAD_TOL;
}

/**
 * First intersection of the segment with the ARC of the slip surface (lower
 * half circle between entry and exit, not the chord), seen from the head.
 * Returns { x, z, s } with s = distance from the head, or null.
 * SPEC_ETAPPE3 3.4 (3): an intersection exactly at the end of the element
 * is not counted (parameter range [0, 1)); tangent contacts are not counted.
 * SPEC_ETAPPE3 3.4 (9): the first arc intersection counts even if an
 * upward element (negative angle) leaves the ground line before it.
 */
function firstArcHit(g, seg) {
  const { zc } = g.circle;
  const p = [seg.x0, seg.z0];
  const q = [seg.x0 + seg.dx * seg.length, seg.z0 + seg.dz * seg.length];
  let best = null;
  for (const h of circleSegmentIntersections(g.circle, p, q)) {
    if (h.z > zc + EPS) continue; // upper half circle
    if (h.x < g.entry[0] - EPS || h.x > g.exit[0] + EPS) continue; // outside the slip surface
    if (best === null || h.t < best.t) best = h;
  }
  if (best === null) return null;
  return { x: best.x, z: best.z, s: Math.max(0, best.t) * seg.length };
}

/**
 * First intersection of the segment with the polyline of the slip surface (SPEC_ETAPPE4 4.5), seen from the head.
 * Returns { x, z, s, piece } with s = distance from the head, piece = index of the straight piece that carries the
 * intersection ("exactly on a vertex: the piece after it in sliding direction", i.e. the next one), or null. Same rules as
 * for the arc: the parameter range along the element is [0, 1), parallel pieces do not count.
 */
function firstPolylineHit(g, seg) {
  const pts = g.points;
  const px = seg.x0;
  const pz = seg.z0;
  const rx = seg.dx * seg.length;
  const rz = seg.dz * seg.length;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const sx = pts[i + 1][0] - pts[i][0];
    const sz = pts[i + 1][1] - pts[i][1];
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-14 * (Math.hypot(rx, rz) * Math.hypot(sx, sz))) continue; // parallel
    const qx = pts[i][0] - px;
    const qz = pts[i][1] - pz;
    const t = (qx * sz - qz * sx) / den; // along the element
    const u = (qx * rz - qz * rx) / den; // along the piece
    if (!(t >= -EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS)) continue;
    const piece = u > 1 - EPS && i < pts.length - 2 ? i + 1 : i;
    if (best === null || t < best.t - 1e-12 || (Math.abs(t - best.t) <= 1e-12 && piece > best.piece)) best = { t, piece, x: px + t * rx, z: pz + t * rz };
  }
  if (best === null) return null;
  return { x: best.x, z: best.z, s: Math.max(0, best.t) * seg.length, piece: best.piece };
}

/** Force p against the sliding direction along the straight piece of a polyline (unit vector towards +x, times -p). */
function pieceTangentForce(g, piece, p) {
  const [x0, z0] = g.points[piece];
  const [x1, z1] = g.points[piece + 1];
  const len = Math.hypot(x1 - x0, z1 - z0);
  return { Px: (-p * (x1 - x0)) / len, Pz: (-p * (z1 - z0)) / len };
}

/** Tangent of the arc at (xs, zs) against the sliding direction, times p (P_x < 0 in the calculation frame). */
function arcTangentForce(circle, xs, zs, p) {
  const { xc, zc, R } = circle;
  return { Px: (-p * (zc - zs)) / R, Pz: (-p * (xs - xc)) / R };
}

/**
 * Evaluate one support on one slip surface.
 *
 * @param {object} support  element of m.supports (calculation frame)
 * @param {object} m  normalised model (ground, analysis.mode)
 * @param {object} g  result of buildSlicesNormalized() (entry, exit, circle, slices)
 * @returns {object} { id, type, intersects, point:[x,z], sliceIndex, s, T,
 *   governs, perMetre, Px, Pz }. T in kN per element (shotcrete: kN/m),
 *   perMetre = T / spacing in kN/m, (Px, Pz) = force per metre in the
 *   calculation frame. Without effect: intersects false, all other fields null.
 *   governs: pulloutBack, pulloutFront, tensile (nail), anchor, bondZone, shear.
 *   s = length from the head to the intersection (null for shotcrete).
 */
export function evaluateSupport(support, m, g) {
  const none = noEffect(support);
  if (!g || !g.valid) return none;
  const mode = m.analysis.mode;
  const f = resolveSupportFactors(support, mode);

  // ---- shotcrete (SPEC_ETAPPE3 3.1): exit or entry inside [x1, x2], the exit first ----
  if (support.type === 'shotcrete') {
    const inRange = (x) => x >= support.x1 && x <= support.x2;
    const pt = inRange(g.exit[0]) ? g.exit : inRange(g.entry[0]) ? g.entry : null;
    if (pt === null) return none;
    const T = (support.tau / f.gammaC) * support.thickness;
    // polyline: the piece at the exit (last) or at the entry (first), as the tangent of the arc at that point
    const dir = g.type === 'polyline'
      ? pieceTangentForce(g, pt === g.exit ? g.points.length - 2 : 0, T)
      : arcTangentForce(g.circle, pt[0], pt[1], T);
    return {
      ...none,
      intersects: true,
      point: [pt[0], pt[1]],
      sliceIndex: sliceIndexAt(g.slices, pt[0]),
      T,
      governs: 'shear',
      perMetre: T,
      ...dir,
    };
  }

  // ---- nail, anchor, pile (SPEC_ETAPPE3 3.1) ----
  const seg = supportSegment(support);
  if (!headInBody(m, g, seg.x0, seg.z0)) return none;
  const hit = g.type === 'polyline' ? firstPolylineHit(g, seg) : firstArcHit(g, seg);
  if (hit === null) return none;
  const s = hit.s;

  let T;
  let governs;
  if (support.type === 'nail') {
    // SPEC_ETAPPE3 3.2; q in kN/m, resistances divided by gammaM in mode "sia"
    const q0 = support.bond.q !== undefined ? support.bond.q : support.bond.tau * Math.PI * support.bond.diameter;
    const q = q0 / f.gammaM;
    const candidates = [
      ['pulloutBack', q * (seg.length - s)],
      ['tensile', support.tensile / f.gammaM],
    ];
    if (!support.hasHead) candidates.push(['pulloutFront', q * s]);
    // SPEC_ETAPPE3 3.4 (1): on a tie the first limit in the order of the
    // formulas in 3.2 (back, rod, front) is named as governing.
    [governs, T] = candidates[0];
    for (const [name, value] of candidates) {
      if (value < T) {
        governs = name;
        T = value;
      }
    }
  } else if (support.type === 'anchor') {
    const P = f.gammaA * support.P0;
    const total = support.freeLength + support.bondLength;
    if (s >= total) return none; // behind the end of the bond body (SPEC_ETAPPE3 3.2)
    if (s <= support.freeLength) {
      T = P;
      governs = 'anchor';
    } else {
      T = (P * (total - s)) / support.bondLength;
      governs = 'bondZone';
    }
  } else {
    T = support.shear / f.gammaM;
    governs = 'shear';
  }

  const perMetre = T / support.spacing;
  let dir;
  if (support.type === 'pile') {
    dir = g.type === 'polyline' ? pieceTangentForce(g, hit.piece, perMetre) : arcTangentForce(g.circle, hit.x, hit.z, perMetre);
  } else {
    // along the rod, from the intersection towards the end (into the slope)
    dir = { Px: perMetre * seg.dx, Pz: perMetre * seg.dz };
  }
  return {
    ...none,
    intersects: true,
    point: [hit.x, hit.z],
    sliceIndex: sliceIndexAt(g.slices, hit.x),
    s,
    T,
    governs,
    perMetre,
    ...dir,
  };
}

/** evaluateSupport() for every element of m.supports, in the order of the list. */
export function evaluateSupports(m, g) {
  return (m.supports || []).map((s) => evaluateSupport(s, m, g));
}

// ---------------------------------------------------------------------------
// Spencer input and output (SPEC_ETAPPE3 4.1, 4.2, 6)
// ---------------------------------------------------------------------------

/** Active supports (element or its result) are not divided by F (SPEC_ETAPPE3 4.1): the prestressed anchors. */
export const isActiveSupport = (support) => support.type === 'anchor';

/**
 * Copy of the slices with the force sums of SPEC_ETAPPE3 4.2 and 4.3 per slice, FULL values
 * (the division of the passive forces by F is done in Spencer, where F is known):
 * PtA, PnA (active) and PtP, PnP (passive), each summed over all elements acting on the slice,
 * and the moments MA, MP about the circle centre of the force vectors at their intersection
 * points (x_s, z_s), driving positive: M = P_x (z_c - z_s) - P_z (x_c - x_s).
 *   P_t =  P_x*cos(alpha) - P_z*sin(alpha)       (parallel to the base, positive in sliding direction)
 *   P_n = -(P_x*sin(alpha) + P_z*cos(alpha))     (normal to the base, positive pressing on the base)
 * with alpha of the chord and (P_x, P_z) the force per metre. `results` = evaluateSupports(m, g),
 * `circle` = g.circle.
 */
export function withSupportSums(slices, results, circle) {
  const out = slices.map((s) => ({ ...s, PtA: 0, PnA: 0, PtP: 0, PnP: 0, MA: 0, MP: 0 }));
  results.forEach((r) => {
    if (!r.intersects) return;
    const s = out[r.sliceIndex];
    const Pt = r.Px * Math.cos(s.alpha) - r.Pz * Math.sin(s.alpha);
    const Pn = -(r.Px * Math.sin(s.alpha) + r.Pz * Math.cos(s.alpha));
    const M = r.Px * (circle.zc - r.point[1]) - r.Pz * (circle.xc - r.point[0]);
    if (isActiveSupport(r)) {
      s.PtA += Pt;
      s.PnA += Pn;
      s.MA += M;
    } else {
      s.PtP += Pt;
      s.PnP += Pn;
      s.MP += M;
    }
  });
  return out;
}

/**
 * Output list `supports` of one circle (SPEC_ETAPPE3 6), in the INPUT frame like the rest of
 * the output: point mirrored back, slice = number (1, 2, ...) in the slice table of the
 * result (which is ordered by increasing x in the input frame), direction [P_x, P_z] per metre.
 *
 * @param {object[]} results  evaluateSupports(m, g)
 * @param {number} nSlices  number of slices
 * @param {number|null} F  final F of Spencer (null if Spencer gave no result)
 * @param {{mirrored:boolean}} info  result of normalizeModel
 * open question (order 21): without a Spencer F the passive `applied` is null.
 */
export function supportsOutput(results, nSlices, F, info) {
  return results.map((r) => {
    if (!r.intersects) return { id: r.id, type: r.type, intersects: false };
    const active = isActiveSupport(r);
    const flip = info.mirrored;
    return {
      id: r.id,
      type: r.type,
      intersects: true,
      point: pointToInput(r.point, info),
      slice: (flip ? nSlices - r.sliceIndex : r.sliceIndex + 1),
      T: r.T,
      governs: r.governs,
      perMetre: r.perMetre,
      applied: active ? r.perMetre : F === null ? null : r.perMetre / F,
      direction: [flip ? 0 - r.Px : r.Px, r.Pz],
    };
  });
}
