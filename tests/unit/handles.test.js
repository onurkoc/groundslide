// Handles of the sketch (SPEC_ETAPPE2 6.1): list in the order of the table, catching, the values of a move, writing into the
// model, deleting, and inserting a point on a line.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHandles, pickHandle, dragValues, editFields, canDeleteHandle, setHandleValues, deleteHandlePoint, lineTargets, hitSegment, distanceToSegment, insertionPoint, insertOnSegment, radiusHandleAngle, pointInPolygon, CATCH_PX, DRAG_MIN_PX, LINE_CATCH_PX } from '../../app/lib/handles.js';
import { heightAt } from '../../app/lib/sketch-model.js';
import { worldToScreen } from '../../app/lib/view.js';

const makeModel = () => ({
  meta: { name: 't' },
  ground: [[0, 30], [50, 30], [80, 50], [130, 50]],
  bottom: 0,
  layers: [{ material: 'M1', top: null }, { material: 'M2', top: [[0, 20], [50, 20], [130, 22]] }],
  materials: { M1: { name: 'a' }, M2: { name: 'b' } },
  water: [[0, 25], [130, 25]],
  loads: [{ x1: 60, x2: 100, q: 10, type: 'Q' }],
  search: { grid: { xMin: 20, xMax: 80, zMin: 40, zMax: 120, nx: 31, nz: 41 }, radii: 40 },
  surfaces: [{ id: 'C1', xc: 50, zc: 80, R: 52 }, { id: 'C2', xc: 10, zc: 70, R: 30 }],
});

test('constants of the spec: catch area about 8 px, a move below 3 px is no drag', () => {
  assert.equal(CATCH_PX, 8);
  assert.equal(DRAG_MIN_PX, 3);
  assert.ok(LINE_CATCH_PX > 0);
});

test('the list follows the table of 6.1: ground, layer boundaries, water line, load ends, rectangle corners, circles', () => {
  const handles = buildHandles(makeModel());
  assert.deepEqual(handles.map((h) => h.type), [
    'ground', 'ground', 'ground', 'ground',
    'layer', 'layer', 'layer',
    'water', 'water',
    'load', 'load',
    'grid', 'grid', 'grid', 'grid',
    'centre', 'radius', 'centre', 'radius',
  ]);
  assert.deepEqual(handles.slice(0, 4).map((h) => [h.x, h.z, h.index]), [[0, 30, 0], [50, 30, 1], [80, 50, 2], [130, 50, 3]]);
  assert.deepEqual(handles.slice(4, 7).map((h) => [h.layer, h.index, h.x, h.z]), [[1, 0, 0, 20], [1, 1, 50, 20], [1, 2, 130, 22]], 'the first layer has no boundary of its own');
  assert.deepEqual(handles.slice(7, 9).map((h) => [h.x, h.z]), [[0, 25], [130, 25]]);
  // load ends sit on the ground line at their x
  assert.deepEqual(handles.slice(9, 11).map((h) => [h.end, h.x]), [[1, 60], [2, 100]]);
  assert.ok(Math.abs(handles[9].z - (30 + (20 * 10) / 30)) < 1e-12, 'x = 60 on the slope');
  assert.equal(handles[10].z, 50);
  assert.deepEqual(handles.slice(11, 15).map((h) => [h.x, h.z]), [[20, 40], [80, 40], [80, 120], [20, 120]], 'four corners');
  assert.deepEqual(handles.slice(15, 17).map((h) => [h.type, h.x, h.z]), [['centre', 50, 80], ['radius', handles[16].x, handles[16].z]]);
  const ids = handles.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, 'every handle has its own id');
  assert.equal(handles.some((h) => h.type === 'bottom'), false, 'the bottom line has no handle');
});

