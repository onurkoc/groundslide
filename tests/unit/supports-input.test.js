// Order 22 (SPEC_ETAPPE3 8): input of the supports. Table <-> model, free id, empty new rows, the two forms of the nail's bond,
// empty partial factors, the field `supports` only while there is an element, file round trip, errors of the core at the fields.

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel } from '../../core/index.js';
import { DEFAULT_SUPPORT_FACTORS } from '../../core/model.js';
import { loadBenchmark } from './helpers.js';
import { parseNumber } from '../../app/lib/numbers.js';
import { readModel, writeModel } from '../../app/lib/model-io.js';
import { MESSAGES } from '../../app/lib/i18n.js';
import { SECTIONS, sectionForPath, countBySection, supportFactorsVisible } from '../../app/lib/paths.js';
import { createHistory, snapshotModel, modelFromSnapshot } from '../../app/lib/history.js';
import {
  SUPPORT_TYPES, SUPPORT_FIELDS, ID_PREFIX, FACTOR_DEFAULTS, supportsOfType, otherSupports, supportCount, nextSupportId, emptySupport,
  insertSupportAfter, deleteSupport, renameSupport, setSupportNumber, setSupportFactor, setSupportHasHead, bondForm, setBondForm,
  supportFormValues, applySupportForm, factorPlaceholder,
} from '../../app/lib/supports-edit.js';

const num = (text) => parseNumber(text);
const b1 = () => {
  const m = loadBenchmark('B1_homogeneous');
  delete m.expected;
  m.analysis.methods = ['bishop', 'janbu', 'spencer'];
  return m;
};

test('the default partial factors shown as placeholders are the ones of the core (SPEC_ETAPPE3 5)', () => {
  assert.deepEqual(FACTOR_DEFAULTS, DEFAULT_SUPPORT_FACTORS);
  assert.deepEqual(FACTOR_DEFAULTS, { nail: { gammaM: 1.35 }, anchor: { gammaM: 1.35, gammaA: 1.0 }, pile: { gammaM: 1.4 }, shotcrete: { gammaC: 1.5 } });
  // the placeholders as in the order: 1.35, 1.0, 1.4, 1.5
  assert.deepEqual([factorPlaceholder('nail', 'gammaM'), factorPlaceholder('anchor', 'gammaA'), factorPlaceholder('anchor', 'gammaM'), factorPlaceholder('pile', 'gammaM'), factorPlaceholder('shotcrete', 'gammaC')], ['1.35', '1.0', '1.35', '1.4', '1.5']);
});

test('the fields of the tables are exactly the fields of SPEC_ETAPPE3 2.1 per type: a full row makes a valid model', () => {
  const full = {
    nail: { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true },
    anchor: { id: 'A1', type: 'anchor', x: 65.5, z: 40.3, angle: 35, freeLength: 9, bondLength: 1, spacing: 1, P0: 40, Rk: 40 },
    pile: { id: 'P1', type: 'pile', x: 75, z: 46.6, length: 15, spacing: 1, shear: 20 },
    shotcrete: { id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 },
  };
  for (const type of SUPPORT_TYPES) {
    // every key of the element is a field of the table, and every number field of the table is in the element
    const keys = SUPPORT_FIELDS[type].filter((f) => f.kind === 'number' || f.kind === 'hasHead').map((f) => f.key);
    assert.deepEqual(Object.keys(full[type]).filter((k) => !['id', 'type', 'bond'].includes(k)).sort(), keys.sort(), type);
    const m = b1();
    m.supports = [full[type]];
    assert.deepEqual(validateModel(m).errors, [], type);
  }
  // partial factors: nail gammaM, anchor gammaA and gammaM, pile gammaM, shotcrete gammaC
  const factors = (type) => SUPPORT_FIELDS[type].filter((f) => f.kind === 'factor').map((f) => f.key);
  assert.deepEqual([factors('nail'), factors('anchor'), factors('pile'), factors('shotcrete')], [['gammaM'], ['gammaA', 'gammaM'], ['gammaM'], ['gammaC']]);
});

