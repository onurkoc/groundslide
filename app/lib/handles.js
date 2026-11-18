// Handles of the sketch (SPEC_ETAPPE2 6.1): which points of the model can be moved with the mouse, which one is caught, what a
// move writes into the model, and where a point is inserted on a line. No DOM access.
//
// A handle is { id, type, x, z, ...reference to the value in the model }. The list is in the order of the table in 6.1:
// ground, layer boundaries, water line, load ends, supports (SPEC_ETAPPE3 9), search rectangle, single circles (centre, then the
// point for R), the points of the single polylines that can be drawn (SPEC_ETAPPE4 12).

import { heightAt, validPoints, isDrawablePolyline } from './sketch-model.js';
import { snapValue } from './grid-step.js';
import { supportShapes } from './supports-sketch.js';

/** Radius of the area in which a handle is caught, in pixels ("about 8 px"). */
export const CATCH_PX = 8;
/** A movement below this many pixels is not a drag. */
export const DRAG_MIN_PX = 3;
/** A line is caught within this many pixels (double click inserts a point). */
export const LINE_CATCH_PX = 6;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPoint = (p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]);

/** Is (x, z) inside the polygon (list of [x, z])? Ray casting; a point on the border may count either way. */
export function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const SAMPLES = 720; // 0.5 degrees; divisible by 4, so that straight down (-90 degrees) is one of the samples

/**
 * Angle (radians, 0 = right, counter-clockwise, z up) of the handle for R on a single circle. The circle is drawn only
 * where it lies inside the soil body (`polygon`), so the handle sits on the drawn arc: the point of the arc that lies
 * nearest to straight below the centre (-90 degrees), which is the lowest point of the arc, if that is inside. Without a
 * polygon, or when no point of the circle is inside it, straight below the centre.
 */
export function radiusHandleAngle(circle, polygon) {
  const down = -Math.PI / 2;
  if (!Array.isArray(polygon) || polygon.length < 3) return down;
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const angle = -Math.PI + (2 * Math.PI * i) / SAMPLES;
    const distance = Math.abs(angle - down);
    if (distance >= bestDistance) continue;
    if (pointInPolygon(circle.xc + circle.R * Math.cos(angle), circle.zc + circle.R * Math.sin(angle), polygon)) {
      best = angle;
      bestDistance = distance;
    }
  }
  return best === null ? down : best;
}

/**
 * All handles of the model, in the order of the table of 6.1. Parts that are missing or not numbers have no handle.
 *   clip          polygon of the soil body (sketch.clip) or null: where the handle for R sits
 *   radiusAngles  { [index of the single circle]: angle }: while R is dragged the handle follows the pointer
 */
