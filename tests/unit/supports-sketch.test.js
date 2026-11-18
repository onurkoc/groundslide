// Order 22 (SPEC_ETAPPE3 9): sketch of the supports. Drawing geometry of the elements (also for a slope that falls to the left and
// one that falls to the right), which elements are drawn, handles, picking, the points and forces after a run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { slopeDirection, inwardVector, isDrawable, supportShapes, groundBetween } from '../../app/lib/supports-sketch.js';
import { emptySupport, SUPPORT_TYPES } from '../../app/lib/supports-edit.js';
import { buildHandles, pickHandle, isSupportHandle, dragValues, editFields, setHandleValues, hitSupport, canDeleteHandle } from '../../app/lib/handles.js';
import { buildResultOverlay, supportPoints, forceLabel } from '../../app/lib/result-sketch.js';
import { formatForce } from '../../app/lib/numbers.js';
import { validPoints } from '../../app/lib/sketch-model.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const nearPoint = (p, q, eps = 1e-9) => { near(p[0], q[0], eps); near(p[1], q[1], eps); };

// the elements of the Slide2 cases (SPEC_ETAPPE3 7.2.1): heads on the slope line z = 30 + (x - 50) * 2/3 of B1, which falls to the LEFT
const NAIL_S1_END = [75.9633662653296, 29.3339868339687];
const ANCHOR_S4_END = [73.6209366479538, 34.4960199709529];

/** B1 mirrored at x -> 130 - x: the slope falls to the RIGHT (direction 'right'); supports mirrored too. */
function mirrored(model) {
  const X = 130;
  const m = structuredClone(model);
  m.ground = m.ground.map(([x, z]) => [X - x, z]).reverse();
  m.analysis.direction = 'right';
  m.supports = m.supports.map((s) => (s.type === 'shotcrete' ? { ...s, x1: X - s.x2, x2: X - s.x1 } : { ...s, x: X - s.x }));
  return m;
}

test('direction of the slope as the core decides it: given, else from the ends of the ground line, else unknown', () => {
  const m = loadBenchmark('B1_homogeneous');
  assert.equal(slopeDirection(m), 'left', 'analysis.direction left');
  m.analysis.direction = 'auto';
  assert.equal(slopeDirection(m), 'left', 'auto: the left end is lower');
  m.ground = [[0, 50], [50, 50], [80, 30], [130, 30]];
  assert.equal(slopeDirection(m), 'right', 'auto: the left end is higher');
  m.analysis.direction = 'right';
  m.ground = [[0, 30], [50, 30], [80, 50], [130, 50]];
  assert.equal(slopeDirection(m), 'right', 'given wins over the ground');
  m.analysis.direction = 'auto';
  m.ground = [[0, 30], [130, 30]];
  assert.equal(slopeDirection(m), null, 'equal ends: cannot be decided');
  assert.equal(slopeDirection({}), null);
  assert.equal(slopeDirection(null), null);
  assert.equal(slopeDirection({ analysis: { direction: 'auto' }, ground: [[0, 1]] }), null);
});

test('"into the slope" (SPEC_ETAPPE3 2.1): towards the crown and down, also for a slope that falls to the left', () => {
  const [lx, lz] = inwardVector(30, 'left'); // the crown is at +x
  near(lx, Math.cos(Math.PI / 6));
  near(lz, -0.5);
  const [rx, rz] = inwardVector(30, 'right'); // the crown is at -x
  near(rx, -Math.cos(Math.PI / 6));
  near(rz, -0.5);
  assert.deepEqual(inwardVector(0, 'left'), [1, -0]);
  assert.deepEqual(inwardVector(0, 'right'), [-1, -0]);
  assert.equal(inwardVector(-10, 'left')[1] > 0, true, 'a negative angle points upwards (allowed by the core)');
});

