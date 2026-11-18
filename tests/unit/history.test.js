// Undo and redo of the model (SPEC_ETAPPE2 6.1): steps, limit, dropping of the later steps, groups of keystrokes, and the
// snapshot of the model (nothing is lost: unknown fields, order of the keys; U2).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, snapshotModel, modelFromSnapshot, HISTORY_LIMIT } from '../../app/lib/history.js';
import { createNewModel, writeModel, readModel } from '../../app/lib/model-io.js';
import { loadBenchmark } from './helpers.js';

/** A tiny page: a value, changed step by step; every change records the state before it. */
function page(initial = 0) {
  const h = createHistory();
  const p = { value: initial, h };
  p.change = (to, group = null) => { h.record(String(p.value), group); p.value = to; };
  p.undo = () => { const s = h.undo(String(p.value)); if (s !== null) p.value = Number(s); return s !== null; };
  p.redo = () => { const s = h.redo(String(p.value)); if (s !== null) p.value = Number(s); return s !== null; };
  return p;
}

test('a new history has nothing to undo or redo; undo and redo of an empty history do nothing', () => {
  const h = createHistory();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo('now'), null);
  assert.equal(h.redo('now'), null);
  assert.equal(h.undoSteps, 0);
});

test('back and forth over several steps', () => {
  const p = page(0);
  p.change(1);
  p.change(2);
  p.change(3);
  assert.equal(p.h.undoSteps, 3);
  assert.equal(p.undo() && p.value, 2);
  assert.equal(p.undo() && p.value, 1);
  assert.equal(p.h.canRedo, true);
  assert.equal(p.redo() && p.value, 2);
  assert.equal(p.redo() && p.value, 3);
  assert.equal(p.redo(), false, 'nothing after the last step');
  assert.equal(p.value, 3);
  for (let i = 0; i < 3; i++) assert.equal(p.undo(), true);
  assert.equal(p.value, 0);
  assert.equal(p.undo(), false, 'nothing before the first step');
  assert.equal(p.value, 0);
  assert.equal(p.h.canUndo, false);
  assert.equal(p.h.canRedo, true);
});

test('a new change after "back" drops the steps that were undone', () => {
  const p = page(0);
  p.change(1);
  p.change(2);
  p.change(3);
  p.undo();
  p.undo();
  assert.equal(p.value, 1);
  assert.equal(p.h.redoSteps, 2);
  p.change(10);
  assert.equal(p.h.canRedo, false, 'the later steps are gone');
  assert.equal(p.redo(), false);
  assert.equal(p.undo() && p.value, 1);
  assert.equal(p.undo() && p.value, 0);
});

test('limit: at least 100 steps are kept, the oldest fall out beyond the limit', () => {
  assert.ok(HISTORY_LIMIT >= 100);
  const p = page(0);
  for (let i = 1; i <= 100; i++) p.change(i);
  assert.equal(p.h.undoSteps, 100, '100 steps are all there');
  for (let i = 0; i < 100; i++) assert.equal(p.undo(), true);
  assert.equal(p.value, 0, 'back to the very first state after 100 steps');
  // beyond the limit
  const q = page(0);
  const small = createHistory({ limit: 5 });
  for (let i = 1; i <= 8; i++) { small.record(String(i - 1)); }
  assert.equal(small.undoSteps, 5);
  let state = '8';
  const seen = [];
  for (let s = small.undo(state); s !== null; s = small.undo(state)) { seen.push(s); state = s; }
  assert.deepEqual(seen, ['7', '6', '5', '4', '3'], 'the three oldest states are gone');
  assert.equal(q.h.undoSteps, 0);
});

test('groups: the keystrokes of one field are one step; another field, or leaving the field, makes a new step', () => {
  const p = page(0);
  p.change(1, 'ground[0][0]');
  p.change(12, 'ground[0][0]');
  p.change(125, 'ground[0][0]');
  assert.equal(p.h.undoSteps, 1, 'typing "125" is one step');
  p.change(7, 'ground[1][0]');
  assert.equal(p.h.undoSteps, 2, 'another field');
  p.h.breakGroup();
  p.change(8, 'ground[1][0]');
  assert.equal(p.h.undoSteps, 3, 'the field was left and entered again');
  p.change(9); // a change without a group (drag, insert, delete) is its own step
  p.change(10);
  assert.equal(p.h.undoSteps, 5);
  // undo goes back to the state before the whole group
  assert.equal(p.undo() && p.value, 9);
  assert.equal(p.undo() && p.value, 8);
  assert.equal(p.undo() && p.value, 7);
  assert.equal(p.undo() && p.value, 125, 'before the second field: the whole typing of the first is one step');
  assert.equal(p.undo() && p.value, 0);
});

test('undo, redo and clear end a group', () => {
  const p = page(0);
  p.change(1, 'a');
  p.undo();
  p.redo();
  p.change(2, 'a');
  assert.equal(p.h.undoSteps, 2, 'after undo and redo the same field makes a new step');
  p.h.clear();
  assert.deepEqual([p.h.canUndo, p.h.canRedo, p.h.undoSteps, p.h.redoSteps], [false, false, 0, 0]);
  p.change(3, 'a');
  assert.equal(p.h.undoSteps, 1);
});

