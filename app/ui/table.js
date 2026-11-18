// Compact table with fixed header row, insert after the current row, delete
// (SPEC_ETAPPE2 1.3). Used by all tables of the input.

import { h, iconButton } from './widgets.js';

/**
 * Editable table.
 *  path        error path of the whole table, e.g. "ground"
 *  columns     [{ label, num, cls }] header cells (label may contain the unit; cls: extra class of the column)
 *  count       number of rows
 *  rowPath(i)  error path of a row, e.g. "ground[2]"
 *  cells(i)    one node (or null) per column
 *  onInsert(i) insert after row i (i = -1: add at the end of an empty table)
 *  onDelete(i) delete row i
 *  addLabel    text of the add button below the table
 * Rows can be reached with the keyboard: Tab, and arrow up/down in the same column.
 */
export function editableTable(ctx, { path, columns, count, rowPath, cells, onInsert, onDelete, addLabel, ariaLabel }) {
  const head = h('tr', {}, [
    h('th', { class: 'num idx', text: '#', scope: 'col' }),
    ...columns.map((c) => h('th', { class: [c.num ? 'num' : '', c.cls || ''].join(' ').trim(), text: c.label, scope: 'col' })),
    h('th', { class: 'actions', scope: 'col' }, [h('span', { class: 'visually-hidden', text: ctx.t('ui.table.add') })]),
  ]);

  const rows = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const cellNodes = cells(i);
    rows.push(h('tr', { 'data-path': rowPath(i) }, [
      h('td', { class: 'num idx', text: String(n) }),
      ...columns.map((c, k) => h('td', { class: [c.num ? 'num' : '', c.cls || ''].join(' ').trim() }, cellNodes[k] ? [cellNodes[k]] : [])),
      h('td', { class: 'actions' }, [
        iconButton({ name: 'plus', label: ctx.t('ui.table.insertRow', { n }), onClick: () => onInsert(i) }),
        iconButton({ name: 'trash', label: ctx.t('ui.table.deleteRow', { n }), danger: true, onClick: () => onDelete(i) }),
      ]),
    ]));
  }

  const table = h('table', { class: 'compact', 'aria-label': ariaLabel }, [
    h('thead', {}, [head]),
    h('tbody', {}, rows),
  ]);

  table.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'text') return;
    const cell = input.closest('td');
    const row = input.closest('tr');
    const target = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
    if (!cell || !target || target.parentElement !== row.parentElement) return;
    const next = target.children[cell.cellIndex]?.querySelector('input[type="text"]');
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.select();
  });

  return h('div', { class: 'table-block', 'data-path': path }, [
    count === 0 ? h('p', { class: 'hint', text: ctx.t('ui.table.empty') }) : h('div', { class: 'table-wrap' }, [table]),
    h('div', { class: 'table-actions' }, [
      h('button', { type: 'button', class: 'btn btn-small', 'data-path': `${path}:add`, onClick: () => onInsert(count - 1) }, [
        h('span', { text: `+ ${addLabel || ctx.t('ui.table.add')}` }),
      ]),
    ]),
  ]);
}