export function buildHandles(model, { clip = null, radiusAngles = {} } = {}) {
  const out = [];
  const m = isObject(model) ? model : {};

  if (Array.isArray(m.ground)) m.ground.forEach((p, index) => { if (isPoint(p)) out.push({ id: `ground:${index}`, type: 'ground', index, x: p[0], z: p[1] }); });

  if (Array.isArray(m.layers)) {
    m.layers.forEach((layer, k) => {
      // the first layer starts at the ground line (no boundary of its own)
      if (k === 0 || !isObject(layer) || !Array.isArray(layer.top)) return;
      layer.top.forEach((p, index) => { if (isPoint(p)) out.push({ id: `layer:${k}:${index}`, type: 'layer', layer: k, index, x: p[0], z: p[1] }); });
    });
  }

  if (Array.isArray(m.water)) m.water.forEach((p, index) => { if (isPoint(p)) out.push({ id: `water:${index}`, type: 'water', index, x: p[0], z: p[1] }); });

  const ground = validPoints(m.ground);
  if (Array.isArray(m.loads) && ground.length >= 2) {
    m.loads.forEach((load, index) => {
      if (!isObject(load)) return;
      for (const end of [1, 2]) {
        const x = load[`x${end}`];
        const z = isNum(x) ? heightAt(ground, x) : null;
        if (z !== null) out.push({ id: `load:${index}:${end}`, type: 'load', index, end, x, z });
      }
    });
  }

  // supports: the head of nail, anchor and pile (x and z), the two ends of a shotcrete (x only); only drawn elements have handles.
  // On a tie with another handle (e.g. a shotcrete end on a vertex of the ground line) the handle of the support wins: pickHandle, SPEC_ETAPPE3 9.
  for (const shape of supportShapes(m)) {
    if (shape.type === 'shotcrete') shape.ends.forEach(([x, z], k) => out.push({ id: 'supportEnd:' + shape.index + ':' + (k + 1), type: 'supportEnd', index: shape.index, end: k + 1, x, z }));
    else out.push({ id: 'support:' + shape.index, type: 'support', index: shape.index, x: shape.head[0], z: shape.head[1] });
  }

  const g = isObject(m.search) ? m.search.grid : null;
  if (isObject(g) && [g.xMin, g.xMax, g.zMin, g.zMax].every(isNum)) {
    for (const [xKey, zKey] of [['xMin', 'zMin'], ['xMax', 'zMin'], ['xMax', 'zMax'], ['xMin', 'zMax']]) {
      out.push({ id: `grid:${xKey}:${zKey}`, type: 'grid', xKey, zKey, x: g[xKey], z: g[zKey] });
    }
  }

  if (Array.isArray(m.surfaces)) {
    m.surfaces.forEach((s, index) => {
      if (!isObject(s) || !isNum(s.xc) || !isNum(s.zc)) return;
      out.push({ id: `centre:${index}`, type: 'centre', index, x: s.xc, z: s.zc });
      if (isNum(s.R) && s.R > 0) {
        const angle = isNum(radiusAngles[index]) ? radiusAngles[index] : radiusHandleAngle({ xc: s.xc, zc: s.zc, R: s.R }, clip);
        out.push({ id: `radius:${index}`, type: 'radius', index, cx: s.xc, cz: s.zc, R: s.R, angle, x: s.xc + s.R * Math.cos(angle), z: s.zc + s.R * Math.sin(angle) });
      }
    });
  }
  // points of the single polylines: only a complete polyline (SPEC_ETAPPE4 12) is drawn, so only it has handles
  if (Array.isArray(m.surfaces)) {
    m.surfaces.forEach((s, surface) => {
      if (!isObject(s) || s.type !== 'polyline' || !isDrawablePolyline(s.points)) return;
      s.points.forEach((p, index) => out.push({ id: `poly:${surface}:${index}`, type: 'poly', surface, index, x: p[0], z: p[1] }));
    });
  }
  return out;
}

/** Handles of the supports (SPEC_ETAPPE3 9): they win a tie with any other handle and are drawn on top of the others. */
export const isSupportHandle = (handle) => handle.type === 'support' || handle.type === 'supportEnd';

/**
 * The handle that is caught at the pixel (sx, sy), or null: the nearest one within `catchPx`; with the same distance the
 * handle of a support wins (SPEC_ETAPPE3 9), else the one that is earlier in the list (the order of the table of 6.1).
 * `toScreen(x, z)` gives [sx, sy] of a world point.
 */
