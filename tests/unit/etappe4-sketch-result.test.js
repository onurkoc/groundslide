// Order 27 (SPEC_ETAPPE4 12, 13): sketch of polylines, crack and results of search A; drawing mode; overview, slice table, document.
// No DOM: the pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, analyzeSurface } from '../../core/index.js';
import { buildSketch, isDrawablePolyline } from '../../app/lib/sketch-model.js';
import { buildHandles, lineTargets, hitSegment, insertOnSegment, setHandleValues, deleteHandlePoint, canDeleteHandle, editFields, pickHandle } from '../../app/lib/handles.js';
import { buildResultOverlay, polylineBody, polylineCut, polylineLabelSpot, polylineMarks, crackLines, drawingStep, finishedPolyline, singleLabel } from '../../app/lib/result-sketch.js';
import { overviewTable, surfacesTable, countsView, criticalSurface, adoptableSurface } from '../../app/lib/result-view.js';
import { resolveSurface, describeSurface, sliceColumnsFor, STRESS_COLUMNS, displayRows, sliceTsv, columnHead, SLICE_COLUMNS } from '../../app/lib/slices-table.js';
import { documentHead, documentTable } from '../../app/lib/result-document.js';
import { adoptSurface } from '../../app/lib/edit.js';
import { translate } from '../../app/lib/i18n.js';
import { loadBenchmark } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const t = (lang) => (key, params) => translate(lang, key, params);
const PL = [[45, 30], [55, 28], [70, 32], [85, 40], [97.5, 50]];

/** B3 with a small search grid, search A (9 points: the polyline beats the circle for every target here), a polyline and a circle. */
function searchModel(extra = {}) {
  const m = loadBenchmark('B3_two_layers');
  m.analysis.methods = ['bishop', 'janbu', 'spencer'];
  m.search = { grid: { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 3, nz: 3 }, radii: 6, optimize: { points: 9 } };
  m.surfaces = [{ id: 'C1', xc: 50, zc: 80, R: 52 }, { id: 'P1', type: 'polyline', points: PL.map((p) => [...p]) }];
  return { ...m, ...extra };
}
const model = searchModel();
const result = analyze(model);

// ------------------------------------------------------------ sketch model

test('buildSketch: only a complete polyline with x strictly increasing is drawn; the frame holds it', () => {
  assert.equal(isDrawablePolyline(PL), true);
  assert.equal(isDrawablePolyline([[0, 0]]), false);
  assert.equal(isDrawablePolyline([[0, 0], [0, 1]]), false);
  assert.equal(isDrawablePolyline([[0, 0], [1, null]]), false);
  assert.equal(isDrawablePolyline(undefined), false);
  const m = { ground: [[0, 30], [100, 30]], bottom: 0, layers: [], materials: {}, surfaces: [
    { id: 'P1', type: 'polyline', points: PL }, { id: 'P2', type: 'polyline', points: [[1, 1]] }, { id: 'P3', type: 'polyline', points: [[5, 1], [4, 2]] }, { id: 'C1', xc: 50, zc: 60, R: 20 }] };
  const sketch = buildSketch(m);
  assert.deepEqual(sketch.polylines.map((p) => [p.id, p.index]), [['P1', 0]]);
  assert.deepEqual(sketch.surfaces.map((c) => c.id), ['C1'], 'circles as before');
  assert.ok(sketch.bounds.xMax >= 97.5 && sketch.bounds.zMin <= 28);
});

test('buildSketch: the line of the crack zone parallel to the ground at the depth; none without or with an invalid crack', () => {
  const base = { ground: [[0, 30], [50, 30], [80, 50]], bottom: 0, layers: [], materials: {} };
  assert.equal(buildSketch(base).crackZone, null);
  const zone = buildSketch({ ...base, tensionCrack: { depth: 3, waterFill: 0.5 } }).crackZone;
  assert.equal(zone.depth, 3);
  assert.deepEqual(zone.points, [[0, 27], [50, 27], [80, 47]]);
  for (const tc of [{ depth: 0, waterFill: 0 }, { depth: null, waterFill: 0 }, { depth: -1 }, 'x', null]) assert.equal(buildSketch({ ...base, tensionCrack: tc }).crackZone, null, JSON.stringify(tc));
});

