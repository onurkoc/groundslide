// Effective layer boundaries (SPEC 4, version 1.8): ends extended horizontally, clipped at the ground.

import test from 'node:test';
import assert from 'node:assert/strict';
import { extendBoundary, effectiveBoundary, effectiveLayerTops, withEffectiveLayerTops } from '../../core/layers.js';
import { heightAt } from '../../core/geometry.js';

const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;

test('extendBoundary: a short line is continued horizontally to the right edge', () => {
  assert.deepEqual(extendBoundary([[0, 5], [30, 5]], 0, 35), [[0, 5], [30, 5], [35, 5]]);
});

test('extendBoundary: points outside the model width are cut at the edge (interpolated)', () => {
  const e = extendBoundary([[-5, 1], [10, 3], [50, 3]], 0, 35);
  assert.equal(e[0][0], 0);
  assert.ok(near(e[0][1], 1 + (2 * 5) / 15));
  assert.deepEqual(e[e.length - 1], [35, 3]);
  assert.ok(e.every(([x]) => x >= 0 && x <= 35));
});

const H1_GROUND = [[0, 10], [10, 10], [25, 17.5], [35, 17.5]];

test('effectiveBoundary: the part above the ground follows the ground', () => {
  const eff = effectiveBoundary([[0, 5], [20, 18], [35, 5]], H1_GROUND);
  assert.ok(near(heightAt(eff, 20), 15));
  assert.ok(near(heightAt(eff, 0), 5));
  const xs = [...H1_GROUND.map((p) => p[0]), 20, ...eff.map((p) => p[0])];
  for (const x of xs) assert.ok(heightAt(eff, x, 'max') <= heightAt(H1_GROUND, x, 'min') + 1e-9, `x=${x}`);
});

test('effectiveBoundary: a vertical ground segment gives both ends, no NaN', () => {
  const eff = effectiveBoundary([[0, 9], [20, 11]], [[0, 5], [10, 5], [10, 13], [20, 14]]);
  const at10 = eff.filter(([x]) => x === 10);
  assert.deepEqual(at10, [[10, 5], [10, 10]]);
  assert.ok(eff.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)));
});

test('effectiveBoundary: a line below the ground is unchanged', () => {
  const top = [[0, 5], [12, 6], [35, 4]];
  const eff = effectiveBoundary(top, H1_GROUND);
  for (const [x, z] of top) assert.ok(near(heightAt(eff, x), z));
  for (const [x] of eff) assert.ok(near(heightAt(eff, x), heightAt(top, x)));
});

test('effectiveLayerTops: index-aligned, null for the top layer', () => {
  const tops = effectiveLayerTops(H1_GROUND, [{ material: 'M1', top: null }, { material: 'M1', top: [[0, 5], [30, 5]] }]);
  assert.equal(tops[0], null);
  assert.ok(near(heightAt(tops[1], 35), 5));
});

test('withEffectiveLayerTops does not modify its input', () => {
  const m = { ground: H1_GROUND, layers: [{ material: 'M1', top: null }, { material: 'M1', top: [[0, 5], [20, 18], [35, 5]] }] };
  const before = JSON.stringify(m);
  const out = withEffectiveLayerTops(m);
  assert.equal(JSON.stringify(m), before);
  assert.ok(near(heightAt(out.layers[1].top, 20), 15));
});

// ------------------------------------------------------------ calculation (invented cut geometry, no project data)
import { analyze, analyzeSurface } from '../../core/index.js';

// face [[0,5],[2,13]] (z = 5 + 4x) crossed by the line [[-3,8.2],[12,11]]
const slope = (11 - 8.2) / 15;
const xs = (8.2 + 3 * slope - 5) / (4 - slope);
const zs = 5 + 4 * xs;