test('nail S1: a line from the head to the end of the Slide2 nail; mirrored model: the same line mirrored', () => {
  const m = loadBenchmark('S1_nail_head');
  const [shape] = supportShapes(m);
  assert.equal(shape.type, 'nail');
  assert.equal(shape.id, 'N1');
  assert.deepEqual(shape.head, [66.7124382544835, 41.141625502989]);
  assert.equal(shape.segments.length, 1);
  nearPoint(shape.segments[0].b, NAIL_S1_END, 1e-9);
  assert.ok(shape.segments[0].b[0] > shape.head[0], 'falls to the left: into the slope is +x');

  const mm = mirrored(m);
  const [mshape] = supportShapes(mm);
  nearPoint(mshape.head, [130 - 66.7124382544835, 41.141625502989]);
  nearPoint(mshape.segments[0].b, [130 - NAIL_S1_END[0], NAIL_S1_END[1]], 1e-9);
  assert.ok(mshape.segments[0].b[0] < mshape.head[0], 'falls to the right: into the slope is -x');
  // the same with direction auto
  mm.analysis.direction = 'auto';
  nearPoint(supportShapes(mm)[0].segments[0].b, [130 - NAIL_S1_END[0], NAIL_S1_END[1]], 1e-9);
});

test('anchor S4: thin free length, thick bond length, ends where the Slide2 anchor ends', () => {
  const m = loadBenchmark('S4_anchor_free');
  const [shape] = supportShapes(m);
  assert.equal(shape.type, 'anchor');
  assert.deepEqual(shape.segments.map((s) => s.part), ['free', 'bond']);
  const free = Math.hypot(shape.segments[0].b[0] - shape.segments[0].a[0], shape.segments[0].b[1] - shape.segments[0].a[1]);
  near(free, 9, 1e-9);
  assert.deepEqual(shape.segments[1].a, shape.segments[0].b, 'the bond length follows the free length');
  nearPoint(shape.segments[1].b, ANCHOR_S4_END, 1e-9);
  const [mshape] = supportShapes(mirrored(m));
  near(mshape.segments[1].b[0], 130 - ANCHOR_S4_END[0], 1e-9);
});

test('piles S6: vertical down from the head, length 15; shotcrete as a band on the ground line from x1 to x2', () => {
  const piles = supportShapes(loadBenchmark('S6_piles'));
  assert.equal(piles.length, 4);
  for (const p of piles) {
    assert.equal(p.type, 'pile');
    assert.equal(p.segments[0].b[0], p.head[0]);
    near(p.head[1] - p.segments[0].b[1], 15);
  }
  const m = loadBenchmark('B1_homogeneous');
  m.supports = [{ id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 }];
  const [band] = supportShapes(m);
  assert.deepEqual(band.ends, [[50, 30], [80, 50]]);
  assert.deepEqual(band.segments.map((s) => [s.a, s.b]), [[[50, 30], [80, 50]]]);
  m.supports[0].x1 = 40;
  m.supports[0].x2 = 100;
  assert.deepEqual(supportShapes(m)[0].segments.map((s) => s.a), [[40, 30], [50, 30], [80, 50]], 'the vertices of the ground between the ends are followed');
  assert.deepEqual(supportShapes(m)[0].ends, [[40, 30], [100, 50]]);
  m.supports[0].x2 = 200;
  assert.deepEqual(supportShapes(m), [], 'an end off the ground line: not drawn');
  assert.equal(groundBetween(validPoints(m.ground), 40, 200), null);
});

