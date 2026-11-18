// Input field of a support element in the sketch (SPEC_ETAPPE3 9, double click on a line or band): all properties of the
// element as in its table row (id, numbers with units, head, the two forms of the nail's bond, partial factors only in mode
// sia). Enter takes the values over (one step of the history, done by the caller), Esc or a click beside it throws them away.
// Numbers as in SPEC_ETAPPE2 5.3 (point or comma); an empty field is empty (null) as in the table, an unreadable number marks
// the field with APP_NUMBER_INVALID and nothing is taken over. No snapping.

import { parseNumber, formatNumber } from '../lib/numbers.js';
import { translate } from '../lib/i18n.js';
import { SUPPORT_FIELDS, factorPlaceholder, supportFormValues } from '../lib/supports-edit.js';
import { h } from './widgets.js';

const BOND_INPUTS = { bondTau: 'tau', bondDiameter: 'diameter', bondQ: 'q' };

/**
 * host      element the field is placed in (position: relative); `anchor` {x, y} in pixels of the host
 * support   the element in the model (read only here)
 * stash     what the inputs remember in the session (bond values of the form that is not chosen)
 * sia       partial factors are shown (mode sia)
 * lang      language of the texts
 * onApply(form)  Enter with readable numbers: the values as supportFormValues() gives them (factors only with `sia`)
 * onClose()      the field is gone (after Enter, Esc, a click beside it, focus moved away)
 * Returns { close() }.
 */
export function openSupportEditor({ host, anchor, support, stash, sia, lang, onApply, onClose }) {
  const t = (key, params) => translate(lang, key, params);
  const type = support.type;
  const initial = supportFormValues(support, stash);
  let closed = false;

  const labelOf = (f) => (f.label ? (f.label.startsWith('ui.') ? t(f.label) : f.label) : f.key);
  const makeInput = (value, placeholder) => {
    const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder });
    input.value = formatNumber(value);
    return input;
  };
  const makeSelect = (options, value) => {
    const select = h('select', {}, options.map((o) => h('option', { value: o.value, text: o.label })));
    select.value = value;
    return select;
  };

  /** One line: name, control, unit, error text. */
  const rows = [];
  const row = ({ key, name, control, unit, number = false }) => {
    const error = h('span', { class: 'node-editor-error', hidden: true });
    const el = h('div', { class: 'node-editor-row support-editor-row' }, [
      h('label', { class: 'node-editor-label' }, [h('span', { class: 'support-editor-key', text: name }), control, h('span', { class: 'node-editor-unit', text: unit || '' })]),
      error,
    ]);
    if (number) control.addEventListener('input', () => mark(control, error, false));
    const entry = { key, control, error, el, number };
    rows.push(entry);
    return entry;
  };

  function mark(input, error, bad) {
    input.classList.toggle('is-invalid', bad);
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    error.hidden = !bad;
    error.textContent = bad ? t('APP_NUMBER_INVALID') : '';
  }

  // id
  const idInput = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' });
  idInput.value = initial.id;
  row({ key: 'id', name: 'ID', control: idInput });

  let formSelect = null;
  const bondRows = [];
  for (const f of SUPPORT_FIELDS[type]) {
    if (f.kind === 'number') {
      row({ key: f.key, name: labelOf(f), control: makeInput(initial.numbers[f.key]), unit: f.unit, number: true });
    } else if (f.kind === 'bond') {
      formSelect = makeSelect([{ value: 'tauD', label: t('ui.sup.bondTauD') }, { value: 'q', label: t('ui.sup.bondQ') }], initial.bondForm);
      row({ key: 'bondForm', name: labelOf(f), control: formSelect });
    } else if (BOND_INPUTS[f.kind]) {
      const entry = row({ key: f.key, name: labelOf(f), control: makeInput(initial.bond[BOND_INPUTS[f.kind]]), unit: f.unit, number: true });
      entry.bondKey = BOND_INPUTS[f.kind];
      bondRows.push(entry);
    } else if (f.kind === 'hasHead') {
      const value = initial.hasHead === true ? 'true' : initial.hasHead === false ? 'false' : '';
      row({ key: 'hasHead', name: labelOf(f), control: makeSelect([{ value: '', label: t('ui.select.none') }, { value: 'true', label: t('ui.sup.yes') }, { value: 'false', label: t('ui.sup.no') }], value) });
    } else if (f.kind === 'factor' && sia) {
      const entry = row({ key: f.key, name: labelOf(f), control: makeInput(initial.factors[f.key], factorPlaceholder(type, f.key)), number: true });
      entry.factor = true;
    }
  }

  /** Only the inputs of the chosen form of the bond are shown. */
  function showBondForm() {
    const q = formSelect.value === 'q';
    for (const r of bondRows) r.el.hidden = (r.bondKey === 'q') !== q;
  }
  if (formSelect) {
    formSelect.addEventListener('change', showBondForm);
    showBondForm();
  }

  const box = h('form', { class: 'node-editor support-editor', role: 'dialog', 'aria-label': t('ui.sup.dialog'), novalidate: true }, [
    h('strong', { class: 'support-editor-title', text: `${t('ui.sup.dialog')}: ${t(`ui.sup.type.${type}`)}` }),
    h('div', { class: 'support-editor-fields' }, rows.map((r) => r.el)),
    h('p', { class: 'hint node-editor-hint', text: sia ? `${t('ui.edit.hint')} ${t('ui.sup.factorsDefault')}` : t('ui.edit.hint') }),
  ]);

  // what happens in the field stays in the field: no panning, zooming or key commands of the sketch
  for (const type2 of ['pointerdown', 'pointermove', 'pointerup', 'dblclick', 'click', 'wheel', 'keydown', 'keyup']) {
    box.addEventListener(type2, (e) => { if (type2 !== 'keydown' || e.key !== 'Escape') e.stopPropagation(); });
  }

  /** Read all fields; when one number is unreadable, mark it and keep the field open. */
  function apply() {
    const form = { id: idInput.value, numbers: {}, hasHead: null, bondForm: formSelect ? formSelect.value : null, bond: { ...initial.bond }, factors: sia ? {} : undefined };
    let first = null;
    for (const r of rows) {
      if (r.key === 'id') continue;
      if (r.key === 'bondForm') continue;
      if (r.key === 'hasHead') {
        form.hasHead = r.control.value === 'true' ? true : r.control.value === 'false' ? false : null;
        continue;
      }
      if (!r.number) continue;
      const parsed = parseNumber(r.control.value);
      const hidden = r.el.hidden; // the form of the bond that is not chosen: its text is kept if readable, not reported
      if (!parsed.ok && !hidden) {
        mark(r.control, r.error, true);
        if (!first) first = r.control;
        continue;
      }
      const value = parsed.ok ? parsed.value : null;
      mark(r.control, r.error, false);
      if (r.bondKey) form.bond[r.bondKey] = value;
      else if (r.factor) form.factors[r.key] = value;
      else form.numbers[r.key] = value;
    }
    if (first) {
      first.focus(); // nothing is taken over
      return;
    }
    finish();
    onApply(form);
  }

  box.addEventListener('submit', (e) => e.preventDefault());
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === 'Enter' && e.target.matches('input, select')) {
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
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  box.style.left = `${Math.max(4, Math.min(anchor.x + 12, host.clientWidth - width - 4))}px`;
  box.style.top = `${Math.max(4, Math.min(anchor.y + 12, host.clientHeight - height - 4))}px`;
  const firstInput = rows.find((r) => r.key !== 'id' && !r.el.hidden && r.control.matches('input'));
  (firstInput ? firstInput.control : idInput).focus();

  return { close: finish };
}
