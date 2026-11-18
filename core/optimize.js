// Search A of SPEC_ETAPPE4 5: optimisation of the governing circle as a polyline.
// The circle becomes a polyline with n points; the points are moved one by one (inner points at right angles to x, entry and
// exit along the ground line) as long as F of the target falls. Calculation frame. Pure functions, no DOM or browser access.

import { heightAt, arcHeight } from './geometry.js';
import { maxBodyThickness } from './slices.js';

export const DEFAULT_OPTIMIZE_POINTS = 11; // SPEC_ETAPPE4 5, details of A
export const MIN_OPTIMIZE_STEP = 0.01; // m; the run ends after a pass with a step below this has improved nothing
const MAX_PASSES_PER_LEVEL = 10000; // safety net against endless passes (as MAX_MOVES_PER_LEVEL in refine())

/** Number of points of the optimised polyline from search.optimize ({ } = default); null when the search does not optimise. */
export function optimizePoints(search) {
  const o = search && search.optimize;
  if (o === undefined || o === null) return null;
  return o.points === undefined ? DEFAULT_OPTIMIZE_POINTS : o.points;
}

/**
 * The circle as a polyline of n points (SPEC_ETAPPE4 5): entry, exit and n - 2 inner points at equal distances in x, z on
 * the lower arc. Entry and exit are those of the circle (on the ground line).
 * @param {{xc:number, zc:number, R:number}} circle
 * @param {number[]} entry  [x, z]
 * @param {number[]} exit  [x, z]
 */
export function circleToPolyline(circle, entry, exit, n) {
  const pts = [[entry[0], entry[1]]];
  for (let i = 1; i < n - 1; i++) {
    const x = entry[0] + ((exit[0] - entry[0]) * i) / (n - 1);
    pts.push([x, arcHeight(circle, x)]);
  }
  pts.push([exit[0], exit[1]]);
  return pts;
}

/**
 * Optimise the governing circle of one target.
 *
 * @param {object} m  model in the calculation frame
 * @param {{circle:object, evaluation:object}} best  governing circle of the target (evaluation of the circle, valid)
 * @param {number} n  number of points (integer >= 3)
 * @param {function(number[][]): ({F:number, evaluation:object}|null)} evaluate  F of the target and the evaluation of a
 *   polyline (points in the calculation frame), null for an invalid surface or one without a value for the method
 * @returns {{result: ({F:number, points:number[][], evaluation:object}|null), evaluations:number}}  result null when the
 *   start polyline is not valid (no optimisation possible); evaluations = polylines calculated
 */
export function optimizeCircle(m, best, n, evaluate) {
  const g = best.evaluation.geometry;
  const ground = m.ground;
  let evaluations = 0;
  const run = (pts) => {
    evaluations++;
    return evaluate(pts);
  };

  // with a tension crack the circle is cut off at the crack base (g.entry); the polyline starts on the ground at the entry of the
  // circle, so that its end point lies on the ground line and the crack cuts it as it cuts the circle (SPEC_ETAPPE4 6)
  // (SPEC_ETAPPE4 5, "Mit Zugriss": the start polyline begins at the ground point of the uncut circle)
  let points = circleToPolyline(best.circle, g.entryUncut || g.entry, g.exit, n);
  let cur = run(points);
  // SPEC_ETAPPE4 5 ("Nach dem Bericht zu Auftrag 25"): when the start polyline is invalid for the method the circle stays the result.
  if (cur === null) return { result: null, evaluations };

  let step = maxBodyThickness(ground, best.circle, g.entry[0], g.exit[0]) / 10; // SPEC_ETAPPE4 5: 1/10 of the thickest point
  for (;;) {
    for (let pass = 0; pass < MAX_PASSES_PER_LEVEL; pass++) {
      let improved = false;
      for (let i = 0; i < n; i++) {
        let bestMove = null;
        for (const sign of [1, -1]) {
          const p = movedPoint(ground, points, i, sign * step);
          if (p === null) continue;
          const candidate = points.map((q, j) => (j === i ? p : q));
          const r = run(candidate);
          if (r !== null && r.F < (bestMove ? bestMove.F : cur.F)) bestMove = { F: r.F, evaluation: r.evaluation, points: candidate };
        }
        if (bestMove) {
          cur = bestMove;
          points = bestMove.points;
          improved = true;
        }
      }
      if (!improved) break;
    }
    // The level ends with a pass that improved nothing. If its step was below the minimum, that is the end (SPEC_ETAPPE4 5);
    // SPEC_ETAPPE4 5 ("Nach dem Bericht zu Auftrag 25"): the first level with a step < 0.01 m is run to its end, then stop.
    if (step < MIN_OPTIMIZE_STEP) break;
    step /= 2;
  }
  return { result: { F: cur.F, points, evaluation: cur.evaluation }, evaluations };
}

/**
 * Which surface governs a target (SPEC_ETAPPE4 5, "Nach dem Bericht zu Auftrag 25"): the optimised one only if its F is
 * smaller than the F of the circle (the optimisation starts at the chord polyline, not at the circle). Otherwise null:
 * the circle stays the result.
 * @param {number} circleF  F of the circle
 * @param {{F:number}|null} result  result of optimizeCircle (null: no optimisation possible)
 */
export function governingOptimized(circleF, result) {
  return result !== null && result !== undefined && result.F < circleF ? result : null;
}

/**
 * Point i moved by `delta`: inner points in z; entry and exit along the ground line (delta measured in x, z from the ground).
 * Null when the move is not executed: x would not stay strictly increasing, or the ground has no height there.
 */
function movedPoint(ground, points, i, delta) {
  const [x, z] = points[i];
  const last = points.length - 1;
  if (i > 0 && i < last) return [x, z + delta];
  const xNew = x + delta;
  if (i === 0 ? !(xNew < points[1][0]) : !(xNew > points[last - 1][0])) return null;
  const zNew = heightAt(ground, xNew, 'max');
  return Number.isFinite(zNew) ? [xNew, zNew] : null;
}
