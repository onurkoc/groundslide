// What the result shows of the supports (SPEC_ETAPPE3 6, 10), derived from the output of analyze(). Numbers stay unrounded
// here, rounding only in the display functions. No DOM access, nothing in `result` is changed.

import { METHODS } from './result-state.js';
import { resolveSurface, describeSurface } from './slices-table.js';
import { formatForce, formatCoordinate } from './numbers.js';
import { SUPPORT_TYPES } from './supports-edit.js';
import { surfaceCodeKey } from './draw-snap.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const CODE_SPENCER_ONLY = 'I_SUPPORT_SPENCER_ONLY';

/** Does the result hold a list `supports` (of the governing circle of a method, or of a single circle)? Shows the tab "Supports". */
export function resultHasSupportLists(result) {
  if (!isObject(result)) return false;
  const critical = isObject(result.critical) ? Object.values(result.critical) : [];
  if (critical.some((c) => isObject(c) && Array.isArray(c.supports))) return true;
  return Array.isArray(result.surfaces) && result.surfaces.some((s) => isObject(s) && Array.isArray(s.supports));
}

/**
 * Were supports part of the calculation? The lists above, the format of the check of mode sia with supports
 * (`check.withSupports`), or a circle that was refused for Bishop / Janbu with I_SUPPORT_SPENCER_ONLY (count per method).
 */
export function resultHasSupports(result) {
  if (!isObject(result)) return false;
  if (resultHasSupportLists(result)) return true;
  if (isObject(result.check) && result.check.withSupports === true) return true;
  const by = isObject(result.countsByMethod) ? Object.values(result.countsByMethod) : [];
  return by.some((m) => isObject(m) && isObject(m.invalid) && Object.hasOwn(m.invalid, CODE_SPENCER_ONLY));
}

/**
 * Methods of the analysis that have no governing circle only because supports are present (SPEC_ETAPPE3 4.5): the methods that
 * the run counted (countsByMethod: bishop, janbu, spencer) in display order, minus those in `critical`. Janbu stands for Janbu F0
 * and Janbu corrected. [] when no supports are involved. They are shown in the overview with I_SUPPORT_SPENCER_ONLY and cannot be chosen.
 * open question (order 23): only methods that the run was asked for get a row; a model with `methods: ["spencer"]` (like S6) shows none.
 */
export function supportOnlyMethods(result) {
  if (!resultHasSupports(result) || !isObject(result.countsByMethod)) return [];
  const asked = new Set();
  for (const name of Object.keys(result.countsByMethod)) {
    if (name === 'janbu') {
      asked.add('janbu');
      asked.add('janbuCorrected');
    } else {
      asked.add(name);
    }
  }
  const critical = isObject(result.critical) ? result.critical : {};
  return METHODS.filter((m) => asked.has(m) && !Object.hasOwn(critical, m));
}

// ---------- table of the supports for one circle ----------

/** Column keys in the order of the table (SPEC_ETAPPE3 10): the heads are interface texts `ui.supres.<key>`. */
export const SUPPORT_RESULT_COLUMNS = ['id', 'type', 'intersects', 'T', 'governs', 'perMetre', 'applied'];

/** Columns of numbers (T, per metre, applied), aligned right; index in SUPPORT_RESULT_COLUMNS. */
export const SUPPORT_NUMERIC_COLUMNS = [3, 5, 6];

/** Which list of `supports` belongs to the circle: { list } | { code, message } (circle invalid) | { none: true } (no circle, no list). */
export function supportListFor(result, method, target) {
  if (!isObject(result)) return { none: true };
  if (target && target.kind === 'single') {
    const s = Array.isArray(result.surfaces) ? result.surfaces.find((x) => isObject(x) && x.id === target.id) : undefined;
    if (!s) return { none: true };
    if (s.valid !== true) return { code: s.code, message: s.message };
    return Array.isArray(s.supports) ? { list: s.supports } : { none: true };
  }
  const c = isObject(result.critical) && method ? result.critical[method] : null;
  return isObject(c) && Array.isArray(c.supports) ? { list: c.supports } : { none: true };
}

/**
 * Rows of the table, one per element in the order of `supports` (no sorting), as data: numbers unrounded or null.
 *   { id, type, intersects, T, governs, perMetre, applied }
 * An element without an intersection has only id and type (the other cells are empty); `applied` null stays null.
 */
