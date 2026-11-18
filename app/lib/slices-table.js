// Slice table of one surface (SPEC_ETAPPE2 8.3): columns, rows in degrees, text for copying.
// No DOM access. The core delivers angles in radians (SPEC 8: slices of analyzeSurface); the
// table shows alpha and phi in degrees. Copying: tab-separated, values unrounded with a point.

import { criticalSurface, surfacesTable } from './result-view.js';
import { formatCoordinate } from './numbers.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const toDegrees = (radians) => (radians * 180) / Math.PI;

/**
 * Columns after SPEC chapter 8 (x_m, b, alpha, W, Q, u, c, phi, N' of Bishop, m_alpha).
 * `key` = field of a slice, `unit` for the head, `degrees`: the core delivers radians.
 */
export const SLICE_COLUMNS = [
  { key: 'xm', symbol: 'x_m', unit: 'm' },
  { key: 'b', symbol: 'b', unit: 'm' },
  { key: 'alpha', symbol: 'α', unit: '°', degrees: true },
  { key: 'W', symbol: 'W', unit: 'kN/m' },
  { key: 'Q', symbol: 'Q', unit: 'kN/m' },
  { key: 'u', symbol: 'u', unit: 'kPa' },
  { key: 'c', symbol: 'c', unit: 'kPa' },
  { key: 'phi', symbol: 'φ', unit: '°', degrees: true },
  { key: 'Nprime', symbol: "N' (Bishop)", unit: 'kN/m' },
  { key: 'mAlpha', symbol: 'm_α', unit: '-' },
];

/**
 * The stresses at the base of the slice (SPEC_ETAPPE4 8, 13): tau_mob, tau_f, sigma_n, sigma'_n in kPa, from the Spencer
 * solution; the cell is empty ("–" in the display) when the core gives null. They stand at the very end of the table.
 */
export const STRESS_COLUMNS = [
  { key: 'tauMob', symbol: 'τ_mob', unit: 'kPa' },
  { key: 'tauF', symbol: 'τ_f', unit: 'kPa' },
  { key: 'sigmaN', symbol: 'σ_n', unit: 'kPa' },
  { key: 'sigmaNEff', symbol: "σ'_n", unit: 'kPa' },
];

/**
 * Two more columns at the end when the core delivers the sums of the support forces per slice (`sumPt`, `sumPn`; SPEC_ETAPPE3 6,
 * 10): ΣP_t and ΣP_n in kN/m. Without supports there are none.
 */
export const SUPPORT_SLICE_COLUMNS = [
  { key: 'sumPt', symbol: 'ΣP_t', unit: 'kN/m' },
  { key: 'sumPn', symbol: 'ΣP_n', unit: 'kN/m' },
];

/**
 * The columns of the table for these slices: SLICE_COLUMNS, plus ΣP_t and ΣP_n when a slice carries them. With
 * `{ stresses: true }` (the tables of the page and of the document, SPEC_ETAPPE4 13) the four stress columns follow at the end when
 * Spencer gave stresses for some slice (a single cell without a value is shown as "–").
 */
export function sliceColumnsFor(slices, { stresses = false } = {}) {
  // the fields are there with supports, also as null (Spencer gives no F for the circle): the cells are empty then (SPEC_ETAPPE2 8.3)
  const given = (v) => v === null || typeof v === 'number';
  const carries = Array.isArray(slices) && slices.some((s) => isObject(s) && (given(s.sumPt) || given(s.sumPn)));
  const base = carries ? [...SLICE_COLUMNS, ...SUPPORT_SLICE_COLUMNS] : SLICE_COLUMNS;
  // only when Spencer gave stresses for some slice: without Spencer every value is null and there is nothing to show
  const withStresses = stresses && Array.isArray(slices) && slices.some((s) => isObject(s) && STRESS_COLUMNS.some((col) => typeof s[col.key] === 'number'));
  return withStresses ? [...base, ...STRESS_COLUMNS] : base;
}

