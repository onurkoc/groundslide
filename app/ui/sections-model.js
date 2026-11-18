// Input areas Project, Ground, Bottom, Materials, Layers, Water, Loads, Seismic
// (SPEC_ETAPPE2 5.1). Each builder returns the nodes for the body of its <details>.

import { h, numberInput, textInput, selectInput, numberField, textField, checkbox, iconButton } from './widgets.js';
import { editableTable } from './table.js';
import {
  setNumber, setGammaW, setText, setPointValue, deleteAt, insertPointAfter,
  insertMaterialAfter, deleteMaterial, renameMaterial, setMaterialModel,
  insertLayerAfter, deleteLayer, setLayerMaterial, layerBoundary, setWaterEnabled, insertLoadAfter, materialIds,
  setOptionalNumber, setCrackEnabled, setCrackWaterPercent, fillToPercent,
} from '../lib/edit.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const listOf = (value) => (Array.isArray(value) ? value : []);

/** Table of [x, z] points (ground, layer boundary, water, polyline of a single surface). `list(model)` returns the (created) list. */
export function pointTable(ctx, { path, section, ariaLabel, read, list, focusPrefix }) {
  const points = listOf(read(ctx.model()));
  const clear = [`${path}[`];
  const scope = [section];
  const edit = (mutate, focus) => ctx.edit(mutate, { structural: true, scope, clearInvalid: clear, focus });
  return editableTable(ctx, {
    path,
    ariaLabel,
    columns: [{ label: 'x (m)', num: true }, { label: 'z (m)', num: true }],
    count: points.length,
    rowPath: (i) => `${path}[${i}]`,
    cells: (i) => [0, 1].map((axis) => numberInput(ctx, {
      path: `${path}[${i}][${axis}]`,
      ariaLabel: `${axis === 0 ? 'x' : 'z'} ${i + 1}`,
      get: (m) => listOf(read(m))[i]?.[axis],
      set: (m, parsed) => setPointValue(list(m), i, axis, parsed),
    })),
    onInsert: (i) => edit((m) => insertPointAfter(list(m), i), [`${path}[${i + 1}][0]`]),
    onDelete: (i) => edit((m) => deleteAt(list(m), i), [`${path}[${Math.min(i, points.length - 2)}][0]`, `${path}:add`]),
  });
}

export function buildProject(ctx) {
  return [
    textField(ctx, { label: ctx.t('ui.f.name'), path: 'meta.name', get: (m) => (typeof m.meta?.name === 'string' ? m.meta.name : ''), set: (m, v) => setText(m, ['meta', 'name'], v) }),
    textField(ctx, { label: ctx.t('ui.f.description'), path: 'meta.description', multiline: true, get: (m) => (typeof m.meta?.description === 'string' ? m.meta.description : ''), set: (m, v) => setText(m, ['meta', 'description'], v) }),
  ];
}

export function buildGround(ctx) {
  return [pointTable(ctx, {
    path: 'ground', section: 'ground', ariaLabel: ctx.t('ui.section.ground'),
    read: (m) => m.ground,
    list: (m) => { if (!Array.isArray(m.ground)) m.ground = []; return m.ground; },
  })];
}

export function buildBottom(ctx) {
  return [numberField(ctx, { label: ctx.t('ui.f.bottom'), unit: 'm', path: 'bottom', get: (m) => m.bottom, set: (m, p) => setNumber(m, ['bottom'], p) })];
}

// ---------- materials ----------

