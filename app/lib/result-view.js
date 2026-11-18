// What the overview of the result shows (SPEC_ETAPPE2 8.1), derived from the output of
// analyze(). Numbers stay unrounded here; rounding is only done by the display
// (formatters in numbers.js). No DOM access, nothing in `result` is changed.

import { METHODS, calculatedMethods } from './result-state.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Row of the table of governing surfaces for one calculated method. */
function rowFor(result, method) {
  const c = result.critical[method];
  const withSupports = isObject(result.check) && result.check.withSupports === true;
  const check = isObject(result.check) && isObject(result.check[method]) ? result.check[method] : null;
  if (!isObject(c)) return { method, valid: false, F: null, xc: null, zc: null, R: null, entry: null, exit: null, theta: null, check: null };
  return {
    method,
    valid: true,
    F: c.F,
    xc: c.xc,
    zc: c.zc,
    R: c.R,
    entry: c.entry,
    exit: c.exit,
    theta: method === 'spencer' && typeof c.theta === 'number' ? c.theta : null,
    // Janbu F0 has no verdict (SPEC 8); then `check` is null
    check: check ? { gammaR: result.check.gammaR, utilisation: check.utilisation, ok: check.ok, ...(withSupports ? { required: result.check.required } : {}) } : null,
    // search A (SPEC_ETAPPE4 5, 9, 13): a polyline has points instead of centre and radius; `searchF` = F of the circle before the
    // optimisation; `crack` = { x, depth, Pw } of a tension crack. These fields exist only when the result has them.
    ...(c.type === 'polyline' ? { polyline: { n: Array.isArray(c.points) ? c.points.length : 0 } } : {}),
    ...(isObject(c.searchCircle) && Number.isFinite(c.searchCircle.F) ? { searchF: c.searchCircle.F } : {}),
    ...(isObject(c.crack) ? { crack: { x: c.crack.x, depth: c.crack.depth, Pw: c.crack.Pw } } : {}),
  };
}

/**
 * Table of the governing surfaces: one row per calculated method in the order Bishop, Janbu F0,
 * Janbu corrected, Spencer. `critical.<method> = null`: the row has `valid: false`
 * ("no valid surface"). Without search: `rows` is empty.
 * `hasTheta`: Spencer was calculated; `hasCheck`: mode sia (columns gamma_R, utilisation, verdict).
 */
export function overviewTable(result) {
  const methods = calculatedMethods(result);
  const rows = methods.map((m) => rowFor(result, m));
  return {
    rows,
    hasTheta: methods.includes('spencer'),
    hasCheck: isObject(result) && isObject(result.check),
    gammaR: isObject(result) && isObject(result.check) ? result.check.gammaR : null,
    // mode sia with supports (SPEC_ETAPPE3 5, 10): F_d of the soil with gamma_R, required 1.0, utilisation 1 / F_d
    withSupports: isObject(result) && isObject(result.check) && result.check.withSupports === true,
    required: isObject(result) && isObject(result.check) && result.check.withSupports === true ? result.check.required : null,
    // columns of SPEC_ETAPPE4 13: the kind of surface when search A ran (or a method gave a polyline), F of the circle before the
    // optimisation, the tension crack; without them the table is as before
    hasSurface: isObject(result) && (result.optimizeEvaluations !== undefined || rows.some((r) => r.polyline)),
    hasSearchF: rows.some((r) => r.searchF !== undefined),
    hasCrack: rows.some((r) => r.crack !== undefined),
    optimizeEvaluations: isObject(result) && Number.isFinite(result.optimizeEvaluations) ? result.optimizeEvaluations : null,
  };
}

/**
 * Methods offered for the choice of the governing method: the rows of the overview table, same methods and order
 * (SPEC_ETAPPE2 8.1). The choice in the tool bar of the sketch (version 1.8) uses this list too. [] without result or
 * without search.
 */
export function methodChoices(result) {
  return overviewTable(result).rows.map((row) => row.method);
}

/** Warning codes of the result, each once, in the order of the core. Without result: []. */
export function warningCodes(result) {
  if (!isObject(result) || !Array.isArray(result.warnings)) return [];
  return [...new Set(result.warnings.filter((c) => typeof c === 'string'))];
}

