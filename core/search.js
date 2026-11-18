// Search for the governing circular slip surface (SPEC chapter 7).
// The search runs separately per method ("target"): bishop, janbu (F0),
// janbuCorrected (f0 * F0) and spencer. All work happens in the calculation frame; the
// result is mapped back to the input frame.
// Pure functions, no DOM or browser access.

import { buildSlicesNormalized, buildSlicesPolylineNormalized } from './slices.js';
import { CODE_NONCIRCULAR, MESSAGE_NONCIRCULAR, isPolylineSurface, polylineToInput } from './polyline.js';
import { crackOutput } from './crack.js';
import { governingOptimized, optimizeCircle, optimizePoints } from './optimize.js';
import { bishop } from './bishop.js';
import { janbu } from './janbu.js';
import { spencer } from './spencer.js';
import { evaluateSupports, supportsOutput, withSupportSums } from './supports.js';
import { distanceToPolyline, maxVertexDistance } from './geometry.js';
import { pointToInput, xToInput } from './model.js';

const MIN_STEP = 0.005; // SPEC 7.4: stop when the largest step is below this (m)
const MAX_MOVES_PER_LEVEL = 10000; // safety net against endless moves
export const KNEE_RADIUS_OFFSET = 0.0001; // SPEC 7.2: knee radius = |M - P| - offset (circle stays on the R < |M - P| side)

/** Method (evaluation) needed for a search target. */
const methodOf = (target) => (target === 'bishop' || target === 'spencer' ? target : 'janbu');

/**
 * Evaluate one circle (calculation frame) with the given methods.
 * Returns { geometry, bishop, janbu } where each method entry is the result
 * object of that method, or { valid:false, code, message } if the surface is
 * invalid (geometrically or for that method). Methods not requested are null.
 *
 * With supports (SPEC_ETAPPE3 4): Spencer calculates with the support forces and the
 * result carries `supports` (evaluateSupports, calculation frame) and `supportSlices`
 * (slices with the force sums). Bishop and Janbu give I_SUPPORT_SPENCER_ONLY for every
 * geometrically valid circle (4.5), also if no element cuts the circle.
 */
export function evaluateCircle(m, circle, methods) {
  return evaluateGeometry(m, buildSlicesNormalized(m, circle), methods);
}

/**
 * Evaluate one slip surface of either kind (calculation frame): a circle { xc, zc, R } or a polyline
 * { type: "polyline", points } with x strictly increasing (SPEC_ETAPPE4 3). Result as evaluateCircle().
 * A polyline gets no Bishop result (I_NONCIRCULAR, SPEC_ETAPPE4 4.4); Janbu and Spencer calculate for every form; with
 * supports only Spencer (SPEC_ETAPPE4 4.4).
 * A polyline with supports: Bishop gets I_NONCIRCULAR, Janbu I_SUPPORT_SPENCER_ONLY (SPEC_ETAPPE4 4.4).
 */
export function evaluateSurface(m, surface, methods) {
  if (!isPolylineSurface(surface)) return evaluateCircle(m, surface, methods);
  return evaluateGeometry(m, buildSlicesPolylineNormalized(m, surface.points), methods);
}

/** Options of the methods from the model (calculation frame): k_h, k_v (positive downwards, SPEC_ETAPPE4 7), tolerance, iterations. */
export function solverOptions(m) {
  return {
    kh: m.seismic && typeof m.seismic.kh === 'number' ? m.seismic.kh : 0,
    kv: m.seismic && typeof m.seismic.kv === 'number' ? m.seismic.kv : 0,
    tolerance: m.analysis.tolerance,
    maxIterations: m.analysis.maxIterations,
  };
}

