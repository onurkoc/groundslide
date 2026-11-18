// Contour of the safety factors as colour bands (SPEC_ETAPPE2 8.2, version 1.7): fixed classes, bands with
// linear interpolation along the edges of the squares between four neighbouring centres of the search grid
// ("marching squares" for isobands). No DOM access. The colours are CSS variables (style.css, --contour-1 ...
// --contour-7 and --contour-none); here only the class index and the polygons are decided.

import { calculatedMethods } from './result-state.js';

/**
 * Classes of the colour scale (SPEC_ETAPPE2 8.2). The lower limit belongs to the class:
 * F < 1.0 | 1.0-1.1 | 1.1-1.2 | 1.2-1.3 | 1.3-1.5 | 1.5-2.0 | >= 2.0
 */
export const CONTOUR_LIMITS = [1.0, 1.1, 1.2, 1.3, 1.5, 2.0];
export const CONTOUR_CLASS_COUNT = CONTOUR_LIMITS.length + 1;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Class 0 ... 6 of a safety factor; null for "no valid surface" (null, missing, not a finite number). */
export function contourClass(F) {
  if (!isNum(F)) return null;
  let k = 0;
  while (k < CONTOUR_LIMITS.length && F >= CONTOUR_LIMITS[k]) k++;
  return k;
}

/** CSS class of a polygon: contour-0 ... contour-6, contour-none. */
export const contourCssClass = (cls) => (cls === null ? 'contour-none' : `contour-${cls}`);

/**
 * Legend entries from the lowest class to the highest, then "no valid surface":
 * { cls, from, to } with from / to = limits (null = open end); `cls: null` is the grey entry.
 */
export function contourLegend() {
  const items = [];
  for (let k = 0; k < CONTOUR_CLASS_COUNT; k++) {
    items.push({ cls: k, from: k === 0 ? null : CONTOUR_LIMITS[k - 1], to: k === CONTOUR_LIMITS.length ? null : CONTOUR_LIMITS[k] });
  }
  items.push({ cls: null, from: null, to: null });
  return items;
}