// ------------------------------------------------------------ handles on polylines

test('handles of a polyline: every point is a handle (drag, double click), only of a drawable polyline; the order after the circles', () => {
  const m = { ground: [[0, 30], [100, 30]], surfaces: [{ id: 'C1', xc: 50, zc: 60, R: 20 }, { id: 'P1', type: 'polyline', points: PL.map((p) => [...p]) }, { id: 'P2', type: 'polyline', points: [[1, 1]] }] };
  const handles = buildHandles(m);
  const poly = handles.filter((h) => h.type === 'poly');
  assert.deepEqual(poly.map((h) => h.id), PL.map((_, i) => `poly:1:${i}`));
  assert.deepEqual(poly.map((h) => [h.x, h.z]), PL);
  assert.ok(handles.findIndex((h) => h.type === 'poly') > handles.findIndex((h) => h.type === 'radius'), 'after the circles');
  const toScreen = (x, z) => [x * 10, -z * 10];
  assert.equal(pickHandle(handles, 700, -320, toScreen).id, 'poly:1:2');
  // move: x and z are written into the point
  const h = poly[2];
  assert.deepEqual(editFields(h).map((f) => f.key), ['x', 'z']);
  assert.equal(setHandleValues(m, h, { x: 71, z: 33 }), true);
  assert.deepEqual(m.surfaces[1].points[2], [71, 33]);
  assert.equal(setHandleValues(m, { type: 'poly', surface: 7, index: 0 }, { x: 1, z: 1 }), false);
  // delete a point
  assert.equal(canDeleteHandle(h), true);
  assert.equal(deleteHandlePoint(m, h), true);
  assert.equal(m.surfaces[1].points.length, 4);
});

test('double click on the line of a polyline inserts a point on it, between the neighbours (x stays strictly increasing)', () => {
  const m = { ground: [[0, 30], [100, 30]], surfaces: [{ id: 'P1', type: 'polyline', points: PL.map((p) => [...p]) }] };
  const targets = lineTargets(m);
  assert.ok(targets.some((x) => x.type === 'poly' && x.surface === 0));
  const toScreen = (x, z) => [x * 10, -z * 10];
  const hit = hitSegment(targets.filter((x) => x.type === 'poly'), 620, -299, toScreen); // on the piece (55;28)-(70;32): x = 62, z = 29.87
  assert.ok(hit);
  const point = insertOnSegment(hit, 62);
  assert.equal(m.surfaces[0].points.length, 6);
  assert.ok(point[0] > 55 && point[0] < 70);
  assert.ok(Math.abs(point[1] - (28 + (4 * 7) / 15)) < 1e-9, 'z on the line');
  const xs = m.surfaces[0].points.map((p) => p[0]);
  assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]));
});

// ------------------------------------------------------------ drawing mode

test('drawing mode: the first two points give the direction, a click that leaves x not strictly monotone sets no point', () => {
  assert.deepEqual(drawingStep([], 0, 5), { ok: true, direction: 0 });
  assert.deepEqual(drawingStep([[5, 1]], 0, 5), { ok: false }, 'same x as the first point');
  assert.deepEqual(drawingStep([[5, 1]], 0, 8), { ok: true, direction: 1 });
  assert.deepEqual(drawingStep([[5, 1]], 0, 2), { ok: true, direction: -1 });
  assert.deepEqual(drawingStep([[5, 1], [8, 2]], 1, 9), { ok: true, direction: 1 });
  assert.deepEqual(drawingStep([[5, 1], [8, 2]], 1, 8), { ok: false });
  assert.deepEqual(drawingStep([[5, 1], [8, 2]], 1, 7), { ok: false }, 'back against the direction');
  assert.deepEqual(drawingStep([[5, 1], [2, 2]], -1, 1), { ok: true, direction: -1 });
  assert.deepEqual(drawingStep([[5, 1], [2, 2]], -1, 3), { ok: false });
  assert.deepEqual(drawingStep([[5, 1]], 0, Number.NaN), { ok: false });
  // a drawing made of accepted points is always strictly monotone
  const points = [];
  let direction = 0;
  for (const x of [10, 12, 11, 12, 15, 14, 20]) {
    const step = drawingStep(points, direction, x);
    if (step.ok) { direction = step.direction; points.push([x, 0]); }
  }
  assert.deepEqual(points.map((p) => p[0]), [10, 12, 15, 20]);
});

