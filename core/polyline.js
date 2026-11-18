// Slip surface as a polyline (SPEC_ETAPPE4 3): validity of the points, mapping between the frames, the section below the
// ground line, heights and crossings with other lines, and the chord measures for Janbu (SPEC_ETAPPE4 4.4).
// Pure functions, no DOM or browser access.
//
// A polyline is an array of [x, z] points. In the input frame x is strictly increasing. The calculation frame is the mirrored
// frame of normalizeModel (slope falls to the right); a polyline is mirrored like a circle centre (x -> -x) and the order of
// its points is reversed, so that x is increasing there too.

import { linearOn } from './geometry.js';

const X_TOL = 1e-9;
const SIGN_TOL = 1e-9; // |difference of height| below this counts as "on the line"

export const CODE_SURFACE_POINTS = 'E_SURFACE_POINTS';
export const CODE_NONCIRCULAR = 'I_NONCIRCULAR';
export const MESSAGE_NONCIRCULAR = 'Bishop needs a circular slip surface; a polyline gets no Bishop result.';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Is the surface (a single surface of the model or the search) a polyline? `type` "polyline"; anything else is a circle. */
export const isPolylineSurface = (surface) => surface !== null && typeof surface === 'object' && surface.type === 'polyline';

/**
 * Rules of SPEC_ETAPPE4 3.2 for the points in the input frame: at least 2 points, each a pair of finite numbers, x strictly
 * increasing. Returns null when valid, else the message for E_SURFACE_POINTS.
 */
export function polylinePointsProblem(points) {
  if (!Array.isArray(points) || points.length < 2) return 'A polyline needs at least 2 points.';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Array.isArray(p) || p.length < 2 || !isNum(p[0]) || !isNum(p[1])) return `Point ${i + 1} of the polyline must be [x, z] with numbers.`;
  }
  for (let i = 1; i < points.length; i++) {
    if (!(points[i][0] > points[i - 1][0])) return `Polyline x must be strictly increasing (point ${i + 1}).`;
  }
  return null;
}

/** Points of the input frame -> calculation frame: x mirrored when the slope falls to the left, order reversed then. */
export function polylineToCore(points, info) {
  const pts = points.map(([x, z]) => [x, z]);
  return info.mirrored ? pts.map(([x, z]) => [0 - x, z]).reverse() : pts;
}

/** Points of the calculation frame -> input frame (the inverse of polylineToCore). */
export function polylineToInput(points, info) {
  const pts = points.map(([x, z]) => [x, z]);
  return info.mirrored ? pts.map(([x, z]) => [0 - x, z]).reverse() : pts;
}

/** Height of a polyline with strictly increasing x at x (NaN outside its x range). */
export function polylineHeight(points, x) {
  const n = points.length;
  if (x < points[0][0] || x > points[n - 1][0]) return NaN;
  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    if (x >= x0 && x <= x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return NaN;
}

const sign = (d) => (d < -SIGN_TOL ? -1 : d > SIGN_TOL ? 1 : 0);

/** Sorted x values without duplicates closer than `tol`. */
function uniqueSorted(values, tol) {
  const s = [...values].sort((a, b) => a - b);
  const out = [s[0]];
  for (let i = 1; i < s.length; i++) if (s[i] - out[out.length - 1] > tol) out.push(s[i]);
  return out;
}

/**
 * Sections of the polyline below the ground line (SPEC_ETAPPE4 3.2, as SPEC 5.1 a) to d) for the circle): maximal runs where
 * the polyline lies below the ground, within the x range of the model and of the polyline. Each section is
 * { xa, xb, za, zb, startOutside, endOutside }; `startOutside` / `endOutside` tell that the run does not end on the ground
 * but where the polyline or the model ends (the surface does not come out of the ground there).
 */
export function sectionsBelowGround(ground, points) {
  const xMin = ground[0][0];
  const xMax = ground[ground.length - 1][0];
  const x0 = Math.max(points[0][0], xMin);
  const x1 = Math.min(points[points.length - 1][0], xMax);
  if (!(x1 - x0 > 1e-12)) return [];
  const xs = [x0, x1];
  for (const p of points) if (p[0] > x0 && p[0] < x1) xs.push(p[0]);
  for (const p of ground) if (p[0] > x0 && p[0] < x1) xs.push(p[0]);
  const bp = uniqueSorted(xs, 1e-12);

  // pieces below the ground, interval by interval (height difference linear on an interval without vertices);
  // lowStart / lowEnd: the polyline is really below the ground (not only on it) at that end of the piece
  const pieces = [];
  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i];
    const b = bp[i + 1];
    const [gza, gzb] = linearOn(ground, a, b);
    const [pza, pzb] = linearOn(points, a, b);
    if (![gza, gzb, pza, pzb].every(Number.isFinite)) continue;
    const da = pza - gza;
    const db = pzb - gzb;
    const sa = sign(da);
    const sb = sign(db);
    if (sa < 0 && sb <= 0) pieces.push({ a, b, lowStart: true, lowEnd: sb < 0 });
    else if (sa < 0 && sb > 0) pieces.push({ a, b: a + ((b - a) * da) / (da - db), lowStart: true, lowEnd: false });
    else if (sa === 0 && sb < 0) pieces.push({ a, b, lowStart: false, lowEnd: true });
    else if (sa > 0 && sb < 0) pieces.push({ a: a + ((b - a) * da) / (da - db), b, lowStart: false, lowEnd: true });
  }
  const sections = [];
  for (const pc of pieces) {
    const last = sections[sections.length - 1];
    if (last && pc.a - last.xb <= 1e-12) {
      last.xb = pc.b;
      last.lowEnd = pc.lowEnd;
    } else {
      sections.push({ xa: pc.a, xb: pc.b, lowStart: pc.lowStart, lowEnd: pc.lowEnd });
    }
  }
  return sections.map((s) => ({
    xa: s.xa,
    xb: s.xb,
    za: polylineHeight(points, s.xa),
    zb: polylineHeight(points, s.xb),
    // the run ends at the end of the polyline or of the model while the polyline is still below the ground there
    startOutside: s.lowStart && Math.abs(s.xa - x0) <= X_TOL,
    endOutside: s.lowEnd && Math.abs(s.xb - x1) <= X_TOL,
  }));
}

