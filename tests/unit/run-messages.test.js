// Messages between page and worker (SPEC_ETAPPE2 7.1, 7.2); the worker logic without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runRequest, isRunRequest, errorMessage, executeRun, APP_RUN_FAILED } from '../../app/lib/run-messages.js';
import { createProgressThrottle } from '../../app/lib/progress.js';
import { analyze, ModelError, validateModel } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';

function smallB1() {
  const m = loadBenchmark('B1_homogeneous');
  m.search.grid = { ...m.search.grid, nx: 3, nz: 2 };
  m.search.radii = 4;
  return m;
}

/** Fake clock that advances `step` ms at every reading. */
const stepClock = (step) => {
  let t = 0;
  return () => (t += step);
};

test('request form and check', () => {
  assert.deepEqual(runRequest(7, { a: 1 }), { type: 'run', id: 7, model: { a: 1 } });
  assert.equal(isRunRequest(runRequest(1, {})), true);
  for (const bad of [null, undefined, 5, 'run', {}, { type: 'run' }, { type: 'run', id: 1 }, { type: 'progress', id: 1, model: {} }]) {
    assert.equal(isRunRequest(bad), false, JSON.stringify(bad));
  }
});

test('executeRun with the real core: progress messages, then one result with the time; same result as analyze', () => {
  const model = smallB1();
  const posted = [];
  executeRun(runRequest(3, model), { analyze, post: (m) => posted.push(m), throttle: () => true, now: stepClock(10) });
  const progress = posted.filter((m) => m.type === 'progress');
  assert.equal(progress.length, 6 + 1);
  assert.deepEqual(progress.at(-1), { type: 'progress', id: 3, phase: 'refine', done: 0, total: 0 });
  assert.deepEqual(progress.slice(0, 6).map((p) => p.done), [1, 2, 3, 4, 5, 6]);
  assert.ok(progress.every((p) => p.id === 3 && Object.keys(p).sort().join() === 'done,id,phase,total,type'));
  const last = posted.at(-1);
  assert.equal(last.type, 'result');
  assert.equal(last.id, 3);
  assert.equal(last.timeMs, 10);
  const expected = analyze(model);
  const { searchTimeMs: a, ...got } = last.result;
  const { searchTimeMs: b, ...want } = expected;
  assert.deepEqual(got, want);
  assert.equal(posted.length, progress.length + 1, 'exactly one result and nothing after');
});

test('executeRun throttles: only the forwarded messages are posted, refine and the last grid message always', () => {
  const model = smallB1();
  const posted = [];
  // clock: 1 ms per reading, so only the first message passes the 100 ms interval, plus the forced ones
  executeRun(runRequest(1, model), { analyze, post: (m) => posted.push(m), throttle: createProgressThrottle({ now: stepClock(1) }), now: stepClock(1) });
  const progress = posted.filter((m) => m.type === 'progress');
  assert.deepEqual(progress.map((p) => `${p.phase}:${p.done}/${p.total}`), ['grid:1/6', 'grid:6/6', 'refine:0/0']);
});

test('executeRun without a search: no progress, a result', () => {
  const posted = [];
  executeRun(runRequest(2, loadBenchmark('H1_handcalc_dry')), { analyze, post: (m) => posted.push(m), throttle: () => true });
  assert.deepEqual(posted.map((m) => m.type), ['result']);
});

test('ModelError keeps code, text and the path of the first error', () => {
  const model = loadBenchmark('B1_homogeneous');
  model.bottom = 1000;
  const posted = [];
  executeRun(runRequest(4, model), { analyze, post: (m) => posted.push(m), throttle: () => true });
  assert.equal(posted.length, 1);
  const e = posted[0];
  assert.equal(e.type, 'error');
  assert.equal(e.id, 4);
  assert.equal(e.code, 'E_BOTTOM_ABOVE_GROUND');
  assert.equal(e.path, 'bottom');
  assert.match(e.message, /E_BOTTOM_ABOVE_GROUND/);
  assert.equal(e.code, validateModel(model).errors[0].code);
});

test('a ModelError that crossed the worker boundary (plain object with name) is still recognised', () => {
  const lookalike = { name: 'ModelError', code: 'E_GROUND_INVALID', message: 'E_GROUND_INVALID: x', errors: [{ code: 'E_GROUND_INVALID', path: 'ground' }] };
  assert.deepEqual(errorMessage(9, lookalike), { type: 'error', id: 9, code: 'E_GROUND_INVALID', message: 'E_GROUND_INVALID: x', path: 'ground' });
  assert.equal(errorMessage(9, new ModelError([{ code: 'E_X', message: 'm', path: 'p' }])).path, 'p');
  assert.equal(errorMessage(9, new ModelError([])).code, 'E_MODEL_INVALID');
});

test('an unexpected error becomes APP_RUN_FAILED with the text of the exception', () => {
  const posted = [];
  executeRun(runRequest(5, {}), { analyze: () => { throw new RangeError('out of range here'); }, post: (m) => posted.push(m), throttle: () => true });
  assert.deepEqual(posted, [{ type: 'error', id: 5, code: APP_RUN_FAILED, message: 'out of range here', path: undefined }]);
  assert.equal(errorMessage(1, 'plain string').message, 'plain string');
  assert.equal(errorMessage(1, null).code, APP_RUN_FAILED);
  assert.equal(errorMessage(1, new Error('')).message, 'Error');
  assert.equal(APP_RUN_FAILED, 'APP_RUN_FAILED');
});

test('an exception of the progress callback chain is reported as an error message, never thrown', () => {
  const posted = [];
  const post = (m) => { if (m.type === 'progress') throw new Error('post failed'); posted.push(m); };
  assert.doesNotThrow(() => executeRun(runRequest(6, smallB1()), { analyze, post, throttle: () => true }));
  assert.equal(posted.at(-1).type, 'error');
  assert.equal(posted.at(-1).code, APP_RUN_FAILED);
});
