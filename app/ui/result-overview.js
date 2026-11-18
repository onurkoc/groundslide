// Overview of the result (SPEC_ETAPPE2 8.1): governing surface per method with the choice of the
// governing method, warnings, counters, single circles. Numbers are rounded only here.

import { translate } from '../lib/i18n.js';
import { formatCoordinate, formatFactor, formatAngle, formatPoint, formatForce } from '../lib/numbers.js';
import { overviewTable, warningCodes, countsView, surfacesTable, adoptableSurface } from '../lib/result-view.js';
import { METHODS } from '../lib/result-state.js';
import { resultHasSupports, supportOnlyMethods, CODE_SPENCER_ONLY } from '../lib/supports-result.js';
import { surfaceCodeKey } from '../lib/draw-snap.js';
import { h } from './widgets.js';

const th = (text, cls) => h('th', { text, class: cls, scope: 'col' });
const td = (child, cls) => h('td', { class: cls }, child === undefined ? [] : [typeof child === 'string' ? document.createTextNode(child) : child]);
const num = (text) => td(text, 'num');

/**
 * Show the overview in `panel`.
 *   result            output of analyze() or null
 *   method            chosen governing method
 *   lang              language (the time of the run is shown beside the tabs, main.js)
 *   onSelectMethod(m) the user chose a method (radio button of a row, or a click on the row)
 *   onAdopt(m)        the user asked to take the governing surface of method m over as a single surface (SPEC_ETAPPE4 13)
 */
export function renderOverview(panel, { result, method, lang, onSelectMethod, onAdopt }) {
  const t = (key, params) => translate(lang, key, params);
  const active = document.activeElement;
  const focused = panel.contains(active) && active.matches('input[name="method"]') ? active.value : null;

  if (!result) {
    panel.replaceChildren(h('p', { class: 'hint', text: t('ui.result.none') }));
    return;
  }

  const parts = [];
  // supports act in Spencer only (SPEC_ETAPPE3 10): fixed note; Bishop and Janbu show the code in their row
  if (resultHasSupports(result)) parts.push(h('p', { class: 'notice notice-info result-supports-hint', text: t('ui.result.supportsHint') }));

  // ---- governing surfaces per method
  const table = overviewTable(result);
  if (table.rows.length) parts.push(governingTable(table, { t, method, onSelectMethod, onAdopt, adoptable: adoptableSurface(result, method) !== null, only: supportOnlyMethods(result) }));
  else parts.push(h('p', { class: 'hint', text: t('ui.result.noSearch') }));

  // ---- warnings
  parts.push(section(t('ui.warnings.title'), warningCodes(result).length
    ? h('ul', { class: 'messages-list' }, warningCodes(result).map((code) => h('li', { class: 'notice notice-warn' }, [
      h('span', { class: 'code', text: code }),
      h('span', { class: 'notice-text', text: t(code) }),
    ])))
    : h('p', { class: 'hint', text: t('ui.warnings.none') })));

  // ---- counters
  const counts = countsView(result);
  if (counts) parts.push(countersBlock(counts, t));

  // ---- single circles
  const singles = surfacesTable(result);
  if (singles.rows.length) parts.push(section(t('ui.section.surfaces'), singlesTable(singles, t)));

  panel.replaceChildren(...parts);
  if (focused) panel.querySelector(`input[name="method"][value="${focused}"]`)?.focus();
}

function section(title, content) {
  return h('section', { class: 'result-section' }, [h('h3', { text: title }), content]);
}