test('no handle for what is not there: switched off water line and search, unreadable points, loads without ground, wrong model', () => {
  const m = makeModel();
  m.water = null;
  m.search = null;
  m.ground[1] = [null, 30];
  m.ground[2] = 'x';
  m.loads[0].x2 = null;
  m.surfaces[1] = { id: 'C2', xc: null, zc: 1, R: 3 };
  m.surfaces[0].R = -1;
  const types = buildHandles(m).map((h) => h.type);
  assert.deepEqual(types.filter((t) => t === 'ground').length, 2);
  assert.equal(types.includes('water'), false);
  assert.equal(types.includes('grid'), false);
  assert.equal(types.filter((t) => t === 'load').length, 1);
  assert.deepEqual(types.filter((t) => t === 'centre' || t === 'radius'), ['centre'], 'a circle without a usable R has the centre only; a circle without a centre has none');
  assert.deepEqual(buildHandles(null), []);
  assert.deepEqual(buildHandles({}), []);
  assert.deepEqual(buildHandles({ ground: [[0, 0], [10, 0]], loads: [{ x1: -50, x2: 5 }] }).filter((h) => h.type === 'load').map((h) => h.end), [2], 'an end outside the ground has no handle');
  assert.deepEqual(buildHandles({ loads: [{ x1: 0, x2: 5 }] }), [], 'no ground: no load handles');
});

test('a reversed rectangle still has its four corners (so that it can be dragged back)', () => {
  const m = makeModel();
  m.search.grid = { xMin: 80, xMax: 20, zMin: 120, zMax: 40, nx: 3, nz: 3 };
  assert.equal(buildHandles(m).filter((h) => h.type === 'grid').length, 4);
});

const SCALE = 10;
const toScreen = (x, z) => worldToScreen({ scale: SCALE, x0: 0, z0: 100 }, x, z);

test('pickHandle: the nearest handle within 8 px; nothing farther; the border is included', () => {
  const handles = [{ id: 'a', x: 10, z: 50 }, { id: 'b', x: 11, z: 50 }];
  const [ax, ay] = toScreen(10, 50);
  assert.equal(pickHandle(handles, ax, ay, toScreen).id, 'a');
  assert.equal(pickHandle(handles, ax + 3, ay, toScreen).id, 'a', '3 px from a, 7 px from b');
  assert.equal(pickHandle(handles, ax + 7, ay, toScreen).id, 'b', 'nearer to b');
  assert.equal(pickHandle(handles, ax - 8, ay, toScreen).id, 'a', 'exactly 8 px is caught');
  assert.equal(pickHandle(handles, ax - 8.01, ay, toScreen), null);
  assert.equal(pickHandle(handles, ax, ay - 30, toScreen), null);
  assert.equal(pickHandle([], 0, 0, toScreen), null);
  assert.equal(pickHandle(handles, ax + 15, ay + 6, toScreen, 20).id, 'b', 'another catch area');
});

test('pickHandle: with the same distance the handle that is earlier in the list (order of the table) wins', () => {
  const [sx, sy] = toScreen(20, 50);
  const first = { id: 'ground:0', x: 20 - 0.3, z: 50 };
  const second = { id: 'layer:1:0', x: 20 + 0.3, z: 50 }; // 3 px on each side
  assert.equal(pickHandle([first, second], sx, sy, toScreen).id, 'ground:0');
  assert.equal(pickHandle([second, first], sx, sy, toScreen).id, 'layer:1:0');
  // the same point twice (ground point = start of a layer boundary): the earlier one, the ground
  const m = makeModel();
  m.layers[1].top[0] = [0, 30];
  const list = buildHandles(m);
  const [gx, gy] = toScreen(0, 30);
  assert.equal(pickHandle(list, gx, gy, toScreen).id, 'ground:0');
});

