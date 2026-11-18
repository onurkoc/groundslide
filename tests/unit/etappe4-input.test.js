// Order 27 (SPEC_ETAPPE4 11, 13a): input of the single surfaces (circle or polyline), search A, tension crack, k_v; header and licence.
// No DOM: the functions of app/lib are tested; the page is checked in the source of index.html, main.js and sketch.js (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModel, writeModel } from '../../app/lib/model-io.js';
import { validateSurfaces, surfaceKind, APP_SURFACE_INVALID } from '../../app/lib/surfaces-check.js';
import { validateAll } from '../../app/lib/validate.js';
import { parseNumber } from '../../app/lib/numbers.js';
import {
  setSurfaceType, surfaceKindOf, surfacePoints, nextSurfaceId, appendSurface, adoptSurface, setOptimizeEnabled, setCrackEnabled,
  setCrackWaterPercent, fillToPercent, setOptionalNumber, setNumber, setSearchEnabled, DEFAULT_OPTIMIZE_POINTS,
} from '../../app/lib/edit.js';
import { sectionForPath, SECTIONS, countBySection } from '../../app/lib/paths.js';
import { MESSAGES, translate } from '../../app/lib/i18n.js';
import { loadBenchmark } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const PL = [[45, 30], [55, 28], [70, 32], [85, 40], [97.5, 50]];

// ------------------------------------------------------------ model file

test('U2 write and read a model with a polyline, optimize, tensionCrack and kv: the content stays the same', () => {
  const model = loadBenchmark('B3_two_layers');
  model.surfaces = [{ id: 'C1', xc: 50, zc: 80, R: 52 }, { id: 'P1', type: 'polyline', points: PL }];
  model.search.optimize = { points: 11 };
  model.tensionCrack = { depth: 3, waterFill: 0.5 };
  model.seismic = { kh: 0.1, kv: -0.05 };
  const text = writeModel(model);
  const back = readModel(text, 'en');
  assert.equal(back.ok, true);
  assert.deepEqual(back.model, model);
  assert.equal(JSON.parse(text).formatVersion, 1);
});

// ------------------------------------------------------------ APP_SURFACE_INVALID for polylines

test('APP_SURFACE_INVALID for a polyline: fewer than 2 points, a value that is not a number, x not strictly increasing; with the path', () => {
  const errors = (points) => validateSurfaces([{ id: 'P1', type: 'polyline', points }]);
  assert.deepEqual(errors(PL), []);
  assert.deepEqual(errors([[0, 0], [1, 1]]), []);
  // fewer than 2 points (or no list): the path of the list
  for (const points of [[], [[1, 2]], undefined, null, 'x']) {
    const e = errors(points);
    assert.equal(e.length, 1, JSON.stringify(points));
    assert.equal(e[0].code, APP_SURFACE_INVALID);
    assert.equal(e[0].path, 'surfaces[0].points');
  }
  // not a (finite) number: the path of the value
  assert.deepEqual(errors([[0, 0], [1, null], [2, 2]]).map((e) => e.path), ['surfaces[0].points[1][1]']);
  assert.deepEqual(errors([[0, 0], [Number.NaN, 1]]).map((e) => e.path), ['surfaces[0].points[1][0]']);
  assert.deepEqual(errors([[0, 0], 'p', [2, 2]]).map((e) => e.path), ['surfaces[0].points[1][0]', 'surfaces[0].points[1][1]']);
  // x not strictly increasing: the path of the point
  assert.deepEqual(errors([[0, 0], [5, 1], [5, 2], [9, 3]]).map((e) => e.path), ['surfaces[0].points[2]']);
  assert.deepEqual(errors([[0, 0], [5, 1], [4, 2]]).map((e) => e.path), ['surfaces[0].points[2]']);
  // the index counts the row of the list; a second polyline after a circle
  const mixed = validateSurfaces([{ id: 'C1', xc: 1, zc: 2, R: 3 }, { id: 'P1', type: 'polyline', points: [[0, 0]] }, { id: 'P2', type: 'polyline', points: [[0, 0], [0, 1]] }]);
  assert.deepEqual(mixed.map((e) => e.path), ['surfaces[1].points', 'surfaces[2].points[1]']);
  // the id and the type are checked as for a circle
  assert.deepEqual(validateSurfaces([{ id: '', type: 'polyline', points: PL }]).map((e) => e.path), ['surfaces[0].id']);
  assert.deepEqual(validateSurfaces([{ id: 'A', type: 'cone', xc: 1, zc: 1, R: 1 }]).map((e) => e.path), ['surfaces[0].type']);
  assert.equal(validateSurfaces([{ id: 'A', type: 'circle', xc: 1, zc: 1, R: 1 }]).length, 0, '`type: "circle"` is a circle');
  // a circle stays as it was
  assert.deepEqual(validateSurfaces([{ id: 'C', xc: 1, zc: 'a', R: -1 }]).map((e) => e.path), ['surfaces[0].zc', 'surfaces[0].R']);
  assert.equal(surfaceKind({ type: 'polyline' }), 'polyline');
  assert.equal(surfaceKind({ xc: 1 }), 'circle');
});

