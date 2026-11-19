// Drawing mode of the sketch (SPEC_ETAPPE4 12, 12a): what a click sets, what the preview shows and what the finished drawing writes
// into the model, for every kind: slip surface, layer boundary, water line, ground, nail, anchor, pile, shotcrete. No DOM access.
//
// A drawing is { kind, points, direction } with the points set so far in the input frame. Nothing is corrected silently: a click that
// breaks a rule of the drawing sets no point (the sketch shows a hint); a position the model does not allow (a boundary that crosses
// another, water above the ground ...) is written as it is and reported by the check (SPEC_ETAPPE2 6.1).

import { drawingStep, finishedPolyline } from './result-sketch.js';
import { heightAt } from './sketch-model.js';
import { effectiveBoundary } from '../../core/index.js';
import { slopeDirection, groundBetween } from './supports-sketch.js';
import { insertSupportAfter } from './supports-edit.js';
import { appendSurface, nextSurfaceId } from './edit.js';
import { snapEndsToGround, snapToModelEdge } from './draw-snap.js';

/** The kinds in the order of the choice in the tool bar (SPEC_ETAPPE4 12a). */
export const DRAW_KINDS = ['surface', 'layer', 'water', 'ground', 'nail', 'anchor', 'pile', 'shotcrete'];

/** Lines: the points are open (any number of clicks, double click or Enter ends). */
export const LINE_KINDS = ['surface', 'layer', 'water', 'ground'];

/** Number of clicks of the kinds with a fixed number; the drawing ends with the last one (no double click). null: open. */
export const CLICKS = { surface: null, layer: null, water: null, ground: null, nail: 2, anchor: 3, pile: 2, shotcrete: 2 };

const EPS = 1e-9;
const DEG = 180 / Math.PI;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** A drawing that has just begun. */
export const newDrawing = (kind) => ({ kind, points: [], direction: 0 });

/** Has a drawing of a kind with a fixed number of clicks got them all? Open kinds: never (they end by double click or Enter). */
export const isComplete = (drawing) => CLICKS[drawing.kind] !== null && drawing.points.length >= CLICKS[drawing.kind];

/** Model width (SPEC.md 4): x of the first and last ground point; null without a usable ground line. */
export function modelWidth(model) {
  const g = isObject(model) && Array.isArray(model.ground) ? model.ground : [];
  const first = g[0];
  const last = g[g.length - 1];
  if (g.length < 2 || !Array.isArray(first) || !Array.isArray(last) || !isNum(first[0]) || !isNum(last[0]) || !(first[0] < last[0])) return null;
  return { xMin: first[0], xMax: last[0] };
}

/** Direction "into the slope" for nail and anchor: the slope of the model; when it cannot be told (equal ends) 'right'. */
// open question (order 28): SPEC_ETAPPE4 12a does not say what to do for a ground line whose ends have the same height. The check of
// the core reports E_DIRECTION_AUTO for direction "auto" anyway; for the angle of the drawn element 'right' is taken.
const slopeOf = (model) => slopeDirection(model) || 'right';