test('only complete, usable elements are drawn: a new empty row of each type is not (no crash), nor one that lacks a field', () => {
  const m = loadBenchmark('B1_homogeneous');
  for (const type of SUPPORT_TYPES) {
    m.supports = [emptySupport(type, 'X')];
    assert.deepEqual(supportShapes(m), [], type);
    assert.deepEqual(buildHandles(m).filter((h) => h.type.startsWith('support')), [], type);
  }
  const full = {
    nail: { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true },
    anchor: { id: 'A1', type: 'anchor', x: 65.5, z: 40.3, angle: 35, freeLength: 9, bondLength: 1, spacing: 1, P0: 40, Rk: 40 },
    pile: { id: 'P1', type: 'pile', x: 75, z: 46.6, length: 15, spacing: 1, shear: 20 },
    shotcrete: { id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 },
  };
  for (const type of SUPPORT_TYPES) {
    m.supports = [full[type]];
    assert.equal(supportShapes(m).length, 1, `${type} is drawn when complete`);
    for (const key of Object.keys(full[type]).filter((k) => !['id', 'type'].includes(k))) {
      const broken = { ...full[type] };
      delete broken[key];
      m.supports = [broken];
      assert.deepEqual(supportShapes(m), [], `${type} without ${key}`);
      m.supports = [{ ...full[type], [key]: null }];
      assert.deepEqual(supportShapes(m), [], `${type} with ${key}: null`);
    }
  }
});

test('ungültige Werte: not drawn (angle out of range, length / spacing <= 0, force < 0, x1 >= x2, bond with both forms or half a form)', () => {
  const m = loadBenchmark('B1_homogeneous');
  const nail = { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true };
  const bad = [
    { angle: 90 }, { angle: -90 }, { angle: 120 }, { length: 0 }, { spacing: 0 }, { spacing: -1 }, { tensile: -1 },
    { hasHead: 'yes' }, { bond: { tau: 1, diameter: 0.1, q: 2 } }, { bond: { tau: 80 } }, { bond: { tau: 80, diameter: 0 } }, { bond: {} }, { bond: { q: -1 } }, { x: Infinity }, { x: '66' },
  ];
  for (const change of bad) {
    m.supports = [{ ...nail, ...change }];
    assert.deepEqual(supportShapes(m), [], JSON.stringify(change));
  }
  m.supports = [{ ...nail, bond: { tau: 80, diameter: 0.1 } }];
  assert.equal(supportShapes(m).length, 1, 'the other form of the bond is drawn as well');
  m.supports = [{ id: 'S', type: 'shotcrete', x1: 80, x2: 50, thickness: 1, tau: 1 }];
  assert.deepEqual(supportShapes(m), [], 'x1 >= x2');
  m.supports = [{ id: 'S', type: 'shotcrete', x1: 50, x2: 50, thickness: 1, tau: 1 }];
  assert.deepEqual(supportShapes(m), []);
  m.supports = ['x', null, 5, { type: 'cable' }, { id: 'P', type: 'pile', x: 70, z: 43, length: 5, spacing: 1, shear: 1 }];
  assert.deepEqual(supportShapes(m).map((s) => s.index), [4], 'no crash on entries that are no elements');
  for (const supports of [null, 'x', 5, {}, undefined]) {
    m.supports = supports;
    assert.deepEqual(supportShapes(m), []);
    assert.doesNotThrow(() => buildHandles(m));
  }
  assert.deepEqual(supportShapes(null), []);
  assert.equal(isDrawable(null, 'left'), false);
});

test('rules about place and context do not stop the drawing: id, factors, head above the ground, outside the model (the element can be moved)', () => {
  const m = loadBenchmark('B1_homogeneous');
  const nail = { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true };
  for (const change of [{ id: '' }, { gammaM: 0 }, { z: 60 }, { x: 140 }]) {
    m.supports = [{ ...nail, ...change }];
    assert.equal(supportShapes(m).length, 1, JSON.stringify(change));
  }
  m.supports = [nail, { ...nail }];
  assert.equal(supportShapes(m).length, 2, 'a repeated id');
  // nail and anchor need the direction of the slope; pile and shotcrete do not
  m.analysis.direction = 'auto';
  m.ground = [[0, 30], [130, 30]];
  m.supports = [nail, { id: 'P1', type: 'pile', x: 70, z: 30, length: 5, spacing: 1, shear: 1 }, { id: 'S1', type: 'shotcrete', x1: 10, x2: 20, thickness: 1, tau: 1 }];
  assert.deepEqual(supportShapes(m).map((s) => s.type), ['pile', 'shotcrete']);
});

