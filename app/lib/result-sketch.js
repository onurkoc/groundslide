// What the sketch shows of a result (SPEC_ETAPPE2 8.2): the circles of the methods, the contour and the
// labels. Pure function of result, chosen method and the contour switch; no DOM access.

import { METHODS, calculatedMethods } from './result-state.js';
import { criticalSurface, surfacesTable } from './result-view.js';
import { heightAt } from './sketch-model.js';
import { worldToScreen } from './view.js';
import { contourBands } from './contour.js';
import { formatFactor, formatForce } from './numbers.js';

/** Label of a circle centre: "F = 1.139" (3 decimals, SPEC_ETAPPE2 5.3). */
export const factorLabel = (F) => `F = ${formatFactor(F)}`;

/**
 * Label of a single circle for the chosen method: "C1  F = 1.236", or the code of the problem
 * ("C1  I_INTERSECTIONS") when the circle or the method is invalid for it, or just the id.
 */
export function singleLabel(row, method) {
  const id = row.id || '';
  let extra = '';
  if (!row.valid) extra = row.code || '';
  else if (method && row.methods[method]) extra = row.methods[method].code || (Number.isFinite(row.methods[method].F) ? factorLabel(row.methods[method].F) : '');
  return extra ? `${id}  ${extra}` : id;
}

/**
 * Radius lines of the governing circle of a method (SPEC_ETAPPE2 8.2, version 1.7): from the centre to the entry point
 * and to the exit point (critical.<method>.entry / exit), dashed in the sketch. [] when the method has no valid
 * surface or entry / exit are missing.
 */
export function radiusLines(result, method) {
  const c = result && result.critical && method ? result.critical[method] : null;
  if (!c || ![c.xc, c.zc].every(Number.isFinite)) return [];
  const lines = [];
  for (const end of [c.entry, c.exit]) {
    if (Array.isArray(end) && end.length === 2 && end.every(Number.isFinite)) lines.push({ x1: c.xc, z1: c.zc, x2: end[0], z2: end[1] });
  }
  return lines;
}

/** Text at the point of a support: the force per metre in kN/m with one decimal (SPEC_ETAPPE3 9, SPEC_ETAPPE2 5.3). */
export const forceLabel = (perMetre) => `${formatForce(perMetre)} kN/m`;

/**
 * Points of the supports that cut the governing Spencer circle (SPEC_ETAPPE3 6, 9): [{ id, x, z, perMetre }] of every element
 * of critical.spencer.supports with `intersects: true`, in the order of the output. [] without result, without supports or
 * when there is no valid Spencer circle. Elements without a usable point are left out.
 */
export function supportPoints(result) {
  const c = result && result.critical ? result.critical.spencer : null;
  const list = c && Array.isArray(c.supports) ? c.supports : [];
  const out = [];
  for (const s of list) {
    if (!s || s.intersects !== true || !Array.isArray(s.point) || !s.point.every(Number.isFinite)) continue;
    out.push({ id: s.id, x: s.point[0], z: s.point[1], perMetre: Number.isFinite(s.perMetre) ? s.perMetre : null });
  }
  return out;
}

/**
 * Overlay of the sketch for a result:
 *   circles   governing surfaces of all calculated methods that have one (circles, and the polylines of search A,
 *             `kind: 'polyline'` with `points`, `entry`, `exit`); the chosen one has
 *             `selected: true` (strong line, label with F), the others are thin; the selected one is last
 *             (drawn on top)
 *   searchCircle  the circle of the chosen method before the optimisation (SPEC_ETAPPE4 5, 9), drawn thin and dashed, or null
 *   cracks    tension cracks of the surfaces of the result (SPEC_ETAPPE4 12): [{ x, depth, Pw, water }], water = h_w in m
 *   radii     radius lines of the chosen circle to its entry and exit point (radiusLines)
 *   singles   { id: text } extra label of the single circles of the model (the circles themselves are
 *             drawn by the sketch from the model)
 *   contour   { polygons, reason } colour bands for the chosen method (lib/contour.js), or null when the contour is switched off
 *   supportPoints  points where supports cut the Spencer circle of the result (supportPoints)
 *   method    the chosen method
 *   contourAvailable  the result has a grid for the chosen method (the switch in the bar is shown)
 * Without result (null): null.
 */