/**
 * x values at which the polyline `points` crosses the line `line` strictly between xa and xb (sign change of the height
 * difference inside an interval between vertices). Crossings at a vertex of either line are not listed: both are slice
 * boundaries anyway.
 */
export function polylineCrossings(points, line, xa, xb) {
  const xs = [xa, xb];
  for (const p of points) if (p[0] > xa && p[0] < xb) xs.push(p[0]);
  for (const p of line) if (p[0] > xa && p[0] < xb) xs.push(p[0]);
  const bp = uniqueSorted(xs, 1e-12);
  const out = [];
  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i];
    const b = bp[i + 1];
    const [lza, lzb] = linearOn(line, a, b);
    const [pza, pzb] = linearOn(points, a, b);
    if (![lza, lzb, pza, pzb].every(Number.isFinite)) continue;
    const da = pza - lza;
    const db = pzb - lzb;
    if (da * db < 0) out.push(a + ((b - a) * da) / (da - db));
  }
  return out;
}

/**
 * Largest vertical distance ground - polyline over [xa, xb] (the thickness of the slip body); both are linear between the
 * vertices, so the largest value lies at a vertex of either line or at an end.
 */
export function maxPolylineBodyThickness(ground, points, xa, xb) {
  const xs = [xa, xb];
  for (const p of points) if (p[0] > xa && p[0] < xb) xs.push(p[0]);
  for (const p of ground) if (p[0] > xa && p[0] < xb) xs.push(p[0]);
  const bp = uniqueSorted(xs, 1e-12);
  let best = -Infinity;
  for (let i = 0; i < bp.length - 1; i++) {
    const [gza, gzb] = linearOn(ground, bp[i], bp[i + 1]);
    const [pza, pzb] = linearOn(points, bp[i], bp[i + 1]);
    if (![gza, gzb, pza, pzb].every(Number.isFinite)) continue;
    best = Math.max(best, gza - pza, gzb - pzb);
  }
  return best;
}

/**
 * Chord length L between entry and exit and the largest distance d of the polyline from this chord, at right angles to the
 * chord (SPEC_ETAPPE4 4.4; the same measures as chordAndSagitta for the arc). `points` = entry, vertices, exit.
 */
export function polylineChordAndSagitta(points) {
  const entry = points[0];
  const exit = points[points.length - 1];
  const dx = exit[0] - entry[0];
  const dz = exit[1] - entry[1];
  const L = Math.hypot(dx, dz);
  const nx = -dz / L;
  const nz = dx / L;
  let d = 0;
  for (const p of points) d = Math.max(d, Math.abs((p[0] - entry[0]) * nx + (p[1] - entry[1]) * nz));
  return { L, d };
}
