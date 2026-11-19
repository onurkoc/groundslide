// Order 28 (SPEC_ETAPPE4 12a): drawing of the geometry and the supports (slip surface, layer boundary, water line, ground, nail, anchor, pile,
// shotcrete). No DOM: lib/drawing.js and the other pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModel } from '../../core/index.js';
import {
  DRAW_KINDS, CLICKS, newDrawing, acceptPoint, previewParts, isComplete, canFinish, applyDrawing, extendToWidth, addLayerBoundary,
  nailFromClicks, anchorFromClicks, inclinationOf, modelWidth,
} from '../../app/lib/drawing.js';
import { supportShapes, slopeDirection } from '../../app/lib/supports-sketch.js';
import { createHistory, snapshotModel, modelFromSnapshot } from '../../app/lib/history.js';
import { MESSAGES } from '../../app/lib/i18n.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

/** Click through a drawing: every point goes through acceptPoint (as the sketch does); returns { drawing, rejected }. */
function draw(kind, model, clicks) {
  const drawing = newDrawing(kind);
  const rejected = [];
  for (const p of clicks) {
    const r = acceptPoint(drawing, p, model);
    if (!r.ok) { rejected.push(r.reason); continue; }
    if (r.direction !== undefined) drawing.direction = r.direction;
    drawing.points.push(r.point);
    if (isComplete(drawing)) break;
  }
  return { drawing, rejected };
}
/** Largest distance the end of an element can lie from the click after the rounding of order 29 (SPEC_ETAPPE4 13b): 0.005 m per length, 0.005 degree over the whole run. */
const roundingReach = (runMetres, lengths) => 0.005 * lengths + runMetres * ((0.005 * Math.PI) / 180) + 1e-9;
const isRounded = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9; // 0.01 m or 0.01 degree
const b3 = () => structuredClone(loadBenchmark('B3_two_layers')); // ground (0,30) (50,30) (80,50) (130,50); two layers, the boundary at z = 35 on the right
const b1 = () => structuredClone(loadBenchmark('B1_homogeneous'));

// ------------------------------------------------------------ the choice

test('the choice: slip surface, layer boundary, water line, ground, nail, anchor, pile, shotcrete; the fixed kinds end with their last click', () => {
  assert.deepEqual(DRAW_KINDS, ['surface', 'layer', 'water', 'ground', 'nail', 'anchor', 'pile', 'shotcrete']);
  assert.deepEqual(CLICKS, { surface: null, layer: null, water: null, ground: null, nail: 2, anchor: 3, pile: 2, shotcrete: 2 });
  for (const kind of DRAW_KINDS) for (const lang of ['de', 'en']) assert.ok(MESSAGES[lang][`ui.draw.kind.${kind}`], `${lang}:${kind}`);
  assert.equal(MESSAGES.de['ui.draw.kind.surface'], 'Gleitfläche');
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /let drawKind = 'surface';/, 'the slip surface as before (order 27) is the start');
  assert.match(sketch, /drawSelect\.addEventListener\('change', \(\) => \{ if \(DRAW_KINDS\.includes\(drawSelect\.value\)\) drawKind = drawSelect\.value; \}\);/, 'the choice stays in the session (not in the model, not saved)');
  assert.match(sketch, /drawSelect\.disabled = drawing !== null;/);
  assert.match(sketch, /drawing = \{ \.\.\.newDrawing\(drawKind\), mouse: null, hint: null, lastPx: null \};/);
  assert.equal(MESSAGES.de['ui.sketch.draw'], 'Zeichnen');
  assert.equal(MESSAGES.en['ui.sketch.draw'], 'Draw');
});

// ------------------------------------------------------------ lines

