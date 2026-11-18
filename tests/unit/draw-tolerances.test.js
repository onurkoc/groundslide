// Order 30 (SPEC_ETAPPE4 13c): drawing tolerances. End points of a drawn slip surface onto the ground, the text of I_OUT_OF_MODEL for a
// polyline below the ground, a click near the model edge for a layer boundary or the water line. No DOM: lib/draw-snap.js, lib/drawing.js
// and the pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../core/index.js';
import { CATCH_PX } from '../../app/lib/handles.js';
import { pxToMetres, catchMetres, snapEndsToGround, snapToModelEdge, endsBelowGround, markBelowGround, surfaceCodeKey } from '../../app/lib/draw-snap.js';
import { newDrawing, acceptPoint, applyDrawing, isComplete, drawPoint, previewParts } from '../../app/lib/drawing.js';
import { surfacesTable } from '../../app/lib/result-view.js';
import { documentHead, documentTable } from '../../app/lib/result-document.js';
import { resolveSurface } from '../../app/lib/slices-table.js';
import { supportsView } from '../../app/lib/supports-result.js';
import { translate } from '../../app/lib/i18n.js';
import { loadBenchmark } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

const b3 = () => structuredClone(loadBenchmark('B3_two_layers')); // ground (0,30) (50,30) (80,50) (130,50)

/** Click through a drawing as the sketch does (acceptPoint with the tolerance); returns the drawing. */
function draw(kind, model, clicks, tolerance = 0) {
  const drawing = newDrawing(kind);
  for (const p of clicks) {
    const r = acceptPoint(drawing, p, model, tolerance);
    if (!r.ok) continue;
    if (r.direction !== undefined) drawing.direction = r.direction;
    drawing.points.push(r.point);
    if (isComplete(drawing)) break;
  }
  return drawing;
}

// ------------------------------------------------------------ px -> m

test('13c: the catch area in metres is the catch radius of the handles in pixels divided by the scale of the view', () => {
  assert.equal(pxToMetres(8, 20), 0.4);
  assert.equal(catchMetres(20), CATCH_PX / 20);
  assert.equal(catchMetres(100), CATCH_PX / 100);
  assert.equal(CATCH_PX, 8);
  for (const bad of [0, -3, NaN, undefined, Infinity]) assert.equal(catchMetres(bad), 0, `scale ${bad}`);
});

// ------------------------------------------------------------ 1 end points of a drawn slip surface

const GROUND = b3().ground;

test('13c: first and last point just below the ground are set onto the ground, deeper ones stay, higher ones stay', () => {
  const tol = 0.4; // 8 px at 20 px/m
  // flat ground z = 30 at x = 10 and 40
  const just = snapEndsToGround([[10, 29.8], [25, 20], [40, 29.7]], GROUND, tol);
  assert.deepEqual(just, [[10, 30], [25, 20], [40, 30]]);
  const deep = snapEndsToGround([[10, 28], [25, 20], [40, 27]], GROUND, tol);
  assert.deepEqual(deep, [[10, 28], [25, 20], [40, 27]]);
  const above = snapEndsToGround([[10, 31], [25, 20], [40, 33]], GROUND, tol);
  assert.deepEqual(above, [[10, 31], [25, 20], [40, 33]]);
  const onGround = snapEndsToGround([[10, 30], [25, 20], [40, 30]], GROUND, tol);
  assert.deepEqual(onGround, [[10, 30], [25, 20], [40, 30]]);
});

test('13c: the first and the last point are tested separately', () => {
  const tol = 0.4;
  assert.deepEqual(snapEndsToGround([[10, 29.8], [25, 20], [40, 27]], GROUND, tol), [[10, 30], [25, 20], [40, 27]], 'only the first');
  assert.deepEqual(snapEndsToGround([[10, 27], [25, 20], [40, 29.8]], GROUND, tol), [[10, 27], [25, 20], [40, 30]], 'only the last');
  assert.deepEqual(snapEndsToGround([[10, 29.8], [25, 20], [40, 31]], GROUND, tol), [[10, 30], [25, 20], [40, 31]], 'first below, last above');
});