function evaluateGeometry(m, g, methods) {
  const out = { geometry: g, bishop: null, janbu: null, spencer: null };
  if (!g.valid) {
    for (const name of methods) out[name] = { valid: false, code: g.code, message: g.message };
    return out;
  }
  const opts = solverOptions(m);
  // what the methods take as the shape of the surface: the circle, or for a polyline the moment point (Spencer) and the points (Janbu)
  const polyline = g.type === 'polyline';
  const spencerShape = polyline ? { pivot: g.pivot } : g.circle;
  const janbuShape = polyline ? { points: g.points } : g.circle;
  const nonCircular = { valid: false, code: CODE_NONCIRCULAR, message: MESSAGE_NONCIRCULAR };
  if (hasSupports(m)) {
    // open question (order 21): a geometrically invalid circle keeps its geometry code for every method.
    const only = { valid: false, code: 'I_SUPPORT_SPENCER_ONLY', message: 'Supports act in Spencer only.' };
    if (methods.includes('bishop')) out.bishop = polyline ? { ...nonCircular } : { ...only };
    if (methods.includes('janbu')) out.janbu = { ...only };
    out.supports = evaluateSupports(m, g);
    // the moments of the support forces are taken about the circle centre or, for a polyline, about the moment point
    out.supportSlices = withSupportSums(g.slices, out.supports, polyline ? { xc: g.pivot[0], zc: g.pivot[1] } : g.circle);
    if (methods.includes('spencer')) out.spencer = spencer(out.supportSlices, spencerShape, opts);
    return out;
  }
  if (methods.includes('bishop')) out.bishop = polyline ? { ...nonCircular } : bishop(g.slices, g.circle, opts);
  if (methods.includes('janbu')) out.janbu = janbu(g.slices, janbuShape, g.entry, g.exit, opts);
  if (methods.includes('spencer')) out.spencer = spencer(g.slices, spencerShape, opts);
  return out;
}

/** The model has supports (a non-empty list). */
export const hasSupports = (m) => Array.isArray(m.supports) && m.supports.length > 0;

/** F of a search target from an evaluation, or null if invalid. */
export function targetValue(evaluation, target) {
  const r = target === 'bishop' ? evaluation.bishop : target === 'spencer' ? evaluation.spencer : evaluation.janbu;
  if (!r || !r.valid) return null;
  return target === 'janbu' ? r.F0 : r.F;
}

/** Radii of a centre (SPEC 7.2): n values evenly spaced between R_min and R_max. */
export function radiiFor(m, xc, zc, n) {
  const rMin = distanceToPolyline(m.ground, xc, zc) + 0.1;
  const rMax = Math.min(maxVertexDistance(m.ground, xc, zc), zc - m.bottom);
  if (!(rMax >= rMin)) return { rMin, rMax, radii: [] };
  const radii = [];
  for (let k = 0; k < n; k++) radii.push(n === 1 ? rMin : rMin + ((rMax - rMin) * k) / (n - 1));
  return { rMin, rMax, radii };
}

/**
 * Knee radii of a centre (SPEC 7.2, version 1.6): R_P = |M - P| - KNEE_RADIUS_OFFSET for every inner ground
 * point P (not the first or last), if R_min <= R_P <= R_max. Returns [{ R, point }], point = index into m.ground.
 */
export function kneeRadiiFor(m, xc, zc) {
  const { rMin, rMax } = radiiFor(m, xc, zc, 1);
  const out = [];
  for (let point = 1; point < m.ground.length - 1; point++) {
    const R = Math.hypot(xc - m.ground[point][0], zc - m.ground[point][1]) - KNEE_RADIUS_OFFSET;
    if (R >= rMin && R <= rMax) out.push({ R, point });
  }
  return out;
}

/**
 * Run the search.
 *
 * @param {object} m  model in the calculation frame (normalised, partial factors applied)
 * @param {{mirrored:boolean}} info  result of normalizeModel
 * @param {string[]} methods  subset of ["bishop", "janbu", "spencer"]
 * @param {{grid:object, radii:number}} search
 * @param {function} [onProgress]  progress callback (SPEC 8.1): called after each centre of the grid with
 *   {phase: "grid", done, total}, once before the refinement with {phase: "refine", done: 0, total: 0} and, with
 *   search.optimize, once before the first optimisation with {phase: "optimize", done: 0, total: 0} (SPEC_ETAPPE4 5).
 *   Exceptions of the callback are not caught. Has no influence on the result.
 * @returns {{critical:object, grid:object[], counts:object, countsByMethod:object,
 *   warnings:{code:string, method:string}[], refinementEvaluations:object, optimizeEvaluations?:number, timeMs:number}}
 *   critical/grid are in the input frame. With search.optimize (SPEC_ETAPPE4 5, 9) critical of janbu, janbuCorrected and
 *   spencer is the optimised polyline with `searchCircle` (the circle before the optimisation); bishop stays the circle.
 */