function governingTable(table, { t, method, onSelectMethod, onAdopt, adoptable, only = [] }) {
  // mode sia with supports (SPEC_ETAPPE3 5, 10): other names, the check of F_d against 1.0; gamma_R is stated above the table
  const fd = table.withSupports;
  const head = [th(t('ui.col.method')), th(t(fd ? 'ui.col.Fd' : 'ui.col.F'), 'num'), ...(table.hasSurface ? [th(t('ui.col.surface'))] : []), th(t('ui.col.xc'), 'num'), th(t('ui.col.zc'), 'num'), th(t('ui.col.R'), 'num'), th(t('ui.col.entry'), 'num'), th(t('ui.col.exit'), 'num')];
  if (table.hasTheta) head.push(th(t('ui.col.theta'), 'num'));
  if (table.hasSearchF) head.push(th(t('ui.col.searchF'), 'num'));
  if (table.hasCrack) head.push(th(t('ui.col.crack'), 'num'));
  if (table.hasCheck) head.push(th(t(fd ? 'ui.col.required' : 'ui.col.gammaR'), 'num'), th(t(fd ? 'ui.col.utilisationFd' : 'ui.col.utilisation'), 'num'), th(t(fd ? 'ui.col.verdictFd' : 'ui.col.verdict')));
  const columns = head.length;

  // the methods that supports exclude are rows without a choice, in the order of the display
  const rows = [...table.rows, ...only.map((m) => ({ method: m, refused: true }))].sort((a, b) => METHODS.indexOf(a.method) - METHODS.indexOf(b.method));

  const body = rows.map((row) => {
    if (row.refused) {
      return h('tr', { 'data-method': row.method }, [
        td(h('span', { class: 'method-choice', text: t(`ui.method.${row.method}`) })),
        h('td', { colspan: String(columns - 1), class: 'no-surface' }, [h('span', { class: 'code', text: CODE_SPENCER_ONLY }), document.createTextNode(` ${t(CODE_SPENCER_ONLY)}`)]),
      ]);
    }
    const selected = row.method === method;
    const radio = h('input', { type: 'radio', name: 'method', value: row.method, checked: selected, 'data-method': row.method });
    radio.checked = selected;
    radio.addEventListener('change', () => onSelectMethod(row.method));
    const cells = [td(h('label', { class: 'method-choice' }, [radio, h('span', { text: t(`ui.method.${row.method}`) })]))];
    if (!row.valid) {
      cells.push(h('td', { colspan: String(columns - 1), class: 'no-surface', text: t('ui.result.noValid') }));
    } else {
      // a polyline (search A) has no centre and radius: "–" (SPEC_ETAPPE4 13)
      const centre = row.polyline ? [num('–'), num('–'), num('–')] : [num(formatCoordinate(row.xc)), num(formatCoordinate(row.zc)), num(formatCoordinate(row.R))];
      cells.push(num(formatFactor(row.F)));
      if (table.hasSurface) cells.push(td(row.polyline ? t('ui.surf.polylineN', { n: row.polyline.n }) : t('ui.surf.circle')));
      cells.push(...centre, num(formatPoint(row.entry)), num(formatPoint(row.exit)));
      if (table.hasTheta) cells.push(num(row.theta === null ? '' : formatAngle(row.theta)));
      if (table.hasSearchF) cells.push(num(row.searchF === undefined ? '–' : formatFactor(row.searchF)));
      if (table.hasCrack) cells.push(num(row.crack ? `${formatCoordinate(row.crack.x)} / ${formatForce(row.crack.Pw)} kN/m` : '–'));
      if (table.hasCheck) {
        if (row.check) {
          cells.push(num(formatFactor(fd ? row.check.required : row.check.gammaR)), num(formatFactor(row.check.utilisation)),
            td(h('span', { class: `verdict ${row.check.ok ? 'verdict-ok' : 'verdict-fail'}`, text: t(row.check.ok ? 'ui.verdict.ok' : 'ui.verdict.fail') })));
        } else {
          cells.push(num('–'), num('–'), td('–')); // Janbu F0: no verdict
        }
      }
    }
    const tr = h('tr', { class: selected ? 'is-selected' : null }, cells);
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input, label')) return;
      onSelectMethod(row.method);
    });
    return tr;
  });

  return section(t('ui.result.governing'), h('div', { class: 'table-block' }, [
    h('p', { class: 'hint', text: t('ui.result.chooseHint') }),
    // SPEC_ETAPPE4 13: the governing surface of the chosen method becomes a single surface of the model
    h('div', { class: 'table-actions' }, [h('button', { type: 'button', class: 'btn btn-small', 'data-adopt': '', disabled: !adoptable, title: t('ui.result.adoptTitle'), onClick: () => onAdopt && onAdopt(method) }, [h('span', { text: t('ui.result.adopt') })])]),
    fd ? h('p', { class: 'hint num result-gamma-note', text: t('ui.result.gammaRNote', { gammaR: formatFactor(table.gammaR) }) }) : null,
    h('div', { class: 'table-wrap result-table' }, [
      h('table', { class: 'compact', 'aria-label': t('ui.result.governing') }, [
        h('thead', {}, [h('tr', {}, head)]),
        h('tbody', {}, body),
      ]),
    ]),
  ]));
}