test('layer boundary: ordered by x, extended horizontally to both edges of the model; a point exactly at an edge adds no point', () => {
  const m = b3();
  const { drawing } = draw('layer', m, [[30, 20], [70, 18]]);
  assert.equal(canFinish(drawing, m).ok, true);
  const before = structuredClone(m);
  const result = applyDrawing(drawing, m);
  const line = m.layers[result.focus === 'layers[1].material' ? 1 : 2].top;
  assert.deepEqual(extendToWidth([[30, 20], [70, 18]], { xMin: 0, xMax: 130 }), [[0, 20], [30, 20], [70, 18], [130, 18]]);
  assert.ok(Array.isArray(line));
  // a point already at the edge: no additional point on that side
  assert.deepEqual(extendToWidth([[0, 20], [70, 18]], { xMin: 0, xMax: 130 }), [[0, 20], [70, 18], [130, 18]]);
  assert.deepEqual(extendToWidth([[0, 20], [130, 18]], { xMin: 0, xMax: 130 }), [[0, 20], [130, 18]]);
  assert.notDeepEqual(m, before);
});

test('layer boundary drawn from right to left is ordered by x ascending', () => {
  const m = b3();
  const { drawing, rejected } = draw('layer', m, [[100, 20], [60, 22], [20, 19], [40, 25]]);
  assert.deepEqual(rejected, ['direction'], 'the click that goes back is not set');
  applyDrawing(drawing, m);
  const added = m.layers.find((l) => Array.isArray(l.top) && l.top.some((p) => p[1] === 19));
  assert.deepEqual(added.top, [[0, 19], [20, 19], [60, 22], [100, 20], [130, 20]]);
});

test('a layer without a boundary (empty point table, not the top one) gets the line as its boundary; no new layer', () => {
  const m = b3();
  m.layers.push({ material: 'M2', top: [] });
  const count = m.layers.length;
  const { drawing } = draw('layer', m, [[10, 15], [90, 15]]);
  const result = applyDrawing(drawing, m);
  assert.equal(m.layers.length, count, 'no new layer');
  assert.equal(result.focus, `layers[${count - 1}].material`);
  assert.deepEqual(m.layers[count - 1].top, [[0, 15], [10, 15], [90, 15], [130, 15]]);
  // the FIRST such layer is filled when there are several; the top layer never counts
  const two = b3();
  two.layers.push({ material: 'M2', top: [] }, { material: 'M1', top: null });
  applyDrawing(draw('layer', two, [[10, 12], [20, 12]]).drawing, two);
  assert.deepEqual(two.layers[2].top.slice(0, 2), [[0, 12], [10, 12]]);
  assert.equal(two.layers[3].top, null);
  assert.equal(two.layers[0].top, null);
});