test('13c: the ground height is taken at the x of the point (sloping ground), inner points never move', () => {
  // ground between (50,30) and (80,50): z(65) = 40; an inner point just below the ground stays
  const out = snapEndsToGround([[20, 29.9], [65, 39.9], [65.5, 30], [100, 49.9]], GROUND, 0.4);
  assert.deepEqual(out[0], [20, 30]);
  assert.deepEqual(out[1], [65, 39.9], 'inner point unchanged');
  assert.deepEqual(out[3], [100, 50]);
  // end on the slope: the tolerance is vertical
  const slope = snapEndsToGround([[65, 39.8], [70, 20], [100, 20]], GROUND, 0.4);
  assert.deepEqual(slope[0], [65, 40]);
});

test('13c: the tolerance is at most the catch area: exactly the tolerance is snapped, a hair more is not', () => {
  assert.deepEqual(snapEndsToGround([[10, 29.6], [20, 10], [30, 10]], GROUND, 0.4)[0], [10, 30]);
  assert.deepEqual(snapEndsToGround([[10, 29.5999], [20, 10], [30, 10]], GROUND, 0.4)[0], [10, 29.5999]);
});

test('13c: the scale of the view acts: the same distance in metres gives another result at another scale', () => {
  const clicks = [[10, 29.9], [25, 20], [40, 29.9]]; // 0.1 m below the ground at both ends
  const at20 = snapEndsToGround(clicks, GROUND, catchMetres(20)); // 0.4 m: snapped
  const at100 = snapEndsToGround(clicks, GROUND, catchMetres(100)); // 0.08 m: not snapped
  assert.deepEqual(at20, [[10, 30], [25, 20], [40, 30]]);
  assert.deepEqual(at100, clicks);
});

test('13c: points outside the model width and a drawing without ground are left as they are', () => {
  assert.deepEqual(snapEndsToGround([[-5, 29.9], [20, 10], [140, 49.9]], GROUND, 0.4), [[-5, 29.9], [20, 10], [140, 49.9]]);
  assert.deepEqual(snapEndsToGround([[10, 29.9], [20, 10]], [], 0.4), [[10, 29.9], [20, 10]]);
  assert.equal(snapEndsToGround(null, GROUND, 0.4), null);
});

test('13c: applyDrawing writes the snapped surface in one change; the input is not touched', () => {
  const model = b3();
  const clicks = [[40, 29.8], [25, 20], [10, 29.9]]; // drawn from the right to the left: ordered by x when finished
  const drawing = draw('surface', model, clicks);
  assert.deepEqual(drawing.points, clicks);
  applyDrawing(drawing, model, catchMetres(20));
  const surface = model.surfaces[model.surfaces.length - 1];
  assert.equal(surface.type, 'polyline');
  assert.deepEqual(surface.points, [[10, 30], [25, 20], [40, 30]]);
  assert.deepEqual(drawing.points, clicks, 'the drawing is not changed');
  // without tolerance (as before order 30) nothing moves
  const plain = b3();
  applyDrawing(draw('surface', plain, clicks), plain);
  assert.deepEqual(plain.surfaces[plain.surfaces.length - 1].points, [[10, 29.9], [25, 20], [40, 29.8]]);
});

test('13c: a snapped slip surface is valid for the core where the click below the ground was not', () => {
  const clicks = [[45, 29.9], [55, 28], [70, 32], [85, 40], [97.5, 49.9]]; // like the polyline of order 27, B3 slides to the left; both ends 0.1 m below the ground
  const run = (points) => {
    const m = b3();
    m.surfaces = [{ id: 'P1', type: 'polyline', points }];
    return analyze(m).surfaces[0];
  };
  const raw = run(clicks);
  assert.equal(raw.valid, false);
  assert.equal(raw.code, 'I_OUT_OF_MODEL');
  const snapped = run(snapEndsToGround(clicks, GROUND, catchMetres(20)));
  assert.equal(snapped.valid, true, snapped.code);
});

// ------------------------------------------------------------ 2 text of I_OUT_OF_MODEL for a polyline below the ground

const DE = (key, params) => translate('de', key, params);
const EN = (key, params) => translate('en', key, params);