export function runSearch(m, info, methods, search, onProgress) {
  const t0 = performance.now();
  const { grid, radii: nRadii } = search;
  const nOptimize = optimizePoints(search); // number of points of the optimised polyline, null = no optimisation
  const optimized = (t) => nOptimize !== null && t !== 'bishop'; // bishop stays the circle (SPEC_ETAPPE4 5)
  const targets = [];
  const supported = hasSupports(m);
  // with supports only Spencer is searched (SPEC_ETAPPE3 4.5)
  if (methods.includes('bishop') && !supported) targets.push('bishop');
  if (methods.includes('janbu') && !supported) targets.push('janbu', 'janbuCorrected');
  if (methods.includes('spencer')) targets.push('spencer');

  const dx = grid.nx > 1 ? (grid.xMax - grid.xMin) / (grid.nx - 1) : 0;
  const dz = grid.nz > 1 ? (grid.zMax - grid.zMin) / (grid.nz - 1) : 0;

  const counts = {};
  for (const name of methods) counts[name] = { total: 0, valid: 0, invalid: {} };
  const best = {}; // target -> { F, circle, ix, iz, rMin, rMax, evaluation }
  const gridRows = [];
  const bestKnee = {}; // target -> Map(ground point index -> best valid grid surface with the knee radius of that point)
  for (const t of targets) bestKnee[t] = new Map();

  // ---- grid search ----
  for (let iz = 0; iz < grid.nz; iz++) {
    for (let ix = 0; ix < grid.nx; ix++) {
      const xIn = grid.xMin + dx * ix;
      const zIn = grid.zMin + dz * iz;
      const xc = info.mirrored ? 0 - xIn : xIn;
      const { rMin, rMax, radii } = radiiFor(m, xc, zIn, nRadii);
      const row = { xc: xIn, zc: zIn };
      for (const t of targets) row[t] = null;
      const candidates = radii.map((R) => ({ R, point: null }));
      for (const k of kneeRadiiFor(m, xc, zIn)) candidates.push(k);
      for (const { R, point } of candidates) {
        const evaluation = evaluateCircle(m, { xc, zc: zIn, R }, methods);
        for (const name of methods) {
          const r = evaluation[name];
          const c = counts[name];
          c.total++;
          if (r.valid) c.valid++;
          else c.invalid[r.code] = (c.invalid[r.code] || 0) + 1;
        }
        for (const t of targets) {
          const F = targetValue(evaluation, t);
          if (F === null) continue;
          if (row[t] === null || F < row[t]) row[t] = F;
          if (!best[t] || F < best[t].F) {
            best[t] = { F, circle: { xc, zc: zIn, R }, ix, iz, rMin, rMax, evaluation };
          }
          if (point !== null) {
            const kb = bestKnee[t].get(point);
            if (!kb || F < kb.F) bestKnee[t].set(point, { F, circle: { xc, zc: zIn, R }, evaluation });
          }
        }
      }
      gridRows.push(row);
      if (onProgress) onProgress({ phase: 'grid', done: iz * grid.nx + ix + 1, total: grid.nx * grid.nz });
    }
  }

  if (onProgress) onProgress({ phase: 'refine', done: 0, total: 0 });

  // ---- refinement (SPEC 7.4), per target ----
  const warnings = [];
  const refinementEvaluations = {};
  for (const t of targets) {
    const b = best[t];
    if (!b) continue;
    // warning: minimum on the edge of the grid (the raster minimum before refinement)
    const onEdge =
      (grid.nx > 1 && (b.ix === 0 || b.ix === grid.nx - 1)) || (grid.nz > 1 && (b.iz === 0 || b.iz === grid.nz - 1));
    if (onEdge) warnings.push({ code: 'W_MIN_ON_GRID_EDGE', method: t });

    const ref = refine(m, t, b, [dx, dz, (b.rMax - b.rMin) / nRadii]);
    let result = ref;
    let evaluations = ref.evaluations;
    // knee refinement (SPEC 7.4, points 5-8): replaces the result only if strictly better
    for (const [point, start] of bestKnee[t]) {
      const kr = refineKnee(m, t, point, start, [dx, dz]);
      evaluations += kr.evaluations;
      if (kr.F < result.F) result = kr;
    }
    refinementEvaluations[t] = evaluations;
    best[t] = { ...b, F: result.F, circle: result.circle, evaluation: result.evaluation };

    // warning: lowest point of the governing surface less than 0.01 m above the model bottom (SPEC 7.5);
    // for an optimised target it is checked at the optimised surface below
    if (!optimized(t) && best[t].evaluation.geometry.zMin - m.bottom < 0.01) warnings.push({ code: 'W_MIN_AT_BOTTOM', method: t });
  }

  // ---- optimisation of the governing circles to polylines (SPEC_ETAPPE4 5), per target with its own method ----
  let optimizeEvaluations;
  if (nOptimize !== null) {
    optimizeEvaluations = 0;
    let announced = false;
    for (const t of targets) {
      if (!optimized(t) || !best[t]) continue;
      if (!announced && onProgress) onProgress({ phase: 'optimize', done: 0, total: 0 });
      announced = true;
      const methodsOf = [methodOf(t)];
      const evaluate = (points) => {
        const evaluation = evaluateSurface(m, { type: 'polyline', points }, methodsOf);
        const F = targetValue(evaluation, t);
        return F === null ? null : { F, evaluation };
      };
      const o = optimizeCircle(m, best[t], nOptimize, evaluate);
      optimizeEvaluations += o.evaluations;
      // the smaller F governs: the optimised surface only if it is smaller than the circle (SPEC_ETAPPE4 5)
      const chosen = governingOptimized(best[t].F, o.result);
      if (chosen) best[t] = { ...best[t], optimized: chosen };
      // warning at the governing surface: the optimised one, else the circle
      const governing = chosen ? chosen.evaluation : best[t].evaluation;
      if (governing.geometry.zMin - m.bottom < 0.01) warnings.push({ code: 'W_MIN_AT_BOTTOM', method: t });
    }
  }

  // ---- result in the input frame ----
  const critical = {};
  for (const t of targets) {
    const b = best[t];
    critical[t] = b ? (b.optimized ? criticalEntryPolyline(t, b, info) : criticalEntry(t, b, info)) : null;
  }
  // open question (order 21): with supports `critical` holds Spencer only; the other methods have no
  // entry (they are not searched). Per circle they carry I_SUPPORT_SPENCER_ONLY (see evaluateCircle).

  return {
    critical,
    grid: gridRows,
    counts: sumCounts(counts),
    countsByMethod: counts,
    warnings,
    refinementEvaluations,
    ...(optimizeEvaluations === undefined ? {} : { optimizeEvaluations }),
    timeMs: performance.now() - t0,
  };
}