test('handles: head of nail, anchor and pile (x and z), the two ends of the shotcrete (x only), after the loads and before the search rectangle', () => {
  const m = loadBenchmark('B1_homogeneous');
  m.loads = [{ x1: 60, x2: 100, q: 10, type: 'Q' }];
  m.supports = [
    { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 50, length: 15, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true },
    { id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 },
    { id: 'P1', type: 'pile', x: 75, z: 46.6, length: 15, spacing: 1, shear: 20 },
  ];
  const handles = buildHandles(m);
  assert.deepEqual(handles.map((h) => h.type).filter((t) => t !== 'ground' && t !== 'centre' && t !== 'radius'), ['load', 'load', 'support', 'supportEnd', 'supportEnd', 'support', 'grid', 'grid', 'grid', 'grid']);
  const sup = handles.filter((h) => h.type.startsWith('support'));
  assert.deepEqual(sup.map((h) => [h.id, h.x, h.z]), [['support:0', 66, 40.6], ['supportEnd:1:1', 50, 30], ['supportEnd:1:2', 80, 50], ['support:2', 75, 46.6]]);
  assert.equal(new Set(handles.map((h) => h.id)).size, handles.length);
  assert.equal(canDeleteHandle(sup[0]), false, 'no "Delete point" for a support');
  // the move: x and z of the head, x of an end of the shotcrete; snapped to the grid width; nothing is limited
  assert.deepEqual(dragValues(sup[0], { x: 66.04, z: 40.52 }, 0.5), { x: 66, z: 40.5 });
  assert.deepEqual(dragValues(sup[0], { x: 66.04, z: 40.52 }), { x: 66.04, z: 40.52 });
  assert.deepEqual(dragValues(sup[1], { x: 52.3, z: 99 }, 1), { x: 52 });
  assert.deepEqual(editFields(sup[0]), [{ key: 'x', value: 66 }, { key: 'z', value: 40.6 }]);
  assert.deepEqual(editFields(sup[1]), [{ key: 'x', value: 50 }]);
  // writing into the model
  assert.equal(setHandleValues(m, sup[0], { x: 67, z: 41 }), true);
  assert.deepEqual([m.supports[0].x, m.supports[0].z], [67, 41]);
  assert.equal(setHandleValues(m, sup[1], { x: 55 }), true);
  assert.equal(setHandleValues(m, sup[2], { x: 85 }), true);
  assert.deepEqual([m.supports[1].x1, m.supports[1].x2], [55, 85]);
  assert.deepEqual(Object.keys(m.supports[1]), ['id', 'type', 'x1', 'x2', 'thickness', 'tau'], 'no field is added');
  assert.equal(setHandleValues(m, { type: 'support', index: 9 }, { x: 1 }), false, 'the element is gone');
  assert.equal(setHandleValues({}, sup[0], { x: 1 }), false);
  // caught within 8 px of the handle
  const toScreen = (x, z) => [x * 10, -z * 10];
  assert.equal(pickHandle(sup, 80 * 10 + 5, -500 + 5, toScreen)?.id, 'supportEnd:1:2', 'within 8 px of the end of the band');
  assert.equal(pickHandle(sup, 80 * 10 + 30, -500, toScreen), null);
});

test('mirrored model: the handles sit at the mirrored heads, the move writes x of the input frame', () => {
  const m = mirrored(loadBenchmark('S1_nail_head'));
  const handle = buildHandles(m).find((h) => h.type === 'support');
  near(handle.x, 130 - 66.7124382544835);
  setHandleValues(m, handle, { x: 60, z: 41 });
  assert.deepEqual([m.supports[0].x, m.supports[0].z], [60, 41]);
  const [shape] = supportShapes(m);
  assert.equal(shape.head[0], 60);
  assert.ok(shape.segments[0].b[0] < 60, 'still into the slope (towards the crown at the left)');
});