export function buildResultOverlay(result, { method, contour, grid, tensionCrack = null }) {
  if (!result) return null;
  const methods = calculatedMethods(result);
  const circles = [];
  for (const m of [...methods.filter((x) => x !== method), ...methods.filter((x) => x === method)]) {
    const c = criticalSurface(result, m);
    if (!c) continue;
    const selected = m === method;
    const label = selected ? factorLabel(c.F) : null;
    if (c.kind === 'polyline') circles.push({ method: m, kind: 'polyline', points: c.points, entry: c.entry, exit: c.exit, selected, label });
    else circles.push({ method: m, xc: c.xc, zc: c.zc, R: c.R, entry: c.entry, exit: c.exit, selected, label }); // entry and exit: the circle is drawn between them
  }
  const chosen = method ? criticalSurface(result, method) : null;
  const searchCircle = chosen && chosen.kind === 'polyline' && chosen.searchCircle && [chosen.searchCircle.xc, chosen.searchCircle.zc, chosen.searchCircle.R].every(Number.isFinite)
    ? { xc: chosen.searchCircle.xc, zc: chosen.searchCircle.zc, R: chosen.searchCircle.R, entry: chosen.searchCircle.entry, exit: chosen.searchCircle.exit }
    : null;
  const singles = {};
  for (const row of surfacesTable(result).rows) if (row.id) singles[row.id] = singleLabel(row, method);
  return {
    method: methods.includes(method) ? method : null,
    circles,
    searchCircle,
    cracks: crackLines(result, tensionCrack),
    radii: radiusLines(result, method),
    singles,
    singleArcs: singleArcs(result),
    supportPoints: supportPoints(result),
    contour: contour && methods.includes(method) ? contourBands(result, method, grid) : null,
    methods: METHODS.filter((m) => methods.includes(m)),
    contourAvailable: methods.includes(method) && Array.isArray(result.grid),
  };
}

/**
 * The grid centres (small dots) are hidden while the contour is visible; the grid rectangle stays
 * (SPEC_ETAPPE2 6, version 1.6). Visible = the overlay has contour polygons (not: contour switched off, no result, grid that
 * cannot be drawn as bands).
 */
export function centresVisible(overlay) {
  return !(overlay && overlay.contour && overlay.contour.polygons.length > 0);
}

/**
 * Marks of the single circles in the sketch (SPEC_ETAPPE2 6, version 1.6): the centre and its text (id, with F or code
 * after a run) are always there, whether the circle meets the soil or not; the arc is only drawn inside the soil body
 * (clip path in the sketch), so a circle that does not meet the soil leaves just centre and text.
 * `surfaces` = sketch.surfaces of buildSketch, `overlay` = buildResultOverlay or null.
 */
export function singleMarks(surfaces, overlay) {
  return surfaces.map((c) => ({
    id: c.id,
    xc: c.xc,
    zc: c.zc,
    R: c.R,
    label: c.id ? (overlay && overlay.singles[c.id] ? overlay.singles[c.id] : c.id) : '',
  }));
}

/**
 * Tension cracks of the result (SPEC_ETAPPE4 9, 12): the `crack` of every governing surface and of every valid single surface, each
 * place once. `water` = h_w = waterFill * depth from the model (the result holds P_w only); 0 without usable `tensionCrack`.
 */
export function crackLines(result, tensionCrack) {
  const found = [];
  const add = (crack) => {
    if (crack && Number.isFinite(crack.x) && Number.isFinite(crack.depth) && !found.some((c) => c.x === crack.x && c.depth === crack.depth)) found.push({ x: crack.x, depth: crack.depth, Pw: crack.Pw });
  };
  if (result && result.critical) for (const c of Object.values(result.critical)) add(c && c.crack);
  if (result && Array.isArray(result.surfaces)) for (const s of result.surfaces) add(s && s.valid === true && s.crack);
  const fill = tensionCrack && Number.isFinite(tensionCrack.waterFill) ? Math.min(Math.max(tensionCrack.waterFill, 0), 1) : 0;
  return found.map((c) => ({ ...c, water: fill * c.depth }));
}

/**
 * Where the label F of a polyline stands (SPEC_ETAPPE4 12): in the middle between its two end points (x), at the height of the ground
 * there; [x, z] or null. `ground` = list of [x, z]. Without ground the middle of the end points.
 */
export function polylineLabelSpot(entry, exit, ground) {
  if (!Array.isArray(entry) || !Array.isArray(exit)) return null;
  const x = 0.5 * (entry[0] + exit[0]);
  const z = Array.isArray(ground) ? heightAt(ground, x) : null;
  return [x, z === null ? 0.5 * (entry[1] + exit[1]) : z];
}

/**
 * Polygon of the slip body of a polyline (the light colour of the chosen surface): entry, the points between, exit, then the ground
 * back to the entry. [] when entry or exit are missing. Entry and exit lie on the ground (or the entry at the crack base: then
 * straight up to the ground there).
 */
