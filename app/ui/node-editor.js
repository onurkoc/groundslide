// Small input field at a node of the sketch (SPEC_ETAPPE2 6.1, "Doppelklick"): the coordinates of the handle with unit m, the
// value unrounded, Enter takes it over, Esc or a click beside it throws it away; for points of ground, layer boundaries and
// water line also "Delete point". Numbers as in 5.3 (point or comma); an unreadable number marks the field with
// APP_NUMBER_INVALID and nothing is taken over. No snapping.

import { parseNumber, formatNumber } from '../lib/numbers.js';
import { translate } from '../lib/i18n.js';
import { h } from './widgets.js';

/**
 * host      element the field is placed in (position: relative); `anchor` {x, y} in pixels of the host
 * fields    [{ key: 'x' | 'z' | 'R', value }] from lib/handles.js editFields
 * canDelete show "Delete point"
 * lang      language of the texts
 * onApply(values)  Enter with readable numbers: { x, z } / { x } / { R }
 * onDelete()       "Delete point"
 * onClose()        the field is gone (after any of the above, Esc, a click beside it, focus moved away)
 * Returns { close() }.
 */
export function openNodeEditor({ host, anchor, fields, canDelete, lang, onApply, onDelete, onClose }) {
  const t = (key, params) => translate(lang, key, params);
  let closed = false;

  const inputs = fields.map((f) => {
    const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'data-key': f.key, 'aria-label': f.key });
    input.value = formatNumber(f.value);
    const error = h('span', { class: 'node-editor-error', hidden: true });
    input.addEventListener('input', () => mark(input, error, false));
    return { key: f.key, input, error };
  });

  function mark(input, error, bad) {
    input.classList.toggle('is-invalid', bad);
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    error.hidden = !bad;
    error.textContent = bad ? t('APP_NUMBER_INVALID') : '';
  }

  const rows = inputs.map(({ key, input, error }) => h('div', { class: 'node-editor-row' }, [
    h('label', { class: 'node-editor-label' }, [h('span', { class: 'node-editor-key', text: key }), input, h('span', { class: 'node-editor-unit', text: 'm' })]),
    error,
  ]));

  const actions = [];
  if (canDelete) {
    actions.push(h('button', { type: 'button', class: 'btn btn-small btn-danger', onClick: () => { finish(); onDelete(); } }, [h('span', { text: t('ui.edit.deletePoint') })]));
  }

  const box = h('form', { class: 'node-editor', role: 'dialog', 'aria-label': t('ui.edit.dialog'), novalidate: true }, [
    ...rows,
    actions.length ? h('div', { class: 'node-editor-actions' }, actions) : null,
    h('p', { class: 'hint node-editor-hint', text: t('ui.edit.hint') }),
  ]);

  // what happens in the field stays in the field: no panning, zooming or key commands of the sketch
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'dblclick', 'click', 'wheel', 'keydown', 'keyup']) {
    box.addEventListener(type, (e) => { if (type !== 'keydown' || e.key !== 'Escape') e.stopPropagation(); });
  }

  /** Take the numbers over when all are readable; else mark the unreadable ones and keep the field open. */
  function apply() {
    const values = {};
    let first = null;
    for (const { key, input, error } of inputs) {
      const parsed = parseNumber(input.value);
      const ok = parsed.ok && parsed.value !== null; // an empty field is not a number either
      mark(input, error, !ok);
      if (ok) values[key] = parsed.value;
      else if (!first) first = input;
    }
    if (first) {
      first.focus(); // nothing is taken over
      return;
    }
    finish();
    onApply(values);
  }

  // a form with two text fields and no submit button does not send itself on Enter: the key is handled here
  box.addEventListener('submit', (e) => e.preventDefault());
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === 'Enter' && e.target.matches('input')) {
      e.preventDefault();
      apply();
    }
  });

  // a click beside the field, or the focus leaving it, throws the input away
  const outside = (e) => { if (!box.contains(e.target)) finish(); };
  document.addEventListener('pointerdown', outside, true);
  box.addEventListener('focusout', (e) => { if (e.relatedTarget && !box.contains(e.relatedTarget)) finish(); });

  function finish() {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    box.remove();
    onClose();
  }

  host.append(box);
  // place it at the node, inside the host
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  box.style.left = `${Math.max(4, Math.min(anchor.x + 12, host.clientWidth - width - 4))}px`;
  box.style.top = `${Math.max(4, Math.min(anchor.y + 12, host.clientHeight - height - 4))}px`;
  inputs[0].input.focus();
  inputs[0].input.select();

  return { close: finish };
}
