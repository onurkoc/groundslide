// Input areas Analysis, Partial factors, Search, Single surfaces (SPEC_ETAPPE2 5.1, SPEC_ETAPPE4 11).

import { h, numberInput, textInput, selectInput, selectField, numberField, checkbox } from './widgets.js';
import { editableTable } from './table.js';
import { setNumber, setText, setMethod, setSearchEnabled, setOptimizeEnabled, insertSurfaceAfter, deleteAt, setSurfaceType, surfaceKindOf, surfaceStashKey, surfacePoints } from '../lib/edit.js';
import { gammaEditable } from '../lib/paths.js';
import { pointTable } from './sections-model.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const listOf = (value) => (Array.isArray(value) ? value : []);

export function buildAnalysis(ctx) {
  const analysis = isObject(ctx.model().analysis) ? ctx.model().analysis : {};
  const methods = Array.isArray(analysis.methods) ? analysis.methods : [];
  const int = (key, label) => numberField(ctx, {
    label, path: `analysis.${key}`, get: (m) => m.analysis?.[key], set: (m, p) => setNumber(m, ['analysis', key], p),
  });
  return [
    selectField(ctx, {
      label: ctx.t('ui.an.mode'), path: 'analysis.mode', value: analysis.mode,
      options: [{ value: 'characteristic', label: ctx.t('ui.an.characteristic') }, { value: 'sia', label: ctx.t('ui.an.sia') }],
      onChange: (value) => ctx.edit((m) => setText(m, ['analysis', 'mode'], value), { visibility: true }),
    }),
    h('fieldset', { class: 'check-group', 'data-path': 'analysis.methods' }, [
      h('legend', { text: ctx.t('ui.an.methods') }),
      ...['bishop', 'janbu', 'spencer'].map((name) => checkbox({
        label: name === 'bishop' ? 'Bishop' : name === 'janbu' ? 'Janbu' : 'Spencer',
        checked: methods.includes(name), path: `analysis.methods.${name}`,
        onChange: (checked) => ctx.edit((m) => setMethod(m, name, checked)),
      })),
      h('span', { class: 'field-error', hidden: true }),
    ]),
    selectField(ctx, {
      label: ctx.t('ui.an.direction'), path: 'analysis.direction', value: analysis.direction,
      options: [
        { value: 'auto', label: ctx.t('ui.an.auto') },
        { value: 'left', label: ctx.t('ui.an.left') },
        { value: 'right', label: ctx.t('ui.an.right') },
      ],
      onChange: (value) => ctx.edit((m) => setText(m, ['analysis', 'direction'], value)),
    }),
    int('slices', ctx.t('ui.an.slices')),
    int('tolerance', ctx.t('ui.an.tolerance')),
    int('maxIterations', ctx.t('ui.an.maxIterations')),
  ];
}

const FACTORS = [
  ['phi', 'ui.pf.phi'], ['c', 'ui.pf.c'], ['cu', 'ui.pf.cu'], ['gamma', 'ui.pf.gamma'], ['G', 'ui.pf.G'], ['Q', 'ui.pf.Q'], ['R', 'ui.pf.R'],
];

/** Partial factors: shown only in mode "sia" (see inputs.js); values stay in the model in mode "characteristic". */
export function buildPartialFactors(ctx) {
  const note = h('p', { class: 'hint', 'data-pf-note': '', text: ctx.t('ui.pf.onlySia'), hidden: ctx.model().analysis?.mode === 'sia' });
  const fields = FACTORS.map(([key, textKey]) => {
    if (key === 'gamma') {
      // fixed 1.0 (SPEC 4): not editable; editable while the model holds another value, until it is 1.0 (SPEC_ETAPPE2 5.1)
      const field = numberField(ctx, {
        label: ctx.t(textKey), path: 'partialFactors.gamma', readonly: !gammaEditable(ctx.model().partialFactors), placeholder: '1',
        get: (m) => m.partialFactors?.gamma, set: (m, p) => setNumber(m, ['partialFactors', 'gamma'], p),
        onEdited: (parsed, input) => { if (parsed.ok && parsed.value === 1) input.readOnly = true; },
      });
      return field;
    }
    return numberField(ctx, {
      label: ctx.t(textKey), path: `partialFactors.${key}`,
      get: (m) => m.partialFactors?.[key], set: (m, p) => setNumber(m, ['partialFactors', key], p),
    });
  });
  return [note, ...fields];
}