test('free id per type: N1, N2 ... A1 ... P1 ... S1; the first free one, unique among all supports', () => {
  const m = { supports: [] };
  assert.deepEqual(SUPPORT_TYPES.map((t) => nextSupportId(m, t)), ['N1', 'A1', 'P1', 'S1']);
  assert.deepEqual(ID_PREFIX, { nail: 'N', anchor: 'A', pile: 'P', shotcrete: 'S' });
  m.supports = [{ id: 'N1' }, { id: 'N3' }, { id: 'A1' }];
  assert.equal(nextSupportId(m, 'nail'), 'N2');
  assert.equal(nextSupportId(m, 'anchor'), 'A2');
  assert.equal(nextSupportId({}, 'pile'), 'P1', 'no list at all');
  // an id used by another type does not repeat either
  assert.equal(nextSupportId({ supports: [{ id: 'N1', type: 'pile' }] }, 'nail'), 'N2');
});

test('a new row: free id, everything else empty (numbers null, head not chosen), nothing added by the app', () => {
  const m = b1();
  const nail = insertSupportAfter(m, 'nail', -1);
  assert.deepEqual(nail, { index: 0, id: 'N1' });
  assert.deepEqual(m.supports[0], { id: 'N1', type: 'nail', x: null, z: null, angle: null, length: null, spacing: null, bond: { tau: null, diameter: null }, tensile: null, hasHead: null });
  insertSupportAfter(m, 'anchor', -1);
  insertSupportAfter(m, 'pile', -1);
  insertSupportAfter(m, 'shotcrete', -1);
  assert.deepEqual(m.supports.slice(1), [
    { id: 'A1', type: 'anchor', x: null, z: null, angle: null, freeLength: null, bondLength: null, spacing: null, P0: null, Rk: null },
    { id: 'P1', type: 'pile', x: null, z: null, length: null, spacing: null, shear: null },
    { id: 'S1', type: 'shotcrete', x1: null, x2: null, thickness: null, tau: null },
  ]);
  for (const s of m.supports) for (const key of ['gammaM', 'gammaA', 'gammaC']) assert.equal(Object.hasOwn(s, key), false, 'no partial factor is written');
  for (const type of SUPPORT_TYPES) assert.deepEqual(emptySupport(type, 'X'), m.supports.find((s) => s.type === type) && { ...emptySupport(type, 'X') });
});

test('insert after a row of a type: the element goes behind that row in the whole list; the order is kept', () => {
  const m = b1();
  m.supports = [
    { id: 'N1', type: 'nail' }, { id: 'P1', type: 'pile' }, { id: 'N2', type: 'nail' }, { id: 'A1', type: 'anchor' },
  ];
  assert.deepEqual(supportsOfType(m, 'nail').map((r) => [r.support.id, r.index]), [['N1', 0], ['N2', 2]]);
  const created = insertSupportAfter(m, 'nail', 0);
  assert.deepEqual(m.supports.map((s) => s.id), ['N1', 'N3', 'P1', 'N2', 'A1']);
  assert.deepEqual(created, { index: 1, id: 'N3' });
  insertSupportAfter(m, 'pile', -1); // table empty or "add at the end": at the end of the list
  assert.equal(m.supports.at(-1).id, 'P2');
});

test('no row in all four tables: `supports` is removed (model as in stage 2); a file with an empty list is left alone until edited', () => {
  const m = b1();
  assert.equal(Object.hasOwn(m, 'supports'), false);
  insertSupportAfter(m, 'pile', -1);
  assert.equal(Array.isArray(m.supports), true);
  deleteSupport(m, 0);
  assert.equal(Object.hasOwn(m, 'supports'), false, 'the field is removed with the last element');
  assert.deepEqual(m, b1(), 'insert and delete leave the model as it was');
  // empty list from a file: nothing happens by itself (round trip below), delete on it does nothing
  const empty = { supports: [] };
  deleteSupport(empty, 0);
  assert.deepEqual(empty, { supports: [] });
});

