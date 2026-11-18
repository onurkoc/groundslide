// Content of the result document (SPEC_ETAPPE2 8.5) as data: head with the values of the chosen method, and the
// slice table of the circle that the tab Slices shows. Values and rounding as in the overview (8.1) and the slice
// table (8.3). No DOM access.

import { overviewTable } from './result-view.js';
import { METHODS } from './result-state.js';
import { formatCoordinate, formatFactor, formatAngle, formatPoint, formatForce } from './numbers.js';
import { resultHasSupportLists, supportsView, SUPPORT_RESULT_COLUMNS, SUPPORT_NUMERIC_COLUMNS } from './supports-result.js';
import { sliceColumnsFor, columnHead, displayRows, resolveSurface, describeSurface } from './slices-table.js';
import { FACTOR_DEFAULTS } from './supports-edit.js';
import { surfaceCodeKey } from './draw-snap.js';

const pad = (n) => String(n).padStart(2, '0');

/** Date and time of the document in the local time of the computer: "2026-11-15 14:32" (the same in both languages). */
export function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Head of the document.
 *   model, result   the model (name) and the output of analyze()
 *   method          chosen governing method (null without search)
 *   target          { kind: 'critical' } | { kind: 'single', id }: what the tab Slices shows (single circle: see singleHead)
 *   now             Date of the moment of the document
 *   t(key, params)  text of the interface language
 * Returns
 *   title       name of the model
 *   dateTime    "2026-11-15 14:32"
 *   methodName  text of the method, or null without search
 *   note        text when there are no values to show (no search, or the method has no valid surface), else null
 *   entries     [{ label, value }]: F, x_c, z_c, R, entry, exit; Spencer: theta; mode sia: gamma_R, utilisation, verdict
 */
export function documentHead({ model, result, method, target, now, t }) {
  const name = model && model.meta && typeof model.meta.name === 'string' ? model.meta.name.trim() : '';
  const table = overviewTable(result);
  const row = method ? table.rows.find((r) => r.method === method) : undefined;
  const head = {
    title: name === '' ? t('ui.model.unnamed') : name,
    dateTime: formatDateTime(now),
    methodName: method ? t(`ui.method.${method}`) : null,
    note: null,
    entries: [],
  };
  if (target && target.kind === 'single') return singleHead(head, { result, method, id: target.id, t });
  if (!row) {
    head.note = t('ui.result.noSearch');
    return head;
  }
  if (!row.valid) {
    head.note = t('ui.result.noValid');
    return head;
  }
  const e = (key, value) => head.entries.push({ label: t(key), value });
  // mode sia with supports: the names of the overview (SPEC_ETAPPE3 10)
  const fd = table.withSupports;
  e(fd ? 'ui.col.Fd' : 'ui.col.F', formatFactor(row.F));
  if (table.hasSurface) head.entries.push({ label: t('ui.col.surface'), value: row.polyline ? t('ui.surf.polylineN', { n: row.polyline.n }) : t('ui.surf.circle') });
  // a polyline has no centre and radius (SPEC_ETAPPE4 13)
  e('ui.col.xc', row.polyline ? '–' : formatCoordinate(row.xc));
  e('ui.col.zc', row.polyline ? '–' : formatCoordinate(row.zc));
  e('ui.col.R', row.polyline ? '–' : formatCoordinate(row.R));
  e('ui.col.entry', formatPoint(row.entry));
  e('ui.col.exit', formatPoint(row.exit));
  if (table.hasTheta && row.theta !== null) e('ui.col.theta', formatAngle(row.theta));
  if (table.hasSearchF) e('ui.col.searchF', row.searchF === undefined ? '–' : formatFactor(row.searchF));
  if (table.hasCrack) e('ui.col.crack', row.crack ? `${formatCoordinate(row.crack.x)} / ${formatForce(row.crack.Pw)} kN/m` : '–');
  if (table.hasCheck) {
    if (fd) {
      // gamma_R as a statement, then required, utilisation 1 / F_d, verdict (only Spencer has a check with supports)
      // open question (order 23): gamma_R is one more entry of the head with the text of the note; the order only says "same names"
      head.entries.push({ label: t('ui.col.gammaR'), value: t('ui.doc.gammaRValue', { gammaR: formatFactor(table.gammaR) }) });
    }
    if (row.check) {
      if (!fd) e('ui.col.gammaR', formatFactor(row.check.gammaR));
      else e('ui.col.required', formatFactor(row.check.required));
      e(fd ? 'ui.col.utilisationFd' : 'ui.col.utilisation', formatFactor(row.check.utilisation));
      e(fd ? 'ui.col.verdictFd' : 'ui.col.verdict', t(row.check.ok ? 'ui.verdict.ok' : 'ui.verdict.fail'));
    } else {
      // Janbu F0 has no verdict (SPEC 8): the cells stay empty as in the overview
      e(fd ? 'ui.col.required' : 'ui.col.gammaR', '–');
      e(fd ? 'ui.col.utilisationFd' : 'ui.col.utilisation', '–');
      e(fd ? 'ui.col.verdictFd' : 'ui.col.verdict', '–');
    }
  }
  return head;
}

