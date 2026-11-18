// Slice construction for a circular slip surface (SPEC chapter 5 and the
// geometric validity rules of 7.3).
// Pure functions, no DOM or browser access.
//
// Frames: buildSlices() takes the model and the circle in INPUT coordinates,
// normalises internally (mirror at x -> -x if the slope falls to the left)
// and returns the slices in the CALCULATION frame (slope falls to the right,
// sliding towards +x, alpha > 0 where the base falls towards +x).
// toInputFrame() maps a result back to the input frame.

import {
  arcHeight,
  circlePolylineIntersections,
  heightAt,
  linearOn,
  polygonAreaCentroid,
} from './geometry.js';
import {
  CODE_SURFACE_POINTS,
  maxPolylineBodyThickness,
  polylineCrossings,
  polylineHeight,
  polylinePointsProblem,
  polylineToCore,
  polylineToInput,
  sectionsBelowGround,
} from './polyline.js';
import { crackBaseX, crackWaterForce } from './crack.js';
import {
  DEFAULT_GAMMA_W,
  angleToInput,
  assertValidModel,
  circleToCore,
  normalizeModel,
  pointToInput,
  xToInput,
} from './model.js';

const DEG = Math.PI / 180;
const X_TOL = 1e-9;
const MIN_BODY_THICKNESS = 0.1; // SPEC 7.3, I_TOO_SHALLOW

const invalid = (code, message) => ({ valid: false, code, message });

const CRACK_NOT_REACHED = 'The slip surface does not reach the crack depth: the whole slip body lies in the crack zone.';

/** Tension crack at the base point of the slip surface (calculation frame): { x, z, depth, Pw, zPw } (SPEC_ETAPPE4 6, 9). */
function crackOf(m, base) {
  const gammaW = typeof m.gammaW === 'number' ? m.gammaW : DEFAULT_GAMMA_W;
  return { x: base[0], z: base[1], depth: m.tensionCrack.depth, ...crackWaterForce(m.tensionCrack, gammaW, base[1]) };
}

/**
 * Build the slices of a circular slip surface.
 *
 * @param {object} model  input model (validated here unless opts.validate is false)
 * @param {{xc:number, zc:number, R:number}} circle  circle in input coordinates
 * @returns {object} { valid: true, mirrored, direction, circle, entry, exit,
 *   B, slices } in the calculation frame, or { valid: false, code, message }
 *   with code one of I_INTERSECTIONS, I_OUT_OF_MODEL, I_DIRECTION,
 *   I_BELOW_MODEL, I_TOO_SHALLOW.
 */
export function buildSlices(model, circle, opts = {}) {
  if (opts.validate !== false) assertValidModel(model);
  const info = normalizeModel(model);
  const res = buildSlicesNormalized(info.model, circleToCore(circle, info));
  return { ...res, mirrored: info.mirrored, direction: info.direction };
}

/**
 * Same as buildSlices() for a model that is already in the calculation frame
 * (see normalizeModel) and a circle in that frame. No validation.
 */