export function pickHandle(handles, sx, sy, toScreen, catchPx = CATCH_PX) {
  let best = null;
  let bestDistance = Infinity;
  for (const handle of handles) {
    const [hx, hy] = toScreen(handle.x, handle.z);
    const distance = Math.hypot(hx - sx, hy - sy);
    if (distance <= catchPx && (distance < bestDistance || (distance === bestDistance && isSupportHandle(handle) && !isSupportHandle(best)))) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Values that a move to the world point `pointer` { x, z } gives: x and z for points, centres and corners (snapped to the
 * grid width `step` when it is given), x only for the end of a load, R for the point on a circle (distance of the pointer
 * from the centre, snapped). Nothing is limited or corrected.
 */
export function dragValues(handle, pointer, step = null) {
  const snap = (v) => (step ? snapValue(v, step) : v);
  if (handle.type === 'load' || handle.type === 'supportEnd') return { x: snap(pointer.x) };
  if (handle.type === 'radius') return { R: snap(Math.hypot(pointer.x - handle.cx, pointer.z - handle.cz)) };
  return { x: snap(pointer.x), z: snap(pointer.z) };
}

/** Which values the small input field of a handle holds: [{ key: 'x' | 'z' | 'R', value }] (unrounded). */
export function editFields(handle) {
  if (handle.type === 'load' || handle.type === 'supportEnd') return [{ key: 'x', value: handle.x }];
  if (handle.type === 'radius') return [{ key: 'R', value: handle.R }];
  return [{ key: 'x', value: handle.x }, { key: 'z', value: handle.z }];
}

/** Handles whose point can be deleted: the points of ground, layer boundaries, water line and polylines. */
export const canDeleteHandle = (handle) => handle.type === 'ground' || handle.type === 'layer' || handle.type === 'water' || handle.type === 'poly';

/** The list of points that a ground, layer, water or polyline handle belongs to (in the model), or null. */
function pointList(model, handle) {
  if (handle.type === 'poly') return Array.isArray(model.surfaces) && isObject(model.surfaces[handle.surface]) ? model.surfaces[handle.surface].points : null;
  if (handle.type === 'ground') return model.ground;
  if (handle.type === 'layer') return model.layers && model.layers[handle.layer] ? model.layers[handle.layer].top : null;
  if (handle.type === 'water') return model.water;
  return null;
}

/**
 * Write values ({ x, z } / { x } / { R }) of a handle into the model. true when the value was written, false when the
 * place in the model does not exist (anymore).
 */
export function setHandleValues(model, handle, values) {
  const has = (k) => Object.hasOwn(values, k);
  switch (handle.type) {
    case 'ground':
    case 'layer':
    case 'water':
    case 'poly': {
      const list = pointList(model, handle);
      if (!Array.isArray(list) || !Array.isArray(list[handle.index])) return false;
      if (has('x')) list[handle.index][0] = values.x;
      if (has('z')) list[handle.index][1] = values.z;
      return true;
    }
    case 'load': {
      const load = Array.isArray(model.loads) ? model.loads[handle.index] : null;
      if (!isObject(load)) return false;
      load[`x${handle.end}`] = values.x;
      return true;
    }
    case 'support': {
      const s = Array.isArray(model.supports) ? model.supports[handle.index] : null;
      if (!isObject(s)) return false;
      if (has('x')) s.x = values.x;
      if (has('z')) s.z = values.z;
      return true;
    }
    case 'supportEnd': {
      const s = Array.isArray(model.supports) ? model.supports[handle.index] : null;
      if (!isObject(s)) return false;
      s['x' + handle.end] = values.x;
      return true;
    }
    case 'grid': {
      const grid = isObject(model.search) ? model.search.grid : null;
      if (!isObject(grid)) return false;
      if (has('x')) grid[handle.xKey] = values.x;
      if (has('z')) grid[handle.zKey] = values.z;
      return true;
    }
    case 'centre':
    case 'radius': {
      const s = Array.isArray(model.surfaces) ? model.surfaces[handle.index] : null;
      if (!isObject(s)) return false;
      if (handle.type === 'centre') {
        if (has('x')) s.xc = values.x;
        if (has('z')) s.zc = values.z;
      } else {
        s.R = values.R;
      }
      return true;
    }
    default:
      return false;
  }
}

/** Delete the point of a ground, layer, water or polyline handle. true when a point was deleted. */
export function deleteHandlePoint(model, handle) {
  if (!canDeleteHandle(handle)) return false;
  const list = pointList(model, handle);
  if (!Array.isArray(list) || handle.index < 0 || handle.index >= list.length) return false;
  list.splice(handle.index, 1);
  return true;
}

// ---------- lines: ground, layer boundaries, water line ----------

/** The lines of the model on which a point can be inserted, in the order ground, layer boundaries, water line, polylines. */
export function lineTargets(model) {
  const m = isObject(model) ? model : {};
  const out = [];
  if (Array.isArray(m.ground)) out.push({ type: 'ground', id: 'ground', points: m.ground });
  if (Array.isArray(m.layers)) m.layers.forEach((layer, k) => { if (k > 0 && isObject(layer) && Array.isArray(layer.top)) out.push({ type: 'layer', layer: k, id: `layer:${k}`, points: layer.top }); });
  if (Array.isArray(m.water)) out.push({ type: 'water', id: 'water', points: m.water });
  if (Array.isArray(m.surfaces)) m.surfaces.forEach((s, i) => { if (isObject(s) && s.type === 'polyline' && isDrawablePolyline(s.points)) out.push({ type: 'poly', surface: i, id: `poly:${i}`, points: s.points }); });
  return out;
}

/** Distance in pixels of (px, py) from the segment (ax, ay)-(bx, by). */
export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / length2, 0), 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The segment of the lines that lies at the pixel (sx, sy) within `tolPx`: { target, index } (the segment between point
 * `index` and `index + 1`), or null. The nearest segment wins; with the same distance the earlier line.
 */
export function hitSegment(targets, sx, sy, toScreen, tolPx = LINE_CATCH_PX) {
  let best = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    for (let i = 0; i + 1 < target.points.length; i++) {
      const a = target.points[i];
      const b = target.points[i + 1];
      if (!isPoint(a) || !isPoint(b)) continue;
      const [ax, ay] = toScreen(a[0], a[1]);
      const [bx, by] = toScreen(b[0], b[1]);
      const distance = distanceToSegment(sx, sy, ax, ay, bx, by);
      if (distance <= tolPx && distance < bestDistance) {
        best = { target, index: i };
        bestDistance = distance;
      }
    }
  }
  return best;
}

