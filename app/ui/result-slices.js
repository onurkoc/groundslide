// Slice table (SPEC_ETAPPE2 8.3): choice of the surface, F per method, the table, copy button.
// The calculation (analyzeSurface) runs in the worker; this part only shows what main.js hands over.

import { translate } from '../lib/i18n.js';
import { formatFactor } from '../lib/numbers.js';
import { surfacesTable, criticalSurface } from '../lib/result-view.js';
import { sliceColumnsFor, columnHead, displayRows, sliceTsv, surfaceFactors, resolveSurface, describeSurface } from '../lib/slices-table.js';
import { surfaceCodeKey } from '../lib/draw-snap.js';
import { h, icon } from './widgets.js';

/** Copy text to the clipboard. Returns a promise that resolves to true when it worked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // no permission or no secure context: old way through a hidden text area
    const area = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;left:-9999px;top:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

let copiedTimer = null;

/**
 * Show the slice table in `panel`.
 *   result, method, target   state of the result display (lib/result-state.js)
 *   slices                   calculated table { key, status: 'loading' | 'ok' | 'invalid' | 'error', result?, code?, message? } or null
 *   running                  a run is going: no slice calculation is started meanwhile
 *   onSelectTarget(target)   the user chose { kind: 'critical' } or { kind: 'single', id }
 */
export function renderSlices(panel, { result, method, target, slices, running, lang, onSelectTarget }) {
  const t = (key, params) => translate(lang, key, params);
  const hadFocus = panel.contains(document.activeElement) && document.activeElement.id === 'slices-target'; // the select is rebuilt: keep the keyboard focus
  render(panel, { result, method, target, slices, running, t, onSelectTarget });
  if (hadFocus) panel.querySelector('#slices-target')?.focus();
}

function render(panel, { result, method, target, slices, running, t, onSelectTarget }) {
  if (!result) {
    panel.replaceChildren(h('p', { class: 'hint', text: t('ui.result.none') }));
    return;
  }
  const parts = [chooser({ result, method, target, t, onSelectTarget })];
  const resolved = resolveSurface(result, method, target);

  if (!resolved.surface) {
    parts.push(h('p', { class: 'hint', text: t(resolved.reason === 'no-valid-surface' ? 'ui.result.noValid' : 'ui.slices.unknown') }));
    panel.replaceChildren(...parts);
    return;
  }
  parts.push(h('p', { class: 'hint num', text: describeSurface(resolved, t) }));

  if (!slices || slices.key !== resolved.key || slices.status === 'loading') {
    parts.push(h('p', { class: 'hint', role: 'status', text: t(running ? 'ui.slices.waitRun' : 'ui.slices.loading') }));
  } else if (slices.status === 'error') {
    parts.push(noticeRow('error', slices.code, t(slices.code, { message: slices.message }), slices.message));
  } else if (slices.status === 'invalid') {
    parts.push(noticeRow('warn', slices.result.code, t(surfaceCodeKey(slices.result.code, resolved)), slices.result.message));
  } else {
    parts.push(...tableParts(slices.result, { t }));
  }
  panel.replaceChildren(...parts);
}

function noticeRow(kind, code, text, detail) {
  return h('ul', { class: 'messages-list' }, [h('li', { class: `notice notice-${kind}`, title: detail || null }, [
    h('span', { class: 'code', text: code }),
    h('span', { class: 'notice-text', text }),
  ])]);
}

/** Choice of the circle (shared by the tabs Slices and Supports: the same circle in both). `id` of the select. */
export function chooser({ result, method, target, t, onSelectTarget, id = 'slices-target' }) {
  const singles = surfacesTable(result).rows.filter((r) => r.id && (r.circle || r.polyline));
  const polyline = method ? (criticalSurface(result, method) || {}).kind === 'polyline' : false;
  const critical = method ? t(polyline ? 'ui.slices.criticalSurface' : 'ui.slices.critical', { method: t(`ui.method.${method}`) }) : t('ui.slices.criticalNone');
  const options = [];
  if (method) options.push(h('option', { value: '', text: critical, selected: target.kind === 'critical' }));
  for (const r of singles) options.push(h('option', { value: r.id, text: t(r.polyline ? 'ui.slices.singleSurface' : 'ui.slices.single', { id: r.id }), selected: target.kind === 'single' && target.id === r.id }));
  const select = h('select', { id, 'aria-label': t('ui.slices.which') }, options);
  select.value = target.kind === 'single' ? target.id : '';
  select.addEventListener('change', () => onSelectTarget(select.value === '' ? { kind: 'critical' } : { kind: 'single', id: select.value }));
  return h('div', { class: 'field slices-chooser' }, [
    h('label', { for: id, text: t('ui.slices.which') }),
    h('div', { class: 'field-control' }, [select]),
  ]);
}

function tableParts(surfaceResult, { t }) {
  const slices = surfaceResult.slices || [];
  const status = h('span', { class: 'hint copy-status', role: 'status' });
  const copy = h('button', { type: 'button', class: 'btn btn-small', onClick: async () => {
    const ok = await copyText(sliceTsv(slices, { stresses: true }));
    status.textContent = t(ok ? 'ui.slices.copied' : 'ui.slices.copyFailed');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { status.textContent = ''; }, 4000);
  } }, [icon('copy'), h('span', { text: t('ui.slices.copy') })]);

  const factors = surfaceFactors(surfaceResult).map((f) => h('li', {}, [
    h('span', { class: 'factor-name', text: t(`ui.method.${f.method}`) }),
    f.code
      ? h('span', { class: 'factor-value no-surface' }, [h('span', { class: 'code', text: f.code }), document.createTextNode(` ${t(f.code)}`)])
      : h('span', { class: 'factor-value num', text: `F = ${formatFactor(f.F)}` }),
  ]));

  const rows = displayRows(slices, 3, { stresses: true });
  const table = h('table', { class: 'compact', 'aria-label': t('ui.tab.slices') }, [
    h('thead', {}, [h('tr', {}, [h('th', { class: 'idx', scope: 'col', text: '#' }), ...sliceColumnsFor(slices, { stresses: true }).map((col) => h('th', { class: 'num', scope: 'col', text: columnHead(col) }))])]),
    h('tbody', {}, rows.map((row, i) => h('tr', {}, [h('td', { class: 'idx', text: String(i + 1) }), ...row.map((v) => h('td', { class: 'num', text: v }))]))),
  ]);
  return [
    h('ul', { class: 'factor-list' }, factors),
    h('div', { class: 'table-actions' }, [copy, status, h('span', { class: 'hint', text: t('ui.slices.count', { n: slices.length }) })]),
    h('div', { class: 'table-wrap slices-table' }, [table]),
  ];
}
