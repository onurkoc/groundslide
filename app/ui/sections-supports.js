// Input area Supports (SPEC_ETAPPE3 8): one table per type (nails, anchors, piles, shotcrete), rows inserted and deleted as for
// the loads. A new row has a free id and everything else empty. The columns of the partial factors are shown in mode "sia"
// only (inputs.js toggles the class "show-factors" of the root element). The nail's bond has two forms, chosen per row.

import { h, numberInput, textInput, selectInput, iconButton } from './widgets.js';
import { editableTable } from './table.js';
import { supportFactorsVisible } from '../lib/paths.js';
import {
  SUPPORT_TYPES, SUPPORT_FIELDS, factorPlaceholder, supportsOfType, otherSupports,
  insertSupportAfter, deleteSupport, renameSupport, setSupportNumber, setSupportFactor, setSupportHasHead, bondForm, setBondForm,
} from '../lib/supports-edit.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const TITLE_KEY = { nail: 'ui.sup.nails', anchor: 'ui.sup.anchors', pile: 'ui.sup.piles', shotcrete: 'ui.sup.shotcrete' };

/** Name of a field: an interface text (key starting with "ui.") or the symbol itself. */
const labelOf = (ctx, field) => (field.label ? (field.label.startsWith('ui.') ? ctx.t(field.label) : field.label) : field.key);

/** Text of a column head: the name with the unit. */
const columnLabel = (ctx, field) => (field.unit ? `${labelOf(ctx, field)} (${field.unit})` : labelOf(ctx, field));

/** Columns of numbers are aligned right; the choices (bond form, head) are not. */
const isNumeric = (field) => field.kind !== 'bond' && field.kind !== 'hasHead';

/** Cell of one field of one row; null when the field has no input in this row (the bond form that is not chosen). */
function cell(ctx, type, field, row) {
  const i = row.index;
  const path = `supports[${i}].${field.key}`;
  const aria = `${labelOf(ctx, field)} ${row.support.id ?? ''}`.trim();
  const scope = ['supports'];
  switch (field.kind) {
    case 'number':
    case 'bondTau':
    case 'bondDiameter':
    case 'bondQ': {
      if (field.kind !== 'number') {
        const form = bondForm(row.support.bond);
        if ((field.kind === 'bondQ') !== (form === 'q')) return null; // only the inputs of the chosen form
      }
      return numberInput(ctx, {
        path, ariaLabel: aria,
        get: (m) => (field.key.startsWith('bond.') ? m.supports?.[i]?.bond?.[field.key.slice(5)] : m.supports?.[i]?.[field.key]),
        set: (m, parsed) => setSupportNumber(m, i, field.key, parsed),
      });
    }
    case 'factor':
      return numberInput(ctx, {
        path, ariaLabel: aria, placeholder: factorPlaceholder(type, field.key),
        get: (m) => m.supports?.[i]?.[field.key],
        set: (m, parsed) => setSupportFactor(m, i, field.key, parsed),
      });
    case 'hasHead': {
      const value = row.support.hasHead;
      return selectInput(ctx, {
        path, ariaLabel: aria,
        options: [{ value: '', label: ctx.t('ui.select.none') }, { value: 'true', label: ctx.t('ui.sup.yes') }, { value: 'false', label: ctx.t('ui.sup.no') }],
        value: typeof value === 'boolean' ? String(value) : value === undefined || value === null ? undefined : String(value),
        onChange: (v) => ctx.edit((m) => setSupportHasHead(m, i, v)),
      });
    }
    case 'bond':
      return selectInput(ctx, {
        path, ariaLabel: aria,
        options: [{ value: 'tauD', label: ctx.t('ui.sup.bondTauD') }, { value: 'q', label: ctx.t('ui.sup.bondQ') }],
        value: bondForm(row.support.bond),
        onChange: (v) => ctx.edit((m) => setBondForm(m, i, v, ctx.stash), { structural: true, scope, clearInvalid: [`supports[${i}].bond`], focus: [path] }),
      });
    default:
      return null;
  }
}

/** The table of one type. */
function typeTable(ctx, type) {
  const rows = supportsOfType(ctx.model(), type);
  const scope = ['supports'];
  const fields = SUPPORT_FIELDS[type];
  const columns = [
    { label: 'ID' },
    ...fields.map((f) => ({ label: columnLabel(ctx, f), num: isNumeric(f), cls: f.kind === 'factor' ? 'col-factor' : isNumeric(f) ? undefined : 'col-choice' })),
  ];
  const idPath = (i) => `supports[${rows[i].index}].id`;
  return editableTable(ctx, {
    path: `supports:${type}`,
    ariaLabel: ctx.t(TITLE_KEY[type]),
    columns,
    count: rows.length,
    rowPath: (i) => `supports[${rows[i].index}]`,
    cells: (i) => [
      textInput(ctx, {
        path: idPath(i), ariaLabel: `ID ${i + 1}`,
        get: (m) => (typeof m.supports?.[rows[i].index]?.id === 'string' ? m.supports[rows[i].index].id : ''),
        set: (m, v) => renameSupport(m, rows[i].index, v, ctx.stash),
      }),
      ...fields.map((f) => cell(ctx, type, f, rows[i])),
    ],
    onInsert: (i) => {
      let created;
      ctx.edit((m) => { created = insertSupportAfter(m, type, i); }, { structural: true, scope, clearInvalid: ['supports['], focus: () => [`supports[${created.index}].id`] });
    },
    onDelete: (i) => {
      const next = rows[i + 1] || rows[i - 1];
      ctx.edit((m) => deleteSupport(m, rows[i].index, ctx.stash), {
        structural: true, scope, clearInvalid: ['supports['],
        focus: [...(next ? [`supports[${next.index - (rows[i + 1] ? 1 : 0)}].id`] : []), `supports:${type}:add`],
      });
    },
    addLabel: ctx.t('ui.table.add'),
  });
}

/** Entries that no table shows (unknown type, no object): they can only be deleted. */
function otherEntries(ctx) {
  const others = otherSupports(ctx.model());
  if (!others.length) return null;
  return h('div', { class: 'support-type', 'data-path': 'supports:other' }, [
    h('h3', { text: ctx.t('ui.sup.other') }),
    h('p', { class: 'hint', text: ctx.t('ui.sup.otherHint') }),
    h('ul', { class: 'support-other' }, others.map((o) => h('li', { 'data-path': o.object ? `supports[${o.index}].type` : `supports[${o.index}]` }, [
      h('span', { text: `${ctx.t('ui.sup.otherEntry', { n: o.index + 1 })}${o.id ? ` ${o.id}` : ''}${o.type ? ` (${o.type})` : ''}` }),
      iconButton({
        name: 'trash', label: ctx.t('ui.sup.deleteOther', { n: o.index + 1 }), danger: true,
        onClick: () => ctx.edit((m) => deleteSupport(m, o.index, ctx.stash), { structural: true, scope: ['supports'], clearInvalid: ['supports['] }),
      }),
    ]))),
  ]);
}

export function buildSupports(ctx) {
  const m = ctx.model();
  const root = h('div', { class: 'supports-root', 'data-supports-root': '' }, [
    ...SUPPORT_TYPES.map((type) => h('div', { class: 'support-type' }, [h('h3', { text: ctx.t(TITLE_KEY[type]) }), typeTable(ctx, type)])),
    otherEntries(ctx),
  ]);
  root.classList.toggle('show-factors', supportFactorsVisible(isObject(m.analysis) ? m.analysis.mode : undefined, ctx.errors()));
  return [root];
}