export function buildSlicesNormalized(m, circle) {
  const { xc, zc, R } = circle;
  const ground = m.ground;
  const xMin = ground[0][0];
  const xMax = ground[ground.length - 1][0];

  // ---- 1. slip surface (SPEC 5.1 a) to f)) ----
  // a) intersections of the lower half circle (z <= zc) with the ground line, ordered by x;
  //    the model boundaries count as end points where the arc lies below the ground there
  const lowerHalf = (h) => h.z <= zc + X_TOL;
  const pts = circlePolylineIntersections(circle, ground)
    .filter(lowerHalf)
    .map((h) => ({ x: h.x, z: h.z, boundary: false }));
  for (const xb of [xMin, xMax]) {
    if (Math.abs(xb - xc) <= R) {
      const za = arcHeight(circle, xb);
      if (za < heightAt(ground, xb, 'min') - X_TOL) pts.push({ x: xb, z: za, boundary: true });
    }
  }
  pts.sort((p, q) => p.x - q.x);

  // b) sections: adjacent points with the arc below the ground at the midpoint
  // d) the slip surface is the section with the largest height difference (left - right)
  let section = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (!(q.x - p.x > 1e-12)) continue;
    const xmid = 0.5 * (p.x + q.x);
    if (!(arcHeight(circle, xmid) < heightAt(ground, xmid))) continue;
    const diff = p.z - q.z;
    if (section === null || diff > section.diff) section = { p, q, diff };
  }
  // c) no section
  if (section === null) {
    return invalid('I_INTERSECTIONS', 'Slip circle has no section below the ground line.');
  }
  // e) not higher on the left than on the right
  if (!(section.diff > X_TOL)) {
    return invalid('I_DIRECTION', 'Entry point is not higher than the exit point.');
  }
  // f) section ends at the model boundary instead of the ground
  if (section.p.boundary || section.q.boundary) {
    return invalid('I_OUT_OF_MODEL', 'Entry or exit point of the slip circle lies outside the model width.');
  }
  const pIn = section.p;
  const pOut = section.q;
  let xStart = pIn.x;
  let entry = [pIn.x, pIn.z];
  const exit = [pOut.x, pOut.z];

  // ---- 2. tension crack (SPEC_ETAPPE4 6): the slip body begins at the crack base, the part before it is cut off ----
  let crack = null;
  if (m.tensionCrack) {
    const xCrack = crackBaseX(ground, (x) => arcHeight(circle, x), pIn.x, pOut.x, m.tensionCrack.depth);
    if (xCrack === null) return invalid('I_TENSION_CRACK', CRACK_NOT_REACHED);
    xStart = xCrack;
    entry = [xCrack, arcHeight(circle, xCrack)];
    crack = crackOf(m, entry);
  }

  // ---- 3. below model (SPEC 7.3) ----
  const zLowest = xStart <= xc && xc <= pOut.x ? zc - R : Math.min(entry[1], exit[1]);
  if (zLowest < m.bottom - X_TOL) {
    return invalid('I_BELOW_MODEL', `Slip surface reaches z=${zLowest}, below the model bottom ${m.bottom}.`);
  }

  // ---- 4. too shallow (SPEC 7.3) ----
  const thickness = maxBodyThickness(ground, circle, xStart, pOut.x);
  if (thickness < MIN_BODY_THICKNESS) {
    return invalid('I_TOO_SHALLOW', `Slip body is only ${thickness.toFixed(4)} m thick at its thickest point (min ${MIN_BODY_THICKNESS} m).`);
  }

  // ---- 5. to 7. mandatory boundaries, equal slices, slice quantities (SPEC 5.2, 5.3, 5) ----
  const { B, slices } = sliceBody(m, {
    xIn: xStart,
    xOut: pOut.x,
    zAt: (x) => arcHeight(circle, x),
    innerXs: [],
    crack,
    // crossings of the lower arc with a line
    crossingsWith: (poly) => circlePolylineIntersections(circle, poly).filter((h) => h.z <= zc + X_TOL).map((h) => h.x),
  });

  // with a crack `entryUncut` is the entry of the circle on the ground (the crack base is `entry`); search A starts from it
  return { valid: true, circle: { xc, zc, R }, entry, exit, B, zMin: zLowest, slices, ...(crack ? { crack, entryUncut: [pIn.x, pIn.z] } : {}) };
}

/**
 * Build the slices of a slip surface given as a polyline (SPEC_ETAPPE4 3). Same as buildSlices() for a polyline in the
 * input frame; the result is in the calculation frame like that of a circle, with `type: "polyline"` and `points` (entry,
 * vertices between, exit) instead of `circle`, and the moment point `pivot` [x_M, z_M] of Spencer (SPEC_ETAPPE4 4.2).
 * Invalid: the codes of the circle (I_INTERSECTIONS, I_OUT_OF_MODEL, I_DIRECTION, I_BELOW_MODEL, I_TOO_SHALLOW) or
 * E_SURFACE_POINTS for points that break SPEC_ETAPPE4 3.2.
 */
export function buildSlicesPolyline(model, points, opts = {}) {
  if (opts.validate !== false) assertValidModel(model);
  const info = normalizeModel(model);
  const problem = polylinePointsProblem(points);
  if (problem) return { ...invalid(CODE_SURFACE_POINTS, problem), mirrored: info.mirrored, direction: info.direction };
  const res = buildSlicesPolylineNormalized(info.model, polylineToCore(points, info));
  return { ...res, mirrored: info.mirrored, direction: info.direction };
}

/**
 * Same as buildSlicesPolyline() for a model in the calculation frame and points in that frame (x strictly increasing,
 * see polylineToCore). No validation of the model or of the points.
 */