/** Counter entry list { code, count } of an object { code: count }, sorted by code. */
function invalidList(invalid) {
  if (!isObject(invalid)) return [];
  return Object.entries(invalid)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/**
 * Counters of the search (SPEC 7.5): calculated, valid, invalid per code; additionally per method
 * (countsByMethod) in display order. null without search (no `counts`).
 */
export function countsView(result) {
  if (!isObject(result) || !isObject(result.counts)) return null;
  const c = result.counts;
  const byMethod = [];
  if (isObject(result.countsByMethod)) {
    for (const method of METHODS) {
      const m = result.countsByMethod[method];
      if (isObject(m)) byMethod.push({ method, total: m.total, valid: m.valid, invalid: invalidList(m.invalid) });
    }
  }
  return {
    total: c.total,
    valid: c.valid,
    invalidTotal: c.total - c.valid,
    invalid: invalidList(c.invalid),
    byMethod,
    // search A (SPEC_ETAPPE4 5, 13): number of polylines calculated for all targets; only when the result has it
    ...(Number.isFinite(result.optimizeEvaluations) ? { optimizeEvaluations: result.optimizeEvaluations } : {}),
  };
}

/**
 * Single circles (result.surfaces): per circle the id and either `valid: false` with code and message of
 * the core, or `valid: true` with one entry per method { F } or { code, message } (a method can be invalid
 * for a valid circle). `methods` = columns: the methods that occur in the circles, in display order.
 */
export function surfacesTable(result) {
  const list = isObject(result) && Array.isArray(result.surfaces) ? result.surfaces : [];
  const rows = list.map((s) => {
    if (!isObject(s)) return { id: '', valid: false, code: undefined, message: undefined, methods: {}, circle: null };
    const circle = isObject(s.circle) ? { xc: s.circle.xc, zc: s.circle.zc, R: s.circle.R } : null;
    // a polyline (SPEC_ETAPPE4 9): no circle, `polyline` holds its points (as given, in the input frame); circles have no such key
    // belowGround (SPEC_ETAPPE4 13c): set by markBelowGround (draw-snap.js); chooses the text of I_OUT_OF_MODEL
    const extra = s.type === 'polyline' ? { polyline: { points: Array.isArray(s.points) ? s.points : [] }, ...(s.belowGround === true ? { belowGround: true } : {}) } : {};
    if (s.valid !== true) return { id: s.id, valid: false, code: s.code, message: s.message, methods: {}, circle, ...extra };
    const methods = {};
    for (const m of METHODS) {
      const r = isObject(s.results) ? s.results[m] : undefined;
      if (!isObject(r)) continue;
      methods[m] = r.valid === true ? { F: r.F } : { code: r.code, message: r.message };
    }
    return { id: s.id, valid: true, methods, circle, ...extra };
  });
  const present = METHODS.filter((m) => rows.some((r) => Object.hasOwn(r.methods, m)));
  return { rows, methods: present };
}

/**
 * Governing surface of a method as the graphic and the slice table need it (SPEC_ETAPPE4 9): a circle
 * { kind: 'circle', xc, zc, R, F }, a polyline of search A { kind: 'polyline', points, F, entry, exit, searchCircle, crack } or null
 * (no search, method not calculated, no valid surface).
 */
export function criticalSurface(result, method) {
  const c = isObject(result) && isObject(result.critical) && method ? result.critical[method] : null;
  if (!isObject(c)) return null;
  if (c.type === 'polyline') {
    const points = Array.isArray(c.points) && c.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ? c.points : null;
    if (!points || !Number.isFinite(c.F)) return null;
    return { kind: 'polyline', points, F: c.F, entry: c.entry, exit: c.exit, searchCircle: isObject(c.searchCircle) ? c.searchCircle : null, crack: isObject(c.crack) ? c.crack : null };
  }
  return [c.xc, c.zc, c.R].every(Number.isFinite) ? { kind: 'circle', xc: c.xc, zc: c.zc, R: c.R, F: c.F, entry: c.entry, exit: c.exit, crack: isObject(c.crack) ? c.crack : null } : null;
}

/**
 * Circle of the selected method for the graphic and the slice table: the governing surface of the
 * method, or null (no search, method not calculated, no valid surface).
 */
export function criticalCircle(result, method) {
  const c = isObject(result) && isObject(result.critical) && method ? result.critical[method] : null;
  return isObject(c) && [c.xc, c.zc, c.R].every(Number.isFinite) ? { xc: c.xc, zc: c.zc, R: c.R, F: c.F } : null;
}

/**
 * The governing surface of a method as a new single surface (the button "Als Einzelfläche übernehmen", SPEC_ETAPPE4 13): a circle
 * { xc, zc, R } or a polyline { type: 'polyline', points } without id (edit.js gives the next free one), or null when the method has
 * no valid surface.
 */
export function adoptableSurface(result, method) {
  const c = criticalSurface(result, method);
  if (!c) return null;
  if (c.kind === 'polyline') return { type: 'polyline', points: c.points.map(([x, z]) => [x, z]) };
  return { xc: c.xc, zc: c.zc, R: c.R };
}