export function buildMaterials(ctx) {
  const ids = materialIds(ctx.model());
  const scope = ['materials', 'layers'];
  const modelOptions = [{ value: 'drained', label: ctx.t('ui.mat.drained') }, { value: 'undrained', label: ctx.t('ui.mat.undrained') }];
  const num = (state, key, label) => numberInput(ctx, {
    path: `materials.${state.id}.${key}`,
    ariaLabel: `${label} ${state.id}`,
    get: (m) => m.materials?.[state.id]?.[key],
    set: (m, parsed) => setNumber(m, ['materials', state.id, key], parsed),
  });
  const states = ids.map((id) => ({ id }));

  const table = editableTable(ctx, {
    path: 'materials',
    ariaLabel: ctx.t('ui.section.materials'),
    columns: [
      { label: 'ID' }, { label: ctx.t('ui.col.name') }, { label: 'γ (kN/m³)', num: true }, { label: 'γ_sat (kN/m³)', num: true },
      { label: ctx.t('ui.col.model') }, { label: "c′ (kPa)", num: true }, { label: 'φ′ (°)', num: true }, { label: 'c_u (kPa)', num: true },
    ],
    count: ids.length,
    rowPath: (i) => `materials.${states[i].id}`,
    cells: (i) => {
      const state = states[i];
      const material = ctx.model().materials[state.id];
      const kind = isObject(material) ? material.model : undefined;
      const drained = kind === 'drained';
      const undrained = kind === 'undrained';
      const idInput = textInput(ctx, {
        path: `materials.${state.id}.id`,
        ariaLabel: `ID ${state.id}`,
        get: () => state.id,
        commit: 'change',
        onCommit: (value, input) => {
          if (value === state.id) { ctx.invalid.delete(`materials.${state.id}.id`); ctx.markInput(input, null); return; }
          const old = state.id;
          const free = value.trim() !== '' && !Object.hasOwn(ctx.model().materials, value);
          if (free) {
            ctx.edit((m) => renameMaterial(m, old, value));
            ctx.invalid.delete(`materials.${old}.id`);
            state.id = value;
            // paths of the row follow the new id (the table is not rebuilt, the focus stays)
            for (const el of input.closest('tr').querySelectorAll('[data-path]')) el.dataset.path = el.dataset.path.replace(`materials.${old}`, `materials.${value}`);
            input.closest('tr').dataset.path = `materials.${value}`;
            ctx.markInput(input, null);
            ctx.renderSections(['layers']);
          } else {
            ctx.invalid.set(`materials.${old}.id`, { text: value, code: 'APP_MATERIAL_ID_INVALID' });
            ctx.markInput(input, 'APP_MATERIAL_ID_INVALID');
            ctx.revalidate();
          }
        },
      });
      const model = selectInput(ctx, {
        path: `materials.${state.id}.model`,
        ariaLabel: `${ctx.t('ui.col.model')} ${state.id}`,
        options: modelOptions,
        value: kind,
        onChange: (value) => ctx.edit((m) => setMaterialModel(m, state.id, value), { structural: true, scope: ['materials'], focus: [`materials.${state.id}.model`] }),
      });
      return [
        idInput,
        textInput(ctx, { path: `materials.${state.id}.name`, ariaLabel: `${ctx.t('ui.col.name')} ${state.id}`, get: (m) => (typeof m.materials?.[state.id]?.name === 'string' ? m.materials[state.id].name : ''), set: (m, v) => setText(m, ['materials', state.id, 'name'], v) }),
        num(state, 'gamma', 'γ'),
        num(state, 'gammaSat', 'γ_sat'),
        model,
        drained ? num(state, 'c', "c′") : null,
        drained ? num(state, 'phi', 'φ′') : null,
        undrained ? num(state, 'cu', 'c_u') : null,
      ];
    },
    onInsert: (i) => {
      let created;
      ctx.edit((m) => { created = insertMaterialAfter(m, i >= 0 ? states[i].id : null); }, { structural: true, scope, clearInvalid: ['materials.'], focus: () => [`materials.${created}.id`] });
    },
    onDelete: (i) => {
      const next = states[i + 1] || states[i - 1];
      ctx.edit((m) => deleteMaterial(m, states[i].id), { structural: true, scope, clearInvalid: ['materials.'], focus: [next ? `materials.${next.id}.id` : 'materials:add', 'materials:add'] });
    },
    addLabel: ctx.t('ui.table.add'),
  });
  return [table];
}