export function buildSlicesPolylineNormalized(m, points) {
  const ground = m.ground;

  // ---- 1. slip surface: the section of the polyline below the ground (SPEC_ETAPPE4 3.2, as SPEC 5.1 a) to f)) ----
  // SPEC_ETAPPE4 3.2 (clarification): several sections below the ground are treated as for the circle (SPEC 5.1 d): the section with
  // the largest height difference counts, the other parts are outside. An end point of the polyline below the ground (inside the
  // model or at its edge) has no entry or exit there: I_OUT_OF_MODEL (SPEC 5.1 f).
  let section = null;
  for (const s of sectionsBelowGround(ground, points)) {
    if (!(s.xb - s.xa > 1e-12)) continue;
    const diff = s.za - s.zb;
    if (section === null || diff > section.diff) section = { ...s, diff };
  }
  if (section === null) {
    return invalid('I_INTERSECTIONS', 'Slip surface has no section below the ground line.');
  }
  if (!(section.diff > X_TOL)) {
    return invalid('I_DIRECTION', 'Entry point is not higher than the exit point.');
  }
  if (section.startOutside || section.endOutside) {
    return invalid('I_OUT_OF_MODEL', 'Entry or exit point of the slip surface lies outside the model width or the surface does not reach the ground.');
  }
  let xIn = section.xa;
  const xOut = section.xb;
  let entry = [xIn, section.za];
  const exit = [xOut, section.zb];
  // the part of the polyline between entry and exit: entry, the vertices between, exit
  let inner = points.filter((p) => p[0] > xIn + X_TOL && p[0] < xOut - X_TOL);
  let cut = [entry, ...inner, exit];

  // tension crack (SPEC_ETAPPE4 6): the slip body begins at the crack base; the crack base is the entry for everything below
  // (moment point, chord of Janbu corrected, supports)
  let crack = null;
  if (m.tensionCrack) {
    const xCrack = crackBaseX(ground, (x) => polylineHeight(cut, x), xIn, xOut, m.tensionCrack.depth, inner.map((p) => p[0]));
    if (xCrack === null) return invalid('I_TENSION_CRACK', CRACK_NOT_REACHED);
    xIn = xCrack;
    entry = [xCrack, polylineHeight(cut, xCrack)];
    crack = crackOf(m, entry);
    inner = inner.filter((p) => p[0] > xIn + X_TOL);
    cut = [entry, ...inner, exit];
  }

  // ---- 3. below model (SPEC 7.3) ----
  const zLowest = Math.min(...cut.map((p) => p[1]));
  if (zLowest < m.bottom - X_TOL) {
    return invalid('I_BELOW_MODEL', `Slip surface reaches z=${zLowest}, below the model bottom ${m.bottom}.`);
  }

  // ---- 4. too shallow (SPEC 7.3) ----
  const thickness = maxPolylineBodyThickness(ground, cut, xIn, xOut);
  if (thickness < MIN_BODY_THICKNESS) {
    return invalid('I_TOO_SHALLOW', `Slip body is only ${thickness.toFixed(4)} m thick at its thickest point (min ${MIN_BODY_THICKNESS} m).`);
  }

  // ---- 5. to 7. every vertex of the polyline is a slice boundary too (SPEC_ETAPPE4 3.3) ----
  const { B, slices } = sliceBody(m, {
    xIn,
    xOut,
    zAt: (x) => polylineHeight(cut, x),
    innerXs: inner.map((p) => p[0]),
    crossingsWith: (poly) => polylineCrossings(cut, poly, xIn, xOut),
    crack,
  });

  // moment point (SPEC_ETAPPE4 4.2): middle between entry and exit, highest ground point between them
  let zTop = Math.max(heightAt(ground, xIn, 'max'), heightAt(ground, xOut, 'max'));
  for (const p of ground) if (p[0] > xIn && p[0] < xOut) zTop = Math.max(zTop, p[1]);
  const pivot = [0.5 * (xIn + xOut), zTop];

  return { valid: true, type: 'polyline', circle: null, points: cut, pivot, entry, exit, B, zMin: zLowest, slices, ...(crack ? { crack } : {}) };
}

/**
 * Slice boundaries and slice quantities for a slip surface between entry and exit (SPEC 5.2, 5.3, 5), shared by the circle
 * and the polyline (SPEC_ETAPPE4 3.3). The surface enters as its height function `zAt(x)`; the base of a slice is the chord
 * between the surface at its two boundaries.
 *   xIn, xOut            x of entry and exit
 *   zAt(x)               height of the slip surface
 *   innerXs              extra mandatory boundaries (the vertices of a polyline)
 *   crossingsWith(poly)  x of the crossings of the slip surface with a line (layer top, water line) between entry and exit
 *   crack                tension crack { Pw, zPw } or null: the water force acts on the first slice (SPEC_ETAPPE4 6)
 * Returns { B, slices }.
 */