/**
 * Head for a single circle (the tab Slices shows one; SPEC_ETAPPE2 8.5, version 1.11): ID, F of this circle for the chosen
 * method (or its code when the circle or the method is invalid for it), centre, radius; entry, exit and, for Spencer,
 * theta only as far as the result holds them for the circle. The result has no check (gamma_R, utilisation, verdict)
 * for single circles, so none is shown. Without a chosen method (no search) F is given for every method that was
 * calculated for the circle.
 */
function singleHead(head, { result, method, id, t }) {
  const s = result && Array.isArray(result.surfaces) ? result.surfaces.find((x) => x && x.id === id) : undefined;
  if (!s) {
    head.note = t('ui.slices.unknown');
    return head;
  }
  const e = (label, value) => head.entries.push({ label, value });
  e(t('ui.col.id'), String(s.id));
  const circle = s.circle || {};
  const polyline = s.type === 'polyline';
  const results = s.valid === true && s.results ? s.results : {};
  const factor = (m) => {
    const r = results[m];
    if (!r) return null;
    return r.valid === true ? formatFactor(r.F) : r.code || '';
  };
  if (s.valid !== true) {
    e(t('ui.col.F'), s.code || '');
    head.note = s.code ? t(surfaceCodeKey(s.code, s)) : null;
  } else if (method) {
    e(t('ui.col.F'), factor(method) ?? '');
    const r = results[method];
    if (r && r.valid !== true && r.code) head.note = t(r.code);
  } else {
    for (const m of METHODS) if (results[m]) e(`${t('ui.col.F')} – ${t(`ui.method.${m}`)}`, factor(m));
  }
  if (polyline) {
    e(t('ui.col.surface'), t('ui.surf.polylineN', { n: Array.isArray(s.points) ? s.points.length : 0 }));
  } else {
    e(t('ui.col.xc'), formatCoordinate(circle.xc));
    e(t('ui.col.zc'), formatCoordinate(circle.zc));
    e(t('ui.col.R'), formatCoordinate(circle.R));
  }
  if (s.valid === true && s.crack) e(t('ui.col.crack'), `${formatCoordinate(s.crack.x)} / ${formatForce(s.crack.Pw)} kN/m`);
  if (s.valid === true && Array.isArray(s.entry)) e(t('ui.col.entry'), formatPoint(s.entry));
  if (s.valid === true && Array.isArray(s.exit)) e(t('ui.col.exit'), formatPoint(s.exit));
  const spencer = method === 'spencer' ? results.spencer : null;
  if (spencer && spencer.valid === true && typeof spencer.theta === 'number') e(t('ui.col.theta'), formatAngle(spencer.theta));
  return head;
}

/**
 * Table "Supports" of the document (SPEC_ETAPPE3 10), after the slice table, for the same circle (method and target as the tab
 * Slices): null when the result holds no supports (the table is left out), else one of
 *   { kind: 'table',   which, circle, head, rows, numeric }  head and rows as texts (1 decimal); numeric: [bool] per column (aligned right)
 *   { kind: 'invalid', which, circle, code, text }           the circle is invalid: code and text instead of the table
 *   { kind: 'none',    text }                                 no circle, or no list for it
 */