test('a new layer: ordered by the height of the line in the middle of the model width, with the material of the layer it lies in', () => {
  const m = b3(); // layers: M1 (top, down to the boundary), M2 below; ground at the middle x = 65 is 40; the boundary of layer 2 at x = 65: see below
  const mid = 65;
  const boundaryZ = (() => { const top = m.layers[1].top; for (let i = 0; i + 1 < top.length; i++) if (mid >= top[i][0] && mid <= top[i + 1][0]) return top[i][1] + ((top[i + 1][1] - top[i][1]) * (mid - top[i][0])) / (top[i + 1][0] - top[i][0]); return null; })();
  assert.ok(boundaryZ !== null && boundaryZ < 40);
  // a line between the ground and the boundary: it lies in layer 1 (M1): the new layer comes after it, with material M1
  const high = (40 + boundaryZ) / 2;
  const a = structuredClone(m);
  const ra = applyDrawing(draw('layer', a, [[10, high], [120, high]]).drawing, a);
  assert.equal(ra.focus, 'layers[1].material');
  assert.equal(a.layers.length, 3);
  assert.equal(a.layers[1].material, m.layers[0].material, 'material of the layer the line lies in');
  assert.deepEqual(a.layers[2], m.layers[1], 'the old second layer is now the third');
  // a line below the boundary: it lies in layer 2 (M2): the new layer comes last, with material M2
  const b = structuredClone(m);
  const rb = applyDrawing(draw('layer', b, [[10, 5], [120, 5]]).drawing, b);
  assert.equal(rb.focus, 'layers[2].material');
  assert.equal(b.layers.length, 3);
  assert.equal(b.layers[2].material, m.layers[1].material);
  assert.deepEqual(b.layers.map((l) => l.material), [m.layers[0].material, m.layers[1].material, m.layers[1].material]);
  // the model stays valid for the core where the lines do not cross
  assert.equal(validateModel(b).valid, true, JSON.stringify(validateModel(b).errors));
  // a horizontal line between the ground and the boundary leaves the ground at the left edge: written as it is;
  // since SPEC 4 v1.8 the core clips it at the ground, the model is valid (until 1.7: E_LAYER_CROSS)
  assert.ok(a.layers[1].top.every(([, z]) => z === high), 'written as drawn');
  assert.equal(validateModel(a).valid, true, JSON.stringify(validateModel(a).errors));
  // a line above the ground is written as it is (no correction of the input); SPEC 4 v1.8: valid, the layer has thickness 0
  const c = structuredClone(m);
  applyDrawing(draw('layer', c, [[10, 80], [120, 80]]).drawing, c);
  assert.equal(c.layers.length, 3);
  assert.ok(c.layers[1].top.every(([, z]) => z === 80), 'written as drawn');
  assert.equal(validateModel(c).valid, true, JSON.stringify(validateModel(c).errors));
});

test('layer boundary and water line: clicks outside the model width set no point; without a valid ground there is no width', () => {
  const m = b3();
  for (const kind of ['layer', 'water']) {
    const { drawing, rejected } = draw(kind, m, [[-5, 10], [140, 10], [10, 10], [130.5, 12], [90, 12]]);
    assert.deepEqual(rejected, ['outside', 'outside', 'outside'], kind);
    assert.deepEqual(drawing.points, [[10, 10], [90, 12]], kind);
  }
  assert.deepEqual(draw('water', m, [[0, 5], [130, 5]]).rejected, [], 'the edges themselves are inside');
  assert.deepEqual(modelWidth(m), { xMin: 0, xMax: 130 });
  const none = { ground: [[0, 0]] };
  assert.equal(modelWidth(none), null);
  assert.deepEqual(acceptPoint(newDrawing('layer'), [1, 1], none), { ok: false, reason: 'noWidth' });
  // ground and slip surface have no such limit
  assert.equal(acceptPoint(newDrawing('ground'), [-5, 10], m).ok, true);
  assert.equal(acceptPoint(newDrawing('surface'), [-5, 10], m).ok, true);
});

test('water line: sets (or replaces) water over the whole width; the switch "Wasserlinie" is then on (the field is not null)', () => {
  const m = b1();
  assert.equal(m.water, null);
  applyDrawing(draw('water', m, [[20, 30], [100, 40]]).drawing, m);
  assert.deepEqual(m.water, [[0, 30], [20, 30], [100, 40], [130, 40]]);
  applyDrawing(draw('water', m, [[40, 28], [60, 29]]).drawing, m);
  assert.deepEqual(m.water, [[0, 28], [40, 28], [60, 29], [130, 29]], 'replaced');
  const input = read('app', 'ui', 'sections-model.js');
  assert.match(input, /const on = m\.water !== null && m\.water !== undefined;/, 'the switch is on when the field exists');
});