function cutModel(m2Top, m3Top) {
  return {
    ground: [[-10, 5], [0, 5], [2, 13], [12, 14], [20, 14]],
    bottom: -3,
    layers: [
      { material: 'A', top: null },
      { material: 'B', top: m2Top },
      { material: 'C', top: m3Top },
    ],
    materials: {
      A: { gamma: 20, gammaSat: 20, model: 'drained', c: 3, phi: 26 },
      B: { gamma: 22, gammaSat: 22, model: 'drained', c: 2, phi: 34 },
      C: { gamma: 24, gammaSat: 24, model: 'drained', c: 20, phi: 30 },
    },
    water: null,
    loads: [{ x1: 2, x2: 10, q: 10, type: 'Q' }],
    seismic: { kh: 0 },
    analysis: { mode: 'characteristic', methods: ['bishop', 'janbu', 'spencer'], direction: 'left', slices: 50, tolerance: 0.0001, maxIterations: 100 },
  };
}
const traced = () => cutModel([[-10, 5], [0, 5], [xs, zs], [12, 11], [20, 11]], [[-10, 3], [20, 3]]);
const raw = () => cutModel([[-3, 8.2], [12, 11]], [[-1, 3], [8, 3]]);

function mirrored(m) {
  const mir = (pts) => pts.map(([x, z]) => [-x, z]).reverse();
  return {
    ...m,
    ground: mir(m.ground),
    layers: m.layers.map((l) => (l.top ? { ...l, top: mir(l.top) } : l)),
    loads: m.loads.map((l) => ({ ...l, x1: -l.x2, x2: -l.x1 })),
    analysis: { ...m.analysis, direction: 'right' },
  };
}

function sameF(a, b, label) {
  for (const k of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) {
    if (!a[k] && !b[k]) continue;
    assert.equal(a[k].valid, b[k].valid, `${label} ${k} valid`);
    if (a[k].valid) assert.ok(Math.abs(a[k].F - b[k].F) < 1e-9, `${label} ${k}: ${a[k].F} vs ${b[k].F}`);
  }
}

test('clipped boundaries give the same F as hand-traced boundaries (circle and polyline)', () => {
  const circle = { xc: -1, zc: 14, R: 9 };
  const poly = { type: 'polyline', points: [[-1, 5], [3, 2.5], [9, 6], [10.5, 13.85]] };
  for (const [label, mk] of [['left', (f) => f()], ['right (mirrored)', (f) => mirrored(f())]]) {
    const c = label === 'left' ? circle : { ...circle, xc: -circle.xc };
    const p = label === 'left' ? poly : { ...poly, points: poly.points.map(([x, z]) => [-x, z]).reverse() };
    const r1 = analyzeSurface(mk(traced), c).results;
    const r2 = analyzeSurface(mk(raw), c).results;
    assert.ok(r1.bishop.valid, `${label}: circle must be valid`);
    sameF(r1, r2, `${label} circle`);
    sameF(analyzeSurface(mk(traced), p).results, analyzeSurface(mk(raw), p).results, `${label} polyline`);
  }
});

test('clipped boundaries give the same critical F in a search', () => {
  const search = { grid: { xMin: -4, xMax: 2, zMin: 12, zMax: 18, nx: 3, nz: 3 }, radii: 6 };
  const a = analyze({ ...traced(), search });
  const b = analyze({ ...raw(), search });
  for (const k of Object.keys(a.critical)) {
    assert.ok(Math.abs(a.critical[k].F - b.critical[k].F) < 1e-9, `${k}: ${a.critical[k].F} vs ${b.critical[k].F}`);
  }
});

test('effectiveBoundary: a vertex next to a vertical ground step gives no spike above the ground', () => {
  const ground = [[0, 10], [5, 10], [5, 5], [10, 5]];
  const eff = effectiveBoundary([[0, 7], [5 + 1e-12, 7], [10, 7]], ground);
  for (const [x, z] of eff) assert.ok(x <= 5 || z <= 5 + 1e-9, `point above the ground right of the step: [${x}, ${z}]`);
});
