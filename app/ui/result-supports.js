// Tab "Supports" of the result (SPEC_ETAPPE3 10): the table of the supports for the circle that the tab Slices shows (governing
// Spencer circle or a chosen single circle), one row per element in the order of `supports`; copy as text with tabs.
// main.js hands over what to show; the lists come with the result (no calculation of their own).

import { translate } from '../lib/i18n.js';
import { supportsView, SUPPORT_NUMERIC_COLUMNS } from '../lib/supports-result.js';
import { copyText, chooser } from './result-slices.js';
import { h, icon } from './widgets.js';

let copiedTimer = null;

// columns of numbers (T, per metre, applied) are aligned right
const NUMERIC = new Set(SUPPORT_NUMERIC_COLUMNS);

/**
 * Show the table in `panel`.
 *   result, method, target   state of the result display (lib/result-state.js)
 *   onSelectTarget(target)   the user chose { kind: 'critical' } or { kind: 'single', id } (the same choice as in the tab Slices)
 */
export function renderSupports(panel, { result, method, target, lang, onSelectTarget }) {
  const t = (key, params) => translate(lang, key, params);
  const hadFocus = panel.contains(document.activeElement) && document.activeElement.id === 'supports-target'; // the select is rebuilt: keep the focus
  if (!result) {
    panel.replaceChildren(h('p', { class: 'hint', text: t('ui.result.none') }));
    return;
  }
  const parts = [chooser({ result, method, target, t, onSelectTarget, id: 'supports-target' })];
  const view = supportsView({ result, method, target, t });
  if (view.kind === 'none') {
    parts.push(h('p', { class: 'hint', text: view.text }));
  } else {
    parts.push(h('p', { class: 'hint num', text: view.circle }));
    if (view.kind === 'invalid') {
      parts.push(h('ul', { class: 'messages-list' }, [h('li', { class: 'notice notice-warn' }, [
        h('span', { class: 'code', text: view.code }),
        h('span', { class: 'notice-text', text: view.text }),
      ])]));
    } else {
      parts.push(...tableParts(view, t));
    }
  }
  panel.replaceChildren(...parts);
  if (hadFocus) panel.querySelector('#supports-target')?.focus();
}

function tableParts(view, t) {
  const status = h('span', { class: 'hint copy-status', role: 'status' });
  const copy = h('button', { type: 'button', class: 'btn btn-small', onClick: async () => {
    const ok = await copyText(view.copy);
    status.textContent = t(ok ? 'ui.slices.copied' : 'ui.slices.copyFailed');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { status.textContent = ''; }, 4000);
  } }, [icon('copy'), h('span', { text: t('ui.slices.copy') })]);
  const n = view.rows.length;
  const table = h('table', { class: 'compact', 'aria-label': t('ui.tab.supports') }, [
    h('thead', {}, [h('tr', {}, view.head.map((text, i) => h('th', { scope: 'col', class: NUMERIC.has(i) ? 'num' : '', text })))]),
    h('tbody', {}, view.rows.map((row) => h('tr', {}, row.map((text, i) => h('td', { class: NUMERIC.has(i) ? 'num' : '', text }))))),
  ]);
  return [
    h('div', { class: 'table-actions' }, [copy, status, h('span', { class: 'hint', text: t(n === 1 ? 'ui.sum.support1' : 'ui.sum.supports', { n }) })]),
    h('div', { class: 'table-wrap supports-result-table' }, [table]),
  ];
}