test('ground: replaces `ground` completely, ordered by x; the model width follows the first and last point', () => {
  const m = b3();
  applyDrawing(draw('ground', m, [[100, 40], [60, 30], [0, 30], [-10, 30]]).drawing, m);
  // the click at x = -10 continues the direction (to the left): it is set; the order is ascending
  assert.deepEqual(m.ground, [[-10, 30], [0, 30], [60, 30], [100, 40]]);
  assert.deepEqual(modelWidth(m), { xMin: -10, xMax: 100 });
  // the layers are not changed; since SPEC 4 v1.8 a boundary beyond the model width is cut there, the model stays valid
  // (until 1.7: E_LAYER_WIDTH)
  assert.deepEqual(m.layers, b3().layers);
  assert.equal(validateModel(m).valid, true, JSON.stringify(validateModel(m).errors));
  assert.deepEqual(draw('ground', m, [[10, 5], [20, 5], [15, 6]]).rejected, ['direction']);
  assert.equal(canFinish(draw('ground', m, [[10, 5]]).drawing, m).ok, false);
  assert.equal(canFinish(draw('ground', m, [[10, 5]]).drawing, m).reason, 'min');
});

test('lines need at least 2 points; a layer boundary needs a layer; the slip surface is as in order 27', () => {
  const m = b3();
  for (const kind of ['surface', 'layer', 'water', 'ground']) assert.deepEqual(canFinish(draw(kind, m, [[10, 10]]).drawing, m), { ok: false, reason: 'min' }, kind);
  assert.deepEqual(canFinish(draw('layer', { ...m, layers: [] }, [[10, 10], [20, 10]]).drawing, { ...m, layers: [] }), { ok: false, reason: 'layers' });
  const s = b1();
  applyDrawing(draw('surface', s, [[60, 20], [40, 22], [20, 30]]).drawing, s);
  assert.deepEqual(s.surfaces.at(-1), { id: 'P1', type: 'polyline', points: [[20, 30], [40, 22], [60, 20]] });
});

// ------------------------------------------------------------ supports

/** Make a drawn nail or anchor complete for the sketch (the fields the drawing leaves empty), so that supportShapes draws it. */
const completeNail = (s) => Object.assign(s, { spacing: 1, bond: { q: 50 }, tensile: 100, hasHead: true });
const completeAnchor = (s) => Object.assign(s, { spacing: 2, P0: 100, Rk: 500 });

test('nail: head, angle (into the slope, downwards positive) and length so that the nail lies exactly between the two clicks, in both directions of the slope', () => {
  for (const flip of [false, true]) {
    const m = flip ? mirrorModelForTest(b1()) : b1();
    const direction = slopeDirection(m);
    assert.equal(direction, flip ? 'right' : 'left');
    // B1 falls to the left (crown at +x): into the slope is +x; mirrored it is -x
    const head = flip ? [-60, 38] : [60, 38];
    const end = flip ? [-72, 32] : [72, 32];
    const { drawing } = draw('nail', m, [head, end]);
    assert.equal(isComplete(drawing), true);
    const result = applyDrawing(drawing, m);
    const nail = m.supports[result.support];
    assert.equal(nail.type, 'nail');
    assert.equal(nail.id, 'N1');
    near(assert, nail.x, head[0], 0);
    near(assert, nail.z, head[1], 0);
    // rounded at the end of the drawing (order 29): angle to 0.01 degree, length to 0.01 m
    near(assert, nail.length, Math.hypot(12, 6), 0.005 + 1e-12, 'length');
    near(assert, nail.angle, (Math.atan2(6, 12) * 180) / Math.PI, 0.005 + 1e-12, 'angle below the horizontal, positive downwards');
    assert.ok(isRounded(nail.length) && isRounded(nail.angle), `rounded: ${nail.length} ${nail.angle}`);
    // the other fields are empty as with the button "add"
    assert.deepEqual({ spacing: nail.spacing, tensile: nail.tensile, hasHead: nail.hasHead, bond: nail.bond }, { spacing: null, tensile: null, hasHead: null, bond: { tau: null, diameter: null } });
    // the nail as the sketch draws it ends in the second click
    completeNail(nail);
    const shape = supportShapes(m).find((x) => x.index === result.support);
    assert.ok(shape, 'drawable');
    // the end lies at most the rounding beside the second click (the same strictness as before, the rounding is the limit)
    const reach = roundingReach(Math.hypot(12, 6), 1);
    assert.ok(Math.hypot(shape.segments[0].b[0] - end[0], shape.segments[0].b[1] - end[1]) <= reach, 'end beside the click');
    assert.ok(reach <= 0.01, 'at most 0.01 m');
  }
  // an angle outside -90..90 (the end on the wrong side) is written as it is: the check reports E_SUPPORT_ANGLE, nothing is corrected
  const wrong = b1();
  applyDrawing(draw('nail', wrong, [[60, 38], [50, 32]]).drawing, wrong);
  assert.ok(Math.abs(wrong.supports[0].angle) > 90);
  assert.ok(validateModel(wrong).errors.some((e) => e.code === 'E_SUPPORT_ANGLE'));
  assert.equal(inclinationOf(12, -6, 'left') > 0, true);
  assert.deepEqual(draw('nail', b1(), [[60, 38], [60, 38]]).rejected, ['same'], 'a nail of length 0 is not set');
});