/** Head text of a column with its unit: "W [kN/m]". */
export const columnHead = (col) => `${col.symbol} [${col.unit}]`;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Value of one cell: number (degrees converted) or null (missing, e.g. N' without Bishop). */
export function cellValue(slice, col) {
  const v = isObject(slice) ? slice[col.key] : undefined;
  if (!isNum(v)) return null;
  return col.degrees ? toDegrees(v) : v;
}

/** Rows of numbers (null = empty cell) in the order of the columns (sliceColumnsFor, same options). */
export function sliceRows(slices, options) {
  const columns = sliceColumnsFor(slices, options);
  return (Array.isArray(slices) ? slices : []).map((s) => columns.map((col) => cellValue(s, col)));
}

/** Display: `decimals` after the point (3 after SPEC_ETAPPE2 8.3), empty cell as "" ("–" with `{ stresses: true }`, SPEC_ETAPPE4 13). */
export function displayRows(slices, decimals = 3, options) {
  const empty = options && options.stresses ? '–' : '';
  return sliceRows(slices, options).map((row) => row.map((v) => (v === null ? empty : v.toFixed(decimals))));
}

/**
 * Text for the clipboard (with the columns of sliceColumnsFor): first line the head with units, then one line per slice; tabs between the
 * columns, "\n" between the lines; values unrounded (String of the number: shortest text that gives
 * the same number back), with a point; an empty cell stays empty.
 */
export function sliceTsv(slices, options) {
  const lines = [sliceColumnsFor(slices, options).map(columnHead).join('\t')];
  for (const row of sliceRows(slices, options)) lines.push(row.map((v) => (v === null ? '' : String(v))).join('\t'));
  return lines.join('\n');
}

/**
 * Surface for the slice table: the governing surface of the chosen method ({ kind: 'critical' }) or a
 * single surface ({ kind: 'single', id }). Returns
 *   { circle, surface, kind, key, label }   circle: { xc, zc, R } or null for a polyline; `surface` = what analyzeSurface() takes:
 *                                           the circle, or { type: 'polyline', points }; kind: 'circle' | 'polyline'
 *   { circle: null, surface: null, reason }   'no-result' | 'no-valid-surface' (critical is null or missing) | 'unknown-single'
 * `key` identifies the request (same surface, same key).
 */
export function resolveSurface(result, method, target) {
  const none = (reason) => ({ circle: null, surface: null, reason });
  if (!isObject(result)) return none('no-result');
  const t = isObject(target) ? target : { kind: 'critical' };
  let circle = null;
  let points = null;
  let label = '';
  let belowGround = false; // polyline with I_OUT_OF_MODEL and an end below the ground: its own text (SPEC_ETAPPE4 13c)
  if (t.kind === 'single') {
    const row = surfacesTable(result).rows.find((r) => r.id === t.id);
    if (!row) return none('unknown-single');
    if (row.polyline) points = row.polyline.points;
    else if (row.circle) circle = row.circle;
    else return none('unknown-single');
    label = row.id;
    belowGround = row.belowGround === true;
  } else {
    const c = criticalSurface(result, method);
    if (!c) return none('no-valid-surface');
    if (c.kind === 'polyline') points = c.points;
    else circle = { xc: c.xc, zc: c.zc, R: c.R };
    label = method;
  }
  if (points) {
    if (!points.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum))) return none('unknown-single');
    return { circle: null, surface: { type: 'polyline', points }, kind: 'polyline', points, key: JSON.stringify(['polyline', points]), label, belowGround };
  }
  if (![circle.xc, circle.zc, circle.R].every(isNum)) return none('unknown-single');
  return { circle, surface: circle, kind: 'circle', key: JSON.stringify([circle.xc, circle.zc, circle.R]), label };
}

/** The line that tells which surface a table belongs to: "Kreis: x_c = ..., R = ..." or "Polylinie: 11 Punkte" (SPEC_ETAPPE4 13). */
export function describeSurface(resolved, t) {
  if (!resolved || !resolved.surface) return '';
  if (resolved.kind === 'polyline') return t('ui.slices.polyline', { n: resolved.points.length });
  const c = resolved.circle;
  return t('ui.slices.circle', { xc: formatCoordinate(c.xc), zc: formatCoordinate(c.zc), R: formatCoordinate(c.R) });
}

/** F per calculated method of an analyzeSurface result: [{ method, F }] or [{ method, code, message }]. */
export function surfaceFactors(surfaceResult) {
  if (!isObject(surfaceResult) || surfaceResult.valid !== true || !isObject(surfaceResult.results)) return [];
  return ['bishop', 'janbu', 'janbuCorrected', 'spencer']
    .filter((m) => isObject(surfaceResult.results[m]))
    .map((m) => {
      const r = surfaceResult.results[m];
      return r.valid === true ? { method: m, F: r.F } : { method: m, code: r.code, message: r.message };
    });
}