test('an invalid polyline blocks the run: validateAll reports it with the path, and the path belongs to the area Single surfaces', () => {
  const model = loadBenchmark('B1_homogeneous');
  model.surfaces = [{ id: 'P1', type: 'polyline', points: [[10, 10]] }];
  const result = validateAll(model, []);
  assert.equal(result.valid, false);
  const e = result.errors.find((x) => x.code === APP_SURFACE_INVALID);
  assert.equal(e.path, 'surfaces[0].points');
  assert.equal(sectionForPath(e.path), 'surfaces');
  assert.equal(sectionForPath('surfaces[2].points[3]'), 'surfaces');
  model.surfaces[0].points = PL;
  assert.equal(validateAll(model, []).valid, true);
});

// ------------------------------------------------------------ type switch

test('switching a single surface between circle and polyline keeps the values of the other kind in the session', () => {
  const model = { surfaces: [{ id: 'S1', xc: 50, zc: 80, R: 52 }] };
  const stash = {};
  setSurfaceType(model, 0, 'polyline', stash);
  assert.deepEqual(model.surfaces[0], { id: 'S1', type: 'polyline', points: [] }, 'a polyline starts empty');
  assert.equal(surfaceKindOf(model.surfaces[0]), 'polyline');
  surfacePoints(model, 0).push([1, 2], [3, 4]);
  setSurfaceType(model, 0, 'circle', stash);
  assert.deepEqual(model.surfaces[0], { id: 'S1', xc: 50, zc: 80, R: 52 }, 'the circle comes back, without `type`');
  setSurfaceType(model, 0, 'polyline', stash);
  assert.deepEqual(model.surfaces[0].points, [[1, 2], [3, 4]], 'and so do the points');
  // a circle that was never filled in starts empty
  const fresh = { surfaces: [{ id: 'P', type: 'polyline', points: PL }] };
  setSurfaceType(fresh, 0, 'circle', {});
  assert.deepEqual(fresh.surfaces[0], { id: 'P', xc: null, zc: null, R: null });
  // the same kind again changes nothing
  const same = { surfaces: [{ id: 'S1', xc: 1, zc: 2, R: 3 }] };
  setSurfaceType(same, 0, 'circle', {});
  assert.deepEqual(same.surfaces[0], { id: 'S1', xc: 1, zc: 2, R: 3 });
});