test('anchor: the third click is projected onto the line of the first two and must lie behind the second; free length and bond length', () => {
  const m = b1();
  const head = [60, 38];
  const second = [70, 32]; // direction (10, -6)
  const length = Math.hypot(10, 6);
  // behind the head and between head and second: not set; next to the line: projected
  const probe = draw('anchor', m, [head, second, [64, 35], [60, 38], [90, 30]]);
  assert.deepEqual(probe.rejected, ['behind', 'behind']);
  assert.equal(isComplete(probe.drawing), true, 'ends after the third click, without a double click');
  const third = probe.drawing.points[2];
  // on the line through head and second
  near(assert, (third[0] - head[0]) * -6 - (third[1] - head[1]) * 10, 0, 1e-9, 'on the line');
  assert.ok(Math.hypot(third[0] - head[0], third[1] - head[1]) > length);
  const result = applyDrawing(probe.drawing, m);
  const anchor = m.supports[result.support];
  assert.equal(anchor.type, 'anchor');
  assert.equal(anchor.id, 'A1');
  // rounded at the end of the drawing (order 29)
  near(assert, anchor.freeLength, length, 0.005 + 1e-12, 'free length');
  near(assert, anchor.bondLength, Math.hypot(third[0] - second[0], third[1] - second[1]), 0.005 + 1e-12, 'bond length');
  near(assert, anchor.angle, (Math.atan2(6, 10) * 180) / Math.PI, 0.005 + 1e-12);
  assert.ok([anchor.freeLength, anchor.bondLength, anchor.angle].every(isRounded));
  completeAnchor(anchor);
  const shape = supportShapes(m).find((x) => x.index === result.support);
  assert.ok(shape);
  const toSecond = Math.hypot(second[0] - head[0], second[1] - head[1]);
  const toThird = Math.hypot(third[0] - head[0], third[1] - head[1]);
  assert.ok(Math.hypot(shape.segments[0].b[0] - second[0], shape.segments[0].b[1] - second[1]) <= roundingReach(toSecond, 1), 'end of the free length beside the second click');
  assert.ok(Math.hypot(shape.segments[1].b[0] - third[0], shape.segments[1].b[1] - third[1]) <= roundingReach(toThird, 2), 'end of the anchor beside the third click');
  // the preview of the bond part follows the pointer only where a point could be set
  const early = newDrawing('anchor');
  early.points = [head, second];
  assert.equal(previewParts(early, [64, 35], m).filter((p) => p.cls === 'line').length, 0);
  assert.equal(previewParts(early, [90, 30], m).filter((p) => p.cls === 'line').length, 1);
  assert.deepEqual(anchorFromClicks([head, second, third], 'left').freeLength, anchor.freeLength);
});