test('snapshot: the model comes back as it was, with every field, also unknown ones, and the order of the keys', () => {
  const model = loadBenchmark('B1_homogeneous'); // has "expected" and "surfaces", which the app does not edit
  const text = snapshotModel(model);
  const back = modelFromSnapshot(text);
  assert.deepEqual(back, model);
  assert.deepEqual(Object.keys(back), Object.keys(model), 'order of the keys');
  assert.notEqual(back, model, 'a new object, the history does not share the live model');
  assert.ok('expected' in back && back.expected.search.bishop === model.expected.search.bishop);
  // changing the live model afterwards does not change the snapshot
  model.ground[0][0] = 999;
  model.expected.source = 'changed';
  assert.equal(modelFromSnapshot(text).ground[0][0], 0);
  assert.notEqual(modelFromSnapshot(text).expected.source, 'changed');
});

test('snapshot of a model with fields the app remembers: nothing is lost by undo or redo (U2)', () => {
  const model = { ...createNewModel('en'), customField: { deep: [1, { a: null }] }, water: null, search: null, gammaW: 9.81 };
  model.materials.M1.model = 'drained';
  model.materials.M1.cu = 40; // value of a material model that is not chosen (kept, SPEC 5.1)
  const before = snapshotModel(model);
  assert.equal(snapshotModel(modelFromSnapshot(before)), before, 'text -> model -> text is the same');
  // written and read as a file after undo: the same text as without undo
  assert.equal(writeModel(modelFromSnapshot(before)), writeModel(model));
  const read = readModel(writeModel(modelFromSnapshot(before)));
  assert.equal(read.ok, true);
  assert.deepEqual(read.model.customField, { deep: [1, { a: null }] });
  assert.equal(read.model.materials.M1.cu, 40);
  assert.equal(read.model.water, null);
  assert.equal(read.model.search, null);
});

test('snapshot: unreadable fields are null in the model (SPEC 5.1) and stay null', () => {
  const model = createNewModel('de');
  model.ground[1][0] = null;
  model.bottom = null;
  const back = modelFromSnapshot(snapshotModel(model));
  assert.equal(back.ground[1][0], null);
  assert.equal(back.bottom, null);
  assert.deepEqual(back, model);
});

// --- wiring (needs a browser to run; the sources are checked here)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const main = read('app', 'main.js');
const sketch = read('app', 'ui', 'sketch.js');

/** Source of `function name(...)` up to its closing brace at the start of a line. */
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start));
}

test('main.js: every change of the model through the input is one step, the keystrokes of a field are one group', () => {
  const apply = fn(main, 'applyEdit');
  assert.match(apply, /const before = snapshotModel\(state\.model\)/);
  assert.match(apply, /mutate\(state\.model\)/);
  assert.match(apply, /if \(snapshotModel\(state\.model\) !== before\) history\.record\(before, typing\)/, 'only a real change is a step');
  assert.match(apply, /active\.type === 'text'/);
  assert.match(main, /document\.addEventListener\('focusout', \(\) => history\.breakGroup\(\)\)/);
});

test('main.js: New and Open empty the history (setModel); undo and redo do not reset the input areas', () => {
  assert.match(fn(main, 'setModel'), /history\.clear\(\)/);
  const step = fn(main, 'stepHistory');
  assert.doesNotMatch(step, /inputs\.reset\(\)/, 'reset would forget the remembered values of the session (SPEC 5.1)');
  assert.match(step, /inputs\.render\(\)/);
  assert.match(step, /inputs\.clearInvalid\(\)/);
  assert.match(step, /dispatchResult\(\{ type: 'model-changed' \}\)/, 'the result is discarded, not brought back');
  assert.match(step, /state\.dirty = true/, 'the model counts as changed');
  assert.match(step, /if \(state\.running \|\| !state\.model\) return false/, 'locked during a run');
  assert.match(step, /modelFromSnapshot\(target\)/);
});

test('keys: Ctrl+Z back, Ctrl+Y and Ctrl+Shift+Z forward; not while the caret is in a field', () => {
  const key = fn(main, 'onHistoryKey');
  assert.match(key, /closest\('input, textarea, select, \[contenteditable\]'\)\) return/);
  assert.match(key, /key === 'z' && !e\.shiftKey \? 'undo'/);
  assert.match(key, /key === 'y' \|\| \(key === 'z' && e\.shiftKey\) \? 'redo'/);
  assert.match(key, /e\.ctrlKey \|\| e\.metaKey/);
  assert.match(main, /document\.addEventListener\('keydown', onHistoryKey\)/);
});

test('sketch.js: two buttons in the bar, locked when there is nothing to undo or redo; texts in both languages', () => {
  assert.match(sketch, /\.\.\.historyButtons\(\)/);
  assert.match(sketch, /b\.disabled = !enabled \|\| !historyState/);
  assert.match(sketch, /setHistory\(next\)/);
  for (const lang of ['de', 'en']) for (const k of ['ui.edit.undo', 'ui.edit.redo']) assert.ok(MESSAGES[lang][k], `${lang}:${k}`);
  assert.match(MESSAGES.de['ui.edit.undo'], /Strg\+Z/);
  assert.match(MESSAGES.en['ui.edit.undo'], /Ctrl\+Z/);
});
