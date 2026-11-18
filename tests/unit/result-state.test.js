// Result display state (SPEC_ETAPPE2 7.1, 8.1): discarding after a change of the model,
// the default method, the choices. Pure functions of app/lib/result-state.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { initialResultState, reduceResult, defaultMethod, defaultTarget, calculatedMethods, NEUTRAL_ACTIONS, METHODS } from '../../app/lib/result-state.js';

// small results of the form of analyze(), no calculation needed
const surface = (xc) => ({ F: 1.2, xc, zc: 50, R: 20, entry: [1, 2], exit: [3, 4] });
const RESULT = {
  mode: 'characteristic',
  warnings: [],
  critical: { bishop: surface(1), janbu: surface(2), janbuCorrected: surface(3), spencer: { ...surface(4), theta: 12 } },
  grid: [],
  surfaces: [{ id: 'C1', valid: true }],
};
const SLICES = { key: 'k1', status: 'ok', data: { valid: true, slices: [] } };

const withResult = () => reduceResult(initialResultState(), { type: 'run-done', result: RESULT });

test('initial state: nothing calculated, contour on', () => {
  const s = initialResultState();
  assert.equal(s.result, null);
  assert.equal(s.timeMs, null);
  assert.equal(s.slices, null);
  assert.equal(s.method, null);
  assert.equal(s.contour, true);
  assert.deepEqual(s.target, { kind: 'critical' });
});

test('run-done: result kept as it is, Bishop chosen, contour on, no slice table', () => {
  let s = withResult();
  s = reduceResult(s, { type: 'select-method', method: 'spencer' });
  s = reduceResult(s, { type: 'set-contour', on: false });
  const again = reduceResult(s, { type: 'run-done', result: RESULT, timeMs: 1234.5 });
  assert.equal(again.result, RESULT, 'the very same object, not rounded or copied');
  assert.equal(again.timeMs, 1234.5);
  assert.equal(again.method, 'bishop');
  assert.equal(again.contour, true);
  assert.equal(again.slices, null);
  assert.deepEqual(again.target, { kind: 'critical' });
});

test('a change of the model discards the result and the slice table', () => {
  let s = withResult();
  s = reduceResult(s, { type: 'slices', key: 'k1', data: SLICES });
  assert.ok(s.slices);
  const after = reduceResult(s, { type: 'model-changed' });
  assert.equal(after.result, null);
  assert.equal(after.slices, null);
  assert.equal(after.method, null);
  assert.deepEqual(after, initialResultState());
});

test('language, light/dark, zoom, pan and saving discard nothing (same state object)', () => {
  let s = withResult();
  s = reduceResult(s, { type: 'slices', key: 'k1', data: SLICES });
  s = reduceResult(s, { type: 'select-method', method: 'janbuCorrected' });
  assert.deepEqual(NEUTRAL_ACTIONS, ['language', 'theme', 'zoom', 'pan', 'save']);
  for (const type of [...NEUTRAL_ACTIONS, 'something-unknown']) {
    assert.equal(reduceResult(s, { type }), s, type);
  }
  assert.equal(reduceResult(s, undefined), s);
  assert.equal(reduceResult(s, null), s);
});

test('slices: stored with the key of the request; slices-reset forgets only the table', () => {
  let s = withResult();
  s = reduceResult(s, { type: 'slices', key: 'k1', data: { status: 'loading' } });
  assert.deepEqual(s.slices, { key: 'k1', status: 'loading' });
  s = reduceResult(s, { type: 'slices', key: 'k1', data: { status: 'ok', result: { valid: true } } });
  assert.equal(s.slices.status, 'ok');
  const reset = reduceResult(s, { type: 'slices-reset' });
  assert.equal(reset.slices, null);
  assert.equal(reset.result, RESULT, 'the result stays');
  assert.equal(reduceResult(reset, { type: 'slices-reset' }), reset);
});

test('model-changed without result keeps the state (nothing to discard)', () => {
  const s = initialResultState();
  assert.equal(reduceResult(s, { type: 'model-changed' }), s);
});

test('the reducer never changes its input', () => {
  const s = withResult();
  const frozen = Object.freeze({ ...s });
  for (const action of [{ type: 'model-changed' }, { type: 'select-method', method: 'spencer' }, { type: 'set-contour', on: false }, { type: 'select-target', target: { kind: 'single', id: 'C1' } }, { type: 'slices', key: 'k', data: {} }, { type: 'run-done', result: RESULT }]) {
    assert.doesNotThrow(() => reduceResult(frozen, action), action.type);
  }
  assert.equal(frozen.method, 'bishop');
});

