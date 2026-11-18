// Page side of a run (SPEC_ETAPPE2 7.1): start, progress, result, error, cancel; with a fake worker.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunController } from '../../app/lib/run-controller.js';

function setup({ failCreateAfter = Infinity } = {}) {
  const workers = [];
  const events = [];
  let clock = 1000;
  const controller = createRunController({
    createWorker: () => {
      if (workers.length >= failCreateAfter) throw new Error('cannot create');
      const w = {
        posted: [],
        terminated: false,
        postMessage(m) { this.posted.push(m); },
        terminate() { this.terminated = true; },
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        emit(data) { if (!this.terminated) this.onmessage({ data }); },
      };
      workers.push(w);
      return w;
    },
    onProgress: (p) => events.push(['progress', p]),
    onResult: (r, t) => events.push(['result', r, t]),
    onError: (e) => events.push(['error', e]),
    onCancel: () => events.push(['cancel']),
    now: () => clock,
  });
  return { controller, workers, events, tick: (ms) => { clock += ms; } };
}

test('a worker is created at once; start posts the run request with a new id', () => {
  const { controller, workers } = setup();
  assert.equal(workers.length, 1);
  assert.equal(controller.running, false);
  assert.equal(controller.start({ m: 1 }), true);
  assert.deepEqual(workers[0].posted, [{ type: 'run', id: 1, model: { m: 1 } }]);
  assert.equal(controller.running, true);
  assert.equal(controller.start({ m: 2 }), false, 'no second run at the same time');
  assert.equal(workers[0].posted.length, 1);
});

test('progress is passed on; the result ends the run; time is measured on the page', () => {
  const { controller, workers, events, tick } = setup();
  controller.start({});
  workers[0].emit({ type: 'progress', id: 1, phase: 'grid', done: 3, total: 10 });
  tick(2500);
  workers[0].emit({ type: 'result', id: 1, result: { critical: {} }, timeMs: 2400 });
  assert.deepEqual(events, [
    ['progress', { phase: 'grid', done: 3, total: 10 }],
    ['result', { critical: {} }, { timeMs: 2500, workerTimeMs: 2400 }],
  ]);
  assert.equal(controller.running, false);
  assert.equal(workers.length, 1, 'the worker is reused');
  assert.equal(controller.start({}), true);
  assert.equal(workers[0].posted.at(-1).id, 2);
});

test('messages of another run (or after the end) are ignored', () => {
  const { controller, workers, events } = setup();
  controller.start({});
  workers[0].emit({ type: 'progress', id: 99, phase: 'grid', done: 1, total: 2 });
  workers[0].emit({ type: 'result', id: 0, result: {}, timeMs: 1 });
  assert.deepEqual(events, []);
  workers[0].emit({ type: 'result', id: 1, result: { ok: 1 }, timeMs: 1 });
  workers[0].emit({ type: 'progress', id: 1, phase: 'grid', done: 2, total: 2 });
  assert.equal(events.length, 1);
  workers[0].emit(null);
  workers[0].emit({ type: 'what', id: 2 });
  assert.equal(events.length, 1);
});

test('an error message of the worker ends the run and is passed on with code, text and path', () => {
  const { controller, workers, events } = setup();
  controller.start({});
  workers[0].emit({ type: 'error', id: 1, code: 'E_BOTTOM_ABOVE_GROUND', message: 'm', path: 'bottom' });
  assert.deepEqual(events, [['error', { code: 'E_BOTTOM_ABOVE_GROUND', message: 'm', path: 'bottom' }]]);
  assert.equal(controller.running, false);
  assert.equal(controller.start({}), true, 'next run possible');
});

test('cancel: worker terminated at once, a new worker, one cancel event, no result', () => {
  const { controller, workers, events } = setup();
  controller.start({});
  workers[0].emit({ type: 'progress', id: 1, phase: 'grid', done: 1, total: 5 });
  assert.equal(controller.cancel(), true);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2, 'a new worker at once');
  assert.deepEqual(events.map((e) => e[0]), ['progress', 'cancel']);
  assert.equal(controller.running, false);
  // a late answer of the old worker (id 1) changes nothing
  workers[0].onmessage({ data: { type: 'result', id: 1, result: {}, timeMs: 1 } });
  assert.deepEqual(events.map((e) => e[0]), ['progress', 'cancel']);
  // and a new run works with the new worker
  assert.equal(controller.start({}), true);
  assert.equal(workers[1].posted.length, 1);
  assert.equal(workers[1].posted[0].id, 2);
  workers[1].emit({ type: 'result', id: 2, result: { r: 1 }, timeMs: 5 });
  assert.equal(events.at(-1)[0], 'result');
});

test('cancel without a run does nothing', () => {
  const { controller, workers, events } = setup();
  assert.equal(controller.cancel(), false);
  assert.equal(workers.length, 1);
  assert.deepEqual(events, []);
});

test('a crash of the worker (error event): APP_RUN_FAILED with text, new worker, page stays usable', () => {
  const { controller, workers, events } = setup();
  controller.start({});
  workers[0].onerror({ message: 'Uncaught RangeError: boom' });
  assert.deepEqual(events, [['error', { code: 'APP_RUN_FAILED', message: 'Uncaught RangeError: boom', path: undefined }]]);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  assert.equal(controller.running, false);
  assert.equal(controller.start({}), true);
  // an error event without a run is ignored
  workers[1].emit({ type: 'result', id: 2, result: {}, timeMs: 1 });
  workers[1].onerror({ message: 'late' });
  assert.equal(events.filter((e) => e[0] === 'error').length, 1);
});

test('an unreadable message (messageerror) is a crash as well', () => {
  const { controller, workers, events } = setup();
  controller.start({});
  workers[0].onmessageerror();
  assert.equal(events[0][0], 'error');
  assert.equal(events[0][1].code, 'APP_RUN_FAILED');
  assert.equal(workers.length, 2);
});

test('a worker that cannot be created: start reports APP_RUN_FAILED and returns false', () => {
  const { controller, events } = setup({ failCreateAfter: 0 });
  assert.equal(controller.start({}), false);
  assert.deepEqual(events, [['error', { code: 'APP_RUN_FAILED', message: 'cannot create', path: undefined }]]);
  assert.equal(controller.running, false);
});

test('postMessage that throws (model cannot be cloned): APP_RUN_FAILED, no run left behind', () => {
  const { controller, workers, events } = setup();
  workers[0].postMessage = () => { throw new Error('DataCloneError'); };
  assert.equal(controller.start({}), false);
  assert.equal(events[0][1].code, 'APP_RUN_FAILED');
  assert.equal(controller.running, false);
});
