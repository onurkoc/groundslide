// Editing functions of the input (SPEC_ETAPPE2 5.1): result at the model, and
// "edit, then counter edit gives the original again".

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setNumber, setGammaW, setText, setPointValue, insertPointAfter, deleteAt, insertGroundPointAfter,
  insertLoadAfter, insertSurfaceAfter, insertMaterialAfter, deleteMaterial, renameMaterial, setMaterialModel, nextMaterialId,
  insertLayerAfter, deleteLayer, setLayerMaterial, layerBoundary, setWaterEnabled, setSearchEnabled, setMethod, emptySearch, materialIds,
} from '../../app/lib/edit.js';
import { parseNumber } from '../../app/lib/numbers.js';
import { validateModel } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';

const P = parseNumber;
const b1 = () => loadBenchmark('B1_homogeneous');
const b3 = () => loadBenchmark('B3_two_layers');

test('setNumber: value, empty -> null, unreadable -> null; objects on the path are created', () => {
  const m = b1();
  setNumber(m, ['bottom'], P('-5,5'));
  assert.equal(m.bottom, -5.5);
  setNumber(m, ['bottom'], P(''));
  assert.equal(m.bottom, null);
  setNumber(m, ['bottom'], P('1,2,3'));
  assert.equal(m.bottom, null);
  setNumber(m, ['analysis', 'slices'], P('30'));
  assert.equal(m.analysis.slices, 30);
  setNumber(m, ['seismic', 'kh'], P('0.15'));
  assert.equal(m.seismic.kh, 0.15);
  const empty = {};
  setNumber(empty, ['search', 'grid', 'nx'], P('7'));
  assert.deepEqual(empty, { search: { grid: { nx: 7 } } });
});

test('setNumber: a non-integer count stays in the model (the core reports it)', () => {
  const m = b1();
  setNumber(m, ['search', 'grid', 'nx'], P('2,5'));
  assert.equal(m.search.grid.nx, 2.5);
  const r = validateModel(m);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.code === 'E_SEARCH_INVALID'));
});

test('setGammaW: empty removes the field, unreadable stores null, value stores it', () => {
  const m = b1();
  setGammaW(m, P('9,5'));
  assert.equal(m.gammaW, 9.5);
  setGammaW(m, P('abc'));
  assert.equal(m.gammaW, null);
  setGammaW(m, P(''));
  assert.ok(!('gammaW' in m));
  assert.equal(validateModel(m).valid, true);
});

test('setText creates missing objects', () => {
  const m = {};
  setText(m, ['meta', 'name'], 'x');
  assert.deepEqual(m, { meta: { name: 'x' } });
});

test('point tables: insert after the current row, delete, set values', () => {
  const m = b1();
  const original = structuredClone(m);
  insertGroundPointAfter(m, 1);
  assert.deepEqual(m.ground, [[0, 30], [50, 30], [null, null], [80, 50], [130, 50]]);
  setPointValue(m.ground, 2, 0, P('65'));
  setPointValue(m.ground, 2, 1, P('40,5'));
  assert.deepEqual(m.ground[2], [65, 40.5]);
  setPointValue(m.ground, 2, 1, P('x'));
  assert.deepEqual(m.ground[2], [65, null]);
  deleteAt(m.ground, 2);
  assert.deepEqual(m, original);
  insertPointAfter(m.ground, -1);
  assert.deepEqual(m.ground[0], [null, null]);
  deleteAt(m.ground, 99); // out of range: nothing
  deleteAt(m.ground, -1);
  assert.equal(m.ground.length, 5);
});

test('new rows start empty and the core reports them', () => {
  const m = b1();
  insertGroundPointAfter(m, 0);
  assert.ok(validateModel(m).errors.some((e) => e.code === 'E_GROUND_INVALID'));
  const m2 = b1();
  insertLoadAfter(m2, -1);
  assert.deepEqual(m2.loads, [{ x1: null, x2: null, q: null, type: null }]);
  assert.ok(validateModel(m2).errors.some((e) => e.code === 'E_LOAD_INVALID'));
  const m3 = b1();
  m3.surfaces = undefined;
  insertSurfaceAfter(m3, -1);
  assert.deepEqual(m3.surfaces, [{ id: '', xc: null, zc: null, R: null }]);
});

test('loads and surfaces: insert after the current row', () => {
  const m = loadBenchmark('B5_surcharge');
  insertLoadAfter(m, 0);
  assert.equal(m.loads.length, 2);
  assert.equal(m.loads[0].x1, 80);
  assert.equal(m.loads[1].x1, null);
  const b = b1();
  insertSurfaceAfter(b, 0);
  assert.deepEqual(b.surfaces.map((s) => s.id), ['C1', '', 'S_bishop', 'S_janbu']);
});

// --- materials ---