test('double click on an element: the element at the pixel, the nearest line wins, a band counts by its centre line', () => {
  const m = loadBenchmark('B1_homogeneous');
  m.supports = [
    { id: 'N1', type: 'nail', x: 66, z: 40.6, angle: 45, length: 10, spacing: 1, bond: { q: 50 }, tensile: 300, hasHead: true },
    { id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 },
    { id: 'A1', type: 'anchor', x: 60, z: 37.3, angle: 20, freeLength: 5, bondLength: 5, spacing: 1, P0: 1, Rk: 1 },
  ];
  const shapes = supportShapes(m);
  const toScreen = (x, z) => [x * 10, -z * 10];
  // the middle of the nail
  const mid = shapes[0].segments[0];
  const px = toScreen((mid.a[0] + mid.b[0]) / 2, (mid.a[1] + mid.b[1]) / 2);
  assert.equal(hitSupport(shapes, px[0] + 2, px[1] + 2, toScreen).shape.id, 'N1');
  assert.equal(hitSupport(shapes, px[0] + 30, px[1] - 30, toScreen), null, 'beside the line');
  // on the band (here: on the ground line between x1 and x2)
  const on = toScreen(65, 40);
  assert.equal(hitSupport(shapes, on[0], on[1], toScreen).shape.id, 'S1');
  assert.equal(hitSupport(shapes, on[0], on[1] + 20, toScreen), null);
  // the anchor: on its bond length
  const bond = shapes[2].segments[1];
  const bp = toScreen((bond.a[0] + bond.b[0]) / 2, (bond.a[1] + bond.b[1]) / 2);
  assert.equal(hitSupport(shapes, bp[0], bp[1], toScreen).shape.id, 'A1');
  assert.equal(hitSupport([], 0, 0, toScreen), null);
});

// ---------- after a run: points and forces ----------

test('points after a run: every element with intersects: true at its point; nothing for the others, without a result or without supports', () => {
  const result = {
    critical: {
      spencer: {
        supports: [
          { id: 'N1', type: 'nail', intersects: true, point: [70.5, 40], perMetre: 80 },
          { id: 'N2', type: 'nail', intersects: false },
          { id: 'P1', type: 'pile', intersects: true, point: [60, 35.25], perMetre: 20 },
          { id: 'X', type: 'pile', intersects: true, point: null, perMetre: 1 },
        ],
      },
      bishop: { supports: [{ id: 'B', intersects: true, point: [1, 1], perMetre: 1 }] },
    },
  };
  assert.deepEqual(supportPoints(result), [{ id: 'N1', x: 70.5, z: 40, perMetre: 80 }, { id: 'P1', x: 60, z: 35.25, perMetre: 20 }], 'the Spencer circle only');
  for (const none of [null, undefined, {}, { critical: {} }, { critical: { spencer: null } }, { critical: { spencer: {} } }, { critical: { spencer: { supports: 'x' } } }]) assert.deepEqual(supportPoints(none), []);
  const overlay = buildResultOverlay({ ...result, critical: { spencer: { ...result.critical.spencer, xc: 50, zc: 60, R: 30, F: 1.2 } }, grid: null }, { method: 'spencer', contour: false, grid: null });
  assert.deepEqual(overlay.supportPoints.map((p) => p.id), ['N1', 'P1']);
  assert.equal(buildResultOverlay(null, { method: 'spencer', contour: false, grid: null }), null);
});

test('force label: perMetre in kN/m with one decimal', () => {
  assert.equal(forceLabel(20), '20.0 kN/m');
  assert.equal(forceLabel(16.53107965906083), '16.5 kN/m');
  assert.equal(forceLabel(0), '0.0 kN/m');
  assert.equal(formatForce(26.556), '26.6');
  assert.equal(formatForce(null), '');
});