/** Inclination (degrees, positive downwards, measured into the slope, SPEC_ETAPPE3 2.1) of the vector (dx, dz) from the head. */
export function inclinationOf(dx, dz, direction) {
  return Math.atan2(-dz, direction === 'right' ? -dx : dx) * DEG;
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * The point of a click or of the pointer for the kind of the drawing: for a layer boundary and the water line a point at most `tolerance` (m)
 * from the left or right model edge, inside or outside, lies exactly on the edge (SPEC_ETAPPE4 13c); the preview uses it too, so that the
 * point appears at the edge. Every other kind: the point as it is.
 */
export function drawPoint(kind, p, model, tolerance = 0) {
  return kind === 'layer' || kind === 'water' ? snapToModelEdge(p, modelWidth(model), tolerance) : p;
}

/**
 * May the point `p` ([x, z], snapped) be set as the next point of the drawing? `tolerance` (m) = the catch area at the scale of the view
 * (catchMetres), for the edge of the model (drawPoint). Returns
 *   { ok: true, point, direction }   `point` = what is stored (the third point of an anchor is projected onto the line), `direction` of a line
 *   { ok: false, reason }            'direction' | 'outside' | 'noWidth' | 'same' | 'behind' | 'up' | 'xsame'
 */
export function acceptPoint(drawing, p, model, tolerance = 0) {
  const { kind, points } = drawing;
  const n = points.length;
  switch (kind) {
    case 'layer':
    case 'water': {
      const w = modelWidth(model);
      if (!w) return { ok: false, reason: 'noWidth' };
      const q = drawPoint(kind, p, model, tolerance);
      if (q[0] < w.xMin - EPS || q[0] > w.xMax + EPS) return { ok: false, reason: 'outside' };
      return lineStep(drawing, q);
    }
    case 'surface':
    case 'ground':
      return lineStep(drawing, p);
    case 'nail':
      return n === 1 && !(dist(points[0], p) > EPS) ? { ok: false, reason: 'same' } : { ok: true, point: p };
    case 'anchor': {
      if (n === 1 && !(dist(points[0], p) > EPS)) return { ok: false, reason: 'same' };
      if (n === 2) {
        // the third point is projected onto the line of the first two; it must lie behind the second point
        const [a, b] = points;
        const length = dist(a, b);
        const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / length;
        if (!(t > length + EPS)) return { ok: false, reason: 'behind' };
        return { ok: true, point: [a[0] + ((b[0] - a[0]) * t) / length, a[1] + ((b[1] - a[1]) * t) / length] };
      }
      return { ok: true, point: p };
    }
    case 'pile':
      // only the z of the second click counts: the pile stands vertically below its head
      return n === 1 && !(p[1] < points[0][1] - EPS) ? { ok: false, reason: 'up' } : { ok: true, point: n === 1 ? [points[0][0], p[1]] : p };
    case 'shotcrete':
      return n === 1 && !(Math.abs(p[0] - points[0][0]) > EPS) ? { ok: false, reason: 'xsame' } : { ok: true, point: p };
    default:
      return { ok: false, reason: 'direction' };
  }
}

function lineStep(drawing, p) {
  const step = drawingStep(drawing.points, drawing.direction, p[0]);
  return step.ok ? { ok: true, point: p, direction: step.direction } : { ok: false, reason: 'direction' };
}

/**
 * The preview: [{ points, cls }] in world coordinates, `cls` 'set' for what is fixed and 'line' for the part that follows the
 * pointer (dashed). `mouse` = [x, z] snapped or null.
 */
export function previewParts(drawing, mouse, model) {
  const { kind, points } = drawing;
  const parts = [];
  const set = (pts) => { if (pts.length >= 2) parts.push({ points: pts, cls: 'set' }); };
  const line = (pts) => { if (pts.length >= 2) parts.push({ points: pts, cls: 'line' }); };
  if (LINE_KINDS.includes(kind)) {
    set(points);
    if (mouse && points.length >= 1) line([points[points.length - 1], mouse]);
    return parts;
  }
  if (!points.length) return parts;
  const head = points[0];
  if (kind === 'nail') {
    if (mouse) line([head, mouse]);
  } else if (kind === 'anchor') {
    if (points.length === 1) {
      if (mouse) line([head, mouse]);
    } else {
      set([head, points[1]]);
      if (mouse) {
        const probe = acceptPoint(drawing, mouse, model);
        if (probe.ok) line([points[1], probe.point]);
      }
    }
  } else if (kind === 'pile') {
    if (mouse) line([head, [head[0], mouse[1]]]);
  } else if (kind === 'shotcrete') {
    const ground = Array.isArray(model && model.ground) ? model.ground.filter((q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1])) : [];
    if (mouse && ground.length >= 2) {
      const [x1, x2] = head[0] <= mouse[0] ? [head[0], mouse[0]] : [mouse[0], head[0]];
      const band = groundBetween(ground, x1, x2);
      if (band) line(band);
    }
  }
  return parts;
}

// ---------- writing the finished drawing into the model ----------

/**
 * Can the drawing be finished now? Lines need 2 points (the open kinds end on demand), the fixed kinds all their clicks.
 * Returns { ok: true } or { ok: false, reason: 'min' | 'layers' }.
 */
export function canFinish(drawing, model) {
  if (LINE_KINDS.includes(drawing.kind)) {
    if (drawing.points.length < 2) return { ok: false, reason: 'min' };
    if (drawing.kind === 'layer' && !(isObject(model) && Array.isArray(model.layers) && model.layers.length > 0)) return { ok: false, reason: 'layers' };
    return { ok: true };
  }
  return isComplete(drawing) ? { ok: true } : { ok: false, reason: 'min' };
}

/**
 * The line of a layer boundary or the water line over the whole model width (SPEC.md 4): the points ordered by x, with a point added at
 * the model edge with the z of the first or last point when that point is not exactly at the edge (SPEC_ETAPPE4 12a).
 */
export function extendToWidth(points, width) {
  const out = points.map(([x, z]) => [x, z]);
  if (out[0][0] > width.xMin + EPS) out.unshift([width.xMin, out[0][1]]);
  if (out[out.length - 1][0] < width.xMax - EPS) out.push([width.xMax, out[out.length - 1][1]]);
  return out;
}

/** Height of a polyline at x (linear between its points); null outside it or when it is no line. */
function heightOn(points, x) {
  if (!Array.isArray(points) || points.length < 2 || !points.every((q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]))) return null;
  return heightAt(points, x);
}

/** Height of the effective layer boundary at x (SPEC 4 v1.8); the plain height when the ground is no usable line; null when the boundary is no line. */
function effectiveHeightOn(points, ground, x) {
  if (heightOn(points, points?.[0]?.[0]) === null || !points.every((q, i) => i === 0 || q[0] > points[i - 1][0])) return null;
  if (heightOn(ground, x) === null || !ground.every((q, i) => i === 0 || q[0] >= ground[i - 1][0])) return heightOn(points, x);
  return heightOn(effectiveBoundary(points, ground), x);
}