test('dragValues: x and z for points, snapped to the grid width; free without it', () => {
  const h = { type: 'ground' };
  assert.deepEqual(dragValues(h, { x: 12.34, z: 5.67 }, null), { x: 12.34, z: 5.67 });
  assert.deepEqual(dragValues(h, { x: 12.34, z: 5.67 }, 0.5), { x: 12.5, z: 5.5 });
  assert.deepEqual(dragValues(h, { x: -12.34, z: -5.67 }, 0.5), { x: -12.5, z: -5.5 });
  assert.deepEqual(dragValues(h, { x: 12.34, z: 5.67 }, 1), { x: 12, z: 6 });
  assert.deepEqual(dragValues(h, { x: 12.34, z: 5.67 }, 10), { x: 10, z: 10 });
  const fine = dragValues(h, { x: 0.31, z: 0.69 }, 0.1);
  assert.deepEqual(fine, { x: 0.3, z: 0.7 });
  assert.equal(String(fine.x), '0.3');
  for (const type of ['layer', 'water', 'centre', 'grid']) assert.deepEqual(dragValues({ type }, { x: 3.2, z: 4.4 }, 1), { x: 3, z: 4 }, type);
});

test('dragValues: the end of a load moves in x only; the point on a circle gives R, the distance of the pointer from the centre', () => {
  assert.deepEqual(dragValues({ type: 'load' }, { x: 61.37, z: 99 }, null), { x: 61.37 });
  assert.deepEqual(dragValues({ type: 'load' }, { x: 61.37, z: 99 }, 0.5), { x: 61.5 });
  const radius = { type: 'radius', cx: 50, cz: 80 };
  assert.deepEqual(dragValues(radius, { x: 50, z: 28 }, null), { R: 52 });
  assert.deepEqual(dragValues(radius, { x: 53, z: 76 }, null), { R: 5 }, '3-4-5');
  assert.deepEqual(dragValues(radius, { x: 53, z: 76 }, 10), { R: 10 }, 'R is snapped, not the pointer');
  const r = dragValues(radius, { x: 90, z: 80 }, 0.1);
  assert.equal(r.R, 40);
  assert.ok(dragValues(radius, { x: 50.3, z: 80 }, null).R > 0);
  assert.equal(dragValues(radius, { x: 50, z: 80 }, null).R, 0, 'no limit: the pointer on the centre gives R = 0 (the check shows the error)');
});

test('editFields: x and z, only x for a load, only R for the point on a circle; unrounded values', () => {
  assert.deepEqual(editFields({ type: 'ground', x: 1.2345678901, z: -2 }), [{ key: 'x', value: 1.2345678901 }, { key: 'z', value: -2 }]);
  assert.deepEqual(editFields({ type: 'load', x: 60.5, z: 40 }), [{ key: 'x', value: 60.5 }]);
  assert.deepEqual(editFields({ type: 'radius', R: 52.25, x: 1, z: 2 }), [{ key: 'R', value: 52.25 }]);
  assert.deepEqual(editFields({ type: 'grid', x: 20, z: 40 }).map((f) => f.key), ['x', 'z']);
  assert.deepEqual(editFields({ type: 'centre', x: 50, z: 80 }).map((f) => f.key), ['x', 'z']);
  assert.deepEqual(['ground', 'layer', 'water', 'load', 'grid', 'centre', 'radius'].filter((type) => canDeleteHandle({ type })), ['ground', 'layer', 'water']);
});

const byType = (model, type, pick = (h) => true) => buildHandles(model).find((h) => h.type === type && pick(h));