export function supportRows(list) {
  return (Array.isArray(list) ? list : []).filter(isObject).map((s) => {
    const row = { id: typeof s.id === 'string' ? s.id : '', type: typeof s.type === 'string' ? s.type : '', intersects: s.intersects === true, T: null, governs: null, perMetre: null, applied: null };
    if (row.intersects) {
      row.T = isNum(s.T) ? s.T : null;
      row.governs = typeof s.governs === 'string' ? s.governs : null;
      row.perMetre = isNum(s.perMetre) ? s.perMetre : null;
      row.applied = isNum(s.applied) ? s.applied : null;
    }
    return row;
  });
}

const typeText = (t, type) => (SUPPORT_TYPES.includes(type) ? t(`ui.sup.type.${type}`) : type);
const governsText = (t, governs) => (governs === null ? '' : t(`ui.supgov.${governs}`) === `ui.supgov.${governs}` ? governs : t(`ui.supgov.${governs}`));

/** Heads of the columns with units, in the language of `t`. */
export const supportHeads = (t) => SUPPORT_RESULT_COLUMNS.map((key) => t(`ui.supres.${key}`));

/**
 * Cells of one row as text. Display (`copy` false): forces with 1 decimal (as the switch "Forces"), `applied` null as "–", the
 * cells of an element without an intersection empty. Copy (`copy` true): the values unrounded (String of the number) with a point,
 * `applied` null as an empty cell (as the slice table).
 * open question (order 23): the order names "–" for `applied` null in the display; the copy leaves the cell empty, like null in the slice table.
 */
export function supportCells(row, t, { copy = false } = {}) {
  const value = (v, missing) => (v === null ? missing : copy ? String(v) : formatForce(v));
  return [
    row.id,
    typeText(t, row.type),
    t(row.intersects ? 'ui.sup.yes' : 'ui.sup.no'),
    row.intersects ? value(row.T, '') : '',
    row.intersects ? governsText(t, row.governs) : '',
    row.intersects ? value(row.perMetre, '') : '',
    row.intersects ? value(row.applied, copy ? '' : '–') : '',
  ];
}

/** Text for the clipboard: head with units, then one line per element; tabs between the columns, "\n" between the lines. */
export function supportTsv(rows, t) {
  return [supportHeads(t).join('\t'), ...rows.map((row) => supportCells(row, t, { copy: true }).join('\t'))].join('\n');
}

/**
 * The table of the supports for the circle that the tab Slices shows (method and target), as data:
 *   { kind: 'table',   which, circle, head, rows, copy }  rows: strings; copy: text for the clipboard
 *   { kind: 'invalid', which, circle, code, text }        the circle is invalid: code and text instead of the table
 *   { kind: 'none',    text }                              no circle, or no list for it
 * `which` and `circle` are the texts of the slice table's heading (same circle, same words).
 */
export function supportsView({ result, method, target, t }) {
  const single = target && target.kind === 'single';
  if (!method && !single) return { kind: 'none', text: t('ui.result.noSearch') };
  const source = supportListFor(result, method, target);
  const resolved = resolveSurface(result, method, target);
  const which = single ? t(resolved.kind === 'polyline' ? 'ui.slices.singleSurface' : 'ui.slices.single', { id: target.id }) : t(resolved.kind === 'polyline' ? 'ui.slices.criticalSurface' : 'ui.slices.critical', { method: t(`ui.method.${method}`) });
  if (source.code !== undefined) {
    const circle = describeSurface(resolved, t);
    return { kind: 'invalid', which, circle, code: source.code, text: source.code ? t(surfaceCodeKey(source.code, resolved)) : '' };
  }
  if (!resolved.surface) return { kind: 'none', text: t(resolved.reason === 'no-valid-surface' ? 'ui.result.noValid' : 'ui.slices.unknown') };
  if (source.none) return { kind: 'none', text: t('ui.supres.none') };
  const rows = supportRows(source.list);
  return {
    kind: 'table',
    which,
    circle: describeSurface(resolved, t),
    head: supportHeads(t),
    rows: rows.map((row) => supportCells(row, t)),
    copy: supportTsv(rows, t),
  };
}
