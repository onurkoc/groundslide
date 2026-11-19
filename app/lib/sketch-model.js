// What the sketch shows, derived from the model (SPEC_ETAPPE2 6). No DOM access.
//
// Never throws: parts that are missing or not numeric are left out, also for an
// invalid model. All coordinates are world coordinates (m).

import { boundsOf } from './view.js';
import { effectiveBoundary, extendBoundary, heightAt as coreHeightAt } from '../../core/index.js';

export const MATERIAL_COLORS = 8; // --mat-1 ... --mat-8, used cyclically
export const MAX_GRID_POINTS = 2000; // above: only the rectangle, no centres

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The drawable points ([x, z], both finite) of a list; others are left out. */
export function validPoints(list) {
  return Array.isArray(list) ? list.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) : [];
}

/** Height of a polyline at x (linear; at a vertical step the higher value); null outside its range. */
export function heightAt(points, x) {
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i];
    if (x1 === x) best = best === null ? z1 : Math.max(best, z1);
    if (i === 0) continue;
    const [x0, z0] = points[i - 1];
    if (x0 !== x1 && x >= Math.min(x0, x1) && x <= Math.max(x0, x1)) {
      const z = z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
      best = best === null ? z : Math.max(best, z);
    }
  }
  return best;
}

/** x strictly increasing (only then a layer boundary has an effective line, SPEC 4). */
const increasing = (pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1][0]);

/** Does a layer boundary span the ground width and lie nowhere above the ground (then it is its own effective boundary)? */
function fitsBelowGround(points, ground) {
  if (points[0][0] > ground[0][0] || points[points.length - 1][0] < ground[ground.length - 1][0]) return false;
  const xs = [...points, ...ground].map((p) => p[0]).filter((x) => x >= ground[0][0] && x <= ground[ground.length - 1][0]);
  return xs.every((x) => coreHeightAt(points, x, 'max') <= coreHeightAt(ground, x, 'min') + 1e-9);
}

/**
 * Is this list of points a polyline that can be drawn (SPEC_ETAPPE4 3.2, 12)? At least 2 points, each a pair of finite numbers,
 * x strictly increasing. Only such a polyline is drawn and has handles.
 */
export function isDrawablePolyline(points) {
  if (!Array.isArray(points) || points.length < 2) return false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) return false;
    if (i > 0 && !(p[0] > points[i - 1][0])) return false;
  }
  return true;
}

/** Colour index 0 ... 7 of a material: its position in the materials list, cyclic. */
export function colorIndex(position) {
  return ((position % MATERIAL_COLORS) + MATERIAL_COLORS) % MATERIAL_COLORS;
}