test('setHandleValues writes the value of every kind of handle into the model', () => {
  const m = makeModel();
  assert.equal(setHandleValues(m, byType(m, 'ground', (h) => h.index === 2), { x: 81, z: 52 }), true);
  assert.deepEqual(m.ground[2], [81, 52]);
  assert.equal(setHandleValues(m, byType(m, 'layer', (h) => h.index === 1), { x: 55.5, z: 19.25 }), true);
  assert.deepEqual(m.layers[1].top[1], [55.5, 19.25]);
  assert.equal(setHandleValues(m, byType(m, 'water', (h) => h.index === 1), { x: 128, z: 26 }), true);
  assert.deepEqual(m.water[1], [128, 26]);
  assert.equal(setHandleValues(m, byType(m, 'load', (h) => h.end === 1), { x: 62 }), true);
  assert.equal(m.loads[0].x1, 62);
  assert.equal(m.loads[0].x2, 100);
  assert.equal(setHandleValues(m, byType(m, 'load', (h) => h.end === 2), { x: 99.5 }), true);
  assert.equal(m.loads[0].x2, 99.5);
  const corners = buildHandles(m).filter((h) => h.type === 'grid');
  setHandleValues(m, corners[0], { x: 18, z: 38 }); // xMin, zMin
  assert.deepEqual([m.search.grid.xMin, m.search.grid.zMin, m.search.grid.xMax, m.search.grid.zMax], [18, 38, 80, 120]);
  setHandleValues(m, corners[2], { x: 85, z: 125 }); // xMax, zMax
  assert.deepEqual([m.search.grid.xMin, m.search.grid.zMin, m.search.grid.xMax, m.search.grid.zMax], [18, 38, 85, 125]);
  setHandleValues(m, corners[1], { x: 86, z: 37 }); // xMax, zMin
  assert.deepEqual([m.search.grid.xMax, m.search.grid.zMin], [86, 37]);
  setHandleValues(m, corners[3], { x: 17, z: 126 }); // xMin, zMax
  assert.deepEqual([m.search.grid.xMin, m.search.grid.zMax], [17, 126]);
  assert.equal(m.search.grid.nx, 31, 'the numbers of centres are not touched');
  const centre = byType(m, 'centre', (h) => h.index === 1);
  setHandleValues(m, centre, { x: 11, z: 71 });
  assert.deepEqual([m.surfaces[1].xc, m.surfaces[1].zc, m.surfaces[1].R], [11, 71, 30]);
  setHandleValues(m, byType(m, 'radius', (h) => h.index === 0), { R: 49.5 });
  assert.deepEqual([m.surfaces[0].xc, m.surfaces[0].zc, m.surfaces[0].R], [50, 80, 49.5]);
});

test('setHandleValues: only that point changes, equal points in other lines are not coupled; nothing else is touched', () => {
  const m = makeModel();
  m.layers[1].top[0] = [0, 30]; // the same point as ground[0]
  const before = JSON.stringify(m);
  setHandleValues(m, byType(m, 'ground', (h) => h.index === 0), { x: -5, z: 31 });
  assert.deepEqual(m.ground[0], [-5, 31]);
  assert.deepEqual(m.layers[1].top[0], [0, 30], 'the layer boundary keeps its point');
  const after = JSON.parse(JSON.stringify(m));
  after.ground[0] = [0, 30];
  assert.equal(JSON.stringify(after), before, 'nothing else changed');
  // only x, only z
  setHandleValues(m, byType(m, 'ground', (h) => h.index === 1), { z: 33 });
  assert.deepEqual(m.ground[1], [50, 33]);
  setHandleValues(m, byType(m, 'ground', (h) => h.index === 1), { x: 51 });
  assert.deepEqual(m.ground[1], [51, 33]);
});

test('setHandleValues: false when the place does not exist (anymore); unknown fields of the model stay', () => {
  const m = makeModel();
  const handle = byType(m, 'ground', (h) => h.index === 3);
  m.ground.splice(3, 1);
  assert.equal(setHandleValues(m, handle, { x: 1, z: 1 }), false);
  assert.equal(setHandleValues({}, { type: 'load', index: 0, end: 1 }, { x: 1 }), false);
  assert.equal(setHandleValues({}, { type: 'grid', xKey: 'xMin', zKey: 'zMin' }, { x: 1, z: 1 }), false);
  assert.equal(setHandleValues({}, { type: 'centre', index: 0 }, { x: 1, z: 1 }), false);
  assert.equal(setHandleValues({}, { type: 'unknown' }, {}), false);
  const withExtra = { ...makeModel(), expected: { a: 1 }, customField: [1] };
  setHandleValues(withExtra, byType(withExtra, 'ground', (h) => h.index === 0), { x: 1, z: 2 });
  assert.deepEqual(withExtra.expected, { a: 1 });
  assert.deepEqual(withExtra.customField, [1]);
});