export function polylineBody(surface, ground) {
  const { points, entry, exit } = surface;
  if (!Array.isArray(entry) || !Array.isArray(exit) || !Array.isArray(points) || !Array.isArray(ground) || ground.length < 2) return [];
  const [a, b] = entry[0] <= exit[0] ? [entry, exit] : [exit, entry];
  const inner = points.filter((p) => p[0] > a[0] && p[0] < b[0]);
  const back = ground.filter((p) => p[0] > a[0] && p[0] < b[0]).sort((p, q) => q[0] - p[0]);
  const top = (p) => {
    const z = heightAt(ground, p[0]);
    return z === null ? p : [p[0], z];
  };
  return [a, ...inner, b, top(b), ...back, top(a)];
}

/**
 * Marks of the single polylines in the sketch (SPEC_ETAPPE4 12): the line with its id and, after a run, F or the code, as for a
 * single circle. `polylines` = sketch.polylines of buildSketch, `overlay` = buildResultOverlay or null, `ground` = sketch.ground.
 */
export function polylineMarks(polylines, overlay, ground) {
  return polylines.map((p) => {
    const first = p.points[0];
    const last = p.points[p.points.length - 1];
    return { id: p.id, points: p.points, spot: polylineLabelSpot(first, last, ground), label: p.id ? (overlay && overlay.singles[p.id] ? overlay.singles[p.id] : p.id) : '' };
  });
}

/**
 * The part of the polyline of a result that is the slip surface: from the entry (the crack base with a tension crack) to the exit, the
 * points between them. The `points` of the result are not cut (SPEC_ETAPPE4 9). [] without entry and exit.
 */
export function polylineCut(surface) {
  const { points, entry, exit } = surface;
  if (!Array.isArray(entry) || !Array.isArray(exit) || !Array.isArray(points)) return [];
  const [a, b] = entry[0] <= exit[0] ? [entry, exit] : [exit, entry];
  return [a, ...points.filter((p) => p[0] > a[0] && p[0] < b[0]), b];
}

/**
 * Rule of the drawing mode (SPEC_ETAPPE4 12, order 27): may the point (x, z) be set after the points set so far? The direction is
 * given by the first two points; every further x must continue in that direction, strictly. Returns { ok: true, direction } with the
 * direction (+1 or -1, 0 as long as there is one point), or { ok: false } (the click sets no point).
 */
export function drawingStep(points, direction, x) {
  if (!Number.isFinite(x)) return { ok: false };
  if (points.length === 0) return { ok: true, direction: 0 };
  const last = points[points.length - 1][0];
  if (points.length === 1) return x === last ? { ok: false } : { ok: true, direction: x > last ? 1 : -1 };
  return (x - last) * direction > 0 ? { ok: true, direction } : { ok: false };
}

/** The points of a finished drawing ordered by x ascending (as the model needs them); null with fewer than 2 points. */
export function finishedPolyline(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  return points.map(([x, z]) => [x, z]).sort((p, q) => p[0] - q[0]);
}

/** Entry and exit of the valid single circles of a result: { [id]: { entry, exit } } (the arc of a single circle is drawn between them). */
export function singleArcs(result) {
  const out = {};
  const list = result && Array.isArray(result.surfaces) ? result.surfaces : [];
  for (const s of list) {
    if (s && s.valid === true && typeof s.id === 'string' && s.id !== '' && Array.isArray(s.entry) && Array.isArray(s.exit)) out[s.id] = { entry: s.entry, exit: s.exit };
  }
  return out;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Angle (radians) of a point on the lower half of a circle: in [-pi, 0]. A point a hair above the centre height is moved to the nearer end. */
function lowerAngle(circle, p) {
  const a = Math.atan2(p[1] - circle.zc, p[0] - circle.xc);
  if (a <= 0) return a;
  return a > Math.PI / 2 ? a - 2 * Math.PI : 0;
}

/**
 * The lower arc of a circle between two of its points (entry and exit, in any order), as points from the left one to the right one
 * (SPEC_ETAPPE4 12a: the circle of a result is drawn between entry and exit only, not where it lies under the ground elsewhere).
 * [] when the data are not usable.
 */
export function circleArcPoints(circle, entry, exit, n = 64) {
  if (!circle || ![circle.xc, circle.zc, circle.R].every(isNum) || !(circle.R > 0) || !Array.isArray(entry) || !Array.isArray(exit)) return [];
  const [a, b] = entry[0] <= exit[0] ? [entry, exit] : [exit, entry];
  const ta = lowerAngle(circle, a);
  const tb = lowerAngle(circle, b);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = ta + ((tb - ta) * i) / n;
    out.push(i === 0 ? [a[0], a[1]] : i === n ? [b[0], b[1]] : [circle.xc + circle.R * Math.cos(t), circle.zc + circle.R * Math.sin(t)]);
  }
  return out;
}