function countersBlock(counts, t) {
  const invalidList = (list) => (list.length
    ? h('ul', { class: 'counts-list' }, list.map((c) => h('li', {}, [
      h('span', { class: 'code', text: c.code }),
      h('span', { text: ` ${t(c.code)} ` }),
      h('span', { class: 'num', text: `× ${c.count}` }),
    ])))
    : null);
  const byMethod = counts.byMethod.length
    ? h('details', { class: 'counts-by-method' }, [
      h('summary', { text: t('ui.counts.byMethod') }),
      ...counts.byMethod.map((m) => h('div', { class: 'counts-method' }, [
        h('strong', { text: t(`ui.method.${m.method}`) }),
        h('span', { text: ` ${t('ui.counts.line', { total: m.total, valid: m.valid, invalid: m.total - m.valid })}` }),
        invalidList(m.invalid),
      ])),
    ])
    : null;
  return section(t('ui.counts.title'), h('div', { class: 'counts' }, [
    h('p', { class: 'num', text: t('ui.counts.line', { total: counts.total, valid: counts.valid, invalid: counts.invalidTotal }) }),
    invalidList(counts.invalid),
    byMethod,
    counts.optimizeEvaluations === undefined ? null : h('p', { class: 'num', text: t('ui.counts.optimize', { n: counts.optimizeEvaluations }) }),
  ]));
}

function singlesTable(singles, t) {
  const columns = singles.methods;
  const typed = singles.rows.some((r) => r.polyline); // the column "Typ" only when a polyline is among the surfaces (SPEC_ETAPPE4 13)
  const head = [th(t('ui.col.id')), ...(typed ? [th(t('ui.col.type'))] : []), ...columns.map((m) => th(`F – ${t(`ui.method.${m}`)}`, 'num'))];
  const body = singles.rows.map((row) => {
    const cells = [td(row.id)];
    if (typed) cells.push(td(row.polyline ? t('ui.surf.polylineN', { n: row.polyline.points.length }) : t('ui.surf.circle')));
    if (!row.valid) {
      cells.push(h('td', { colspan: String(Math.max(columns.length, 1)), class: 'no-surface' }, [
        h('span', { class: 'code', text: row.code || '' }),
        document.createTextNode(` ${row.code ? t(surfaceCodeKey(row.code, row)) : ''}`),
      ]));
    } else {
      for (const m of columns) {
        const r = row.methods[m];
        if (!r) cells.push(num('–'));
        else if (r.code) cells.push(h('td', { class: 'num no-surface' }, [h('span', { class: 'code', text: r.code }), document.createTextNode(` ${t(r.code)}`)]));
        else cells.push(num(formatFactor(r.F)));
      }
    }
    return h('tr', { 'data-id': row.id }, cells);
  });
  return h('div', { class: 'table-wrap result-table' }, [
    h('table', { class: 'compact', 'aria-label': t('ui.section.surfaces') }, [h('thead', {}, [h('tr', {}, head)]), h('tbody', {}, body)]),
  ]);
}