test('deleteHandlePoint: a point of ground, layer boundary or water line is removed; other handles cannot be deleted', () => {
  const m = makeModel();
  assert.equal(deleteHandlePoint(m, byType(m, 'ground', (h) => h.index === 1)), true);
  assert.deepEqual(m.ground, [[0, 30], [80, 50], [130, 50]]);
  assert.equal(deleteHandlePoint(m, byType(m, 'layer', (h) => h.index === 0)), true);
  assert.deepEqual(m.layers[1].top, [[50, 20], [130, 22]]);
  assert.equal(deleteHandlePoint(m, byType(m, 'water', (h) => h.index === 1)), true);
  assert.deepEqual(m.water, [[0, 25]]);
  assert.equal(deleteHandlePoint(m, byType(m, 'water', (h) => h.index === 0)), true);
  assert.deepEqual(m.water, [], 'a model that becomes invalid is allowed (the check shows it)');
  assert.equal(deleteHandlePoint(m, byType(m, 'load')), false);
  assert.equal(deleteHandlePoint(m, byType(m, 'grid')), false);
  assert.equal(deleteHandlePoint(m, byType(m, 'centre')), false);
  assert.equal(deleteHandlePoint(m, { type: 'ground', index: 99 }), false);
  assert.equal(deleteHandlePoint(m, { type: 'ground', index: -1 }), false);
});

// --- lines

test('lineTargets: ground, layer boundaries (not the first layer), water line, in this order', () => {
  const m = makeModel();
  assert.deepEqual(lineTargets(m).map((t) => t.id), ['ground', 'layer:1', 'water']);
  m.water = null;
  assert.deepEqual(lineTargets(m).map((t) => t.id), ['ground', 'layer:1']);
  assert.deepEqual(lineTargets(null), []);
  assert.strictEqual(lineTargets(m)[0].points, m.ground, 'the live list of the model (a point is inserted into it)');
});

test('distanceToSegment: inside the segment, beyond its ends, degenerate segment', () => {
  assert.equal(distanceToSegment(5, 3, 0, 0, 10, 0), 3);
  assert.equal(distanceToSegment(-3, 4, 0, 0, 10, 0), 5);
  assert.equal(distanceToSegment(13, 4, 0, 0, 10, 0), 5);
  assert.equal(distanceToSegment(3, 4, 0, 0, 0, 0), 5);
  assert.ok(Math.abs(distanceToSegment(0, 0, 0, 10, 10, 0) - Math.hypot(5, 5)) < 1e-12);
});

test('hitSegment: the nearest segment within the tolerance; the earlier line when equally near; none on free ground', () => {
  const m = makeModel();
  const targets = lineTargets(m);
  const [mx, my] = toScreen(25, 30); // on the first ground segment
  const hit = hitSegment(targets, mx, my + 4, toScreen);
  assert.deepEqual([hit.target.id, hit.index], ['ground', 0]);
  assert.equal(hitSegment(targets, mx, my + 9, toScreen, 6), null, '9 px away');
  const [wx, wy] = toScreen(60, 25);
  assert.deepEqual([hitSegment(targets, wx, wy, toScreen).target.id, hitSegment(targets, wx, wy, toScreen).index], ['water', 0]);
  const [lx, ly] = toScreen(100, 20 + (2 * 50) / 80); // on the layer boundary between (50, 20) and (130, 22)
  assert.equal(hitSegment(targets, lx, ly, toScreen).target.id, 'layer:1');
  // the same line twice: the ground wins over the layer boundary
  m.layers[1].top = [[0, 30], [50, 30]];
  const [sx, sy] = toScreen(25, 30);
  assert.equal(hitSegment(lineTargets(m), sx, sy, toScreen).target.id, 'ground');
  // unusable points are skipped
  const broken = [{ id: 'x', points: [[0, 0], [null, 1], [5, 5]] }];
  assert.equal(hitSegment(broken, ...toScreen(2, 2), toScreen), null);
});