// ---------- layers ----------

export function buildLayers(ctx) {
  const layers = listOf(ctx.model().layers);
  const ids = materialIds(ctx.model());
  const scope = ['layers'];
  const cards = layers.map((layer, k) => {
    const n = k + 1;
    const select = selectInput(ctx, {
      path: `layers[${k}].material`,
      ariaLabel: `${ctx.t('ui.layer.material')} ${n}`,
      options: [{ value: '', label: ctx.t('ui.select.none') }, ...ids.map((id) => ({ value: id, label: id }))],
      value: isObject(layer) ? layer.material : undefined,
      onChange: (value) => ctx.edit((m) => setLayerMaterial(m, k, value)),
    });
    const head = h('div', { class: 'layer-head' }, [
      h('strong', { text: ctx.t('ui.layer.title', { n }) }),
      h('div', { class: 'field-control layer-material' }, [select]),
      iconButton({ name: 'plus', label: ctx.t('ui.layer.insertAfter', { n }), onClick: () => ctx.edit((m) => insertLayerAfter(m, k), { structural: true, scope, clearInvalid: ['layers['], focus: [`layers[${k + 1}].material`] }) }),
      iconButton({ name: 'trash', label: ctx.t('ui.layer.delete', { n }), danger: true, onClick: () => ctx.edit((m) => deleteLayer(m, k), { structural: true, scope, clearInvalid: ['layers['], focus: [`layers[${Math.min(k, layers.length - 2)}].material`, 'layers:add'] }) }),
    ]);
    const body = k === 0
      ? h('p', { class: 'hint', text: ctx.t('ui.layer.topNote') })
      : [h('p', { class: 'hint', text: ctx.t('ui.layer.boundary') }), pointTable(ctx, {
          path: `layers[${k}].top`, section: 'layers', ariaLabel: `${ctx.t('ui.layer.boundary')} ${n}`,
          read: (m) => m.layers?.[k]?.top,
          list: (m) => layerBoundary(m, k),
        })];
    return h('div', { class: 'layer', 'data-path': `layers[${k}]` }, [head, ...[].concat(body)]);
  });
  const add = h('button', { type: 'button', class: 'btn btn-small', 'data-path': 'layers:add', onClick: () => ctx.edit((m) => insertLayerAfter(m, layers.length - 1), { structural: true, scope, clearInvalid: ['layers['], focus: [`layers[${layers.length}].material`] }) }, [h('span', { text: `+ ${ctx.t('ui.layer.add')}` })]);
  return [h('div', { class: 'layers', 'data-path': 'layers' }, cards), h('div', { class: 'table-actions' }, [add])];
}

// ---------- water ----------

export function buildWater(ctx) {
  const m = ctx.model();
  const on = m.water !== null && m.water !== undefined;
  const nodes = [
    checkbox({
      label: ctx.t('ui.water.on'), checked: on, path: 'water:switch',
      onChange: (checked) => ctx.edit((model) => setWaterEnabled(model, checked, ctx.stash), { structural: true, scope: ['water'], focus: ['water:switch'] }),
    }),
  ];
  if (on) {
    nodes.push(pointTable(ctx, {
      path: 'water', section: 'water', ariaLabel: ctx.t('ui.water.on'),
      read: (model) => model.water,
      list: (model) => { if (!Array.isArray(model.water)) model.water = []; return model.water; },
    }));
  }
  nodes.push(numberField(ctx, {
    label: ctx.t('ui.f.gammaW'), unit: 'kN/m³', path: 'gammaW', placeholder: '9.81',
    get: (model) => model.gammaW, set: (model, p) => setGammaW(model, p),
  }));
  return nodes;
}

// ---------- loads ----------