test('nextMaterialId finds the first free id', () => {
  assert.equal(nextMaterialId(b1()), 'M2');
  assert.equal(nextMaterialId({ materials: { M1: {}, M3: {} } }), 'M2');
  assert.equal(nextMaterialId({}), 'M1');
});

test('insertMaterialAfter keeps the order and adds an empty drained material', () => {
  const m = b3();
  const id = insertMaterialAfter(m, 'M1');
  assert.equal(id, 'M3');
  assert.deepEqual(materialIds(m), ['M1', 'M3', 'M2']);
  assert.deepEqual(m.materials.M3, { name: '', gamma: null, gammaSat: null, model: 'drained', c: null, phi: null });
  assert.equal(insertMaterialAfter(m, null), 'M4');
  assert.deepEqual(materialIds(m), ['M1', 'M3', 'M2', 'M4']);
  // unused material with empty values: the core does not check unused materials
  assert.equal(validateModel(m).valid, true);
});

test('renameMaterial changes the references in the layers and keeps the order', () => {
  const m = b3();
  const original = structuredClone(m);
  assert.deepEqual(renameMaterial(m, 'M1', 'Sand'), { ok: true });
  assert.deepEqual(materialIds(m), ['Sand', 'M2']);
  assert.equal(m.layers[0].material, 'Sand');
  assert.equal(m.layers[1].material, 'M2');
  assert.equal(validateModel(m).valid, true);
  assert.deepEqual(renameMaterial(m, 'Sand', 'M1'), { ok: true });
  assert.deepEqual(m, original);
  assert.equal(JSON.stringify(m), JSON.stringify(original), 'also the key order');
});

test('renameMaterial refuses an empty or used id; the model stays unchanged', () => {
  const m = b3();
  const original = structuredClone(m);
  for (const bad of ['', '   ', 'M2']) {
    const r = renameMaterial(m, 'M1', bad);
    assert.deepEqual(r, { ok: false, code: 'APP_MATERIAL_ID_INVALID' }, JSON.stringify(bad));
    assert.deepEqual(m, original);
  }
  assert.equal(renameMaterial(m, 'nope', 'X').ok, false);
  assert.deepEqual(renameMaterial(m, 'M1', 'M1'), { ok: true });
});

test('deleteMaterial of a used material is allowed; the core reports E_MATERIAL_UNKNOWN', () => {
  const m = b3();
  deleteMaterial(m, 'M2');
  assert.deepEqual(materialIds(m), ['M1']);
  assert.equal(m.layers[1].material, 'M2', 'layers are not touched');
  assert.ok(validateModel(m).errors.some((e) => e.code === 'E_MATERIAL_UNKNOWN' && e.path === 'layers[1].material'));
});

test('setMaterialModel keeps the values of the other model', () => {
  const m = b1();
  const original = structuredClone(m);
  setMaterialModel(m, 'M1', 'undrained');
  assert.equal(m.materials.M1.model, 'undrained');
  assert.equal(m.materials.M1.c, 5);
  assert.equal(m.materials.M1.phi, 30);
  assert.ok(validateModel(m).errors.some((e) => e.code === 'E_MATERIAL_INVALID'), 'cu is missing');
  setNumber(m, ['materials', 'M1', 'cu'], P('40'));
  assert.equal(validateModel(m).valid, true, 'the core accepts the hidden values');
  m.materials.M1.cu = undefined;
  delete m.materials.M1.cu;
  setMaterialModel(m, 'M1', 'drained');
  assert.deepEqual(m, original);
});

// --- layers ---

test('insertLayerAfter / deleteLayer: boundary rules', () => {
  const m = b3();
  const original = structuredClone(m);
  insertLayerAfter(m, 0);
  assert.equal(m.layers.length, 3);
  assert.deepEqual(m.layers[1], { material: null, top: [] });
  assert.equal(m.layers[0].top, null);
  setLayerMaterial(m, 1, 'M2');
  assert.equal(m.layers[1].material, 'M2');
  deleteLayer(m, 1);
  assert.deepEqual(m, original);
});

test('deleting the top layer makes the next layer the top layer (top: null)', () => {
  const m = b3();
  deleteLayer(m, 0);
  assert.equal(m.layers.length, 1);
  assert.equal(m.layers[0].material, 'M2');
  assert.equal(m.layers[0].top, null);
  deleteLayer(m, 0);
  assert.deepEqual(m.layers, []);
  insertLayerAfter(m, -1);
  assert.deepEqual(m.layers, [{ material: null, top: null }]);
  insertLayerAfter(m, -1);
  assert.deepEqual(m.layers, [{ material: null, top: null }, { material: null, top: [] }]);
});

test('layerBoundary returns the list of a layer and creates it when missing', () => {
  const m = b3();
  assert.equal(layerBoundary(m, 1), m.layers[1].top);
  m.layers[1].top = null;
  assert.deepEqual(layerBoundary(m, 1), []);
  insertPointAfter(layerBoundary(m, 1), -1);
  assert.deepEqual(m.layers[1].top, [[null, null]]);
});