test('numbers: empty or unreadable input -> null (SPEC_ETAPPE2 5.1, 5.3); point and comma', () => {
  const m = b1();
  insertSupportAfter(m, 'nail', -1);
  setSupportNumber(m, 0, 'x', num('66,5'));
  setSupportNumber(m, 0, 'z', num('41.25'));
  setSupportNumber(m, 0, 'angle', num(''));
  setSupportNumber(m, 0, 'length', num('1,2,3'));
  assert.equal(m.supports[0].x, 66.5);
  assert.equal(m.supports[0].z, 41.25);
  assert.equal(m.supports[0].angle, null);
  assert.equal(m.supports[0].length, null);
  setSupportNumber(m, 0, 'bond.tau', num('80'));
  assert.deepEqual(m.supports[0].bond, { tau: 80, diameter: null });
});

test('partial factors: empty removes the field (default of the core, as gammaW), a number is written, unreadable is null', () => {
  const m = b1();
  insertSupportAfter(m, 'nail', -1);
  setSupportFactor(m, 0, 'gammaM', num('2'));
  assert.equal(m.supports[0].gammaM, 2);
  setSupportFactor(m, 0, 'gammaM', num(''));
  assert.equal(Object.hasOwn(m.supports[0], 'gammaM'), false);
  setSupportFactor(m, 0, 'gammaM', num('abc'));
  assert.equal(m.supports[0].gammaM, null);
  m.supports[0].gammaM = 1.5;
  setSupportFactor(m, 0, 'gammaM', num('0'));
  assert.equal(m.supports[0].gammaM, 0, 'the core reports E_SUPPORT_FACTORS, the app does not correct it');
  assert.ok(validateModel({ ...b1(), supports: [{ ...emptySupport('pile', 'P1'), x: 60, z: 40, length: 12, spacing: 2, shear: 200, gammaM: 0 }] }).errors.some((e) => e.code === 'E_SUPPORT_FACTORS' && e.path === 'supports[0].gammaM'));
});

test('"head present": not chosen is null, yes / no are booleans', () => {
  const m = b1();
  insertSupportAfter(m, 'nail', -1);
  assert.equal(m.supports[0].hasHead, null);
  setSupportHasHead(m, 0, 'true');
  assert.equal(m.supports[0].hasHead, true);
  setSupportHasHead(m, 0, 'false');
  assert.equal(m.supports[0].hasHead, false);
  setSupportHasHead(m, 0, '');
  assert.equal(m.supports[0].hasHead, null);
});

test('bond form: the values of the other form stay in the session and come back; the model holds only the chosen form', () => {
  const m = b1();
  const stash = {};
  insertSupportAfter(m, 'nail', -1);
  assert.equal(bondForm(m.supports[0].bond), 'tauD');
  setSupportNumber(m, 0, 'bond.tau', num('80'));
  setSupportNumber(m, 0, 'bond.diameter', num('0.1'));
  setBondForm(m, 0, 'q', stash);
  assert.deepEqual(m.supports[0].bond, { q: null }, 'only the chosen form in the model');
  assert.equal(bondForm(m.supports[0].bond), 'q');
  setSupportNumber(m, 0, 'bond.q', num('50'));
  setBondForm(m, 0, 'tauD', stash);
  assert.deepEqual(m.supports[0].bond, { tau: 80, diameter: 0.1 }, 'back: the values of tau and D are there again');
  setBondForm(m, 0, 'q', stash);
  assert.deepEqual(m.supports[0].bond, { q: 50 }, 'and q');
  // the rest of the element is not touched
  assert.deepEqual(Object.keys(m.supports[0]), ['id', 'type', 'x', 'z', 'angle', 'length', 'spacing', 'bond', 'tensile', 'hasHead']);
  // the core accepts exactly one form; tau without diameter is a missing field
  const bad = b1();
  bad.supports = [{ id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { tau: 80 }, tensile: 300, hasHead: true }];
  assert.deepEqual(validateModel(bad).errors.map((e) => [e.code, e.path]), [['E_SUPPORT_INVALID', 'supports[0].bond.diameter']]);
});