test('the type switch is one change of the model, so one step of the history', () => {
  const main = read('app', 'main.js');
  const sections = read('app', 'ui', 'sections-analysis.js');
  // the switch goes through ctx.edit -> onEdit -> applyEdit, which records one step when the model changed
  assert.match(sections, /ctx\.edit\(\(m\) => setSurfaceType\(m, i, value, ctx\.stash\)/);
  assert.match(main, /function applyEdit\(mutate\) \{[\s\S]*history\.record\(before, typing\)/);
});

// ------------------------------------------------------------ search A, tension crack, k_v

test('search A: switch on gives { points: 11 }, off removes the field, the number comes back in the session', () => {
  const model = { search: { grid: {}, radii: 3 } };
  const stash = {};
  setOptimizeEnabled(model, true, stash);
  assert.deepEqual(model.search.optimize, { points: DEFAULT_OPTIMIZE_POINTS });
  assert.equal(DEFAULT_OPTIMIZE_POINTS, 11);
  setNumber(model, ['search', 'optimize', 'points'], parseNumber('15'));
  setOptimizeEnabled(model, false, stash);
  assert.equal('optimize' in model.search, false, 'off: the field is removed');
  setOptimizeEnabled(model, true, stash);
  assert.deepEqual(model.search.optimize, { points: 15 }, 'on again: the value of the session');
  // an emptied field stores null: the core reports E_SEARCH_INVALID
  setNumber(model, ['search', 'optimize', 'points'], parseNumber(''));
  assert.equal(model.search.optimize.points, null);
  // the whole search switched off and on keeps the optimisation (it is part of the search of the session)
  const m2 = { search: { grid: {}, radii: 3, optimize: { points: 7 } } };
  const s2 = {};
  setSearchEnabled(m2, false, s2);
  assert.equal(m2.search, null);
  setSearchEnabled(m2, true, s2);
  assert.deepEqual(m2.search.optimize, { points: 7 });
});

test('search A without a search: setOptimizeEnabled does nothing (the switch exists only inside an active search)', () => {
  const model = { search: null };
  setOptimizeEnabled(model, true, {});
  assert.equal(model.search, null);
});

test('tension crack: percent and waterFill (percent / 100), without rounding noise; the switch keeps the values in the session', () => {
  assert.equal(fillToPercent(0.5), 50);
  assert.equal(fillToPercent(0.07), 7);
  assert.equal(fillToPercent(1), 100);
  assert.equal(fillToPercent(0), 0);
  assert.equal(fillToPercent(null), null);
  assert.equal(fillToPercent(undefined), undefined);
  const model = {};
  const stash = {};
  setCrackEnabled(model, true, stash);
  assert.deepEqual(model.tensionCrack, { depth: null, waterFill: null }, 'switched on: empty, the core reports it (E_TENSION_CRACK)');
  setNumber(model, ['tensionCrack', 'depth'], parseNumber('3'));
  setCrackWaterPercent(model, parseNumber('50'));
  assert.deepEqual(model.tensionCrack, { depth: 3, waterFill: 0.5 });
  setCrackWaterPercent(model, parseNumber('7'));
  assert.equal(model.tensionCrack.waterFill, 0.07);
  setCrackWaterPercent(model, parseNumber('12,5'));
  assert.equal(model.tensionCrack.waterFill, 0.125);
  setCrackWaterPercent(model, parseNumber('abc'));
  assert.equal(model.tensionCrack.waterFill, null);
  setCrackWaterPercent(model, parseNumber('100'));
  setCrackEnabled(model, false, stash);
  assert.equal('tensionCrack' in model, false, 'off: the field is removed');
  setCrackEnabled(model, true, stash);
  assert.deepEqual(model.tensionCrack, { depth: 3, waterFill: 1 }, 'on again: the values of the session');
});

test('k_v: an empty field removes the field of the model, a number is kept, unreadable text stores null', () => {
  const model = { seismic: { kh: 0.1 } };
  setOptionalNumber(model, ['seismic', 'kv'], parseNumber('0.05'));
  assert.deepEqual(model.seismic, { kh: 0.1, kv: 0.05 });
  setOptionalNumber(model, ['seismic', 'kv'], parseNumber('-0,05'));
  assert.equal(model.seismic.kv, -0.05);
  setOptionalNumber(model, ['seismic', 'kv'], parseNumber(''));
  assert.deepEqual(model.seismic, { kh: 0.1 }, 'empty: no field (the default of the core is 0)');
  setOptionalNumber(model, ['seismic', 'kv'], parseNumber('x'));
  assert.equal(model.seismic.kv, null);
});

test('the areas: Tension crack is an area of the page after the supports; errors at tensionCrack and seismic.kv belong to areas', () => {
  assert.equal(SECTIONS[SECTIONS.indexOf('supports') + 1], 'tensionCrack');
  assert.equal(sectionForPath('tensionCrack'), 'tensionCrack');
  assert.equal(sectionForPath('tensionCrack.depth'), 'tensionCrack');
  assert.equal(sectionForPath('seismic.kv'), 'seismic');
  assert.equal(countBySection([{ path: 'tensionCrack' }]).tensionCrack, 1);
  const html = read('app', 'index.html');
  assert.match(html, /<details class="panel" data-section="tensionCrack">/);
  assert.ok(html.indexOf('data-section="tensionCrack"') > html.indexOf('data-section="supports"'));
  assert.ok(html.indexOf('data-section="tensionCrack"') < html.indexOf('data-section="seismic"'));
});

// ------------------------------------------------------------ new surfaces from the sketch and the result

test('nextSurfaceId gives the next free P1, P2 ... (C1, C2 ... for a circle); appendSurface adds a copy', () => {
  const model = { surfaces: [{ id: 'C1' }, { id: 'P1' }, { id: 'P3' }] };
  assert.equal(nextSurfaceId(model), 'P2');
  assert.equal(nextSurfaceId(model, 'C'), 'C2');
  assert.equal(nextSurfaceId({}), 'P1');
  assert.equal(nextSurfaceId({ surfaces: [] }), 'P1');
  const points = [[0, 0], [1, 1]];
  appendSurface(model, { id: 'P2', type: 'polyline', points });
  assert.deepEqual(model.surfaces.at(-1), { id: 'P2', type: 'polyline', points });
  points[0][0] = 99;
  assert.equal(model.surfaces.at(-1).points[0][0], 0, 'a copy');
  assert.equal(nextSurfaceId(model), 'P4');
});

test('adoptSurface: a circle becomes "C<n>" with xc, zc, R; a polyline "P<n>" with type and points', () => {
  const model = { surfaces: [{ id: 'C1', xc: 1, zc: 2, R: 3 }] };
  assert.equal(adoptSurface(model, { xc: 5, zc: 6, R: 7 }), 'C2');
  assert.equal(adoptSurface(model, { type: 'polyline', points: PL }), 'P1');
  assert.equal(adoptSurface(model, { type: 'polyline', points: PL }), 'P2');
  assert.deepEqual(model.surfaces.map((s) => s.id), ['C1', 'C2', 'P1', 'P2']);
  assert.deepEqual(model.surfaces[1], { id: 'C2', xc: 5, zc: 6, R: 7 });
  assert.equal('type' in model.surfaces[1], false, 'a circle has no type in the model');
  assert.deepEqual(model.surfaces[2], { id: 'P1', type: 'polyline', points: PL });
  const empty = {};
  adoptSurface(empty, { xc: 1, zc: 2, R: 3 });
  assert.deepEqual(empty.surfaces, [{ id: 'C1', xc: 1, zc: 2, R: 3 }], 'a model without surfaces gets the list');
});

test('new texts exist in both languages: input, sketch, result', () => {
  const keys = ['ui.section.tensionCrack', 'ui.f.kv', 'ui.f.kvHint', 'ui.crack.on', 'ui.crack.depth', 'ui.crack.water', 'ui.search.optimize', 'ui.search.optimizePoints',
    'ui.surf.circle', 'ui.surf.polyline', 'ui.surf.points', 'ui.surf.polylineN', 'ui.sketch.draw', 'ui.sketch.drawStop', 'ui.sketch.drawHelp', 'ui.sketch.drawBadX',
    'ui.col.surface', 'ui.col.searchF', 'ui.col.crack', 'ui.result.adopt', 'ui.counts.optimize', 'ui.run.optimize', 'ui.slices.polyline', 'ui.slices.singleSurface', 'ui.slices.criticalSurface'];
  for (const lang of ['de', 'en']) for (const key of keys) assert.ok(MESSAGES[lang][key] && MESSAGES[lang][key].trim() !== '', `${lang}:${key}`);
  assert.equal(MESSAGES.de['ui.section.surfaces'], 'Einzelflächen');
  assert.equal(MESSAGES.en['ui.section.surfaces'], 'Single surfaces');
  assert.equal(MESSAGES.de['ui.crack.water'], 'Wasser im Riss [%]');
  assert.equal(MESSAGES.de['E_TENSION_CRACK'].length > 0 && MESSAGES.en['I_TENSION_CRACK'].length > 0, true);
});