test('insertionPoint: x is the place of the click, z lies on the line between the neighbours', () => {
  assert.deepEqual(insertionPoint([0, 30], [50, 40], 25, null), [25, 35]);
  assert.deepEqual(insertionPoint([50, 30], [80, 50], 62, null), [62, 30 + (20 * 12) / 30]);
  assert.deepEqual(insertionPoint([0, 10], [10, 0], 2.5, null), [2.5, 7.5]);
  assert.deepEqual(insertionPoint([0, 5], [10, 5], 3.3, null), [3.3, 5], 'horizontal line');
});

test('insertionPoint: with the grid on x is snapped when it stays strictly between the neighbours, else not', () => {
  assert.deepEqual(insertionPoint([0, 0], [10, 10], 3.4, 1), [3, 3]);
  assert.deepEqual(insertionPoint([0, 0], [10, 10], 3.4, 0.5), [3.5, 3.5]);
  assert.deepEqual(insertionPoint([0, 0], [10, 10], 0.3, 1), [0.3, 0.3], 'snapping would give 0 = the neighbour: not snapped');
  assert.deepEqual(insertionPoint([0, 0], [10, 10], 9.6, 1), [9.6, 9.6], 'snapping would give 10 = the neighbour: not snapped');
  assert.deepEqual(insertionPoint([0, 0], [10, 10], 4.7, 10), [4.7, 4.7], 'width larger than the segment: not snapped');
  const fine = insertionPoint([0, 0], [1, 10], 0.31, 0.1);
  assert.equal(fine[0], 0.3, 'no remainders of floating point arithmetic');
  assert.ok(Math.abs(fine[1] - 3) < 1e-12);
  assert.deepEqual(insertionPoint([-10, 0], [10, 20], -3.4, 1), [-3, 7], 'negative x');
});

test('insertionPoint: vertical segment and a click beyond the segment never put x outside the neighbours', () => {
  assert.deepEqual(insertionPoint([5, 0], [5, 10], 5, null), [5, 0]);
  assert.deepEqual(insertionPoint([5, 0], [5, 10], 7, 1), [5, 0]);
  const beyond = insertionPoint([0, 0], [10, 10], 12, null);
  assert.deepEqual(beyond, [10, 10]);
  assert.deepEqual(insertionPoint([10, 10], [0, 0], 4.2, null), [4.2, 4.2], 'a segment with falling x (an invalid model) is handled too');
});

test('insertOnSegment: the point is put between the two neighbours and the shape of the line does not change', () => {
  const m = makeModel();
  const shape = () => Array.from({ length: 261 }, (_, i) => heightAt(m.ground.map((p) => [...p]), i * 0.5));
  const reference = shape();
  const hit = hitSegment(lineTargets(m), ...toScreen(65, 40), toScreen); // on the slope between (50, 30) and (80, 50)
  assert.deepEqual([hit.target.id, hit.index], ['ground', 1]);
  const point = insertOnSegment(hit, 65, 0.5);
  assert.deepEqual(point, [65, 40]);
  assert.equal(m.ground.length, 5);
  assert.deepEqual(m.ground, [[0, 30], [50, 30], [65, 40], [80, 50], [130, 50]]);
  const after = shape();
  reference.forEach((z, i) => assert.ok(Math.abs(z - after[i]) < 1e-9, `x = ${i * 0.5}`));
  // snapped x that is not on a nice number of the line: z still on the line
  const m2 = makeModel();
  const hit2 = hitSegment(lineTargets(m2), ...toScreen(66.3, 30 + (20 * 16.3) / 30), toScreen);
  const p2 = insertOnSegment(hit2, 66.3, 1);
  assert.equal(p2[0], 66);
  assert.ok(Math.abs(p2[1] - (30 + (20 * 16) / 30)) < 1e-12);
  // layer boundary and water line
  const hit3 = hitSegment(lineTargets(m2), ...toScreen(90, 20 + (2 * 40) / 80), toScreen);
  assert.equal(hit3.target.id, 'layer:1');
  insertOnSegment(hit3, 90, null);
  assert.equal(m2.layers[1].top.length, 4);
  assert.deepEqual(m2.layers[1].top[2], [90, 20 + (2 * 40) / 80]);
  const hit4 = hitSegment(lineTargets(m2), ...toScreen(40, 25), toScreen);
  assert.equal(hit4.target.id, 'water');
  insertOnSegment(hit4, 40, 1);
  assert.deepEqual(m2.water, [[0, 25], [40, 25], [130, 25]]);
});

