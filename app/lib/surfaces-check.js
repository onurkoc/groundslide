// Check of the single surfaces (circles and polylines) by the app (SPEC_ETAPPE2 5.2, SPEC_ETAPPE4 3.2). The core does not
// check `surfaces`. No DOM access.

export const APP_SURFACE_INVALID = 'APP_SURFACE_INVALID';

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Kind of a single surface: a polyline has `type: "polyline"`, anything else is a circle (SPEC_ETAPPE4 3.1). */
export const surfaceKind = (s) => (s !== null && typeof s === 'object' && s.type === 'polyline' ? 'polyline' : 'circle');

/**
 * Errors of the single surfaces: id empty or repeated; circle: xc / zc / R not a finite number, or R <= 0; polyline (SPEC_ETAPPE4
 * 3.2): fewer than 2 points, a point that is not a pair of finite numbers, x not strictly increasing. Returns
 * [{ code, message, path }], path like "surfaces[2].R", "surfaces[2].points" (count), "surfaces[2].points[3]" (a point, its x too
 * small), "surfaces[2].points[3][1]" (a value that is not a number). A missing `surfaces` is fine. A repeated id is reported on the
 * later rows.
 */
export function validateSurfaces(surfaces) {
  const errors = [];
  const err = (message, path) => errors.push({ code: APP_SURFACE_INVALID, message, path });
  if (surfaces === undefined || surfaces === null) return errors;
  if (!Array.isArray(surfaces)) {
    err('surfaces must be a list.', 'surfaces');
    return errors;
  }
  const seen = new Set();
  surfaces.forEach((s, i) => {
    const path = `surfaces[${i}]`;
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      err(`${path} must be an object.`, path);
      return;
    }
    if (typeof s.id !== 'string' || s.id.trim() === '') {
      err(`${path}.id must not be empty.`, `${path}.id`);
    } else if (seen.has(s.id)) {
      err(`${path}.id "${s.id}" is used more than once.`, `${path}.id`);
    } else {
      seen.add(s.id);
    }
    if (s.type !== undefined && s.type !== 'circle' && s.type !== 'polyline') {
      err(`${path}.type must be "circle" or "polyline".`, `${path}.type`);
    }
    if (surfaceKind(s) === 'polyline') {
      validatePolyline(s.points, path, err);
      return;
    }
    for (const key of ['xc', 'zc', 'R']) {
      if (!isFiniteNumber(s[key])) err(`${path}.${key} must be a finite number.`, `${path}.${key}`);
    }
    if (isFiniteNumber(s.R) && !(s.R > 0)) err(`${path}.R must be greater than 0.`, `${path}.R`);
  });
  return errors;
}

/** Points of a polyline (SPEC_ETAPPE4 3.2): at least 2, each [x, z] with finite numbers, x strictly increasing. */
function validatePolyline(points, path, err) {
  if (!Array.isArray(points) || points.length < 2) {
    err(`${path}.points needs at least 2 points.`, `${path}.points`);
    return;
  }
  let previous = null; // x of the last point that was readable
  points.forEach((p, j) => {
    const at = `${path}.points[${j}]`;
    const pair = Array.isArray(p) ? p : [];
    let readable = true;
    for (const axis of [0, 1]) {
      if (!isFiniteNumber(pair[axis])) {
        err(`${at}[${axis}] must be a finite number.`, `${at}[${axis}]`);
        readable = false;
      }
    }
    if (!readable) return;
    if (previous !== null && !(pair[0] > previous)) err(`${at}: x must be greater than x of the point before.`, at);
    previous = pair[0];
  });
}