test('pile: head and foot (only the z of the second click counts, the pile stands vertically); the foot must be below the head', () => {
  const m = b1();
  const { drawing, rejected } = draw('pile', m, [[100, 50], [105, 55], [103, 41]]);
  assert.deepEqual(rejected, ['up']);
  assert.deepEqual(drawing.points, [[100, 50], [100, 41]], 'the x of the second click is not used');
  const result = applyDrawing(drawing, m);
  const pile = m.supports[result.support];
  assert.deepEqual({ type: pile.type, id: pile.id, x: pile.x, z: pile.z, length: pile.length, spacing: pile.spacing, shear: pile.shear }, { type: 'pile', id: 'P1', x: 100, z: 50, length: 9, spacing: null, shear: null });
  Object.assign(pile, { spacing: 2, shear: 100 });
  const shape = supportShapes(m).find((x) => x.index === result.support);
  assert.deepEqual([shape.segments[0].b[0], shape.segments[0].b[1]], [100, 41]);
  // the preview is vertical
  const d = newDrawing('pile');
  d.points = [[100, 50]];
  assert.deepEqual(previewParts(d, [120, 44], m)[0].points, [[100, 50], [100, 44]]);
});

test('shotcrete: two clicks, x1 < x2 whatever the order; the same x twice is not accepted', () => {
  const m = b1();
  const result = applyDrawing(draw('shotcrete', m, [[75, 48], [55, 33]]).drawing, m);
  const s = m.supports[result.support];
  assert.deepEqual({ type: s.type, id: s.id, x1: s.x1, x2: s.x2, thickness: s.thickness, tau: s.tau }, { type: 'shotcrete', id: 'S1', x1: 55, x2: 75, thickness: null, tau: null });
  assert.ok(s.x1 < s.x2);
  assert.deepEqual(draw('shotcrete', b1(), [[60, 40], [60, 33], [70, 40]]).rejected, ['xsame']);
  // the preview is the band on the ground line between the first click and the pointer
  const d = newDrawing('shotcrete');
  d.points = [[60, 40]];
  const band = previewParts(d, [70, 99], m)[0].points;
  assert.deepEqual(band[0], [60, 36.666666666666664]);
  assert.deepEqual(band.at(-1), [70, 43.333333333333336]);
});

test('every new support gets the next free id of its type; the others stay; the field of the element opens (like a double click)', () => {
  const m = b1();
  m.supports = [{ id: 'N1', type: 'nail' }];
  assert.equal(applyDrawing(draw('nail', m, [[60, 38], [72, 32]]).drawing, m).support, 1);
  assert.equal(m.supports[1].id, 'N2');
  assert.equal(m.supports.length, 2);
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /if \(next\.support !== undefined\) openSupportField\(next\.support, anchor\);/);
  assert.match(sketch, /if \(next\.focus && edit\.focusPath\) edit\.focusPath\(next\.focus\);/, 'a new layer: the area Layers at its material');
  assert.match(read('app', 'main.js'), /focusPath: \(path\) => \{ if \(!state\.running\) inputs\.focusPath\(path\); \}/);
});

// ------------------------------------------------------------ rejected clicks, Esc, one step

test('rejected clicks: direction against the first two points, outside the width, the third point of an anchor; nothing is written', () => {
  const m = b3();
  const before = JSON.stringify(m);
  const surface = draw('surface', m, [[10, 10], [20, 12], [15, 13], [20, 14], [30, 14]]);
  assert.deepEqual(surface.rejected, ['direction', 'direction'], 'back and the same x');
  assert.deepEqual(surface.drawing.points.map((p) => p[0]), [10, 20, 30]);
  assert.deepEqual(draw('anchor', m, [[60, 38], [70, 32], [65, 35]]).rejected, ['behind']);
  assert.equal(JSON.stringify(m), before, 'the model is not touched by clicks');
  for (const reason of ['direction', 'outside', 'noWidth', 'same', 'behind', 'up', 'xsame', 'min', 'layers']) {
    for (const lang of ['de', 'en']) assert.ok(MESSAGES[lang][`ui.draw.reject.${reason}`], `${lang}:${reason}`);
  }
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /flashHint\(t\(`ui\.draw\.reject\.\$\{accepted\.reason\}`\)\);/);
});