// --- the point for R

const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('pointInPolygon', () => {
  assert.equal(pointInPolygon(5, 5, SQUARE), true);
  assert.equal(pointInPolygon(11, 5, SQUARE), false);
  assert.equal(pointInPolygon(5, -1, SQUARE), false);
  assert.equal(pointInPolygon(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10], [0, 6], [6, 6], [6, 4], [0, 4]]), false, 'in the notch of a U shape');
});

test('radiusHandleAngle: straight below the centre when that point of the circle is in the soil; without a body too', () => {
  const down = -Math.PI / 2;
  assert.equal(radiusHandleAngle({ xc: 5, zc: 20, R: 12 }, SQUARE), down, 'lowest point (5, 8) is inside');
  assert.equal(radiusHandleAngle({ xc: 5, zc: 20, R: 12 }, null), down);
  assert.equal(radiusHandleAngle({ xc: 5, zc: 20, R: 12 }, []), down);
});

test('radiusHandleAngle: when the lowest point is outside the handle is on the arc that is drawn, nearest to the bottom', () => {
  const down = -Math.PI / 2;
  // circle around (30, 5) with R = 26 reaches into the square only near (4, 5): the lowest point (30, -21) is far outside
  const circle = { xc: 30, zc: 5, R: 26 };
  const angle = radiusHandleAngle(circle, SQUARE);
  const x = circle.xc + circle.R * Math.cos(angle);
  const z = circle.zc + circle.R * Math.sin(angle);
  assert.equal(pointInPolygon(x, z, SQUARE), true, `(${x}, ${z}) is on the drawn arc`);
  assert.notEqual(angle, down);
  // it is the inside point nearest (in angle) to straight down: sample all angles independently
  let best = null;
  for (let a = -Math.PI; a < Math.PI; a += Math.PI / 360) {
    if (pointInPolygon(circle.xc + circle.R * Math.cos(a), circle.zc + circle.R * Math.sin(a), SQUARE) && (best === null || Math.abs(a - down) < Math.abs(best - down))) best = a;
  }
  assert.ok(Math.abs(angle - best) < Math.PI / 360 + 1e-9, `${angle} vs ${best}`);
  // a circle that does not touch the body at all: straight down (its centre handle is still there)
  assert.equal(radiusHandleAngle({ xc: 100, zc: 100, R: 5 }, SQUARE), down);
});

test('the handle for R sits on the circle, at the angle of buildHandles; radiusAngles overrides it (while R is dragged)', () => {
  const m = makeModel();
  const clip = [[0, 30], [50, 30], [80, 50], [130, 50], [130, 0], [0, 0]];
  const radius = buildHandles(m, { clip }).filter((h) => h.type === 'radius');
  for (const h of radius) {
    assert.ok(Math.abs(Math.hypot(h.x - h.cx, h.z - h.cz) - h.R) < 1e-9, 'on the circle');
    assert.equal(pointInPolygon(h.x, h.z, clip) || h.angle === -Math.PI / 2, true, 'on the drawn arc, or straight below if there is none');
  }
  // C1: centre (50, 80), R = 52: lowest point (50, 28) is below the ground (z = 30 at x = 50) -> inside the body
  assert.ok(Math.abs(radius[0].x - 50) < 1e-9 && Math.abs(radius[0].z - 28) < 1e-9);
  const moved = buildHandles(m, { clip, radiusAngles: { 0: 0 } }).filter((h) => h.type === 'radius');
  assert.ok(Math.abs(moved[0].x - 102) < 1e-9 && Math.abs(moved[0].z - 80) < 1e-9, 'angle 0: right of the centre');
  assert.equal(moved[1].angle, radius[1].angle, 'the other circle is unchanged');
});
