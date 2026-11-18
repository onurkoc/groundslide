// U4 (SPEC_ETAPPE2 chapter 10, SPEC 8.1): analyze with and without onProgress.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';

/** Result without the wall-clock time of the search: the only field that differs from run to run. */
function withoutTime(result) {
  const copy = structuredClone(result);
  delete copy.searchTimeMs; // performance.now() difference, not a calculated value; no other field is removed
  return copy;
}

function collect(model) {
  const messages = [];
  const result = analyze(model, { onProgress: (p) => messages.push({ ...p }) });
  return { messages, result };
}

/** Small search grid on a benchmark model, for the cheap tests. */
function smallGrid(model, nx = 4, nz = 3, radii = 6) {
  const m = structuredClone(model);
  m.search.grid = { ...m.search.grid, nx, nz };
  m.search.radii = radii;
  return m;
}

function assertProgress(messages, total) {
  const grid = messages.filter((p) => p.phase === 'grid');
  assert.equal(grid.length, total, 'one grid message per centre');
  grid.forEach((p, i) => {
    assert.equal(p.done, i + 1, `done rises by exactly 1 (message ${i})`);
    assert.equal(p.total, total, 'total stays nx * nz');
  });
  assert.equal(grid.at(-1).done, grid.at(-1).total, 'last grid message: done = total');
  const refine = messages.filter((p) => p.phase === 'refine');
  assert.equal(refine.length, 1, 'exactly one refine message');
  assert.deepEqual({ ...refine[0] }, { phase: 'refine', done: 0, total: 0 });
  assert.equal(messages.length, total + 1, 'nothing else');
  assert.equal(messages.at(-1).phase, 'refine', 'refine comes after the grid phase and nothing follows');
  assert.deepEqual(Object.keys(messages[0]).sort(), ['done', 'phase', 'total']);
}

for (const name of ['B1_homogeneous', 'V03_acads_1c']) {
  test(`U4 ${name}: result with onProgress equals result without; done rises to nx * nz, then one refine`, () => {
    const model = loadBenchmark(name);
    const { nx, nz } = model.search.grid;
    const plain = analyze(model);
    const { messages, result } = collect(model);
    assert.deepEqual(withoutTime(result), withoutTime(plain));
    assertProgress(messages, nx * nz);
  });
}

test('U4 onProgress that is not a function: no error, same result (also a non-object options)', () => {
  const model = smallGrid(loadBenchmark('B1_homogeneous'));
  const plain = withoutTime(analyze(model));
  for (const options of [undefined, null, 42, 'x', {}, { onProgress: undefined }, { onProgress: null }, { onProgress: 42 }, { onProgress: 'f' }, { onProgress: {} }]) {
    assert.deepEqual(withoutTime(analyze(model, options)), plain, JSON.stringify(options));
  }
});

test('U4 search: null gives no message', () => {
  const model = loadBenchmark('H1_handcalc_dry');
  assert.equal(model.search, null);
  const { messages, result } = collect(model);
  assert.deepEqual(messages, []);
  assert.deepEqual(result, analyze(model));
});

test('U4 an exception of onProgress is passed on, not caught', () => {
  const model = smallGrid(loadBenchmark('B1_homogeneous'));
  const boom = new Error('boom from onProgress');
  assert.throws(() => analyze(model, { onProgress: () => { throw boom; } }), (e) => e === boom);
  let calls = 0;
  assert.throws(
    () => analyze(model, { onProgress: (p) => { calls++; if (p.phase === 'refine') throw boom; } }),
    (e) => e === boom,
  );
  assert.equal(calls, 4 * 3 + 1, 'all grid messages came before the refine message that threw');
});

test('U4 refine message also comes when no method has a valid surface (nothing is refined)', () => {
  const model = smallGrid(loadBenchmark('B1_homogeneous'), 2, 2, 3);
  model.search.grid = { xMin: 2000, xMax: 2010, zMin: -500, zMax: -490, nx: 2, nz: 2 };
  const { messages, result } = collect(model);
  assert.deepEqual(result.critical, { bishop: null, janbu: null, janbuCorrected: null });
  assert.equal(result.counts.valid, 0);
  assertProgress(messages, 4);
});

test('U4 a grid of one centre and non-square grids: counting is exact', () => {
  for (const [nx, nz] of [[1, 1], [5, 1], [1, 4], [3, 7]]) {
    const { messages, result } = collect(smallGrid(loadBenchmark('B1_homogeneous'), nx, nz, 4));
    assertProgress(messages, nx * nz);
    assert.equal(result.grid.length, nx * nz);
  }
});

test('U4 the same with the mirrored model (direction left): messages and result do not depend on the callback', () => {
  const model = smallGrid(loadBenchmark('B3_two_layers'));
  const plain = withoutTime(analyze(model));
  const { messages, result } = collect(model);
  assert.deepEqual(withoutTime(result), plain);
  assertProgress(messages, 12);
});

test('U4 the progress messages are not part of the result', () => {
  const model = smallGrid(loadBenchmark('B1_homogeneous'));
  const { result } = collect(model);
  assert.ok(!JSON.stringify(result).includes('"phase"'));
});