test('S6 after a run (small search around the circle of Slide2): four points at the piles, 20.0 kN/m each; the points are the output points', () => {
  const m = loadBenchmark('S6_piles');
  delete m.expected;
  m.search = { grid: { xMin: 42, xMax: 43.5, zMin: 77, zMax: 78.5, nx: 2, nz: 2 }, radii: 3 };
  const result = analyze(m);
  const points = supportPoints(result);
  assert.deepEqual(points.map((p) => p.id), ['P1', 'P2', 'P3', 'P4']);
  for (const p of points) {
    near(p.perMetre, 20, 1e-9);
    assert.equal(forceLabel(p.perMetre), '20.0 kN/m');
  }
  nearPoint([points[0].x, points[0].z], result.critical.spencer.supports[0].point, 1e-12);
  // each point lies on the circle of the result
  const c = result.critical.spencer;
  for (const p of points) near(Math.hypot(p.x - c.xc, p.z - c.zc), c.R, 1e-6);
  // and on the pile (vertical line from its head)
  m.supports.forEach((s, i) => { assert.equal(points[i].x, s.x); assert.ok(points[i].z < s.z && points[i].z > s.z - s.length); });
});

// ---------- priority of the handles (SPEC_ETAPPE3 9, order 23) ----------

test('priority: a shotcrete end exactly on the toe vertex of the slope wins against the ground handle; so does a pile head on a vertex', () => {
  const toScreen = (x, z) => [x * 10, -z * 10];
  const m = loadBenchmark('B1_homogeneous');
  m.supports = [{ id: 'S1', type: 'shotcrete', x1: 50, x2: 80, thickness: 0.15, tau: 1500 }];
  const handles = buildHandles(m);
  const ground = handles.filter((h) => h.type === 'ground');
  assert.ok(ground.some((h) => h.x === 50 && h.z === 30), 'the ground handle at the toe exists and comes first in the list');
  assert.ok(handles.findIndex((h) => h.type === 'ground') < handles.findIndex((h) => h.type === 'supportEnd'));
  assert.equal(pickHandle(handles, 500, -300, toScreen).id, 'supportEnd:0:1', 'toe: the shotcrete end');
  assert.equal(pickHandle(handles, 800, -500, toScreen).id, 'supportEnd:0:2', 'crest: the shotcrete end');
  assert.equal(pickHandle(handles, 503, -303, toScreen).id, 'supportEnd:0:1', 'a pixel beside: still the shotcrete end');
  // a handle that is nearer still wins, also against a support handle
  const nearer = pickHandle(handles, 500 - 5, -300, toScreen);
  assert.equal(nearer.type, 'supportEnd');
  const m2 = loadBenchmark('B1_homogeneous');
  m2.supports = [{ id: 'P1', type: 'pile', x: 50, z: 30, length: 5, spacing: 1, shear: 10 }];
  const h2 = buildHandles(m2);
  assert.equal(pickHandle(h2, 500, -300, toScreen).type, 'support', 'pile head on the vertex');
  // the ground vertex that is shadowed is reached through its table (it still has a handle in the list)
  assert.ok(h2.some((h) => h.type === 'ground' && h.x === 50 && h.z === 30));
});

test('without supports the earlier handle still wins on a tie: the ground vertex against the end of a load', () => {
  const toScreen = (x, z) => [x * 10, -z * 10];
  const m = loadBenchmark('B1_homogeneous');
  m.loads = [{ x1: 50, x2: 80, q: 10, type: 'Q' }];
  const handles = buildHandles(m);
  assert.equal(handles.some((h) => h.type.startsWith('support')), false);
  assert.equal(pickHandle(handles, 500, -300, toScreen).type, 'ground');
  assert.equal(pickHandle(handles, 800, -500, toScreen).type, 'ground');
  assert.equal(isSupportHandle({ type: 'support' }) && isSupportHandle({ type: 'supportEnd' }) && !isSupportHandle({ type: 'load' }), true);
});