test('finishing the drawing orders the points by x ascending (also when drawn from right to left); fewer than 2 points: nothing', () => {
  assert.deepEqual(finishedPolyline([[9, 1], [5, 2], [2, 3]]), [[2, 3], [5, 2], [9, 1]]);
  assert.deepEqual(finishedPolyline([[1, 1], [2, 2]]), [[1, 1], [2, 2]]);
  assert.equal(finishedPolyline([[1, 1]]), null);
  assert.equal(finishedPolyline([]), null);
  const input = [[9, 1], [5, 2]];
  finishedPolyline(input);
  assert.deepEqual(input, [[9, 1], [5, 2]], 'the points drawn are not changed');
  // the result is a valid polyline (x strictly increasing) for the new single surface
  const model = { surfaces: [{ id: 'P1', type: 'polyline', points: PL }] };
  adoptSurface(model, { type: 'polyline', points: finishedPolyline([[30, 5], [20, 6], [10, 7]]) });
  assert.deepEqual(model.surfaces.map((s) => s.id), ['P1', 'P2'], 'the next free id');
  assert.equal(isDrawablePolyline(model.surfaces[1].points), true);
});

test('drawing mode in the sketch: button in the bar, click sets a point, double click or Enter ends, Esc cancels; the end is one step; not in the export', () => {
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /'ui\.sketch\.draw'/);
  assert.match(sketch, /drawBtn\.disabled = !drawing && !\(edit && edit\.canEdit\(\) && sketch\.bounds\)/, 'locked during a run and without a model');
  // the click sets a point only in the drawing mode and not at the end of a pan or as the second click of a double click
  assert.match(sketch, /canvas\.addEventListener\('click', \(e\) => \{\s*if \(!drawing \|\| e\.button !== 0\) return;/);
  assert.match(sketch, /if \(e\.detail > 1\) return;/);
  // order 28: the rule of the click is acceptPoint of lib/drawing.js (it calls drawingStep for the lines and the slip surface)
  assert.match(sketch, /const accepted = acceptPoint\(drawing, p, modelRef\);/);
  // end: double click and Enter call finishDrawing, Esc cancelDrawing
  assert.match(sketch, /canvas\.addEventListener\('dblclick', \(e\) => \{\s*if \(drawing\) \{\s*e\.preventDefault\(\);\s*finishDrawing\(\);/);
  assert.match(sketch, /if \(drawing && e\.key === 'Enter'\)[\s\S]{0,80}finishDrawing\(\)/);
  assert.match(sketch, /if \(drawing && e\.key === 'Escape'\)[\s\S]{0,120}cancelDrawing\(\)/);
  // the end adds the single surface in ONE edit.commit (one step of the history); cancelling does not touch the model
  const finish = sketch.slice(sketch.indexOf('function finishDrawing'), sketch.indexOf('function setHover'));
  assert.equal([...finish.matchAll(/edit\.commit\(/g)].length, 1);
  // order 28: what is written is decided by applyDrawing (lib/drawing.js): for the slip surface "P<n>" with the points ordered by x
  assert.match(finish, /edit\.commit\(\(model\) => \{ next = applyDrawing\(finished, model\); \}\);/);
  const cancel = sketch.slice(sketch.indexOf('function stopDrawing'), sketch.indexOf('function cancelDrawing'));
  assert.doesNotMatch(cancel, /edit\./);
  // no handles and no moving in the drawing mode; the preview is drawn on the screen only (the export calls paint())
  assert.match(sketch, /const handle = drawing \? null : pickHandle/);
  assert.match(sketch, /if \(drawing\) drawPreview\(svg\);\s*else if \(edit && edit\.canEdit\(\) && modelRef\)/);
  const paint = sketch.slice(sketch.indexOf('function paint('), sketch.indexOf('function setSize'));
  assert.doesNotMatch(paint, /drawPreview|drawHandles/, 'neither the handles nor the preview are part of paint(), so not of the export and the document');
  assert.match(sketch, /if \(drawing && !\(edit && edit\.canEdit\(\)\)\) stopDrawing\(\)/, 'a run drops the drawing');
});

// ------------------------------------------------------------ result of search A in the sketch

test('overlay of a result of search A: the polyline of the method (strong when chosen), the circle before the optimisation, bishop stays a circle', () => {
  const methods = Object.keys(result.critical);
  assert.deepEqual(methods.sort(), ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
  const overlay = buildResultOverlay(result, { method: 'spencer', contour: false, grid: model.search.grid });
  const byMethod = Object.fromEntries(overlay.circles.map((c) => [c.method, c]));
  assert.equal(byMethod.bishop.kind, undefined, 'a circle');
  assert.equal(typeof byMethod.bishop.xc, 'number');
  assert.equal(byMethod.spencer.kind, 'polyline');
  assert.equal(byMethod.spencer.points.length, 9);
  assert.equal(byMethod.spencer.selected, true);
  assert.equal(overlay.circles.at(-1).method, 'spencer', 'the chosen one is drawn last');
  assert.match(byMethod.spencer.label, /^F = \d\.\d{3}$/);
  assert.equal(byMethod.janbu.label, null);
  const sc = result.critical.spencer.searchCircle;
  // order 28: with entry and exit (the circle is drawn between them)
  assert.deepEqual(overlay.searchCircle, { xc: sc.xc, zc: sc.zc, R: sc.R, entry: sc.entry, exit: sc.exit });
  // no dashed radius lines for a polyline; with the circle of Bishop chosen the lines are there and there is no search circle
  assert.deepEqual(overlay.radii, []);
  const bishop = buildResultOverlay(result, { method: 'bishop', contour: false, grid: model.search.grid });
  assert.equal(bishop.radii.length, 2);
  assert.equal(bishop.searchCircle, null);
});

test('label F of a polyline: in the middle between entry and exit, at the height of the ground there; the body polygon lies between polyline and ground', () => {
  const c = criticalSurface(result, 'spencer');
  const spot = polylineLabelSpot(c.entry, c.exit, model.ground);
  assert.ok(Math.abs(spot[0] - 0.5 * (c.entry[0] + c.exit[0])) < 1e-12);
  assert.ok(spot[1] >= 30 && spot[1] <= 50);
  assert.deepEqual(polylineLabelSpot(null, c.exit, model.ground), null);
  const body = polylineBody({ points: c.points, entry: c.entry, exit: c.exit }, model.ground);
  assert.ok(body.length >= c.points.length);
  const cut = polylineCut({ points: c.points, entry: c.entry, exit: c.exit });
  assert.deepEqual(cut[0], cut[0][0] <= cut.at(-1)[0] ? cut[0] : cut.at(-1));
  assert.ok(cut.every((p, i) => i === 0 || p[0] > cut[i - 1][0]), 'x increasing');
  assert.deepEqual(polylineBody({ points: [], entry: null, exit: null }, model.ground), []);
  // marks of the single polylines carry id, line and label (F of the chosen method, or the code)
  const overlay = buildResultOverlay(result, { method: 'spencer', contour: false, grid: model.search.grid });
  const marks = polylineMarks(buildSketch(model).polylines, overlay, buildSketch(model).ground);
  assert.equal(marks.length, 1);
  assert.match(marks[0].label, /^P1  F = \d\.\d{3}$/);
  const bishopMarks = polylineMarks(buildSketch(model).polylines, buildResultOverlay(result, { method: 'bishop', contour: false, grid: model.search.grid }), model.ground);
  assert.equal(bishopMarks[0].label, 'P1  I_NONCIRCULAR', 'Bishop at a polyline: the code instead of F');
});

test('crack of a result in the sketch: x, depth and the height of the water h_w = waterFill * depth; every place once', () => {
  const cracked = searchModel({ tensionCrack: { depth: 3, waterFill: 0.5 } });
  const r = analyze(cracked);
  const lines = crackLines(r, cracked.tensionCrack);
  assert.ok(lines.length >= 1);
  for (const c of lines) {
    assert.equal(c.depth, 3);
    assert.equal(c.water, 1.5);
    assert.ok(c.Pw > 0);
  }
  assert.equal(new Set(lines.map((c) => `${c.x}|${c.depth}`)).size, lines.length, 'every place once');
  const overlay = buildResultOverlay(r, { method: 'spencer', contour: false, grid: cracked.search.grid, tensionCrack: cracked.tensionCrack });
  assert.deepEqual(overlay.cracks, lines);
  assert.deepEqual(crackLines(result, null), [], 'no crack, no line');
  assert.equal(buildResultOverlay(result, { method: 'spencer', contour: false, grid: null }).cracks.length, 0);
  // dry: no water
  assert.ok(crackLines(r, { depth: 3, waterFill: 0 }).every((c) => c.water === 0));
  // the single surfaces with a crack as well
  const single = { surfaces: [{ valid: true, crack: { x: 80, depth: 3, Pw: 1 } }, { valid: false }] };
  assert.deepEqual(crackLines(single, { depth: 3, waterFill: 1 }), [{ x: 80, depth: 3, Pw: 1, water: 3 }]);
  const html = read('app', 'ui', 'sketch.js');
  assert.match(html, /class: 'sk-crack'/);
  assert.match(html, /class: 'sk-crack-water'/);
  assert.match(html, /class: 'sk-crackzone'/);
});

// ------------------------------------------------------------ overview

test('overview table of search A: columns Surface and F circle; centre and radius "–" for a polyline; crack column with a crack', () => {
  const table = overviewTable(result);
  assert.equal(table.hasSurface, true);
  assert.equal(table.hasSearchF, true);
  assert.equal(table.hasCrack, false);
  const row = (m) => table.rows.find((r) => r.method === m);
  assert.equal(row('spencer').polyline.n, 9);
  assert.equal(row('bishop').polyline, undefined);
  assert.equal(row('bishop').searchF, undefined, 'bishop stays the circle: no F of a circle before');
  assert.ok(row('spencer').searchF > row('spencer').F, 'the polyline is below the circle');
  assert.equal(table.optimizeEvaluations, result.optimizeEvaluations);
  assert.equal(countsView(result).optimizeEvaluations, result.optimizeEvaluations);
  const cracked = overviewTable(analyze(searchModel({ tensionCrack: { depth: 3, waterFill: 1 } })));
  assert.equal(cracked.hasCrack, true);
  assert.ok(cracked.rows.every((r) => r.crack && r.crack.depth === 3 && r.crack.Pw > 0));
  // a result without search A looks as before: no new column, no new field in a row
  const plain = analyze({ ...searchModel(), search: { ...searchModel().search, optimize: undefined } });
  const plainTable = overviewTable(plain);
  assert.equal(plainTable.hasSurface, false);
  assert.equal(plainTable.hasSearchF, false);
  assert.equal(plainTable.hasCrack, false);
  assert.equal(countsView(plain).optimizeEvaluations, undefined);
  for (const r of plainTable.rows) assert.deepEqual(Object.keys(r), ['method', 'valid', 'F', 'xc', 'zc', 'R', 'entry', 'exit', 'theta', 'check']);
  // the overview shows the columns through the page part
  const overview = read('app', 'ui', 'result-overview.js');
  assert.match(overview, /table\.hasSurface/);
  assert.match(overview, /ui\.surf\.polylineN/);
  assert.match(overview, /row\.polyline \? \[num\('–'\), num\('–'\), num\('–'\)\]/);
});

test('single surfaces of the result: a polyline has its points; Bishop gives I_NONCIRCULAR with code and text; the circle rows are as before', () => {
  const rows = surfacesTable(result).rows;
  const c1 = rows.find((r) => r.id === 'C1');
  const p1 = rows.find((r) => r.id === 'P1');
  assert.deepEqual(Object.keys(c1), ['id', 'valid', 'methods', 'circle']);
  assert.equal(p1.polyline.points.length, 5);
  assert.equal(p1.circle, null);
  assert.deepEqual(p1.methods.bishop.code, 'I_NONCIRCULAR');
  assert.ok(translate('de', 'I_NONCIRCULAR').length > 0);
  assert.equal(singleLabel(p1, 'bishop'), 'P1  I_NONCIRCULAR');
  assert.match(singleLabel(p1, 'spencer'), /^P1  F = \d\.\d{3}$/);
  assert.equal(translate('de', 'E_SURFACE_POINTS').length > 0, true);
});

test('"Take over as single surface": the governing surface of the method as a circle (Bishop) or as a polyline (search A); a method without one: nothing', () => {
  const circle = adoptableSurface(result, 'bishop');
  assert.deepEqual(Object.keys(circle), ['xc', 'zc', 'R']);
  const polyline = adoptableSurface(result, 'spencer');
  assert.equal(polyline.type, 'polyline');
  assert.equal(polyline.points.length, 9);
  assert.notEqual(polyline.points, result.critical.spencer.points, 'a copy');
  assert.equal(adoptableSurface(result, 'nope'), null);
  assert.equal(adoptableSurface(null, 'spencer'), null);
  // into the model: next free ids; the model stays valid for the core; the polyline gives the same F as the search
  const m = structuredClone(model);
  const id1 = adoptSurface(m, circle);
  const id2 = adoptSurface(m, polyline);
  assert.deepEqual([id1, id2], ['C2', 'P2']);
  const s = analyzeSurface(m, m.surfaces.find((x) => x.id === 'P2'));
  assert.equal(s.valid, true);
  assert.ok(Math.abs(s.results.spencer.F - result.critical.spencer.F) < 1e-9);
  const main = read('app', 'main.js');
  assert.match(main, /if \(surface\) changeModel\(\(m\) => adoptSurface\(m, surface\)\)/, 'one change of the model: one step of the history');
});

// ------------------------------------------------------------ slice table

test('resolveSurface for a polyline: the surface for the core is { type: "polyline", points }; the circle stays as it was', () => {
  const a = resolveSurface(result, 'spencer', { kind: 'critical' });
  assert.equal(a.kind, 'polyline');
  assert.equal(a.circle, null);
  assert.deepEqual(a.surface, { type: 'polyline', points: result.critical.spencer.points });
  assert.equal(a.key, JSON.stringify(['polyline', result.critical.spencer.points]));
  assert.equal(describeSurface(a, t('de')), 'Polylinie: 9 Punkte');
  assert.equal(describeSurface(a, t('en')), 'Polyline: 9 points');
  const b = resolveSurface(result, 'bishop', { kind: 'critical' });
  assert.equal(b.kind, 'circle');
  assert.deepEqual(b.surface, b.circle);
  assert.match(describeSurface(b, t('de')), /^Kreis: x_c = /);
  const single = resolveSurface(result, 'spencer', { kind: 'single', id: 'P1' });
  assert.equal(single.kind, 'polyline');
  assert.deepEqual(single.surface.points, PL);
  assert.equal(single.label, 'P1');
  assert.equal(resolveSurface(result, 'spencer', { kind: 'single', id: 'nope' }).reason, 'unknown-single');
  assert.equal(resolveSurface(result, 'spencer', { kind: 'single', id: 'nope' }).surface, null);
  assert.equal(resolveSurface(null, 'spencer', undefined).reason, 'no-result');
  assert.equal(describeSurface({ surface: null }, t('de')), '');
  // the page asks the worker with the surface
  const main = read('app', 'main.js');
  assert.match(main, /const \{ key, surface: wanted \} = target;/);
  assert.match(main, /controller\.surface\(model, wanted\)/);
});

test('slice table of a polyline: calculated with analyzeSurface; the stresses at the end, N\' of Bishop "–"', () => {
  const r = resolveSurface(result, 'spencer', { kind: 'critical' });
  const surface = analyzeSurface(model, r.surface);
  assert.equal(surface.valid, true);
  const columns = sliceColumnsFor(surface.slices, { stresses: true });
  assert.deepEqual(columns.slice(-4).map((c) => c.key), ['tauMob', 'tauF', 'sigmaN', 'sigmaNEff']);
  assert.deepEqual(columns.slice(-4).map(columnHead), ['τ_mob [kPa]', 'τ_f [kPa]', 'σ_n [kPa]', "σ'_n [kPa]"]);
  assert.deepEqual(columns.slice(0, SLICE_COLUMNS.length), SLICE_COLUMNS, 'the old columns stay in front, as they are');
  const rows = displayRows(surface.slices, 3, { stresses: true });
  assert.ok(rows.every((row) => row.length === columns.length));
  const iN = columns.findIndex((c) => c.key === 'Nprime');
  assert.ok(rows.every((row) => row[iN] === '–'), "N' of Bishop is null for a polyline: \"–\"");
  for (const row of rows) for (const cell of row.slice(-4)) assert.match(cell, /^-?\d+\.\d{3}$/, '3 decimals');
  // tauMob = tauF / F
  const F = surface.results.spencer.F;
  surface.slices.forEach((s) => assert.ok(Math.abs(s.tauMob - s.tauF / F) < 1e-9));
  // copy: unrounded, with the units in the head, the same columns
  const tsv = sliceTsv(surface.slices, { stresses: true }).split('\n');
  assert.equal(tsv[0].split('\t').length, columns.length);
  assert.ok(tsv[0].endsWith("τ_mob [kPa]\tτ_f [kPa]\tσ_n [kPa]\tσ'_n [kPa]"));
  assert.equal(Number(tsv[1].split('\t').at(-4)), surface.slices[0].tauMob);
});

test('stress columns: "–" where the core gives null (a slice without a value), no stress columns when Spencer gave none; the old calls are unchanged', () => {
  const slices = [{ xm: 1, b: 1, alpha: 0, W: 1, Q: 0, u: 0, c: 0, phi: 0, Nprime: null, mAlpha: null, tauMob: 1.5, tauF: 2, sigmaN: 3, sigmaNEff: 3 },
    { xm: 2, b: 1, alpha: 0, W: 1, Q: 0, u: 0, c: 0, phi: 0, Nprime: null, mAlpha: null, tauMob: null, tauF: null, sigmaN: null, sigmaNEff: null }];
  const rows = displayRows(slices, 3, { stresses: true });
  assert.deepEqual(rows[0].slice(-4), ['1.500', '2.000', '3.000', '3.000']);
  assert.deepEqual(rows[1].slice(-4), ['–', '–', '–', '–']);
  assert.equal(sliceTsv(slices, { stresses: true }).split('\n')[2].split('\t').slice(-4).join('|'), '|||', 'the copy leaves a null empty');
  const noSpencer = slices.map((s) => ({ ...s, tauMob: null, tauF: null, sigmaN: null, sigmaNEff: null }));
  assert.equal(sliceColumnsFor(noSpencer, { stresses: true }), SLICE_COLUMNS, 'without a stress value: the table as before');
  assert.equal(sliceColumnsFor(slices), SLICE_COLUMNS, 'without the option: as before');
  assert.equal(displayRows(slices)[0].length, SLICE_COLUMNS.length);
  assert.equal(STRESS_COLUMNS.length, 4);
  const view = read('app', 'ui', 'result-slices.js');
  assert.match(view, /sliceColumnsFor\(slices, \{ stresses: true \}\)/);
  assert.match(view, /displayRows\(slices, 3, \{ stresses: true \}\)/);
  assert.match(view, /sliceTsv\(slices, \{ stresses: true \}\)/);
});

// ------------------------------------------------------------ result document

test('result document: a polyline shows the kind of surface and the polyline table; centre and radius "–"; F circle and the crack', () => {
  const cracked = searchModel({ tensionCrack: { depth: 3, waterFill: 0.5 } });
  const r = analyze(cracked);
  const head = documentHead({ model: cracked, result: r, method: 'spencer', target: { kind: 'critical' }, now: new Date(2026, 10, 18, 9, 5), t: t('de') });
  const value = (label) => (head.entries.find((e) => e.label === label) || {}).value;
  assert.equal(value('Fläche'), 'Polylinie (9 Punkte)');
  assert.equal(value('x_c [m]') ?? value('x_c'), '–');
  assert.ok(head.entries.some((e) => e.label === 'F Kreis' && /^\d\.\d{3}$/.test(e.value)));
  assert.ok(head.entries.some((e) => e.label === 'Riss x / P_w' && / \/ \d+\.\d kN\/m$/.test(e.value)));
  const surface = resolveSurface(r, 'spencer', { kind: 'critical' });
  const slices = { key: surface.key, status: 'ok', result: analyzeSurface(cracked, surface.surface) };
  const table = documentTable({ result: r, method: 'spencer', target: { kind: 'critical' }, slices, t: t('de') });
  assert.equal(table.kind, 'table');
  assert.equal(table.which, 'Massgebende Fläche – Spencer');
  assert.equal(table.circle, 'Polylinie: 9 Punkte');
  assert.deepEqual(table.head.slice(-4), ['τ_mob [kPa]', 'τ_f [kPa]', 'σ_n [kPa]', "σ'_n [kPa]"]);
  assert.ok(table.rows.every((row) => row.length === table.head.length));
  // a single polyline
  const single = documentTable({ result: r, method: 'spencer', target: { kind: 'single', id: 'P1' }, slices: { key: resolveSurface(r, 'spencer', { kind: 'single', id: 'P1' }).key, status: 'ok', result: analyzeSurface(cracked, { type: 'polyline', points: PL }) }, t: t('en') });
  assert.equal(single.which, 'Single surface P1');
  assert.equal(single.circle, 'Polyline: 5 points');
  const singleHead = documentHead({ model: cracked, result: r, method: 'spencer', target: { kind: 'single', id: 'P1' }, now: new Date(2026, 10, 18), t: t('de') });
  assert.ok(singleHead.entries.some((e) => e.label === 'Fläche' && e.value === 'Polylinie (5 Punkte)'));
  assert.ok(singleHead.entries.some((e) => e.label.startsWith('F') && /^\d\.\d{3}$/.test(e.value)));
});

test('the page hands the model\'s crack to the overlay and the kind of the surface to the chooser (source checks)', () => {
  const main = read('app', 'main.js');
  assert.match(main, /buildResultOverlay\(state\.result, \{ method: state\.rs\.method, contour: state\.rs\.contour, grid, tensionCrack: state\.model \? state\.model\.tensionCrack : null \}\)/);
  assert.match(main, /'ui\.run\.optimize'/);
  const slices = read('app', 'ui', 'result-slices.js');
  assert.match(slices, /r\.polyline \? 'ui\.slices\.singleSurface' : 'ui\.slices\.single'/);
});