/**
 * SVG path of the arc of a circle between entry and exit for a given view ({ scale, x0, z0 }): the lower arc from the left point to the
 * right one (SPEC_ETAPPE4 12a). The view is a parameter: the screen and the graphic of the result document draw with different views
 * (SPEC_ETAPPE4 13b). null when the data are not usable or the radius is larger than maxPx pixels.
 */
export function arcPathData(view, circle, entry, exit, maxPx = 1e5) {
  if (!view || !circle || !Array.isArray(entry) || !Array.isArray(exit)) return null;
  const [a, b] = entry[0] <= exit[0] ? [entry, exit] : [exit, entry];
  const [x1, y1] = worldToScreen(view, a[0], a[1]);
  const [x2, y2] = worldToScreen(view, b[0], b[1]);
  const r = circle.R * view.scale;
  if (![x1, y1, x2, y2, r].every(Number.isFinite) || r > maxPx) return null;
  return `M${x1.toFixed(2)},${y1.toFixed(2)}A${r.toFixed(2)},${r.toFixed(2)} 0 0 0 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/** Polygon of the slip body of a circle: the arc from entry to exit, then the ground back (as polylineBody for a polyline). */
export function circleBody(circle, entry, exit, ground) {
  const arc = circleArcPoints(circle, entry, exit);
  if (arc.length < 2 || !Array.isArray(ground) || ground.length < 2) return [];
  const a = arc[0];
  const b = arc[arc.length - 1];
  const back = ground.filter((p) => p[0] > a[0] && p[0] < b[0]).sort((p, q) => q[0] - p[0]);
  const top = (p) => {
    const z = heightAt(ground, p[0]);
    return z === null ? p : [p[0], z];
  };
  return [...arc, top(b), ...back, top(a)];
}

/**
 * Entry and exit of a circle as the sketch knows them without a calculation (a single circle before the run): the part of the lower arc
 * under the ground whose ends differ most in height (as the core takes it, SPEC.md 5.1 d), the higher end being the entry on the side of
 * the crown (direction 'right': the slope falls to the right, the crown is at the left). null when no part of the arc lies under the ground.
 */
export function circleSection(circle, ground, direction) {
  if (!circle || ![circle.xc, circle.zc, circle.R].every(isNum) || !(circle.R > 0) || !Array.isArray(ground) || ground.length < 2) return null;
  const { xc, zc, R } = circle;
  const arcZ = (x) => zc - Math.sqrt(Math.max(R * R - (x - xc) * (x - xc), 0));
  const pts = [];
  for (let i = 0; i + 1 < ground.length; i++) {
    const [x0, z0] = ground[i];
    const [x1, z1] = ground[i + 1];
    if (!(x1 > x0)) continue;
    // intersections of the segment with the circle: solve |P(t) - C|^2 = R^2
    const dx = x1 - x0;
    const dz = z1 - z0;
    const fx = x0 - xc;
    const fz = z0 - zc;
    const A = dx * dx + dz * dz;
    const B = 2 * (fx * dx + fz * dz);
    const C = fx * fx + fz * fz - R * R;
    const disc = B * B - 4 * A * C;
    if (disc < 0) continue;
    for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
      if (t < 0 || t > 1) continue;
      const p = [x0 + t * dx, z0 + t * dz];
      if (p[1] <= zc + 1e-9) pts.push(p);
    }
  }
  const xMin = ground[0][0];
  const xMax = ground[ground.length - 1][0];
  for (const x of [xMin, xMax]) {
    const zg = heightAt(ground, x);
    if (Math.abs(x - xc) <= R && zg !== null && arcZ(x) < zg - 1e-9) pts.push([x, arcZ(x), true]);
  }
  pts.sort((p, q) => p[0] - q[0]);
  let best = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (!(q[0] - p[0] > 1e-12)) continue;
    const xm = 0.5 * (p[0] + q[0]);
    const zg = heightAt(ground, xm);
    if (zg === null || !(arcZ(xm) < zg)) continue;
    if (p[2] || q[2]) continue; // a section that ends at the model edge does not come out of the ground there: not a slip body
    const diff = direction === 'left' ? q[1] - p[1] : p[1] - q[1];
    if (!(diff > 1e-9)) continue;
    if (best === null || diff > best.diff) best = { diff, from: [p[0], p[1]], to: [q[0], q[1]] };
  }
  return best ? { entry: direction === 'left' ? best.to : best.from, exit: direction === 'left' ? best.from : best.to } : null;
}