test('bond values follow a renamed id and go with a deleted element (a new N1 does not inherit them)', () => {
  const m = b1();
  const stash = {};
  insertSupportAfter(m, 'nail', -1);
  setSupportNumber(m, 0, 'bond.tau', num('80'));
  setSupportNumber(m, 0, 'bond.diameter', num('0.1'));
  setBondForm(m, 0, 'q', stash);
  renameSupport(m, 0, 'Nagel A', stash);
  assert.equal(m.supports[0].id, 'Nagel A');
  setBondForm(m, 0, 'tauD', stash);
  assert.deepEqual(m.supports[0].bond, { tau: 80, diameter: 0.1 });
  setBondForm(m, 0, 'q', stash);
  deleteSupport(m, 0, stash);
  insertSupportAfter(m, 'nail', -1);
  assert.equal(m.supports[0].id, 'N1');
  setBondForm(m, 0, 'q', stash);
  setBondForm(m, 0, 'tauD', stash);
  assert.deepEqual(m.supports[0].bond, { tau: null, diameter: null });
});

test('the form of a bond read from a file: only q is "q direct", everything else "tau and D"', () => {
  assert.equal(bondForm({ q: 50 }), 'q');
  assert.equal(bondForm({ tau: 80, diameter: 0.1 }), 'tauD');
  assert.equal(bondForm({ tau: 80, diameter: 0.1, q: 50 }), 'tauD');
  assert.equal(bondForm({}), 'tauD');
  assert.equal(bondForm(undefined), 'tauD');
});

test('the field of an element: values as in the table, applied in one change; factors only when they are shown', () => {
  const m = b1();
  m.supports = [{ id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true, gammaM: 1.5 }];
  const stash = {};
  const form = supportFormValues(m.supports[0], stash);
  assert.deepEqual(form, {
    id: 'N1', numbers: { x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, tensile: 300 }, hasHead: true, bondForm: 'q',
    bond: { tau: null, diameter: null, q: 50 }, factors: { gammaM: 1.5 },
  });
  // change: other form of the bond with tau and D, no head, factor emptied
  form.id = 'N7';
  form.numbers.angle = 45;
  form.hasHead = false;
  form.bondForm = 'tauD';
  form.bond = { tau: 90, diameter: 0.12, q: 50 };
  form.factors.gammaM = null;
  assert.equal(applySupportForm(m, 0, form, stash), true);
  assert.deepEqual(m.supports[0], { id: 'N7', type: 'nail', x: 66, z: 40.6, angle: 45, length: 15, spacing: 1, bond: { tau: 90, diameter: 0.12 }, tensile: 300, hasHead: false });
  // q stays in the session, and comes back in the field and in the table
  assert.equal(supportFormValues(m.supports[0], stash).bond.q, 50);
  setBondForm(m, 0, 'q', stash);
  assert.deepEqual(m.supports[0].bond, { q: 50 });
  // without `factors` (mode characteristic) a factor of the element stays
  m.supports[0].gammaM = 1.7;
  const form2 = supportFormValues(m.supports[0], stash);
  delete form2.factors;
  form2.numbers.x = 67;
  applySupportForm(m, 0, form2, stash);
  assert.equal(m.supports[0].gammaM, 1.7);
  assert.equal(m.supports[0].x, 67);
  // a missing element
  assert.equal(applySupportForm(m, 5, form, stash), false);
});