test('Esc cancels without a change of the model; a drawing is one edit.commit; no handles, no preview in the export', () => {
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /if \(drawing && e\.key === 'Escape'\)[\s\S]{0,120}cancelDrawing\(\)/);
  const stop = sketch.slice(sketch.indexOf('function stopDrawing'), sketch.indexOf('function cancelDrawing'));
  assert.doesNotMatch(stop, /edit\.|applyDrawing/);
  const finish = sketch.slice(sketch.indexOf('function finishDrawing'), sketch.indexOf('function setHover'));
  assert.equal([...finish.matchAll(/edit\.commit\(/g)].length, 1, 'one change of the model: one step of the history');
  assert.match(finish, /edit\.commit\(\(model\) => \{ next = applyDrawing\(finished, model\); \}\);/);
  // the last click of the fixed kinds ends the drawing; a double click right after it opens nothing
  assert.match(sketch, /if \(isComplete\(drawing\)\) finishDrawing\(\);/);
  assert.match(sketch, /if \(Date\.now\(\) < ignoreDblUntil\) return;/);
  const paint = sketch.slice(sketch.indexOf('function paint('), sketch.indexOf('function setSize'));
  assert.doesNotMatch(paint, /drawPreview|drawHandles/);
  assert.match(sketch, /const parts = \[\];\n {4}for \(const part of previewParts\(drawing, drawing\.mouse, modelRef\)\)/);
});

test('every kind is ONE step of the history: undo gives the model before the drawing back, redo the drawing', () => {
  const cases = [
    ['surface', b1(), [[60, 20], [40, 22]]],
    ['layer', b3(), [[10, 20], [90, 20]]],
    ['water', b1(), [[10, 30], [90, 30]]],
    ['ground', b1(), [[0, 30], [60, 40], [130, 40]]],
    ['nail', b1(), [[60, 38], [72, 32]]],
    ['anchor', b1(), [[60, 38], [70, 32], [90, 26]]],
    ['pile', b1(), [[100, 50], [100, 40]]],
    ['shotcrete', b1(), [[55, 33], [75, 47]]],
  ];
  for (const [kind, model, clicks] of cases) {
    const history = createHistory();
    const before = snapshotModel(model);
    const { drawing } = draw(kind, model, clicks);
    applyDrawing(drawing, model); // what edit.commit does: begin, change, end -> history.record(before)
    const after = snapshotModel(model);
    assert.notEqual(after, before, kind);
    history.record(before);
    assert.equal(history.undoSteps, 1, kind);
    const back = history.undo(after);
    assert.equal(back, before, `${kind}: undo`);
    assert.deepEqual(modelFromSnapshot(back), JSON.parse(before));
    assert.equal(history.redo(back), after, `${kind}: redo`);
  }
  // a drawing discards a result like every change of the model: main.js commit -> modelEdited -> dispatchResult model-changed
  const main = read('app', 'main.js');
  assert.match(main, /commit\(mutate\) \{\s*if \(!this\.begin\(\)\) return;\s*this\.change\(mutate\);\s*this\.end\(\);/);
  assert.match(main, /function modelEdited\(\) \{\s*dispatchResult\(\{ type: 'model-changed' \}\);/);
});


test('addLayerBoundary: a short boundary (SPEC 4 v1.8) still orders a new layer by its effective height', () => {
  const model = {
    ground: [[0, 10], [10, 10], [25, 17.5], [35, 17.5]],
    layers: [{ material: 'M1', top: null }, { material: 'M2', top: [[0, 5], [10, 5]] }], // ends left of the middle (x = 17.5)
  };
  const r = addLayerBoundary(model, [[0, 3], [35, 3]]);
  assert.deepEqual(r, { index: 2, created: true });
  assert.equal(model.layers[2].material, 'M2');
});
