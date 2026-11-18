// Small building blocks for the input parts: element helper, icons, fields.

import { parseNumber, formatNumber } from '../lib/numbers.js';

/** Create an element. props: class, text, on<Event>, any attribute; false / null / undefined are skipped. */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

// Inline SVG symbols (no image files). Static strings, no user data.
const ICONS = {
  plus: '<path d="M8 3v10M3 8h10"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5M7 7v4M9 7v4"/>',
  file: '<path d="M4 2h5l3 3v9H4zM9 2v3h3"/>',
  folder: '<path d="M2 4.5h4l1.5 1.5H14v7H2z"/>',
  save: '<path d="M3 3h8l2 2v8H3zM5.5 3v3.5h4V3M5.5 13V9.5h5V13"/>',
  play: '<path d="M5 3l8 5-8 5z"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5V3.5h-7v7h2"/>',
  download: '<path d="M8 2v8M4.5 7l3.5 3.5L11.5 7M3 13h10"/>',
  fullscreen: '<path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/>',
  undo: '<path d="M5.5 3L2.5 6l3 3M2.5 6h7a3.5 3.5 0 010 7H6"/>',
  redo: '<path d="M10.5 3l3 3-3 3M13.5 6h-7a3.5 3.5 0 000 7H10"/>',
  fit: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
  zoomIn: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M7 5v4M5 7h4"/>',
  zoomOut: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4"/>',
};

/** Inline SVG icon (16 px, colour of the text). */
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/** Button with a symbol and an accessible name (also as tooltip). */
export function iconButton({ name, label, onClick, danger = false, path }) {
  return h('button', { type: 'button', class: `btn btn-icon${danger ? ' btn-icon-danger' : ''}`, 'aria-label': label, title: label, 'data-path': path, onClick }, [icon(name)]);
}

let counter = 0;
const uid = (prefix) => `${prefix}-${++counter}`;

/**
 * Number input. Shows the value unrounded with a point (or the unreadable text of
 * the session); reads point or comma. ctx: { invalid: Map, edit, markInput }.
 */
export function numberInput(ctx, { path, get, set, placeholder, readonly = false, ariaLabel, onEdited }) {
  const entry = ctx.invalid.get(path);
  const input = h('input', {
    type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
    'data-path': path, placeholder, 'aria-label': ariaLabel, readonly,
  });
  input.value = entry ? entry.text : formatNumber(get(ctx.model()));
  if (!readonly) {
    input.addEventListener('input', () => {
      const parsed = parseNumber(input.value);
      if (parsed.ok) ctx.invalid.delete(path);
      else ctx.invalid.set(path, { text: input.value, code: 'APP_NUMBER_INVALID' });
      ctx.markInput(input, parsed.ok ? null : 'APP_NUMBER_INVALID');
      ctx.edit((model) => set(model, parsed));
      if (onEdited) onEdited(parsed, input);
    });
  }
  if (entry) ctx.markInput(input, entry.code);
  return input;
}

/** Text input (name, description, id); `commit` is the event that writes to the model. */
export function textInput(ctx, { path, get, set, ariaLabel, multiline = false, commit = 'input', onCommit }) {
  const input = h(multiline ? 'textarea' : 'input', { 'data-path': path, 'aria-label': ariaLabel, autocomplete: 'off', spellcheck: 'false', ...(multiline ? { rows: '2' } : { type: 'text' }) });
  const entry = ctx.invalid.get(path);
  input.value = entry ? entry.text : get(ctx.model());
  input.addEventListener(commit, () => {
    if (onCommit) onCommit(input.value, input);
    else ctx.edit((model) => set(model, input.value));
  });
  if (entry) ctx.markInput(input, entry.code);
  return input;
}

/** Select. `options` = [{ value, label }]; a current value that is not listed is added so it stays visible. */
export function selectInput(ctx, { path, options, value, onChange, ariaLabel }) {
  const list = [...options];
  if (value !== undefined && value !== null && !list.some((o) => o.value === value)) list.push({ value: String(value), label: String(value) });
  const select = h('select', { 'data-path': path, 'aria-label': ariaLabel },
    list.map((o) => h('option', { value: o.value, text: o.label, selected: o.value === (value ?? '') })));
  select.value = value ?? '';
  select.addEventListener('change', () => onChange(select.value, select));
  return select;
}

/** Labelled field with the unit inside the control on the right and a line for the error text. */
export function field(ctx, { label, unit, control, path }) {
  const id = uid('f');
  control.id = id;
  return h('div', { class: 'field', 'data-field': path }, [
    h('label', { for: id, text: label }),
    h('div', { class: 'field-control' }, [control, unit ? h('span', { class: 'field-unit', text: unit }) : null]),
    h('span', { class: 'field-error', hidden: true }),
  ]);
}

/** Number field with label and unit. */
export function numberField(ctx, { label, unit, path, get, set, placeholder, readonly, onEdited }) {
  const input = numberInput(ctx, { path, get, set, placeholder, readonly, ariaLabel: label, onEdited });
  return field(ctx, { label, unit, control: input, path });
}

/** Text field with label. */
export function textField(ctx, opts) {
  const control = textInput(ctx, { ...opts, ariaLabel: opts.label });
  const id = uid('f');
  control.id = id;
  return h('div', { class: 'field', 'data-field': opts.path }, [
    h('label', { for: id, text: opts.label }),
    h('div', { class: 'field-control field-control-text' }, [control]),
    h('span', { class: 'field-error', hidden: true }),
  ]);
}

/** Select field with label. */
export function selectField(ctx, { label, path, options, value, onChange }) {
  const select = selectInput(ctx, { path, options, value, onChange, ariaLabel: label });
  const id = uid('f');
  select.id = id;
  return h('div', { class: 'field', 'data-field': path }, [
    h('label', { for: id, text: label }),
    h('div', { class: 'field-control' }, [select]),
    h('span', { class: 'field-error', hidden: true }),
  ]);
}

/** Checkbox with label text. */
export function checkbox({ label, checked, onChange, path }) {
  const input = h('input', { type: 'checkbox', 'data-path': path, checked });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked, input));
  return h('label', { class: 'check' }, [input, h('span', { text: label })]);
}