test('the field works for anchor, pile and shotcrete too', () => {
  const m = b1();
  m.supports = [
    { id: 'A1', type: 'anchor', x: 65, z: 40, angle: 35, freeLength: 9, bondLength: 1, spacing: 1, P0: 40, Rk: 40 },
    { id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 },
  ];
  const a = supportFormValues(m.supports[0]);
  assert.deepEqual(a.numbers, { x: 65, z: 40, angle: 35, freeLength: 9, bondLength: 1, spacing: 1, P0: 40, Rk: 40 });
  assert.equal(a.bondForm, null);
  a.numbers.P0 = 30;
  a.factors.gammaA = 1.1;
  applySupportForm(m, 0, a);
  assert.deepEqual([m.supports[0].P0, m.supports[0].gammaA], [30, 1.1]);
  const s = supportFormValues(m.supports[1]);
  s.numbers.x2 = 85;
  applySupportForm(m, 1, s);
  assert.deepEqual([m.supports[1].x1, m.supports[1].x2], [50, 85]);
});

test('entries that no table shows: not an object or an unknown type; delete only', () => {
  const m = b1();
  m.supports = [{ id: 'N1', type: 'nail' }, 5, { id: 'X', type: 'cable' }, { id: 'P1' }];
  assert.deepEqual(otherSupports(m), [
    { index: 1, id: '', type: '', object: false },
    { index: 2, id: 'X', type: 'cable', object: true },
    { index: 3, id: 'P1', type: '', object: true },
  ]);
  assert.equal(supportCount(m), 4);
  assert.equal(supportCount({}), 0);
  deleteSupport(m, 1);
  assert.equal(m.supports.length, 3);
});

test('file: the order of `supports` and every other field stay as they are, also with an empty list; `expected` stays', () => {
  const original = loadBenchmark('S6_piles');
  const text = JSON.stringify(original);
  const r = readModel(text);
  assert.equal(r.ok, true);
  assert.deepEqual(supportsOfType(r.model, 'pile').map((x) => x.support.id), ['P1', 'P2', 'P3', 'P4']);
  const written = JSON.parse(writeModel(r.model));
  assert.deepEqual(written.supports, original.supports);
  assert.deepEqual(written.expected, original.expected);
  assert.deepEqual(written, { formatVersion: 1, ...original });
  // an edit through the table functions changes only that value
  setSupportNumber(r.model, 2, 'shear', num('25'));
  assert.deepEqual(r.model.supports.map((s) => s.shear), [20, 20, 25, 20]);
  assert.deepEqual(r.model.supports.map((s) => s.id), ['P1', 'P2', 'P3', 'P4']);
  // a model without supports gets no field, an empty list stays an empty list
  const plain = loadBenchmark('B1_homogeneous');
  assert.equal(Object.hasOwn(JSON.parse(writeModel(readModel(JSON.stringify(plain)).model)), 'supports'), false);
  const withEmpty = { ...plain, supports: [] };
  assert.deepEqual(JSON.parse(writeModel(readModel(JSON.stringify(withEmpty)).model)).supports, []);
});

test('mixed list from a file: every type shows in its own table, the whole list keeps its order after an edit', () => {
  const m = loadBenchmark('S3_three_nails');
  const nails = supportsOfType(m, 'nail');
  assert.equal(nails.length, 3);
  setSupportNumber(m, nails[1].index, 'spacing', num('2'));
  assert.deepEqual(m.supports.map((s) => s.id), ['N1', 'N2', 'N3']);
  assert.equal(m.supports[1].spacing, 2);
});

test('undo and redo (SPEC_ETAPPE2 6.1): the whole model is the state, supports and unknown fields come back', () => {
  const m = loadBenchmark('S1_nail_head');
  const history = createHistory();
  const before = snapshotModel(m);
  setSupportNumber(m, 0, 'x', num('60'));
  history.record(before);
  insertSupportAfter(m, 'pile', -1);
  history.record(snapshotModel({ ...m, supports: m.supports.slice(0, 1) }));
  const back = modelFromSnapshot(history.undo(snapshotModel(m)));
  assert.equal(back.supports.length, 1);
  assert.equal(back.supports[0].x, 60);
  assert.ok(back.expected, 'expected survives');
  const first = modelFromSnapshot(history.undo(snapshotModel(back)));
  assert.deepEqual(first, loadBenchmark('S1_nail_head'));
});