// ---------- supports: nail, anchor, pile, shotcrete ----------

/**
 * The drawn support element at the pixel (sx, sy) within `tolPx` of one of its lines (a band of shotcrete counts by its
 * centre line): { shape, distance } of the nearest one, or null. `shapes` from supportShapes(); with the same distance the
 * earlier element. Used for the double click on an element that is not a handle (SPEC_ETAPPE3 9).
 */
export function hitSupport(shapes, sx, sy, toScreen, tolPx = LINE_CATCH_PX) {
  let best = null;
  for (const shape of shapes) {
    for (const { a, b } of shape.segments) {
      const [ax, ay] = toScreen(a[0], a[1]);
      const [bx, by] = toScreen(b[0], b[1]);
      const distance = distanceToSegment(sx, sy, ax, ay, bx, by);
      if (distance <= tolPx && (best === null || distance < best.distance)) best = { shape, distance };
    }
  }
  return best;
}

/**
 * The point to insert between the neighbours a and b ([x, z] each) for a double click at world x: x is the place of the
 * click, snapped to the grid width `step` (when given) if the snapped value stays strictly between the neighbours, else
 * not snapped; z lies on the line between a and b. When even the click is not between them (vertical segment, click
 * beyond the end) x is moved to the nearest neighbour's x, so the shape never changes.
 */
export function insertionPoint(a, b, x, step = null) {
  const lo = Math.min(a[0], b[0]);
  const hi = Math.max(a[0], b[0]);
  const snapped = step ? snapValue(x, step) : x;
  let xs = snapped > lo && snapped < hi ? snapped : x;
  if (!(xs > lo && xs < hi)) xs = Math.min(Math.max(x, lo), hi);
  const dx = b[0] - a[0];
  const z = dx === 0 ? a[1] : a[1] + ((b[1] - a[1]) * (xs - a[0])) / dx;
  return [xs, z];
}

/** Insert the point for a double click on the segment `hit` ({ target, index }) at world x. Returns the new point. */
export function insertOnSegment(hit, x, step = null) {
  const { points } = hit.target;
  const point = insertionPoint(points[hit.index], points[hit.index + 1], x, step);
  points.splice(hit.index + 1, 0, point);
  return point;
}