export function buildSearch(ctx) {
  const search = ctx.model().search;
  const off = search === null || search === undefined;
  const nodes = [
    checkbox({
      label: ctx.t('ui.search.off'), checked: off, path: 'search:switch',
      onChange: (checked) => ctx.edit((m) => setSearchEnabled(m, !checked, ctx.stash), { structural: true, scope: ['search'], focus: ['search:switch'] }),
    }),
  ];
  if (off) return nodes;
  const grid = (key, label, unit) => numberField(ctx, {
    label, unit, path: `search.grid.${key}`, get: (m) => m.search?.grid?.[key], set: (m, p) => setNumber(m, ['search', 'grid', key], p),
  });
  nodes.push(
    h('fieldset', { class: 'grid-fields', 'data-path': 'search.grid' }, [
      h('legend', { text: ctx.t('ui.search.grid') }),
      grid('xMin', ctx.t('ui.search.xMin'), 'm'), grid('xMax', ctx.t('ui.search.xMax'), 'm'),
      grid('zMin', ctx.t('ui.search.zMin'), 'm'), grid('zMax', ctx.t('ui.search.zMax'), 'm'),
      grid('nx', ctx.t('ui.search.nx')), grid('nz', ctx.t('ui.search.nz')),
      h('span', { class: 'field-error', hidden: true }),
    ]),
    numberField(ctx, { label: ctx.t('ui.search.radii'), path: 'search.radii', get: (m) => m.search?.radii, set: (m, p) => setNumber(m, ['search', 'radii'], p) }),
  );
  // search A (SPEC_ETAPPE4 5, 11): optimise the governing circle to a polyline; the number of points (default 11) stays in the session
  const optimizing = search.optimize !== undefined && search.optimize !== null;
  nodes.push(checkbox({
    label: ctx.t('ui.search.optimize'), checked: optimizing, path: 'search.optimize:switch',
    onChange: (checked) => ctx.edit((m) => setOptimizeEnabled(m, checked, ctx.stash), { structural: true, scope: ['search'], focus: ['search.optimize:switch'] }),
  }));
  if (optimizing) {
    nodes.push(numberField(ctx, {
      label: ctx.t('ui.search.optimizePoints'), path: 'search.optimize.points',
      get: (m) => m.search?.optimize?.points, set: (m, p) => setNumber(m, ['search', 'optimize', 'points'], p),
    }));
  }
  return nodes;
}

export function buildSurfaces(ctx) {
  const surfaces = listOf(ctx.model().surfaces);
  const scope = ['surfaces'];
  const open = (ctx.stash.surfaceOpen = ctx.stash.surfaceOpen || {}); // polylines whose point table is open: { [id]: true }
  const num = (i, key, label) => numberInput(ctx, {
    path: `surfaces[${i}].${key}`, ariaLabel: `${label} ${i + 1}`,
    get: (m) => m.surfaces?.[i]?.[key], set: (m, parsed) => setNumber(m, ['surfaces', i, key], parsed),
  });
  const kinds = surfaces.map((s) => surfaceKindOf(s));
  const table = editableTable(ctx, {
    path: 'surfaces',
    ariaLabel: ctx.t('ui.section.surfaces'),
    columns: [{ label: 'ID', cls: 'surf-id' }, { label: ctx.t('ui.col.type'), cls: 'surf-type' }, { label: 'x_c (m)', num: true }, { label: 'z_c (m)', num: true }, { label: 'R (m)', num: true }],
    count: surfaces.length,
    rowPath: (i) => `surfaces[${i}]`,
    cells: (i) => {
      const circle = kinds[i] === 'circle';
      return [
        textInput(ctx, { path: `surfaces[${i}].id`, ariaLabel: `ID ${i + 1}`, get: (m) => (typeof m.surfaces?.[i]?.id === 'string' ? m.surfaces[i].id : ''), set: (m, v) => setText(m, ['surfaces', i, 'id'], v) }),
        selectInput(ctx, {
          path: `surfaces[${i}].type`, ariaLabel: `${ctx.t('ui.col.type')} ${i + 1}`,
          options: [{ value: 'circle', label: ctx.t('ui.surf.circle') }, { value: 'polyline', label: ctx.t('ui.surf.polyline') }],
          value: kinds[i],
          onChange: (value) => {
            // the table of points of a new polyline is open; the values of the kind that is left stay in the session
            if (value === 'polyline') open[surfaceStashKey(surfaces[i], i)] = true;
            ctx.edit((m) => setSurfaceType(m, i, value, ctx.stash), { structural: true, scope, clearInvalid: ['surfaces['], focus: [`surfaces[${i}].type`] });
          },
        }),
        circle ? num(i, 'xc', 'x_c') : null,
        circle ? num(i, 'zc', 'z_c') : null,
        circle ? num(i, 'R', 'R') : null,
      ];
    },
    onInsert: (i) => ctx.edit((m) => insertSurfaceAfter(m, i), { structural: true, scope, clearInvalid: ['surfaces['], focus: [`surfaces[${i + 1}].id`] }),
    onDelete: (i) => ctx.edit((m) => deleteAt(m.surfaces, i), { structural: true, scope, clearInvalid: ['surfaces['], focus: [`surfaces[${Math.min(i, surfaces.length - 2)}].id`, 'surfaces:add'] }),
  });
  // a table of points per polyline, below the table of the surfaces, closed or open (like a layer boundary)
  const polylines = surfaces.map((s, i) => (kinds[i] === 'polyline'
    ? h('details', {
      class: 'surface-points', open: open[surfaceStashKey(s, i)] === true,
      onToggle: (e) => { open[surfaceStashKey(ctx.model().surfaces?.[i], i)] = e.target.open; },
    }, [
      h('summary', { text: ctx.t('ui.surf.points', { id: typeof s.id === 'string' && s.id !== '' ? s.id : `#${i + 1}`, n: Array.isArray(s.points) ? s.points.length : 0 }) }),
      pointTable(ctx, {
        path: `surfaces[${i}].points`, section: 'surfaces', ariaLabel: ctx.t('ui.surf.points', { id: typeof s.id === 'string' ? s.id : '', n: Array.isArray(s.points) ? s.points.length : 0 }),
        read: (m) => m.surfaces?.[i]?.points,
        list: (m) => surfacePoints(m, i),
      }),
    ])
    : null));
  return [table, ...polylines.filter(Boolean)];
}
