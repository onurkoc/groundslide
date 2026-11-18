// APP_SURFACE_INVALID (SPEC_ETAPPE2 5.2): the app checks the single circles.

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSurfaces } from '../../app/lib/surfaces-check.js';
import { validateAll } from '../../app/lib/validate.js';
import { BENCHMARK_NAMES, loadBenchmark } from './helpers.js';

const ok = { id: 'C1', xc: 50, zc: 80, R: 52 };
const paths = (s) => validateSurfaces(s).map((e) => e.path);

test('valid circles and missing surfaces give no error', () => {
  assert.deepEqual(validateSurfaces([ok, { id: 'C2', xc: -3, zc: 0, R: 0.001 }]), []);
  assert.deepEqual(validateSurfaces([]), []);
  assert.deepEqual(validateSurfaces(undefined), []);
  assert.deepEqual(validateSurfaces(null), []);
});

test('id empty or missing -> surfaces[i].id', () => {
  assert.deepEqual(paths([{ ...ok, id: '' }]), ['surfaces[0].id']);
  assert.deepEqual(paths([{ ...ok, id: '   ' }]), ['surfaces[0].id']);
  assert.deepEqual(paths([ok, { xc: 1, zc: 1, R: 1 }]), ['surfaces[1].id']);
  assert.deepEqual(paths([{ ...ok, id: 5 }]), ['surfaces[0].id']);
});

test('id repeated -> reported on the later rows', () => {
  assert.deepEqual(paths([ok, { ...ok, xc: 1 }, { ...ok, id: 'C3' }, { ...ok, id: 'C1' }]), ['surfaces[1].id', 'surfaces[3].id']);
});

test('xc, zc, R not a finite number -> path of the field', () => {
  assert.deepEqual(paths([{ ...ok, xc: null }]), ['surfaces[0].xc']);
  assert.deepEqual(paths([{ ...ok, zc: NaN }]), ['surfaces[0].zc']);
  assert.deepEqual(paths([{ ...ok, R: Infinity }]), ['surfaces[0].R']);
  assert.deepEqual(paths([{ ...ok, R: '52' }]), ['surfaces[0].R']);
  assert.deepEqual(paths([{ id: 'x' }]), ['surfaces[0].xc', 'surfaces[0].zc', 'surfaces[0].R']);
});

test('R <= 0 -> surfaces[i].R', () => {
  assert.deepEqual(paths([{ ...ok, R: 0 }]), ['surfaces[0].R']);
  assert.deepEqual(paths([ok, ok && { id: 'C2', xc: 1, zc: 1, R: -4 }]), ['surfaces[1].R']);
});

test('not a list, entry not an object', () => {
  assert.deepEqual(paths('x'), ['surfaces']);
  assert.deepEqual(paths({}), ['surfaces']);
  assert.deepEqual(paths([null, 3, []]), ['surfaces[0]', 'surfaces[1]', 'surfaces[2]']);
});

test('errors carry the app code and a message', () => {
  for (const e of validateSurfaces([{ id: '', xc: 1, zc: 1, R: -1 }])) {
    assert.equal(e.code, 'APP_SURFACE_INVALID');
    assert.equal(typeof e.message, 'string');
  }
});

for (const name of BENCHMARK_NAMES) {
  test(`single circles of ${name} are valid`, () => {
    assert.deepEqual(validateSurfaces(loadBenchmark(name).surfaces), []);
  });
}

test('validateAll: core errors, circle errors and input errors together', () => {
  const m = loadBenchmark('B1_homogeneous');
  assert.equal(validateAll(m).valid, true);
  m.surfaces[1].R = 0;
  const r = validateAll(m, [{ code: 'APP_NUMBER_INVALID', message: 'x', path: 'bottom' }]);
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.map((e) => e.code), ['APP_SURFACE_INVALID', 'APP_NUMBER_INVALID']);
  m.bottom = 100;
  assert.deepEqual(validateAll(m).errors.map((e) => e.code), ['E_BOTTOM_ABOVE_GROUND', 'APP_SURFACE_INVALID']);
});