/** B3 with a polyline that ends below the ground (I_OUT_OF_MODEL), a circle with an exit outside the model width (I_OUT_OF_MODEL) and a polyline that ends above the ground... */
function textModel() {
  const m = b3();
  m.analysis.methods = ['spencer'];
  m.surfaces = [
    { id: 'P1', type: 'polyline', points: [[45, 30], [55, 28], [70, 32], [85, 40], [97.5, 45]] }, // last point 5 m below the ground
    { id: 'C1', xc: 20, zc: 45, R: 40 }, // exit outside the model width on the left
    { id: 'P2', type: 'polyline', points: [[45, 30.2], [55, 28], [70, 32], [85, 40], [97.5, 50.1]] }, // valid: both ends above the ground
    { id: 'P3', type: 'polyline', points: [[10, 20], [55, 28], [70, 32], [85, 40], [97.5, 50]] }, // first point 10 m below the ground
  ];
  return m;
}
const tm = textModel();
const tr = analyze(tm);
const marked = markBelowGround(tr, tm);

test('13c: the core keeps the code I_OUT_OF_MODEL for the polyline and for the circle (premise of the texts)', () => {
  const byId = Object.fromEntries(tr.surfaces.map((s) => [s.id, s]));
  assert.equal(byId.P1.code, 'I_OUT_OF_MODEL');
  assert.equal(byId.C1.code, 'I_OUT_OF_MODEL');
  assert.equal(byId.P2.valid, true);
  assert.equal(byId.P3.code, 'I_OUT_OF_MODEL');
});

test('13c: polyline with an end below the ground: the new text in German and English, the code stays', () => {
  const rows = Object.fromEntries(surfacesTable(marked).rows.map((r) => [r.id, r]));
  assert.equal(rows.P1.code, 'I_OUT_OF_MODEL');
  assert.equal(rows.P1.belowGround, true);
  assert.equal(DE(surfaceCodeKey(rows.P1.code, rows.P1)), 'Die Polylinie erreicht das Gelände nicht: Anfangs- oder Endpunkt liegt unter dem Gelände.');
  assert.equal(EN(surfaceCodeKey(rows.P1.code, rows.P1)), 'The polyline does not reach the ground: its first or last point lies below the ground.');
  assert.equal(rows.P3.belowGround, true, 'the first point below the ground');
});

test('13c: I_OUT_OF_MODEL of a circle keeps the old text, also next to a polyline with the new one', () => {
  const rows = Object.fromEntries(surfacesTable(marked).rows.map((r) => [r.id, r]));
  assert.equal(rows.C1.code, 'I_OUT_OF_MODEL');
  assert.equal(rows.C1.belowGround, undefined);
  assert.equal(DE(surfaceCodeKey(rows.C1.code, rows.C1)), 'Ein- oder Austritt liegt ausserhalb der Modellbreite.');
  assert.equal(EN(surfaceCodeKey(rows.C1.code, rows.C1)), 'Entry or exit point lies outside the model width.');
  // other codes and a valid polyline: the code itself
  assert.equal(surfaceCodeKey('I_DIRECTION', { belowGround: true }), 'I_DIRECTION');
  assert.equal(rows.P2.valid, true);
  assert.equal(rows.P2.belowGround, undefined);
});

test('13c: markBelowGround does not change the result of the core and leaves other results as they are', () => {
  assert.equal(tr.surfaces[0].belowGround, undefined);
  assert.notEqual(marked, tr);
  assert.equal(markBelowGround(null, tm), null);
  assert.equal(markBelowGround({ critical: {} }, tm).critical !== undefined, true);
  const noSurfaces = { surfaces: [] };
  assert.deepEqual(markBelowGround(noSurfaces, tm), noSurfaces);
});

test('13c: an invalid polyline that ends outside the model width but not below the ground keeps the old text', () => {
  const m = b3();
  const circleLike = { id: 'P9', type: 'polyline', valid: false, code: 'I_OUT_OF_MODEL', points: [[10, 31], [25, 18], [40, 31]] };
  assert.equal(endsBelowGround(circleLike.points, m.ground), false);
  const r = markBelowGround({ surfaces: [circleLike] }, m);
  assert.equal(r.surfaces[0].belowGround, undefined);
  assert.equal(endsBelowGround([[10, 29], [25, 18], [40, 31]], m.ground), true);
  assert.equal(endsBelowGround([[10, 31], [25, 18], [40, 29]], m.ground), true);
  assert.equal(endsBelowGround([[10, 31], [25, 18], [150, 1]], m.ground), false, 'outside the width: the height of the ground is not defined');
});