/** Text of a legend range, language-neutral: "< 1.0", "1.0-1.1", ">= 2.0". */
export function legendRange({ from, to }) {
  const f = (v) => v.toFixed(1);
  if (from === null && to === null) return '';
  if (from === null) return `< ${f(to)}`;
  if (to === null) return `≥ ${f(from)}`;
  return `${f(from)}–${f(to)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// One square
// ---------------------------------------------------------------------------------------------------------------

/** Area of a polygon (shoelace, positive for counter-clockwise points). */
export function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** Points that follow each other twice are written once. */
function dedupe(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-12 || Math.abs(last[1] - p[1]) > 1e-12) out.push(p);
  }
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= 1e-12 && Math.abs(out[0][1] - out[out.length - 1][1]) <= 1e-12) out.pop();
  return out;
}

/**
 * Bands of one square between four neighbouring centres.
 *   corners  [[x, z] * 4] counter-clockwise: lower left, lower right, upper right, upper left
 *   values   the four safety factors in the same order (null = no valid surface)
 * Returns [{ cls, points }]: polygons that fill the square exactly (their areas add up to the area of the square).
 *
 *   - A value that is null (or not finite) in any corner: the whole square is one grey polygon (cls null).
 *   - Four values in one class: the whole square is one polygon of that class.
 *   - Otherwise: the border of the square is cut at the class limits by LINEAR interpolation along each edge
 *     (a limit that equals a corner value lies on the corner: the lower limit belongs to the class). The part
 *     of the border that lies in a class is joined to the next such part by a straight line between two points
 *     of the same limit, so each band is a polygon of the border parts of its class and chords.
 *   - Saddle (a limit is crossed on all four edges, the corners alternate above / below): the chords can join
 *     the crossings in two ways. The MEAN of the four corner values decides: if it is at or above the limit, the
 *     corners above the limit stay connected (the chords cut off the corners below), otherwise the corners below
 *     stay connected (the chords cut off the corners above). Both bands next to a limit use the same decision,
 *     so the bands never overlap and leave no gap.
 */
export function squareBands(corners, values) {
  if (!values.every(isNum)) return [{ cls: null, points: corners.map((p) => [p[0], p[1]]) }];
  const k = values.map(contourClass);
  if (k.every((c) => c === k[0])) return [{ cls: k[0], points: corners.map((p) => [p[0], p[1]]) }];

  // events along the border, counter-clockwise: the corners and the crossings of the limits on the edges
  const events = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const a = values[i];
    const b = values[j];
    events.push({ point: [corners[i][0], corners[i][1]], cross: false, after: k[i] });
    const lerp = (level) => {
      const t = (CONTOUR_LIMITS[level - 1] - a) / (b - a); // linear along the edge
      return [corners[i][0] + (corners[j][0] - corners[i][0]) * t, corners[i][1] + (corners[j][1] - corners[i][1]) * t];
    };
    if (k[i] < k[j]) for (let level = k[i] + 1; level <= k[j]; level++) events.push({ point: lerp(level), cross: true, level, edge: i, after: level });
    else if (k[i] > k[j]) for (let level = k[i]; level > k[j]; level--) events.push({ point: lerp(level), cross: true, level, edge: i, after: level - 1 });
  }

  const mean = values.reduce((s, v) => s + v, 0) / 4;
  /** The crossing of the same limit that the chord from `event` leads to. */
  const partnerOf = (event) => {
    const same = events.filter((e) => e.cross && e.level === event.level);
    if (same.length === 2) return same[0] === event ? same[1] : same[0];
    // saddle: four crossings, one per edge. The chords cut off the corners that are "isolated": the ones below
    // the limit if the mean is at or above it, the ones above the limit otherwise.
    const limit = CONTOUR_LIMITS[event.level - 1];
    const isolated = (corner) => (mean >= limit ? values[corner] < limit : values[corner] >= limit);
    const at = (edge) => same.find((e) => e.edge === edge);
    for (let corner = 0; corner < 4; corner++) {
      if (!isolated(corner)) continue;
      const before = at((corner + 3) % 4); // edge that ends in the corner
      const next = at(corner); // edge that starts in the corner
      if (before === event) return next;
      if (next === event) return before;
    }
    return null;
  };

  // stretches of the border inside one class: from a crossing that enters the class to the crossing that leaves it
  const n = events.length;
  const startOf = events.map((e, i) => (e.cross ? i : -1)).filter((i) => i >= 0);
  const stretchEnd = (start) => {
    let i = start;
    do i = (i + 1) % n; while (!events[i].cross);
    return i;
  };
  const used = new Set();
  const out = [];
  for (const first of startOf) {
    if (used.has(first)) continue;
    const cls = events[first].after;
    const points = [];
    let cur = first;
    let guard = 0;
    while (!used.has(cur) && guard++ < 16) {
      used.add(cur);
      const end = stretchEnd(cur);
      for (let i = cur; ; i = (i + 1) % n) {
        points.push(events[i].point);
        if (i === end) break;
      }
      const partner = partnerOf(events[end]);
      if (!partner) break;
      cur = events.indexOf(partner);
      if (events[cur].after !== cls) break; // cannot happen with a consistent decision; the check keeps the walk safe
    }
    const clean = dedupe(points);
    if (clean.length >= 3 && Math.abs(polygonArea(clean)) > 0) out.push({ cls, points: clean });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The whole grid
// ---------------------------------------------------------------------------------------------------------------

/**
 * Bands of the contour for one method.
 *   result  output of analyze()
 *   method  key of the grid rows: bishop, janbu (F0), janbuCorrected, spencer
 *   grid    search.grid of the model { xMin, xMax, zMin, zMax, nx, nz }
 * Returns { polygons, reason }. The area is the rectangle xMin ... xMax, zMin ... zMax, divided into (nx - 1) * (nz - 1)
 * squares between four neighbouring centres; a polygon is { cls, points: [[x, z], ...] } with cls 0 ... 6 or null (grey).
 * `polygons` is empty (with a `reason`) without search, for a method that was not calculated, for a grid that cannot be
 * read, and for a grid with only one column or row (no square then).
 * The calculated result is not changed; this is only the picture.
 */
export function contourBands(result, method, grid) {
  const none = (reason) => ({ polygons: [], reason });
  if (!isObject(result) || !Array.isArray(result.grid)) return none('no-search');
  if (!calculatedMethods(result).includes(method)) return none('no-method');
  if (!isObject(grid) || ![grid.xMin, grid.xMax, grid.zMin, grid.zMax].every(isNum)) return none('no-grid');
  if (!Number.isInteger(grid.nx) || !Number.isInteger(grid.nz) || grid.nx < 1 || grid.nz < 1) return none('no-grid');
  if (grid.nx < 2 || grid.nz < 2) return none('single-row');
  const dx = (grid.xMax - grid.xMin) / (grid.nx - 1);
  const dz = (grid.zMax - grid.zMin) / (grid.nz - 1);

  // matrix of the values: row iz, column ix; a centre that is missing counts as "no valid surface"
  const matrix = Array.from({ length: grid.nz }, () => new Array(grid.nx).fill(null));
  for (const row of result.grid) {
    if (!isObject(row) || !isNum(row.xc) || !isNum(row.zc)) continue;
    const ix = dx > 0 ? Math.round((row.xc - grid.xMin) / dx) : 0;
    const iz = dz > 0 ? Math.round((row.zc - grid.zMin) / dz) : 0;
    if (ix >= 0 && ix < grid.nx && iz >= 0 && iz < grid.nz && isNum(row[method])) matrix[iz][ix] = row[method];
  }

  const polygons = [];
  for (let iz = 0; iz < grid.nz - 1; iz++) {
    for (let ix = 0; ix < grid.nx - 1; ix++) {
      const x0 = grid.xMin + dx * ix;
      const x1 = grid.xMin + dx * (ix + 1);
      const z0 = grid.zMin + dz * iz;
      const z1 = grid.zMin + dz * (iz + 1);
      const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      const values = [matrix[iz][ix], matrix[iz][ix + 1], matrix[iz + 1][ix + 1], matrix[iz + 1][ix]];
      polygons.push(...squareBands(corners, values));
    }
  }
  return { polygons, reason: null };
}

/** Polygons grouped by class for drawing: [{ cls, polygons: [points, ...] }], classes 0 ... 6 then grey (null). */
export function groupByClass(polygons) {
  const map = new Map();
  for (const p of polygons) {
    if (!map.has(p.cls)) map.set(p.cls, []);
    map.get(p.cls).push(p.points);
  }
  const order = [0, 1, 2, 3, 4, 5, 6, null];
  return order.filter((c) => map.has(c)).map((cls) => ({ cls, polygons: map.get(cls) }));
}