test('errors of the core at supports: the path leads to the area Supports, E_SUPPORT_METHODS to Analysis; every code has a text in DE and EN', () => {
  const m = b1();
  m.analysis.methods = ['bishop'];
  for (const type of SUPPORT_TYPES) insertSupportAfter(m, type, -1);
  const { errors } = validateModel(m);
  const codes = new Set(errors.map((e) => e.code));
  for (const code of ['E_SUPPORT_INVALID', 'E_SUPPORT_METHODS']) assert.ok(codes.has(code), code);
  for (const e of errors) {
    assert.equal(sectionForPath(e.path), e.code === 'E_SUPPORT_METHODS' ? 'analysis' : 'supports', `${e.code} ${e.path}`);
    assert.ok(SECTIONS.includes(sectionForPath(e.path)));
    for (const lang of ['de', 'en']) assert.equal(typeof MESSAGES[lang][e.code], 'string', `${lang} ${e.code}`);
  }
  assert.equal(countBySection(errors).supports > 0, true);
  assert.equal(countBySection(errors).analysis, 1);
  // every error path of a new row is the path of a field of the table (or of its row), so that the error stands at the field
  const fieldPaths = new Set();
  m.supports.forEach((s, i) => {
    fieldPaths.add(`supports[${i}]`);
    for (const f of SUPPORT_FIELDS[s.type]) fieldPaths.add(`supports[${i}].${f.key}`);
    fieldPaths.add(`supports[${i}].id`);
  });
  for (const e of errors.filter((x) => x.code !== 'E_SUPPORT_METHODS')) assert.ok(fieldPaths.has(e.path), `${e.code} ${e.path}`);
});

test('every other error code of supports reaches a field of the row: id, type, bond, angle, factors, out of the model', () => {
  const base = { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true };
  const cases = [
    [{ id: '' }, 'E_SUPPORT_ID', 'supports[0].id'],
    [{ angle: 95 }, 'E_SUPPORT_ANGLE', 'supports[0].angle'],
    [{ bond: { tau: 1, diameter: 0.1, q: 2 } }, 'E_SUPPORT_BOND', 'supports[0].bond'],
    [{ gammaM: 0 }, 'E_SUPPORT_FACTORS', 'supports[0].gammaM'],
    [{ x: 500 }, 'E_SUPPORT_OUT_OF_MODEL', 'supports[0].x'],
    [{ z: 100 }, 'E_SUPPORT_OUT_OF_MODEL', 'supports[0].z'],
    [{ hasHead: null }, 'E_SUPPORT_INVALID', 'supports[0].hasHead'],
  ];
  for (const [change, code, path] of cases) {
    const m = b1();
    m.supports = [{ ...base, ...change }];
    const hit = validateModel(m).errors.find((e) => e.code === code);
    assert.ok(hit, `${code} for ${JSON.stringify(change)}`);
    assert.equal(hit.path, path);
    assert.equal(sectionForPath(hit.path), 'supports');
  }
});

test('partial-factor columns: shown in mode sia, or when one of them has an error', () => {
  assert.equal(supportFactorsVisible('sia', []), true);
  assert.equal(supportFactorsVisible('characteristic', []), false);
  assert.equal(supportFactorsVisible(undefined, [{ path: 'supports[0].x' }]), false);
  assert.equal(supportFactorsVisible('characteristic', [{ path: 'supports[2].gammaM' }]), true);
  assert.equal(supportFactorsVisible('characteristic', [{ path: 'supports[0].gammaC' }]), true);
  assert.equal(supportFactorsVisible('characteristic', [{ path: 'partialFactors.gamma' }]), false);
});
