// Tolerances of the drawing mode (SPEC_ETAPPE4 13c): the catch area of the handles (about 8 px) converted into metres, the end points of a
// drawn slip surface that are set onto the ground, a click near the model edge that is set onto the edge, and the test that decides
// which text a polyline with I_OUT_OF_MODEL gets. No DOM access.

import { CATCH_PX } from './handles.js';
import { heightAt, validPoints } from './sketch-model.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A length in pixels as metres at the scale of the view (pixels per metre). 0 when the scale is not a positive number. */
export function pxToMetres(px, scale) {
  return isNum(px) && isNum(scale) && scale > 0 ? px / scale : 0;
}

/** The catch area of the handles in metres at the scale of the view (SPEC_ETAPPE4 13c: "about 8 px"). */
export const catchMetres = (scale) => pxToMetres(CATCH_PX, scale);

/**
 * The end points of a drawn slip surface (points ordered by x): a first or last point that lies below the ground, but at most `tolerance`
 * (m, vertical) below it, gets the height of the ground at its x (SPEC_ETAPPE4 13c). Deeper points, points on or above the ground and all
 * inner points stay as they are. Returns a new list.
 */
export function snapEndsToGround(points, ground, tolerance) {
  if (!Array.isArray(points)) return points;
  const out = points.map(([x, z]) => [x, z]);
  const line = validPoints(ground);
  if (out.length < 2 || line.length < 2 || !(tolerance >= 0)) return out;
  for (const k of [0, out.length - 1]) {
    const g = heightAt(line, out[k][0]);
    if (g === null) continue; // outside the model width: nothing to snap to
    const below = g - out[k][1];
    if (below > 0 && below <= tolerance) out[k][1] = g;
  }
  return out;
}

/**
 * A click for a layer boundary or the water line near the model edge (SPEC_ETAPPE4 13c): at most `tolerance` (m, in x) from the left or
 * right edge (inside or outside) -> x of the edge, z unchanged. `width` = { xMin, xMax } of the model (modelWidth in drawing.js) or null.
 * Returns the point (the same array when nothing changes).
 */
export function snapToModelEdge(p, width, tolerance) {
  if (!width || !(tolerance >= 0)) return p;
  if (Math.abs(p[0] - width.xMin) <= tolerance) return [width.xMin, p[1]];
  if (Math.abs(p[0] - width.xMax) <= tolerance) return [width.xMax, p[1]];
  return p;
}

/**
 * Does the polyline start or end below the ground (the height of the ground at its x)? Decides the text of I_OUT_OF_MODEL for a polyline
 * (SPEC_ETAPPE4 13c). `points` in the order of the input frame, `ground` of the model; false when the height cannot be told.
 */
export function endsBelowGround(points, ground) {
  const p = validPoints(points);
  const line = validPoints(ground);
  if (p.length < 2 || line.length < 2) return false;
  return [p[0], p[p.length - 1]].some(([x, z]) => {
    const g = heightAt(line, x);
    return g !== null && z < g;
  });
}

/**
 * The result with the mark `belowGround: true` on every invalid polyline whose code is I_OUT_OF_MODEL and whose first or last point lies below
 * the ground of `model`; the text of the app for this case is chosen by it (surfaceCodeKey). A new object; the result of the core is not changed.
 * Surfaces and results that do not fit are returned as they are.
 */
export function markBelowGround(result, model) {
  if (!isObject(result) || !Array.isArray(result.surfaces) || !isObject(model)) return result;
  const surfaces = result.surfaces.map((s) => (isObject(s) && s.type === 'polyline' && s.valid !== true && s.code === 'I_OUT_OF_MODEL' && endsBelowGround(s.points, model.ground)
    ? { ...s, belowGround: true }
    : s));
  return { ...result, surfaces };
}

/** Key of the text for a code of a surface: the code itself, except I_OUT_OF_MODEL of a marked polyline (SPEC_ETAPPE4 13c). */
export function surfaceCodeKey(code, surface) {
  return code === 'I_OUT_OF_MODEL' && isObject(surface) && surface.belowGround === true ? 'ui.surf.belowGround' : code;
}