/** Local refinement of one target (SPEC 7.4). Steps: [dx, dz, dR]. */
function refine(m, target, start, steps0) {
  const methods = [methodOf(target)];
  let cur = { F: start.F, circle: start.circle, evaluation: start.evaluation };
  let steps = [...steps0];
  let evaluations = 0;
  while (Math.max(...steps) >= MIN_STEP) {
    for (let move = 0; move < MAX_MOVES_PER_LEVEL; move++) {
      let bestNb = null;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (let k = -1; k <= 1; k++) {
            if (i === 0 && j === 0 && k === 0) continue;
            const circle = {
              xc: cur.circle.xc + i * steps[0],
              zc: cur.circle.zc + j * steps[1],
              R: cur.circle.R + k * steps[2],
            };
            if (!(circle.R > 0)) continue;
            evaluations++;
            const evaluation = evaluateCircle(m, circle, methods);
            const F = targetValue(evaluation, target);
            if (F !== null && F < (bestNb ? bestNb.F : cur.F)) bestNb = { F, circle, evaluation };
          }
        }
      }
      if (!bestNb) break;
      cur = bestNb;
    }
    steps = steps.map((s) => s / 2);
  }
  return { ...cur, evaluations };
}

/**
 * Knee refinement of one target for ground point P (SPEC 7.4, points 5-8): only (xc, zc) move, the radius
 * always follows R = |M - P| - KNEE_RADIUS_OFFSET. 8 neighbours, steps [dx, dz] halved. A neighbour whose R
 * lies outside R_min..R_max of its centre is invalid.
 */