export function documentSupports({ result, method, target, t }) {
  if (!resultHasSupportLists(result)) return null;
  const view = supportsView({ result, method, target, t });
  if (view.kind !== 'table') return view;
  const { copy: _copy, ...table } = view;
  return { ...table, numeric: SUPPORT_RESULT_COLUMNS.map((_, i) => SUPPORT_NUMERIC_COLUMNS.includes(i)) };
}

/**
 * Mode sia (SPEC_ETAPPE4 13b): the table of the supports of the document with three more columns, γ_M, γ_A and γ_C of every element as calculated.
 * `table` = documentSupports(); anything that is not a table, and a model not in mode sia, come back unchanged.
 */
export function withSupportFactors(table, model) {
  if (!table || table.kind !== 'table' || !model || !model.analysis || model.analysis.mode !== 'sia') return table;
  return { ...table, head: [...table.head, 'γ_M', 'γ_A', 'γ_C'], rows: table.rows.map((row) => [...row, ...supportFactorCells(model, row[0])]), numeric: [...table.numeric, true, true, true] };
}

/**
 * γ_M, γ_A and γ_C of the element with this id as the core used them (SPEC_ETAPPE3 5, resolveSupportFactors): the value of the element, else the
 * default of its type; "–" where the element has none. γ_M: nail, anchor, pile; γ_A: anchor only; γ_C: shotcrete only (SPEC_ETAPPE4 13b).
 */
export function supportFactorCells(model, id) {
  const list = Array.isArray(model.supports) ? model.supports : [];
  const s = list.find((x) => x && typeof x === 'object' && x.id === id);
  const defaults = s ? FACTOR_DEFAULTS[s.type] : null;
  const pick = (key) => {
    if (!defaults || !Object.hasOwn(defaults, key)) return '–';
    const v = s[key] === undefined ? defaults[key] : s[key];
    return typeof v === 'number' && Number.isFinite(v) ? formatFactor(v) : '–';
  };
  return [pick('gammaM'), pick('gammaA'), pick('gammaC')];
}

/**
 * Slice table of the document: the surface that the tab Slices shows (method and target) and its calculated table.
 *   target   { kind: 'critical' } | { kind: 'single', id }
 *   slices   state.rs.slices: { key, status: 'loading' | 'ok' | 'invalid' | 'error', result?, code?, message? } or null
 * Returns one of
 *   { kind: 'table',   which, circle, head, rows }   head: "#" and the columns with units; rows: strings, 3 decimals
 *   { kind: 'invalid', which, circle, code, text }   circle invalid or calculation failed: code and text instead of the table
 *   { kind: 'pending', which, circle, text }         not calculated yet
 *   { kind: 'none',    text }                        no surface (no valid surface of the method, unknown circle)
 */
export function documentTable({ result, method, target, slices, t }) {
  const single = target && target.kind === 'single';
  if (!method && !single) return { kind: 'none', text: t('ui.result.noSearch') };
  const resolved = resolveSurface(result, method, target);
  if (!resolved.surface) return { kind: 'none', text: t(resolved.reason === 'no-valid-surface' ? 'ui.result.noValid' : 'ui.slices.unknown') };
  const which = single ? t(resolved.kind === 'polyline' ? 'ui.slices.singleSurface' : 'ui.slices.single', { id: target.id }) : t(resolved.kind === 'polyline' ? 'ui.slices.criticalSurface' : 'ui.slices.critical', { method: t(`ui.method.${method}`) });
  const circle = describeSurface(resolved, t); // the line of the surface: circle or polyline (SPEC_ETAPPE4 13)
  if (!slices || slices.key !== resolved.key || slices.status === 'loading') return { kind: 'pending', which, circle, text: t('ui.slices.loading') };
  if (slices.status === 'error') return { kind: 'invalid', which, circle, code: slices.code, text: t(slices.code, { message: slices.message }) };
  if (slices.status === 'invalid') return { kind: 'invalid', which, circle, code: slices.result.code, text: t(surfaceCodeKey(slices.result.code, resolved)) };
  const rows = displayRows(slices.result.slices || [], 3, { stresses: true });
  return {
    kind: 'table',
    which,
    circle,
    head: ['#', ...sliceColumnsFor(slices.result.slices, { stresses: true }).map(columnHead)],
    rows: rows.map((row, i) => [String(i + 1), ...row]),
  };
}