export function buildLoads(ctx) {
  const loads = listOf(ctx.model().loads);
  const scope = ['loads'];
  const num = (i, key, label) => numberInput(ctx, {
    path: `loads[${i}].${key}`, ariaLabel: `${label} ${i + 1}`,
    get: (m) => m.loads?.[i]?.[key],
    set: (m, parsed) => setNumber(m, ['loads', i, key], parsed),
  });
  return [editableTable(ctx, {
    path: 'loads',
    ariaLabel: ctx.t('ui.section.loads'),
    columns: [{ label: 'x1 (m)', num: true }, { label: 'x2 (m)', num: true }, { label: 'q (kPa)', num: true }, { label: ctx.t('ui.col.type') }],
    count: loads.length,
    rowPath: (i) => `loads[${i}]`,
    cells: (i) => [
      num(i, 'x1', 'x1'), num(i, 'x2', 'x2'), num(i, 'q', 'q'),
      selectInput(ctx, {
        path: `loads[${i}].type`, ariaLabel: `${ctx.t('ui.col.type')} ${i + 1}`,
        options: [{ value: '', label: ctx.t('ui.select.none') }, { value: 'G', label: ctx.t('ui.load.typeG') }, { value: 'Q', label: ctx.t('ui.load.typeQ') }],
        value: isObject(loads[i]) ? loads[i].type : undefined,
        onChange: (value) => ctx.edit((m) => setText(m, ['loads', i, 'type'], value === '' ? null : value)),
      }),
    ],
    onInsert: (i) => ctx.edit((m) => insertLoadAfter(m, i), { structural: true, scope, clearInvalid: ['loads['], focus: [`loads[${i + 1}].x1`] }),
    onDelete: (i) => ctx.edit((m) => deleteAt(m.loads, i), { structural: true, scope, clearInvalid: ['loads['], focus: [`loads[${Math.min(i, loads.length - 2)}].x1`, 'loads:add'] }),
  })];
}

export function buildSeismic(ctx) {
  return [
    numberField(ctx, { label: ctx.t('ui.f.kh'), path: 'seismic.kh', get: (m) => m.seismic?.kh, set: (m, p) => setNumber(m, ['seismic', 'kh'], p) }),
    // vertical coefficient k_v, positive downwards (SPEC_ETAPPE4 7, 11): empty removes the field (default 0)
    numberField(ctx, { label: ctx.t('ui.f.kv'), path: 'seismic.kv', placeholder: '0', get: (m) => m.seismic?.kv, set: (m, p) => setOptionalNumber(m, ['seismic', 'kv'], p) }),
    h('p', { class: 'hint', text: ctx.t('ui.f.kvHint') }),
  ];
}

// ---------- tension crack (SPEC_ETAPPE4 6, 11) ----------

export function buildTensionCrack(ctx) {
  const crack = ctx.model().tensionCrack;
  const on = crack !== undefined && crack !== null;
  const nodes = [
    checkbox({
      label: ctx.t('ui.crack.on'), checked: on, path: 'tensionCrack:switch',
      onChange: (checked) => ctx.edit((m) => setCrackEnabled(m, checked, ctx.stash), { structural: true, scope: ['tensionCrack'], focus: ['tensionCrack:switch'] }),
    }),
  ];
  if (on) {
    nodes.push(
      numberField(ctx, { label: ctx.t('ui.crack.depth'), unit: 'm', path: 'tensionCrack.depth', get: (m) => m.tensionCrack?.depth, set: (m, p) => setNumber(m, ['tensionCrack', 'depth'], p) }),
      // the field holds percent (0 to 100), the model waterFill = percent / 100
      numberField(ctx, { label: ctx.t('ui.crack.water'), unit: '%', path: 'tensionCrack.waterFill', get: (m) => fillToPercent(m.tensionCrack?.waterFill), set: (m, p) => setCrackWaterPercent(m, p) }),
    );
  }
  return nodes;
}