/**
 * A layer boundary into the model (SPEC_ETAPPE4 12a). A layer other than the top one without a boundary (missing or empty list) gets the
 * line as its boundary; else a new layer is made: below the layer in which the line lies in the middle of the model width (the layers are
 * ordered by their height there, the top one is bounded by the ground), with the material of that layer. Returns { index, created } of the
 * layer that holds the line.
 */
export function addLayerBoundary(model, points) {
  const layers = model.layers;
  const empty = layers.findIndex((l, k) => k >= 1 && isObject(l) && (l.top === null || l.top === undefined || (Array.isArray(l.top) && l.top.length === 0)));
  if (empty >= 0) {
    layers[empty].top = points;
    return { index: empty, created: false };
  }
  const width = modelWidth(model);
  const xm = width ? 0.5 * (width.xMin + width.xMax) : points[0][0];
  const zNew = heightOn(points, xm);
  // the layer in which the point of the new line in the middle lies: the last layer whose top is not below it
  let j = 0;
  layers.forEach((l, k) => {
    // a boundary counts with its effective height (SPEC 4 v1.8: extended to the model width, clipped at the ground)
    const top = k === 0 ? heightOn(model.ground, xm) : isObject(l) ? effectiveHeightOn(l.top, model.ground, xm) : null;
    if (top !== null && zNew !== null && top >= zNew - EPS) j = k;
  });
  const material = isObject(layers[j]) && layers[j].material !== undefined ? layers[j].material : null;
  layers.splice(j + 1, 0, { material, top: points });
  return { index: j + 1, created: true };
}

/** A value rounded to 2 decimals (0.01 m, 0.01 degree) without the noise of the binary number: 14.93, not 14.930000000000001. */
export const round2 = (v) => Number((Math.round(v * 100) / 100).toFixed(2));

/**
 * Nail from the two clicks: head (as clicked), inclination into the slope (SPEC_ETAPPE3 2.1) rounded to 0.01 degree and length rounded to 0.01 m
 * (SPEC_ETAPPE4 13b): the end then lies at most a few millimetres beside the second click.
 */
export function nailFromClicks(points, direction) {
  const [a, b] = points;
  return { x: a[0], z: a[1], angle: round2(inclinationOf(b[0] - a[0], b[1] - a[1], direction)), length: round2(dist(a, b)) };
}

/** Anchor from the three clicks (the third already on the line of the first two): angle to 0.01 degree, free length and bond length to 0.01 m. */
export function anchorFromClicks(points, direction) {
  const [a, b, c] = points;
  return { x: a[0], z: a[1], angle: round2(inclinationOf(b[0] - a[0], b[1] - a[1], direction)), freeLength: round2(dist(a, b)), bondLength: round2(dist(b, c)) };
}

/**
 * Write a finished drawing into the model (one change). `tolerance` (m, default: `drawing.tolerance`, else 0) = the catch area at the scale of the view (catchMetres): the end points
 * of a slip surface that lie just below the ground are set onto it (SPEC_ETAPPE4 13c). Returns what the page does next:
 *   { focus: path }          the input field to open (layer: the material of the layer)
 *   { support: index }       the element whose field opens (like a double click)
 *   {}                       nothing more
 */
export function applyDrawing(drawing, model, tolerance = isNum(drawing.tolerance) ? drawing.tolerance : 0) {
  const { kind } = drawing;
  const width = modelWidth(model);
  if (kind === 'surface') {
    appendSurface(model, { id: nextSurfaceId(model, 'P'), type: 'polyline', points: snapEndsToGround(finishedPolyline(drawing.points), model.ground, tolerance) });
    return {};
  }
  if (kind === 'ground') {
    model.ground = finishedPolyline(drawing.points);
    return {};
  }
  if (kind === 'water' || kind === 'layer') {
    const line = width ? extendToWidth(finishedPolyline(drawing.points), width) : finishedPolyline(drawing.points);
    if (kind === 'water') {
      model.water = line;
      return {};
    }
    const result = addLayerBoundary(model, line);
    return { focus: `layers[${result.index}].material` };
  }
  const direction = slopeOf(model);
  const type = kind;
  if (type === 'shotcrete') {
    const [x1, x2] = drawing.points.map((p) => p[0]).sort((p, q) => p - q);
    const created = insertSupportAfter(model, type, -1);
    Object.assign(model.supports[created.index], { x1, x2 });
    return { support: created.index };
  }
  const created = insertSupportAfter(model, type, -1);
  const s = model.supports[created.index];
  if (type === 'nail') Object.assign(s, nailFromClicks(drawing.points, direction));
  else if (type === 'anchor') Object.assign(s, anchorFromClicks(drawing.points, direction));
  else Object.assign(s, { x: drawing.points[0][0], z: drawing.points[0][1], length: round2(drawing.points[0][1] - drawing.points[1][1]) });
  return { support: created.index };
}
