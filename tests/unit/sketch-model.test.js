// What the sketch shows (SPEC_ETAPPE2 6): drawable parts of the model; never throws.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSketch, heightAt, validPoints, colorIndex, MAX_GRID_POINTS } from '../../app/lib/sketch-model.js';
import { BENCHMARK_NAMES, loadBenchmark } from './helpers.js';

test('B1: ground, bottom, clip, one layer, grid with centres, single circles, legend', () => {
  const s = buildSketch(loadBenchmark('B1_homogeneous'));
  assert.equal(s.ground.length, 4);
  assert.equal(s.bottom, 0);
  assert.deepEqual(s.clip, [[0, 30], [50, 30], [80, 50], [130, 50], [130, 0], [0, 0]]);
  assert.equal(s.layers.length, 1);
  assert.deepEqual(s.layers[0].points, s.clip);
  assert.equal(s.layers[0].colorIndex, 0);
  assert.equal(s.grid.centers.length, 31 * 41);
  assert.deepEqual(s.grid.centers[0], [20, 40]);
  assert.deepEqual(s.grid.centers[30], [80, 40]);
  assert.deepEqual(s.grid.centers.at(-1), [80, 120]);
  assert.equal(s.surfaces.length, 3);
  assert.deepEqual(s.legend, [{ id: 'M1', name: 'Soil 1', colorIndex: 0 }]);
  assert.deepEqual(s.water, []);
  assert.deepEqual(s.loads, []);
  assert.deepEqual(s.bounds, { xMin: 0, xMax: 130, zMin: 0, zMax: 120 });
});

test('B3: two layers, later layer covers earlier ones, colours by position', () => {
  const s = buildSketch(loadBenchmark('B3_two_layers'));
  assert.equal(s.layers.length, 2);
  assert.deepEqual(s.layers.map((l) => l.colorIndex), [0, 1]);
  assert.deepEqual(s.layers[1].points.slice(0, 4), [[0, 30], [50, 30], [57.5, 35], [130, 35]]);
  assert.deepEqual(s.layers[1].points.slice(-2), [[130, 0], [0, 0]]);
});

test('B5: load; B2: water; B6: seismic model draws as usual', () => {
  const b5 = buildSketch(loadBenchmark('B5_surcharge'));
  assert.deepEqual(b5.loads, [{ index: 0, x1: 80, x2: 95, q: 50, type: 'Q' }]);
  assert.ok(buildSketch(loadBenchmark('B2_water')).water.length >= 2);
  assert.ok(buildSketch(loadBenchmark('B6_seismic')).ground.length >= 2);
});

test('grid with more than 2000 points: only the rectangle', () => {
  const m = loadBenchmark('B1_homogeneous');
  m.search.grid.nx = 50;
  m.search.grid.nz = 50;
  assert.ok(50 * 50 > MAX_GRID_POINTS);
  const g = buildSketch(m).grid;
  assert.equal(g.centers, null);
  assert.deepEqual([g.xMin, g.xMax, g.zMin, g.zMax], [20, 80, 40, 120]);
  m.search.grid.nx = 1;
  m.search.grid.nz = 1;
  assert.deepEqual(buildSketch(m).grid.centers, [[20, 40]]);
});

test('parts that are missing or not numeric are left out', () => {
  const m = loadBenchmark('B3_two_layers');
  m.ground[1] = [null, 30];
  m.layers[1].top[2] = ['x', 35];
  m.loads = [{ x1: 1, x2: null, q: 2, type: 'G' }, { x1: 5, x2: 4, q: 1, type: 'G' }, { x1: 1, x2: 2, q: 3, type: 'Z' }];
  m.search.grid.xMin = null;
  m.surfaces = [{ id: 'a', xc: 1, zc: 2, R: 0 }, { id: 'b', xc: 1, zc: null, R: 3 }, { id: 'c', xc: 1, zc: 2, R: 3 }];
  const s = buildSketch(m);
  assert.equal(s.ground.length, 3);
  assert.equal(s.layers[1].points.length, 3 + 2);
  assert.deepEqual(s.loads, [{ index: 2, x1: 1, x2: 2, q: 3, type: null }]);
  assert.equal(s.grid, null);
  assert.deepEqual(s.surfaces.map((x) => x.id), ['c']);
});

test('without bottom: no clip and no layers; without ground: nothing but legend', () => {
  const m = loadBenchmark('B1_homogeneous');
  m.bottom = null;
  let s = buildSketch(m);
  assert.equal(s.clip, null);
  assert.deepEqual(s.layers, []);
  assert.equal(s.ground.length, 4);
  m.ground = null;
  s = buildSketch(m);
  assert.deepEqual(s.ground, []);
  assert.equal(s.clip, null);
  assert.equal(s.legend.length, 1);
});

test('a layer with an unknown material is not drawn', () => {
  const m = loadBenchmark('B3_two_layers');
  m.layers[1].material = 'ZZ';
  assert.equal(buildSketch(m).layers.length, 1);
  m.layers[1].material = null;
  assert.equal(buildSketch(m).layers.length, 1);
});

test('buildSketch never throws, for any input', () => {
  const garbage = [null, undefined, 0, 'x', [], {}, { ground: 5 }, { ground: [[1]] , layers: 'x'}, { layers: [null, 3, { top: 'x' }], materials: 5 },
    { ground: [[0, 0], [1, 1]], bottom: -1, layers: [{ material: 'a', top: null }], materials: { a: null } },
    { search: { grid: 'x' }, surfaces: 'x', loads: 'x', water: 5 }, { search: { grid: { xMin: 0, xMax: 1, zMin: 0, zMax: 1, nx: 'a', nz: {} } } },
    { water: [[0, 1], null, 'x'], ground: [[0, 0], [10, 5]], loads: [null, 3, { x1: 0, x2: 1, q: 1 }] }];
  for (const g of garbage) assert.doesNotThrow(() => buildSketch(g), JSON.stringify(g));
  const evil = {};
  Object.defineProperty(evil, 'ground', { get() { throw new Error('boom'); } });
  assert.doesNotThrow(() => buildSketch(evil));
});

test('every benchmark builds a sketch with a frame', () => {
  for (const name of BENCHMARK_NAMES) {
    const s = buildSketch(loadBenchmark(name));
    assert.ok(s.bounds && s.bounds.xMax > s.bounds.xMin && s.bounds.zMax > s.bounds.zMin, name);
    assert.ok(s.layers.length >= 1, name);
  }
});

test('heightAt, validPoints, colorIndex', () => {
  const g = [[0, 30], [50, 30], [80, 50], [130, 50]];
  assert.equal(heightAt(g, 25), 30);
  assert.equal(heightAt(g, 65), 40);
  assert.equal(heightAt(g, 130), 50);
  assert.equal(heightAt(g, -1), null);
  assert.equal(heightAt([[0, 1], [5, 1], [5, 9], [10, 9]], 5), 9, 'vertical step: the higher value');
  assert.deepEqual(validPoints([[1, 2], [null, 3], 'x', [4, NaN], [5, 6]]), [[1, 2], [5, 6]]);
  assert.equal(colorIndex(0), 0);
  assert.equal(colorIndex(7), 7);
  assert.equal(colorIndex(8), 0);
  assert.equal(colorIndex(10), 2);
});
