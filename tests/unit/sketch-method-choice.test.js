// Choice of the governing method in the tool bar of the sketch (SPEC_ETAPPE2 6, version 1.8; order 15, chapter 3):
// same methods and order as the overview, one source in the state, not shown without result or without search.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { MESSAGES } from '../../app/lib/i18n.js';
import { methodChoices, overviewTable } from '../../app/lib/result-view.js';
import { calculatedMethods, initialResultState, reduceResult, METHODS } from '../../app/lib/result-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

const circle = (F) => ({ F, xc: 1, zc: 2, R: 3, entry: [0, 0], exit: [1, 0] });

test('methodChoices: the rows of the overview, in the order Bishop, Janbu F0, Janbu corrected, Spencer', () => {
  const all = { critical: { spencer: circle(1.3), janbuCorrected: circle(1.2), janbu: circle(1.1), bishop: circle(1.15) } };
  assert.deepEqual(methodChoices(all), ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
  assert.deepEqual(methodChoices(all), METHODS);
  // a method without a valid surface is a row of the overview, so it is also a choice (same as the radio buttons)
  const some = { critical: { bishop: circle(1.1), janbu: null, spencer: circle(1.2) } };
  assert.deepEqual(methodChoices(some), ['bishop', 'janbu', 'spencer']);
  assert.deepEqual(methodChoices(some), overviewTable(some).rows.map((r) => r.method));
  // only methods that were calculated
  assert.deepEqual(methodChoices({ critical: { janbu: circle(1.1) } }), ['janbu']);
});

test('methodChoices: empty without result and without search (search: null), so the choice is not shown', () => {
  assert.deepEqual(methodChoices(null), []);
  assert.deepEqual(methodChoices(undefined), []);
  assert.deepEqual(methodChoices({ critical: {}, surfaces: [] }), []);
  assert.deepEqual(methodChoices({ surfaces: [{ id: 'C1' }] }), []);
});

test('B1: choices of a real result are the calculated methods, every one can be chosen (state accepts it)', () => {
  const result = analyze(loadBenchmark('B1_homogeneous'));
  const choices = methodChoices(result);
  assert.deepEqual(choices, ['bishop', 'janbu', 'janbuCorrected']);
  assert.deepEqual(choices, calculatedMethods(result));
  let state = reduceResult(initialResultState(), { type: 'run-done', result, timeMs: 1 });
  assert.equal(state.method, 'bishop', 'default after a run (8.1)');
  for (const method of choices) {
    state = reduceResult(state, { type: 'select-method', method });
    assert.equal(state.method, method);
  }
});

test('one source: the tool bar of the sketch and the overview both read state.rs.method and both dispatch select-method', () => {
  const main = read('app', 'main.js');
  assert.match(main, /renderOverview\(\$\('panel-overview'\), \{[^}]*method: state\.rs\.method,[^}]*onSelectMethod: \(method\) => dispatchResult\(\{ type: 'select-method', method \}\)/s);
  assert.match(main, /methodChoice = methods\.length \? \{ methods, method: state\.rs\.method, onChange: \(method\) => dispatchResult\(\{ type: 'select-method', method \}\) \} : null/);
  assert.match(main, /methods = methodChoices\(state\.result\)/);
  // the sketch keeps no state of its own for the method: it shows what it is given and reports the change
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /methodSelect\.value = methodChoice\.method/);
  assert.match(sketch, /methodChoice\.onChange\(methodSelect\.value\)/);
  assert.match(sketch, /methodChoice = next && choice \? choice : null/, 'without result or choice the bar shows none');
  assert.doesNotMatch(sketch, /localStorage|sessionStorage/);
});

test('texts of the choice, the tabs and the mark exist in German and English', () => {
  for (const lang of ['de', 'en']) {
    for (const key of ['ui.sketch.method', 'ui.main.tabs', 'ui.tab.resultReady', 'ui.sketch', 'ui.result']) {
      assert.ok(MESSAGES[lang][key] && MESSAGES[lang][key].trim() !== '', `${lang}:${key}`);
    }
  }
});