function sliceBody(m, { xIn, xOut, zAt, innerXs, crossingsWith, crack = null }) {
  // ---- 5. mandatory slice boundaries (SPEC 5.2) ----
  const B = xOut - xIn;
  const tops = [m.ground, ...m.layers.slice(1).map((l) => l.top)];
  const water = m.water || null;
  const mandatory = [];
  const addInside = (x) => {
    if (x > xIn + X_TOL && x < xOut - X_TOL) mandatory.push(x);
  };
  const lines = water ? [...tops, water] : tops;
  for (const poly of lines) {
    for (const p of poly) addInside(p[0]); // vertices
    for (const x of crossingsWith(poly)) addInside(x); // slip surface x line
  }
  for (const x of innerXs) addInside(x);
  for (const ld of m.loads || []) {
    addInside(ld.x1);
    addInside(ld.x2);
  }
  const sections = uniqueSorted([xIn, ...mandatory, xOut], X_TOL);

  // ---- 6. split sections into equal slices (SPEC 5.3) ----
  const nTarget = m.analysis.slices;
  const bounds = [sections[0]];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    const n = Math.max(1, Math.round((nTarget * (b - a)) / B));
    for (let k = 1; k <= n; k++) bounds.push(k === n ? b : a + ((b - a) * k) / n);
  }

  // ---- 7. slice quantities (SPEC 5) ----
  const gammaW = typeof m.gammaW === 'number' ? m.gammaW : DEFAULT_GAMMA_W;
  const slices = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const xLeft = bounds[i];
    const xRight = bounds[i + 1];
    const b = xRight - xLeft;
    const zL = zAt(xLeft);
    const zR = zAt(xRight);
    const xm = 0.5 * (xLeft + xRight);
    const zb = 0.5 * (zL + zR);
    const alpha = Math.atan2(zL - zR, b);
    const l = b / Math.cos(alpha);

    const { W, zG } = sliceWeight(m, tops, water, xLeft, xRight, zL, zR);

    let Q = 0;
    for (const ld of m.loads || []) {
      const overlap = Math.min(xRight, ld.x2) - Math.max(xLeft, ld.x1);
      if (overlap > 0) Q += ld.q * overlap;
    }

    // material at the base midpoint (upper layer wins on a boundary)
    let k = 0;
    while (k < tops.length - 1 && zb < heightAt(tops[k + 1], xm)) k++;
    const matId = m.layers[k].material;
    const mat = m.materials[matId];

    let c;
    let phi;
    let u;
    if (mat.model === 'undrained') {
      c = mat.cu;
      phi = 0;
      u = 0;
    } else {
      c = mat.c;
      phi = mat.phi * DEG;
      u = water ? gammaW * Math.max(0, heightAt(water, xm) - zb) : 0;
    }

    const slice = { xLeft, xRight, b, xm, zb, alpha, l, W, zG, Q, u, material: matId, c, phi };
    if (i === 0 && crack && crack.Pw > 0) {
      slice.Pw = crack.Pw; // horizontal water force of the crack on the first slice, acting at height zPw
      slice.zPw = crack.zPw;
    }
    slices.push(slice);
  }
  return { B, slices };
}

/**
 * Map a buildSlices() result from the calculation frame back to the input
 * frame: x mirrored back, alpha sign flipped, slices ordered by increasing x.
 * A polyline result keeps its `points` and `pivot` in the input frame too.
 */
export function toInputFrame(result) {
  if (!result.valid || !result.mirrored) return result;
  const slices = result.slices
    .map((s) => ({
      ...s,
      xLeft: xToInput(s.xRight, result),
      xRight: xToInput(s.xLeft, result),
      xm: xToInput(s.xm, result),
      alpha: angleToInput(s.alpha, result),
    }))
    .reverse();
  return {
    ...result,
    circle: result.circle ? { ...result.circle, xc: xToInput(result.circle.xc, result) } : result.circle,
    ...(result.points ? { points: polylineToInput(result.points, result), pivot: pointToInput(result.pivot, result) } : {}),
    ...(result.crack ? { crack: { ...result.crack, x: xToInput(result.crack.x, result) } } : {}),
    ...(result.entryUncut ? { entryUncut: pointToInput(result.entryUncut, result) } : {}),
    entry: pointToInput(result.entry, result),
    exit: pointToInput(result.exit, result),
    slices,
  };
}

// ---------------------------------------------------------------------------

function uniqueSorted(values, tol) {
  const s = [...values].sort((a, b) => a - b);
  const out = [s[0]];
  for (let i = 1; i < s.length; i++) if (s[i] - out[out.length - 1] > tol) out.push(s[i]);
  return out;
}

