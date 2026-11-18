// applyPartialFactors (SPEC 2.4)

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPartialFactors } from '../../core/factors.js';
import { loadBenchmark } from './helpers.js';

const DEG = Math.PI / 180;

function siaModel() {
  const m = loadBenchmark('H1_handcalc_dry');
  m.analysis.mode = 'sia';
  m.materials.M2 = { name: '', gamma: 18, gammaSat: 19, model: 'undrained', cu: 60 };
  m.loads = [
    { x1: 0, x2: 5, q: 10, type: 'G' },
    { x1: 6, x2: 8, q: 20, type: 'Q' },
  ];
  return m;
}

test('sia with default factors: tan(phi_d), c_d, cu_d, loads', () => {
  const m = siaModel();
  const d = applyPartialFactors(m);

  const M1 = d.materials.M1;
  assert.ok(Math.abs(Math.tan(M1.phi * DEG) - Math.tan(20 * DEG) / 1.2) < 1e-12);
  assert.ok(Math.abs(M1.c - 20 / 1.5) < 1e-12);
  assert.ok(Math.abs(d.materials.M2.cu - 60 / 1.5) < 1e-12);

  assert.ok(Math.abs(d.loads[0].q - 10) < 1e-12, 'type G unchanged (gamma_G = 1.0)');
  assert.ok(Math.abs(d.loads[1].q - 20 * 1.3) < 1e-12, 'type Q times 1.3');

  // unit weights and everything else unchanged
  assert.equal(d.materials.M1.gamma, 20);
  assert.equal(d.materials.M2.gammaSat, 19);
  assert.deepEqual(d.ground, m.ground);
  assert.deepEqual(d.seismic, m.seismic);
});

test('sia: the input model is not modified, a copy is returned', () => {
  const m = siaModel();
  const before = JSON.stringify(m);
  const d = applyPartialFactors(m);
  assert.notEqual(d, m);
  assert.equal(JSON.stringify(m), before);
});

test('sia: factors from the input override the defaults', () => {
  const m = siaModel();
  m.partialFactors = { phi: 1.1, c: 1.3, cu: 1.3, gamma: 1.0, G: 1.35, Q: 1.5, R: 1.0 };
  const d = applyPartialFactors(m);
  assert.ok(Math.abs(Math.tan(d.materials.M1.phi * DEG) - Math.tan(20 * DEG) / 1.1) < 1e-12);
  assert.ok(Math.abs(d.materials.M1.c - 20 / 1.3) < 1e-12);
  assert.ok(Math.abs(d.materials.M2.cu - 60 / 1.3) < 1e-12);
  assert.ok(Math.abs(d.loads[0].q - 10 * 1.35) < 1e-12);
  assert.ok(Math.abs(d.loads[1].q - 20 * 1.5) < 1e-12);
});

test('sia: missing partialFactors fall back to the defaults of SPEC 2.2', () => {
  const m = siaModel();
  delete m.partialFactors;
  const d = applyPartialFactors(m);
  assert.ok(Math.abs(d.materials.M1.c - 20 / 1.5) < 1e-12);
  assert.ok(Math.abs(d.loads[1].q - 26) < 1e-12);
});

test('characteristic: all values unchanged', () => {
  const m = siaModel();
  m.analysis.mode = 'characteristic';
  const d = applyPartialFactors(m);
  assert.deepEqual(d, m);
  assert.notEqual(d, m);
});