test('13c: the text appears in the overview table, the document and the supports table', () => {
  const t = (key, params) => DE(key, params);
  const old = DE('I_OUT_OF_MODEL');
  const fresh = DE('ui.surf.belowGround');
  assert.notEqual(old, fresh);

  // document head of a single surface (target P1) and of the circle (C1)
  const head = (id) => documentHead({ model: tm, result: marked, method: null, target: { kind: 'single', id }, now: new Date(0), t });
  assert.equal(head('P1').note, fresh);
  assert.equal(head('C1').note, old);

  // slice table in the document: the calculation answers invalid with the same code (analyzeSurface); the text follows the resolved surface
  const slices = (id) => {
    const resolved = resolveSurface(marked, null, { kind: 'single', id });
    return { key: resolved.key, status: 'invalid', result: { valid: false, code: 'I_OUT_OF_MODEL', message: '' } };
  };
  const table = (id) => documentTable({ result: marked, method: null, target: { kind: 'single', id }, slices: slices(id), t });
  assert.equal(table('P1').kind, 'invalid');
  assert.equal(table('P1').code, 'I_OUT_OF_MODEL');
  assert.equal(table('P1').text, fresh);
  assert.equal(table('C1').text, old);

  // supports tab
  const sup = (id) => supportsView({ result: marked, method: null, target: { kind: 'single', id }, t });
  assert.equal(sup('P1').text, fresh);
  assert.equal(sup('C1').text, old);
});

