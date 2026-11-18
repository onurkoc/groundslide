import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalBenchmarkModel } from '../../tools/verification-state.js';

const model = JSON.parse(fs.readFileSync(new URL('../benchmarks/B1_homogeneous.json', import.meta.url), 'utf8'));
const reference = canonicalBenchmarkModel(model);

test('benchmark guard: changes to expected and surfaces keep the check passing', () => {
  const changed = structuredClone(model);
  changed.expected.source = 'other source';
  changed.expected.search.bishop = 9.99;
  changed.expected.surfaces = { X: { bishop: 1 } };
  changed.surfaces.push({ id: 'S_new', xc: 1, zc: 2, R: 3 });
  delete changed.expected;
  assert.equal(canonicalBenchmarkModel(changed), reference);
  const noSurfaces = structuredClone(model);
  delete noSurfaces.surfaces;
  assert.equal(canonicalBenchmarkModel(noSurfaces), reference);
});

test('benchmark guard: key order does not matter', () => {
  const reordered = Object.fromEntries(Object.entries(model).reverse());
  assert.equal(canonicalBenchmarkModel(reordered), reference);
});

test('benchmark guard: geometry, materials, grid and analysis changes fail the check', () => {
  const edits = [
    m => { m.ground[1][1] += 0.001; },
    m => { m.bottom += 1; },
    m => { m.materials[Object.keys(m.materials)[0]].phi += 1; },
    m => { m.search.grid.nx += 1; },
    m => { m.analysis.tolerance *= 2; },
    m => { m.partialFactors.R = 1.5; },
    m => { m.loads = [{ x1: 0, x2: 1, q: 1 }]; },
  ];
  for (const edit of edits) {
    const changed = structuredClone(model);
    edit(changed);
    assert.notEqual(canonicalBenchmarkModel(changed), reference);
  }
});