// --- switches ---

test('water: off -> null, on -> the last points of the session, otherwise an empty list', () => {
  const m = loadBenchmark('B2_water');
  const original = structuredClone(m);
  const stash = {};
  setWaterEnabled(m, false, stash);
  assert.equal(m.water, null);
  setWaterEnabled(m, true, stash);
  assert.deepEqual(m, original);

  const dry = b1();
  const dryOriginal = structuredClone(dry);
  const stash2 = {};
  setWaterEnabled(dry, true, stash2);
  assert.deepEqual(dry.water, []);
  assert.ok(validateModel(dry).errors.some((e) => e.code === 'E_WATER_INVALID'));
  setWaterEnabled(dry, false, stash2);
  assert.deepEqual(dry, dryOriginal);
});

test('search: off -> null, on -> the last values of the session, otherwise empty fields', () => {
  const m = b1();
  const original = structuredClone(m);
  const stash = {};
  setSearchEnabled(m, false, stash);
  assert.equal(m.search, null);
  assert.equal(validateModel(m).valid, true);
  setSearchEnabled(m, true, stash);
  assert.deepEqual(m, original);

  const off = loadBenchmark('H1_handcalc_dry');
  assert.equal(off.search, null);
  setSearchEnabled(off, true, {});
  assert.deepEqual(off.search, emptySearch());
  assert.ok(validateModel(off).errors.some((e) => e.code === 'E_SEARCH_INVALID'));
});

test('methods: switch on and off, order bishop, janbu, spencer', () => {
  const m = b1();
  const original = structuredClone(m);
  setMethod(m, 'spencer', true);
  assert.deepEqual(m.analysis.methods, ['bishop', 'janbu', 'spencer']);
  setMethod(m, 'bishop', false);
  setMethod(m, 'bishop', true);
  assert.deepEqual(m.analysis.methods, ['bishop', 'janbu', 'spencer']);
  setMethod(m, 'spencer', false);
  assert.deepEqual(m, original);
  setMethod(m, 'bishop', false);
  setMethod(m, 'janbu', false);
  assert.deepEqual(m.analysis.methods, []);
  assert.ok(validateModel(m).errors.some((e) => e.code === 'E_ANALYSIS_INVALID'));
});

test('B1 -> several edits -> counter edits -> B1 again (deepEqual)', () => {
  const m = b1();
  const original = structuredClone(m);
  // edits
  setPointValue(m.ground, 1, 0, P('55'));
  insertGroundPointAfter(m, 2);
  setNumber(m, ['bottom'], P('-10'));
  setMethod(m, 'spencer', true);
  setNumber(m, ['search', 'grid', 'nx'], P('11'));
  const stash = {};
  setSearchEnabled(m, false, stash);
  setWaterEnabled(m, true, {});
  setGammaW(m, P('10'));
  insertLoadAfter(m, -1);
  const id = insertMaterialAfter(m, 'M1');
  renameMaterial(m, 'M1', 'Sand');
  setMaterialModel(m, 'Sand', 'undrained');
  insertLayerAfter(m, 0);
  insertSurfaceAfter(m, 0);
  assert.notDeepEqual(m, original);
  // counter edits, in reverse order
  deleteAt(m.surfaces, 1);
  deleteLayer(m, 1);
  setMaterialModel(m, 'Sand', 'drained');
  renameMaterial(m, 'Sand', 'M1');
  deleteMaterial(m, id);
  deleteAt(m.loads, 0);
  setGammaW(m, P(''));
  setWaterEnabled(m, false, {});
  setSearchEnabled(m, true, stash);
  setNumber(m, ['search', 'grid', 'nx'], P('31'));
  setMethod(m, 'spencer', false);
  setNumber(m, ['bottom'], P('0'));
  deleteAt(m.ground, 3);
  setPointValue(m.ground, 1, 0, P('50'));
  assert.deepEqual(m, original);
});

test('setNumber and setText reach into lists of objects (loads, surfaces) without replacing the list', () => {
  const m = loadBenchmark('B5_surcharge');
  setNumber(m, ['loads', 0, 'q'], P('60'));
  setText(m, ['loads', 0, 'type'], 'G');
  assert.deepEqual(m.loads, [{ x1: 80, x2: 95, q: 60, type: 'G' }]);
  assert.ok(Array.isArray(m.loads));
  setNumber(m, ['surfaces', 1, 'R'], P('40,5'));
  assert.equal(m.surfaces[1].R, 40.5);
  assert.ok(Array.isArray(m.surfaces));
  setText(m, ['surfaces', 0, 'id'], 'X');
  assert.equal(m.surfaces[0].id, 'X');
});