/** Largest vertical distance between ground line and lower arc over [xa, xb]. */
export function maxBodyThickness(ground, circle, xa, xb) {
  const thick = (x, zg) => zg - arcHeight(circle, x);
  let best = -Infinity;
  for (let i = 0; i < ground.length - 1; i++) {
    const [x0, z0] = ground[i];
    const [x1, z1] = ground[i + 1];
    const a = Math.max(x0, xa);
    const b = Math.min(x1, xb);
    if (x1 - x0 < 1e-12) {
      // vertical segment
      if (x0 >= xa && x0 <= xb) {
        best = Math.max(best, thick(x0, Math.max(z0, z1)));
      }
      continue;
    }
    if (b < a) continue;
    const s = (z1 - z0) / (x1 - x0);
    const zAt = (x) => z0 + s * (x - x0);
    best = Math.max(best, thick(a, zAt(a)), thick(b, zAt(b)));
    // stationary point of (ground - arc): slope of arc equals ground slope
    const xs = circle.xc + (circle.R * s) / Math.sqrt(1 + s * s);
    if (xs > a && xs < b) best = Math.max(best, thick(xs, zAt(xs)));
  }
  return best;
}

/**
 * Weight and centre-of-weight height of one slice, exact from the polygon
 * areas per layer and per water zone (no sub-strips).
 */
function sliceWeight(m, tops, water, xa, xb, zL, zR) {
  const chordLin = (p, q) => [zL + ((zR - zL) * (p - xa)) / (xb - xa), zL + ((zR - zL) * (q - xa)) / (xb - xa)];
  const polys = water ? [...tops, water] : tops;

  // stage 1: break at all polyline vertices inside the slice
  const xs1 = [xa, xb];
  for (const poly of polys) for (const p of poly) if (p[0] > xa && p[0] < xb) xs1.push(p[0]);
  const stage1 = uniqueSorted(xs1, 1e-12);

  // stage 2: add crossings between any two of chord / ground / layer tops / water
  const xs2 = [...stage1];
  for (let i = 0; i < stage1.length - 1; i++) {
    const p = stage1[i];
    const q = stage1[i + 1];
    const f = [chordLin(p, q), ...polys.map((poly) => linearOn(poly, p, q))];
    for (let a = 0; a < f.length; a++) {
      for (let b = a + 1; b < f.length; b++) {
        const d0 = f[a][0] - f[b][0];
        const d1 = f[a][1] - f[b][1];
        if (d0 * d1 < 0) xs2.push(p + ((q - p) * d0) / (d0 - d1));
      }
    }
  }
  const xs = uniqueSorted(xs2, 1e-12);

  let W = 0;
  let M = 0; // sum of weight * z of centroid
  for (let i = 0; i < xs.length - 1; i++) {
    const p = xs[i];
    const q = xs[i + 1];
    const chord = chordLin(p, q);
    const topLin = tops.map((poly) => linearOn(poly, p, q));
    const wLin = water ? linearOn(water, p, q) : null;
    const mid = (pair) => 0.5 * (pair[0] + pair[1]);

    for (let k = 0; k < tops.length; k++) {
      const mat = m.materials[m.layers[k].material];
      const hi = topLin[k];
      let lo = chord;
      if (k < tops.length - 1 && mid(topLin[k + 1]) > mid(chord)) lo = topLin[k + 1];
      if (mid(hi) - mid(lo) <= 1e-14) continue;
      const hiC = [Math.max(hi[0], lo[0]), Math.max(hi[1], lo[1])];

      const pieces = [];
      if (!wLin || mid(wLin) <= mid(lo)) {
        pieces.push({ lo, hi: hiC, gamma: mat.gamma }); // entirely above the water line
      } else if (mid(wLin) >= mid(hi)) {
        pieces.push({ lo, hi: hiC, gamma: mat.gammaSat });
      } else {
        pieces.push({ lo, hi: wLin, gamma: mat.gammaSat });
        pieces.push({ lo: wLin, hi: hiC, gamma: mat.gamma });
      }
      for (const pc of pieces) {
        const poly = [
          [p, pc.lo[0]],
          [q, pc.lo[1]],
          [q, pc.hi[1]],
          [p, pc.hi[0]],
        ];
        const { area, cz } = polygonAreaCentroid(poly);
        W += pc.gamma * area;
        M += pc.gamma * area * cz;
      }
    }
  }
  const zG = W > 0 ? M / W : 0.5 * (zL + zR);
  return { W, zG };
}