test('13c: the page marks the result when it arrives, and the views use surfaceCodeKey (source)', () => {
  const main = read('app', 'main.js');
  assert.match(main, /markBelowGround\(result, state\.model\)/);
  for (const f of [['app', 'ui', 'result-overview.js'], ['app', 'ui', 'result-slices.js'], ['app', 'lib', 'result-document.js'], ['app', 'lib', 'supports-result.js']]) {
    assert.match(read(...f), /surfaceCodeKey\(/, f.join('/'));
  }
  // the core is not touched: no knowledge of the new text there
  assert.doesNotMatch(read('core', 'slices.js'), /belowGround/);
});

test('13c: the new text exists in both languages and names no other program', () => {
  for (const lang of ['de', 'en']) {
    const text = translate(lang, 'ui.surf.belowGround');
    assert.notEqual(text, 'ui.surf.belowGround');
    assert.doesNotMatch(text, /slide|rocscience|geostudio/i);
  }
});

// ------------------------------------------------------------ 3 layer boundary and water line: click near the model edge

/** Model with the left edge at x = 0 and the right edge at x = 20 (like the wall model of the test: the first click at x = 0.103). */
function wallModel() {
  const m = b3();
  m.ground = [[0, 10], [8, 10], [12, 14], [20, 14]];
  m.bottom = 0;
  m.layers = [{ material: 'M1', top: null }];
  return m;
}
const SCALE = 30; // pixels per metre, about the scale of a model of this size on the screen
const TOL = catchMetres(SCALE); // 8 / 30 = 0.267 m

test('13c: pure edge snap: inside or outside within the catch area -> x of the edge, z unchanged; farther: unchanged', () => {
  const w = { xMin: 0, xMax: 20 };
  assert.deepEqual(snapToModelEdge([0.103, 7], w, TOL), [0, 7]);
  assert.deepEqual(snapToModelEdge([-0.2, 7], w, TOL), [0, 7]);
  assert.deepEqual(snapToModelEdge([19.9, 6], w, TOL), [20, 6]);
  assert.deepEqual(snapToModelEdge([20.25, 6], w, TOL), [20, 6]);
  assert.deepEqual(snapToModelEdge([0.5, 7], w, TOL), [0.5, 7], 'inside, beyond the catch area');
  assert.deepEqual(snapToModelEdge([-0.5, 7], w, TOL), [-0.5, 7], 'outside, beyond the catch area');
  assert.deepEqual(snapToModelEdge([10, 7], w, TOL), [10, 7]);
  assert.deepEqual(snapToModelEdge([0.103, 7], null, TOL), [0.103, 7]);
});

test('13c: the edge snap depends on the scale of the view', () => {
  const w = { xMin: 0, xMax: 20 };
  assert.deepEqual(snapToModelEdge([0.103, 7], w, catchMetres(30)), [0, 7]);
  assert.deepEqual(snapToModelEdge([0.103, 7], w, catchMetres(200)), [0.103, 7]); // 0.04 m
});

for (const kind of ['water', 'layer']) {
  test(`13c: ${kind}: a click just inside or just outside the edge lies on the edge; no second edge point after finishing`, () => {
    for (const [first, last] of [[0.103, 19.9], [-0.2, 20.2]]) {
      const model = wallModel();
      const drawing = draw(kind, model, [[first, 7], [10, 8], [last, 6]], TOL);
      assert.equal(drawing.points.length, 3, `${kind}: all three clicks set (${first})`);
      assert.equal(drawing.points[0][0], 0);
      assert.equal(drawing.points[2][0], 20);
      assert.equal(drawing.points[0][1], 7, 'z as clicked');
      assert.equal(drawing.points[2][1], 6);
      if (kind === 'layer') model.layers.push({ material: 'M1', top: [] });
      applyDrawing(drawing, model, TOL);
      const line = kind === 'water' ? model.water : model.layers[1].top;
      assert.deepEqual(line, [[0, 7], [10, 8], [20, 6]], 'exactly three points: nothing was added at the edge');
    }
  });

  test(`13c: ${kind}: a click far outside sets no point (as before)`, () => {
    const model = wallModel();
    const drawing = newDrawing(kind);
    assert.deepEqual(acceptPoint(drawing, [-1, 7], model, TOL), { ok: false, reason: 'outside' });
    assert.deepEqual(acceptPoint(drawing, [21, 7], model, TOL), { ok: false, reason: 'outside' });
    assert.deepEqual(acceptPoint(drawing, [-0.5, 7], model, TOL), { ok: false, reason: 'outside' });
    assert.equal(drawing.points.length, 0);
  });

  test(`13c: ${kind}: a click farther inside than the catch area is not moved; the edge point is added at the end as before`, () => {
    const model = wallModel();
    const drawing = draw(kind, model, [[0.5, 7], [10, 8]], TOL);
    assert.deepEqual(drawing.points, [[0.5, 7], [10, 8]]);
    if (kind === 'layer') model.layers.push({ material: 'M1', top: [] });
    applyDrawing(drawing, model, TOL);
    const line = kind === 'water' ? model.water : model.layers[1].top;
    assert.deepEqual(line, [[0, 7], [0.5, 7], [10, 8], [20, 8]]);
  });

  test(`13c: ${kind}: the preview shows the point at the edge`, () => {
    const model = wallModel();
    const drawing = draw(kind, model, [[5, 7]], TOL);
    const mouse = drawPoint(kind, [19.9, 6], model, TOL);
    assert.deepEqual(mouse, [20, 6]);
    const parts = previewParts(drawing, mouse, model);
    assert.deepEqual(parts[0].points, [[5, 7], [20, 6]]);
  });
}

test('13c: the other kinds are not moved to the edge (slip surface, ground, supports)', () => {
  const model = wallModel();
  for (const kind of ['surface', 'ground', 'nail', 'anchor', 'pile', 'shotcrete']) {
    assert.deepEqual(drawPoint(kind, [0.103, 7], model, TOL), [0.103, 7], kind);
  }
});

test('13c: model "wall" (test of Onur): water line, first click at x = 0.103 at the scale of the screen gives one single point at x = 0', () => {
  const model = wallModel();
  const drawing = draw('water', model, [[0.103, 12], [20, 12]], TOL);
  assert.deepEqual(drawing.points, [[0, 12], [20, 12]]);
  applyDrawing(drawing, model, TOL);
  assert.deepEqual(model.water, [[0, 12], [20, 12]]);
  assert.equal(model.water.filter((p) => p[0] === 0).length, 1, 'a single point at x = 0');
  // the same without the tolerance of order 30: the point stays at 0.103 and the edge point is added
  const old = wallModel();
  const oldDrawing = draw('water', old, [[0.103, 12], [20, 12]], 0);
  applyDrawing(oldDrawing, old, 0);
  assert.deepEqual(old.water, [[0, 12], [0.103, 12], [20, 12]]);
});

test('13c: the sketch uses the tolerance for the click, the preview point and the end (source)', () => {
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /catchMetres\(view\.scale\)/);
  assert.match(sketch, /const p = worldAt\(e\);\n\s*const accepted = acceptPoint\(drawing, p, modelRef\);/); // worldAt already puts the point on the edge
  assert.match(sketch, /tolerance: catchTolerance\(\) \}/);
  assert.match(sketch, /next = applyDrawing\(finished, model\);/);
  assert.match(sketch, /drawPoint\(drawing\.kind/);
});
