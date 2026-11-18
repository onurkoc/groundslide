// S-T1 (SPEC_ETAPPE3 7.1): a model without `supports` and with `supports: []`
// gives the same result as in stage 1. analyze() and analyzeSurface() do not
// use supports yet (order 20; the calculation with supports follows in order 21).
// Benchmark files are only read.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface, validateModel } from '../../core/index.js';
import { loadBenchmark, mirrorModelForTest } from './helpers.js';

/** Result without the time field (performance.now() difference, not a calculated value). */
function strip(result) {
  const copy = structuredClone(result);
  delete copy.searchTimeMs;
  return copy;
}

const withoutSupports = (model) => {
  const c = structuredClone(model);
  delete c.supports;
  return c;
};
const withEmptySupports = (model) => ({ ...structuredClone(model), supports: [] });

/** mirrorModelForTest() does not mirror the circles of `surfaces`; do it here. */
function mirroredWithSurfaces(model) {
  const c = mirrorModelForTest(model);
  c.surfaces = c.surfaces.map((s) => ({ ...s, xc: -s.xc }));
  return c;
}

// B1 falls to the left (direction "left"), its mirror falls to the right.
const cases = [
  ['B1 (slope falls left)', () => loadBenchmark('B1_homogeneous')],
  ['B1 mirrored (slope falls right)', () => mirroredWithSurfaces(loadBenchmark('B1_homogeneous'))],
];

for (const [name, load] of cases) {
  test(`S-T1 ${name}: valid without a message, with and without supports: []`, () => {
    assert.deepEqual(validateModel(withoutSupports(load())).errors, []);
    assert.deepEqual(validateModel(withEmptySupports(load())).errors, []);
  });

  test(`S-T1 ${name}: analyze() gives the same result with supports: [] and without the field`, () => {
    const a = strip(analyze(withoutSupports(load())));
    const b = strip(analyze(withEmptySupports(load())));
    assert.deepEqual(b, a);
    assert.ok(a.critical && a.surfaces.length > 0, 'the search and the given surfaces were calculated');
    assert.ok(!JSON.stringify(a).includes('support'), 'no field about supports in the result');
  });

  test(`S-T1 ${name}: analyzeSurface() gives the same result with supports: [] and without the field`, () => {
    const model = load();
    const s = model.surfaces[0];
    const circle = { xc: s.xc, zc: s.zc, R: s.R };
    const a = analyzeSurface(withoutSupports(model), circle);
    const b = analyzeSurface(withEmptySupports(model), circle);
    assert.deepEqual(b, a);
    assert.equal(a.valid, true);
    assert.ok(!JSON.stringify(a).includes('support'));
  });
}
