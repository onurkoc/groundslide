// Messages 'surface' / 'surfaceResult' between the page and the worker (SPEC_ETAPPE2 8.3) and the page
// side in the run controller; fake worker, no browser. A real analyzeSurface of B1 is called once.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSurface } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { surfaceRequest, isSurfaceRequest, isRunRequest, executeSurface, APP_RUN_FAILED } from '../../app/lib/run-messages.js';
import { createRunController } from '../../app/lib/run-controller.js';

const model = loadBenchmark('B1_homogeneous');
const circle = { xc: 50, zc: 80, R: 52 };

test('request: form and recognition (a run request is not a surface request and vice versa)', () => {
  const m = surfaceRequest(7, { a: 1 }, circle);
  assert.deepEqual(m, { type: 'surface', id: 7, model: { a: 1 }, circle });
  assert.equal(isSurfaceRequest(m), true);
  assert.equal(isRunRequest(m), false);
  assert.equal(isRunRequest({ type: 'run', id: 1, model: {} }), true);
  assert.equal(isSurfaceRequest({ type: 'run', id: 1, model: {} }), false);
  for (const bad of [null, undefined, 5, 'x', {}, { type: 'surface' }, { type: 'surface', id: 1, model: {} }, { type: 'surface', id: 1, circle }]) assert.equal(isSurfaceRequest(bad), false, JSON.stringify(bad));
});

test('worker side: result with the slice table of the core, unchanged', () => {
  const posted = [];
  executeSurface(surfaceRequest(3, model, circle), { analyzeSurface, post: (x) => posted.push(x) });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, 'surfaceResult');
  assert.equal(posted[0].id, 3);
  const direct = analyzeSurface(model, circle);
  assert.deepEqual(posted[0].result, direct);
  assert.ok(posted[0].result.slices.length > 10);
});

test('worker side: an invalid circle is a result with valid false (not an error message)', () => {
  const posted = [];
  executeSurface(surfaceRequest(4, model, { xc: 20, zc: 40, R: 5 }), { analyzeSurface, post: (x) => posted.push(x) });
  assert.equal(posted[0].type, 'surfaceResult');
  assert.equal(posted[0].result.valid, false);
  assert.equal(posted[0].result.code, 'I_INTERSECTIONS');
});

test('worker side: errors as with a run: ModelError keeps its code, anything else is APP_RUN_FAILED', () => {
  const posted = [];
  const invalid = JSON.parse(JSON.stringify(model));
  invalid.bottom = null;
  executeSurface(surfaceRequest(5, invalid, circle), { analyzeSurface, post: (x) => posted.push(x) });
  assert.equal(posted[0].type, 'error');
  assert.equal(posted[0].id, 5);
  assert.match(posted[0].code, /^E_/);
  executeSurface(surfaceRequest(6, model, circle), { analyzeSurface: () => { throw new TypeError('boom'); }, post: (x) => posted.push(x) });
  assert.deepEqual(posted[1], { type: 'error', id: 6, code: APP_RUN_FAILED, message: 'boom', path: undefined });
});

// --- page side ---

function setup() {
  const workers = [];
  const events = [];
  const controller = createRunController({
    createWorker: () => {
      const w = {
        posted: [], terminated: false,
        postMessage(m) { this.posted.push(m); },
        terminate() { this.terminated = true; },
        onmessage: null, onerror: null, onmessageerror: null,
        emit(data) { if (!this.terminated) this.onmessage({ data }); },
      };
      workers.push(w);
      return w;
    },
    onProgress: (p) => events.push(['progress', p]),
    onResult: (r) => events.push(['result', r]),
    onError: (e) => events.push(['error', e]),
    onCancel: () => events.push(['cancel']),
    now: () => 0,
  });
  return { controller, workers, events };
}

test('controller.surface: posts the request, resolves with the result of the worker', async () => {
  const { controller, workers, events } = setup();
  const p = controller.surface({ m: 1 }, circle);
  assert.deepEqual(workers[0].posted, [{ type: 'surface', id: 1, model: { m: 1 }, circle }]);
  workers[0].emit({ type: 'surfaceResult', id: 1, result: { valid: true, slices: [] } });
  assert.deepEqual(await p, { valid: true, slices: [] });
  assert.deepEqual(events, [], 'no run event');
  assert.equal(controller.running, false);
});

test('controller.surface: an error message rejects with code, text and path', async () => {
  const { controller, workers } = setup();
  const p = controller.surface({}, circle);
  workers[0].emit({ type: 'error', id: 1, code: 'E_BOTTOM_MISSING', message: 'msg', path: 'bottom' });
  await assert.rejects(p, { code: 'E_BOTTOM_MISSING', message: 'msg', path: 'bottom' });
});

test('controller.surface: two requests are answered each by its own id; an unknown id is ignored', async () => {
  const { controller, workers } = setup();
  const a = controller.surface({}, circle);
  const b = controller.surface({}, { ...circle, R: 40 });
  workers[0].emit({ type: 'surfaceResult', id: 99, result: 'stray' });
  workers[0].emit({ type: 'surfaceResult', id: 2, result: 'B' });
  workers[0].emit({ type: 'surfaceResult', id: 1, result: 'A' });
  assert.equal(await a, 'A');
  assert.equal(await b, 'B');
});

test('controller.surface: not while a run is going', async () => {
  const { controller, workers } = setup();
  controller.start({});
  await assert.rejects(controller.surface({}, circle), (e) => e.code === APP_RUN_FAILED && e.busy === true);
  assert.equal(workers[0].posted.length, 1, 'nothing posted');
});

test('a run and a slice request do not mix: run messages need the run id', async () => {
  const { controller, workers, events } = setup();
  const s = controller.surface({}, circle); // id 1
  controller.start({}); // id 2
  workers[0].emit({ type: 'result', id: 1, result: 'not for the run' });
  assert.deepEqual(events, [], 'a message with the id of the slice request is not a run result');
  workers[0].emit({ type: 'surfaceResult', id: 1, result: 'S' });
  assert.equal(await s, 'S');
  workers[0].emit({ type: 'result', id: 2, result: 'R' });
  assert.deepEqual(events, [['result', 'R']]);
});

test('crash of the worker rejects pending slice requests; cancel of a run does the same (they can be asked again)', async () => {
  const a = setup();
  const p = a.controller.surface({}, circle);
  a.workers[0].onerror({ message: 'crash' });
  await assert.rejects(p, (e) => e.code === APP_RUN_FAILED && e.message === 'crash');
  assert.equal(a.workers.length, 2, 'a crashed worker with an open slice request is replaced');
  assert.equal(a.workers[0].terminated, true);

  const b = setup();
  const q = b.controller.surface({}, circle);
  b.controller.start({});
  b.controller.cancel();
  await assert.rejects(q, (e) => e.cancelled === true);
  assert.equal(b.workers.length, 2, 'new worker after the cancel');
  const again = b.controller.surface({}, circle);
  assert.equal(b.workers[1].posted.at(-1).type, 'surface');
  b.workers[1].emit({ type: 'surfaceResult', id: b.workers[1].posted.at(-1).id, result: 'ok' });
  assert.equal(await again, 'ok');
});
