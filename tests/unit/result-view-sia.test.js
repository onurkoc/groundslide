// Overview in mode sia (SPEC_ETAPPE2 8.1): gamma_R, utilisation and verdict per method, none for Janbu F0.
// The model is a copy of B1 made in the test (the file under tests/benchmarks/ is not changed); the search
// grid is coarse so that the calculation is short. One analyze() in this file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { overviewTable } from '../../app/lib/result-view.js';

const model = loadBenchmark('B1_homogeneous');
const original = JSON.stringify(model);
model.analysis.mode = 'sia';
model.analysis.methods = ['bishop', 'janbu', 'spencer'];
model.partialFactors = { phi: 1.2, c: 1.5, gamma: 1, R: 1.1 };
model.search = { grid: { xMin: 20, xMax: 80, zMin: 40, zMax: 120, nx: 7, nz: 9 }, radii: 12 };
model.surfaces = [];
const result = analyze(model);

test('sia: check present for Bishop, Janbu corrected and Spencer, not for Janbu F0', () => {
  assert.equal(JSON.parse(original).analysis.mode, 'characteristic', 'the benchmark itself is unchanged');
  const t = overviewTable(result);
  assert.equal(t.hasCheck, true);
  assert.equal(t.gammaR, 1.1);
  assert.deepEqual(t.rows.map((r) => r.method), ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
  const by = Object.fromEntries(t.rows.map((r) => [r.method, r]));
  assert.equal(by.janbu.check, null, 'Janbu F0 without verdict');
  for (const m of ['bishop', 'janbuCorrected', 'spencer']) {
    const c = result.check[m];
    assert.deepEqual(by[m].check, { gammaR: 1.1, utilisation: c.utilisation, ok: c.ok }, m);
    assert.ok(by[m].check.utilisation > 0);
    assert.equal(by[m].check.ok, by[m].F >= 1.1, `${m}: verdict agrees with F >= gamma_R`);
    assert.equal(by[m].check.utilisation, 1.1 / by[m].F, m);
  }
});

test('characteristic mode: no check columns', () => {
  const copy = { ...result };
  delete copy.check;
  const t = overviewTable(copy);
  assert.equal(t.hasCheck, false);
  assert.ok(t.rows.every((r) => r.check === null));
});