test('default method: Bishop; without Bishop the first calculated method; without search null', () => {
  assert.equal(defaultMethod(RESULT), 'bishop');
  assert.equal(defaultMethod({ critical: { janbu: null, spencer: surface(1) } }), 'janbu');
  assert.equal(defaultMethod({ critical: { spencer: surface(1) } }), 'spencer');
  assert.equal(defaultMethod({ critical: { bishop: null } }), 'bishop', 'a method without valid surface is still calculated');
  assert.equal(defaultMethod({ surfaces: [] }), null);
  assert.equal(defaultMethod(null), null);
  assert.equal(defaultMethod(undefined), null);
});

test('calculated methods in the order Bishop, Janbu F0, Janbu corrected, Spencer', () => {
  assert.deepEqual(METHODS, ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
  assert.deepEqual(calculatedMethods({ critical: { spencer: null, bishop: null, janbuCorrected: null } }), ['bishop', 'janbuCorrected', 'spencer']);
  assert.deepEqual(calculatedMethods({}), []);
});

test('select-method: only calculated methods; select-target: only with result and valid target', () => {
  const s = withResult();
  assert.equal(reduceResult(s, { type: 'select-method', method: 'spencer' }).method, 'spencer');
  assert.equal(reduceResult(s, { type: 'select-method', method: 'nonsense' }), s);
  const only = reduceResult(initialResultState(), { type: 'run-done', result: { critical: { bishop: null } } });
  assert.equal(reduceResult(only, { type: 'select-method', method: 'spencer' }), only);
  assert.deepEqual(reduceResult(s, { type: 'select-target', target: { kind: 'single', id: 'C1' } }).target, { kind: 'single', id: 'C1' });
  assert.equal(reduceResult(s, { type: 'select-target', target: { kind: 'single' } }), s);
  assert.equal(reduceResult(s, { type: 'select-target', target: 5 }), s);
  const none = initialResultState();
  assert.equal(reduceResult(none, { type: 'select-target', target: { kind: 'single', id: 'C1' } }), none);
  assert.equal(reduceResult(none, { type: 'slices', key: 'k', data: {} }), none, 'no slice table without a result');
});

test('a result without search: no method, singles only', () => {
  const noSearch = { mode: 'characteristic', warnings: [], surfaces: [{ id: 'C1', valid: true }] };
  const s = reduceResult(initialResultState(), { type: 'run-done', result: noSearch });
  assert.equal(s.result, noSearch);
  assert.equal(s.method, null);
  assert.equal(reduceResult(s, { type: 'select-method', method: 'bishop' }), s);
  assert.deepEqual(s.target, { kind: 'single', id: 'C1' }, 'without governing circles the slice table starts with the first single circle');
  assert.deepEqual(defaultTarget(RESULT), { kind: 'critical' });
  assert.deepEqual(defaultTarget({ surfaces: [] }), { kind: 'critical' });
  assert.deepEqual(defaultTarget(null), { kind: 'critical' });
});

// --- wiring in main.js (no DOM here, so the source is checked): every way to change the model discards ---

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mainSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'main.js'), 'utf8').replaceAll('\r\n', '\n');

/** Text of a top-level function of main.js (from "function name(" to the closing "\n}"). */
const body = (name) => {
  const start = mainSrc.search(new RegExp(`(?:export )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  return mainSrc.slice(start, mainSrc.indexOf('\n}\n', start));
};

test('main.js: setModel (New, Open), modelEdited (every edit: input and mouse) and stepHistory (undo, redo) dispatch model-changed', () => {
  for (const name of ['setModel', 'modelEdited', 'stepHistory']) assert.match(body(name), /dispatchResult\(\{ type: 'model-changed' \}\)/, name);
});

test('main.js: language, theme, saving and run-finished do not dispatch model-changed', () => {
  for (const name of ['setLanguage', 'setTheme', 'saveFile', 'onRunResult', 'onRunCancel', 'onRunError']) {
    assert.doesNotMatch(body(name), /model-changed/, name);
  }
  assert.match(body('onRunResult'), /type: 'run-done'/);
  // the only places that name the action: New/Open, an edit, undo and redo (SPEC_ETAPPE2 6.1: they are changes of the model)
  assert.equal([...mainSrc.matchAll(/'model-changed'/g)].length, 3);
  // the input (applyEdit) and the mouse in the sketch (sketchEdit.change) both go through modelEdited
  assert.match(body('applyEdit'), /modelEdited\(\)/);
  assert.match(mainSrc, /change\(mutate\) \{\n {4}mutate\(state\.model\);\n {4}modelEdited\(\)/);
});