function refineKnee(m, target, point, start, steps0) {
  const methods = [methodOf(target)];
  const P = m.ground[point];
  let cur = { F: start.F, circle: start.circle, evaluation: start.evaluation };
  let steps = [...steps0];
  let evaluations = 0;
  while (Math.max(...steps) >= MIN_STEP) {
    for (let move = 0; move < MAX_MOVES_PER_LEVEL; move++) {
      let bestNb = null;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          const xc = cur.circle.xc + i * steps[0];
          const zc = cur.circle.zc + j * steps[1];
          const R = Math.hypot(xc - P[0], zc - P[1]) - KNEE_RADIUS_OFFSET;
          const { rMin, rMax } = radiiFor(m, xc, zc, 1);
          if (!(R >= rMin && R <= rMax)) continue;
          const circle = { xc, zc, R };
          evaluations++;
          const evaluation = evaluateCircle(m, circle, methods);
          const F = targetValue(evaluation, target);
          if (F !== null && F < (bestNb ? bestNb.F : cur.F)) bestNb = { F, circle, evaluation };
        }
      }
      if (!bestNb) break;
      cur = bestNb;
    }
    steps = steps.map((s) => s / 2);
  }
  return { ...cur, evaluations };
}

/** Tension crack of a surface in the input frame for the result entries: { x, depth, Pw } or null (SPEC_ETAPPE4 9). */
const crackInInput = (crack, info) => crackOutput(crack ? { ...crack, x: xToInput(crack.x, info) } : null);

/** Result entry of one target in the input frame. */
export function criticalEntry(target, b, info) {
  const g = b.evaluation.geometry;
  const base = {
    F: b.F,
    xc: xToInput(b.circle.xc, info),
    zc: b.circle.zc,
    R: b.circle.R,
    entry: pointToInput(g.entry, info),
    exit: pointToInput(g.exit, info),
    crack: crackInInput(g.crack, info),
  };
  if (target === 'bishop') {
    const r = b.evaluation.bishop;
    return { ...base, iterations: r.iterations, negativeN: r.negativeN };
  }
  if (target === 'spencer') {
    const r = b.evaluation.spencer;
    const entry = { ...base, iterations: r.iterations, theta: r.theta, Fm: r.Fm, Ff: r.Ff, equilibrium: r.equilibrium, diagnostics: r.diagnostics };
    if (b.evaluation.supports) {
      entry.supports = supportsOutput(b.evaluation.supports, g.slices.length, b.F, info);
    }
    return entry;
  }
  const r = b.evaluation.janbu;
  return { ...base, iterations: r.iterations, F0: r.F0, f0: r.f0, b1: r.b1, d: r.d, L: r.L };
}

/**
 * Result entry of an optimised target in the input frame (SPEC_ETAPPE4 9): the polyline (type, F, points, entry, exit, the
 * fields of the method as for a circle) and `searchCircle`, the circle before the optimisation (the entry without optimisation).
 */
export function criticalEntryPolyline(target, b, info) {
  const o = b.optimized;
  const g = o.evaluation.geometry;
  const circle = criticalEntry(target, b, info);
  const searchCircle = { F: circle.F, xc: circle.xc, zc: circle.zc, R: circle.R, entry: circle.entry, exit: circle.exit };
  const base = {
    type: 'polyline',
    F: o.F,
    points: polylineToInput(o.points, info),
    entry: pointToInput(g.entry, info),
    exit: pointToInput(g.exit, info),
    crack: crackInInput(g.crack, info),
  };
  if (target === 'spencer') {
    const r = o.evaluation.spencer;
    const entry = { ...base, iterations: r.iterations, theta: r.theta, Fm: r.Fm, Ff: r.Ff, equilibrium: r.equilibrium, diagnostics: r.diagnostics };
    if (o.evaluation.supports) entry.supports = supportsOutput(o.evaluation.supports, g.slices.length, o.F, info);
    return { ...entry, searchCircle };
  }
  const r = o.evaluation.janbu;
  return { ...base, iterations: r.iterations, F0: r.F0, f0: r.f0, b1: r.b1, d: r.d, L: r.L, searchCircle };
}

/** Counters over all methods (each circle counts once per method). */
function sumCounts(byMethod) {
  const total = { total: 0, valid: 0, invalid: {} };
  for (const c of Object.values(byMethod)) {
    total.total += c.total;
    total.valid += c.valid;
    for (const [code, n] of Object.entries(c.invalid)) total.invalid[code] = (total.invalid[code] || 0) + n;
  }
  return total;
}