function safely(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Description of the sketch:
 * { bounds, ground, bottom, clip, layers, layerLines, legend, water, loads, grid, surfaces, polylines, crackZone }
 * layerLines: the entered layer boundaries (k >= 1) extended to the model width ({ index, points }), SPEC 4 v1.8;
 * surfaces: single circles; polylines: single polylines that can be drawn ({ id, index, points }); crackZone: { depth, points } the
 * line parallel to the ground at the depth of the tension crack, or null (SPEC_ETAPPE4 12)
 */
export function buildSketch(model) {
  const m = isObject(model) ? model : {};
  const ground = safely(() => validPoints(m.ground), []);
  const bottom = isNum(m.bottom) ? m.bottom : null;
  const materialIds = isObject(m.materials) ? Object.keys(m.materials) : [];

  const groundOk = ground.length >= 2;
  const clip = groundOk && bottom !== null
    ? [...ground, [ground[ground.length - 1][0], bottom], [ground[0][0], bottom]]
    : null;

  const layers = safely(() => {
    const out = [];
    if (bottom === null || !Array.isArray(m.layers)) return out;
    m.layers.forEach((layer, index) => {
      if (!isObject(layer)) return;
      const position = typeof layer.material === 'string' ? materialIds.indexOf(layer.material) : -1;
      if (position < 0) return;
      // SPEC 4 v1.8: filled from the effective boundary (extended to the model width, clipped at the ground);
      // a boundary that already spans the width below the ground is drawn with its own points
      const entered = index === 0 ? ground : validPoints(layer.top);
      if (entered.length < 2) return;
      const boundary = index === 0 || !groundOk || !increasing(entered) || fitsBelowGround(entered, ground) ? entered : effectiveBoundary(entered, ground);
      out.push({
        index,
        materialId: layer.material,
        colorIndex: colorIndex(position),
        points: [...boundary, [boundary[boundary.length - 1][0], bottom], [boundary[0][0], bottom]],
      });
    });
    return out;
  }, []);

  // the entered layer boundaries (k >= 1) over the model width, drawn as thin lines: also the part above the ground
  const layerLines = safely(() => {
    if (!groundOk || !Array.isArray(m.layers)) return [];
    const xMin = ground[0][0];
    const xMax = ground[ground.length - 1][0];
    return m.layers
      .map((layer, index) => {
        if (index === 0 || !isObject(layer)) return null;
        const pts = validPoints(layer.top);
        return pts.length >= 2 && increasing(pts) ? { index, points: extendBoundary(pts, xMin, xMax) } : null;
      })
      .filter(Boolean);
  }, []);

  const legend = materialIds.map((id, position) => ({
    id,
    name: isObject(m.materials[id]) && typeof m.materials[id].name === 'string' ? m.materials[id].name : '',
    colorIndex: colorIndex(position),
  }));

  const water = safely(() => (m.water === null || m.water === undefined ? [] : validPoints(m.water)), []);

  const loads = safely(() => (Array.isArray(m.loads)
    ? m.loads
        .map((l, index) => (isObject(l) && isNum(l.x1) && isNum(l.x2) && isNum(l.q) && l.x1 < l.x2
          ? { index, x1: l.x1, x2: l.x2, q: l.q, type: l.type === 'G' || l.type === 'Q' ? l.type : null }
          : null))
        .filter(Boolean)
    : []), []);

  const grid = safely(() => {
    const s = m.search;
    const g = isObject(s) ? s.grid : null;
    if (!isObject(g) || !isNum(g.xMin) || !isNum(g.xMax) || !isNum(g.zMin) || !isNum(g.zMax)) return null;
    if (g.xMin > g.xMax || g.zMin > g.zMax) return null;
    const nx = Number.isInteger(g.nx) && g.nx >= 1 ? g.nx : null;
    const nz = Number.isInteger(g.nz) && g.nz >= 1 ? g.nz : null;
    let centers = null;
    if (nx !== null && nz !== null && nx * nz <= MAX_GRID_POINTS) {
      centers = [];
      const dx = nx > 1 ? (g.xMax - g.xMin) / (nx - 1) : 0;
      const dz = nz > 1 ? (g.zMax - g.zMin) / (nz - 1) : 0;
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) centers.push([g.xMin + dx * ix, g.zMin + dz * iz]);
    }
    return { xMin: g.xMin, xMax: g.xMax, zMin: g.zMin, zMax: g.zMax, nx, nz, centers };
  }, null);

  const surfaces = safely(() => (Array.isArray(m.surfaces)
    ? m.surfaces
        .filter((s) => isObject(s) && isNum(s.xc) && isNum(s.zc) && isNum(s.R) && s.R > 0)
        .map((s) => ({ id: typeof s.id === 'string' ? s.id : '', xc: s.xc, zc: s.zc, R: s.R }))
    : []), []);

  const polylines = safely(() => (Array.isArray(m.surfaces)
    ? m.surfaces
        .map((s, index) => (isObject(s) && s.type === 'polyline' && isDrawablePolyline(s.points)
          ? { id: typeof s.id === 'string' ? s.id : '', index, points: s.points.map(([x, z]) => [x, z]) }
          : null))
        .filter(Boolean)
    : []), []);

  const crackZone = safely(() => {
    const c = m.tensionCrack;
    if (!isObject(c) || !isNum(c.depth) || !(c.depth > 0) || ground.length < 2) return null;
    return { depth: c.depth, points: ground.map(([x, z]) => [x, z - c.depth]) };
  }, null);

  // frame of the model: ground, bottom, layers, water, loads, search rectangle, centres of single circles, polylines
  const framePoints = [...ground, ...water];
  if (bottom !== null && groundOk) framePoints.push([ground[0][0], bottom], [ground[ground.length - 1][0], bottom]);
  else if (bottom !== null) framePoints.push(...ground.map(([x]) => [x, bottom]));
  for (const l of layers) framePoints.push(...l.points);
  for (const l of loads) {
    const z1 = heightAt(ground, l.x1);
    const z2 = heightAt(ground, l.x2);
    if (z1 !== null) framePoints.push([l.x1, z1]);
    if (z2 !== null) framePoints.push([l.x2, z2]);
  }
  if (grid) framePoints.push([grid.xMin, grid.zMin], [grid.xMax, grid.zMax]);
  for (const s of surfaces) framePoints.push([s.xc, s.zc]);
  for (const p of polylines) framePoints.push(...p.points);

  return { bounds: boundsOf(framePoints), ground, bottom, clip, layers, layerLines, legend, water, loads, grid, surfaces, polylines, crackZone };
}
