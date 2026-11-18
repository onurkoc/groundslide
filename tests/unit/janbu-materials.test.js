import test from 'node:test';
import assert from 'node:assert/strict';
import { janbuB1 } from '../../core/janbu.js';
import { analyzeSurface } from '../../core/index.js';
import { loadBenchmark, near } from './helpers.js';

test('Janbu: different only-c base material IDs require b1 = 0.50', () => {
  assert.equal(janbuB1([{ material: 'A', c: 20, phi: 0 }, { material: 'B', c: 30, phi: 0 }]), 0.5);
});

test('Janbu: different only-phi base material IDs require b1 = 0.50', () => {
  assert.equal(janbuB1([{ material: 'A', c: 0, phi: 0.2 }, { material: 'B', c: 0, phi: 0.4 }]), 0.5);
});

test('Janbu: a single base material retains its strength classification', () => {
  for (const [c, phi, expected] of [[20, 0, 0.69], [0, 0.3, 0.31], [20, 0.3, 0.5]]) {
    assert.equal(janbuB1([{ material: 'A', c, phi }, { material: 'A', c, phi }]), expected);
  }
});

test('Janbu: several intersected layers with the same material ID remain a single-material case', () => {
  const m = loadBenchmark('B4_undrained');
  m.materials.M1 = { model: 'undrained', cu: 30, gamma: 20, gammaSat: 20 };
  for (const layer of m.layers) layer.material = 'M1';
  const r = analyzeSurface(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  assert.ok(m.layers.length > 1);
  assert.deepEqual([...new Set(r.slices.map(s => s.material))], ['M1']);
  assert.equal(r.results.janbuCorrected.b1, 0.69);
});

test('Janbu: an additional material above the bases does not change b1', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  // The upper material pinches out before the entry and exit, so it has
  // positive weight in the body but cannot touch any slice base.
  m.ground = [[0, 10], [10, 10], [15, 12.5], [17.5, 13.75], [20, 15], [22.5, 16.25], [25, 17.5], [35, 17.5]];
  m.materials.M1 = { model: 'drained', c: 0, phi: 30, gamma: 20, gammaSat: 20 };
  m.materials.C = { model: 'undrained', cu: 40, gamma: 20, gammaSat: 20 };
  m.layers.push({ material: 'C', top: m.ground.map(([x, z]) => [x, z - (x === 17.5 || x === 20 ? 0.1 : 0)]) });
  const r = analyzeSurface(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  assert.ok(r.slices.every(s => s.material === 'C'));
  assert.equal(r.results.janbuCorrected.b1, 0.69);
  m.materials.M1.gamma = m.materials.M1.gammaSat = 40;
  const heavier = analyzeSurface(m, m.surfaces[0]);
  assert.ok(heavier.slices.reduce((v, s) => v + s.W, 0) > r.slices.reduce((v, s) => v + s.W, 0),
    'the upper material has positive weight inside the slip body');
  assert.equal(heavier.results.janbuCorrected.b1, 0.69);
});

test('Janbu: integrated V24 circle applies the multiple-material rule without changing F0', () => {
  const m = loadBenchmark('V24_low_undrained');
  m.analysis.methods = ['janbu'];
  const r = analyzeSurface(m, { xc: 28.51875, zc: 23, R: 18.002626601664982 });
  assert.equal(r.valid, true);
  assert.ok(new Set(r.slices.map(s => s.material)).size > 1);
  assert.equal(r.results.janbuCorrected.b1, 0.5);
  near(assert, r.results.janbu.F, 1.4077902424019084, 1e-12, 'unchanged F0');
  near(assert, r.results.janbuCorrected.F, 1.513938729369, 1e-12, 'same circle, corrected F');
});
