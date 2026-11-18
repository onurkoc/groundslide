// Overview of the result (SPEC_ETAPPE2 8.1): rows per method, warnings, counters, single circles.
// Real results of the benchmarks B1 (Bishop, Janbu) and V03 (with Spencer, theta), calculated once each.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { overviewTable, warningCodes, countsView, surfacesTable, criticalCircle } from '../../app/lib/result-view.js';
import { factorLabel, singleLabel, buildResultOverlay } from '../../app/lib/result-sketch.js';
import { formatFactor, formatAngle, formatPoint } from '../../app/lib/numbers.js';

const b1Model = loadBenchmark('B1_homogeneous');
const v03Model = loadBenchmark('V03_acads_1c');
const b1 = analyze(b1Model);
const v03 = analyze(v03Model);
const snapshot = (r) => JSON.stringify(r);

test('B1: rows in the order of the methods, values exactly those of the result', () => {
  const before = snapshot(b1);
  const t = overviewTable(b1);
  assert.deepEqual(t.rows.map((r) => r.method), ['bishop', 'janbu', 'janbuCorrected']);
  assert.equal(t.hasTheta, false);
  assert.equal(t.hasCheck, false);
  for (const row of t.rows) {
    const c = b1.critical[row.method];
    assert.equal(row.valid, true);
    assert.equal(row.F, c.F);
    assert.equal(row.xc, c.xc);
    assert.equal(row.zc, c.zc);
    assert.equal(row.R, c.R);
    assert.deepEqual(row.entry, c.entry);
    assert.deepEqual(row.exit, c.exit);
    assert.equal(row.theta, null);
    assert.equal(row.check, null);
  }
  assert.equal(snapshot(b1), before, 'the result is not changed');
});

test('B1: values are the benchmark values (F to 3 decimals as displayed)', () => {
  const t = overviewTable(b1);
  const shown = Object.fromEntries(t.rows.map((r) => [r.method, formatFactor(r.F)]));
  assert.deepEqual(shown, { bishop: '1.139', janbu: '1.090', janbuCorrected: '1.142' });
});

test('V03: four methods with Spencer and theta', () => {
  const t = overviewTable(v03);
  assert.deepEqual(t.rows.map((r) => r.method), ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
  assert.equal(t.hasTheta, true);
  const sp = t.rows.find((r) => r.method === 'spencer');
  assert.equal(sp.theta, v03.critical.spencer.theta);
  assert.ok(Number.isFinite(sp.theta));
  assert.equal(formatAngle(sp.theta), sp.theta.toFixed(2));
  for (const r of t.rows.filter((x) => x.method !== 'spencer')) assert.equal(r.theta, null);
  assert.deepEqual(t.rows.map((r) => formatFactor(r.F)), ['1.403', '1.259', '1.355', '1.372']);
});

test('a method without valid surface: row with valid false, the others stay', () => {
  const r = { ...b1, critical: { ...b1.critical, janbu: null } };
  const t = overviewTable(r);
  const row = t.rows.find((x) => x.method === 'janbu');
  assert.equal(row.valid, false);
  assert.equal(row.F, null);
  assert.equal(row.entry, null);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0].valid, true);
});

test('without search: no rows, no counters, only single circles', () => {
  const r = { mode: 'characteristic', warnings: [], surfaces: b1.surfaces };
  assert.deepEqual(overviewTable(r).rows, []);
  assert.equal(countsView(r), null);
  assert.equal(criticalCircle(r, 'bishop'), null);
  assert.equal(overviewTable(null).rows.length, 0);
  assert.equal(surfacesTable(r).rows.length, 3);
});

test('warnings: codes once, in the order of the core', () => {
  assert.deepEqual(warningCodes({ warnings: ['W_CIRCLE_LAYERED', 'W_MIN_AT_BOTTOM', 'W_CIRCLE_LAYERED'] }), ['W_CIRCLE_LAYERED', 'W_MIN_AT_BOTTOM']);
  assert.deepEqual(warningCodes(b1), b1.warnings);
  assert.deepEqual(warningCodes({}), []);
  assert.deepEqual(warningCodes(null), []);
});

test('counters: total, valid, invalid per code (sum matches), per method', () => {
  const c = countsView(b1);
  assert.equal(c.total, b1.counts.total);
  assert.equal(c.valid, b1.counts.valid);
  assert.equal(c.invalidTotal, c.total - c.valid);
  assert.equal(c.invalid.reduce((s, x) => s + x.count, 0), c.invalidTotal);
  assert.ok(c.invalid.every((x) => /^I_/.test(x.code) && x.count > 0));
  assert.deepEqual(c.invalid.map((x) => x.code), [...c.invalid.map((x) => x.code)].sort());
  assert.deepEqual(c.byMethod.map((m) => m.method), ['bishop', 'janbu']);
  for (const m of c.byMethod) assert.equal(m.invalid.reduce((s, x) => s + x.count, 0), m.total - m.valid);
});

test('single circles of B1: C1 and two more, F per method; an invalid circle shows code and text', () => {
  const t = surfacesTable(b1);
  assert.deepEqual(t.rows.map((r) => r.id), ['C1', 'S_bishop', 'S_janbu']);
  assert.deepEqual(t.methods, ['bishop', 'janbu', 'janbuCorrected']);
  const c1 = t.rows[0];
  assert.equal(c1.valid, true);
  assert.equal(c1.methods.bishop.F, b1.surfaces[0].results.bishop.F);
  assert.deepEqual(c1.circle, { xc: 50, zc: 80, R: 52 });
  // invalid circle (synthetic row of the form of the core)
  const bad = surfacesTable({ surfaces: [{ id: 'X', valid: false, code: 'I_INTERSECTIONS', message: 'text', circle: { xc: 1, zc: 2, R: 3 } }] });
  assert.deepEqual(bad.rows[0], { id: 'X', valid: false, code: 'I_INTERSECTIONS', message: 'text', methods: {}, circle: { xc: 1, zc: 2, R: 3 } });
  assert.deepEqual(bad.methods, []);
  // a method invalid for a valid circle
  const mixed = surfacesTable({ surfaces: [{ id: 'Y', valid: true, circle: { xc: 1, zc: 2, R: 3 }, results: { bishop: { valid: true, F: 1.5 }, janbu: { valid: false, code: 'I_MALPHA', message: 'm' } } }] });
  assert.deepEqual(mixed.rows[0].methods, { bishop: { F: 1.5 }, janbu: { code: 'I_MALPHA', message: 'm' } });
});

test('critical circle of a method: values, or null', () => {
  const c = criticalCircle(b1, 'bishop');
  assert.deepEqual(c, { xc: b1.critical.bishop.xc, zc: b1.critical.bishop.zc, R: b1.critical.bishop.R, F: b1.critical.bishop.F });
  assert.equal(criticalCircle(b1, 'spencer'), null, 'not calculated');
  assert.equal(criticalCircle({ critical: { bishop: null } }, 'bishop'), null);
  assert.equal(criticalCircle(b1, null), null);
});

test('labels of the sketch: 3 decimals for F; single circle with F of the chosen method or the code', () => {
  assert.equal(factorLabel(1.13912), 'F = 1.139');
  assert.equal(factorLabel(2), 'F = 2.000');
  const t = surfacesTable(b1);
  assert.equal(singleLabel(t.rows[0], 'bishop'), `C1  F = ${formatFactor(b1.surfaces[0].results.bishop.F)}`);
  assert.equal(singleLabel(t.rows[0], 'janbu'), `C1  F = ${formatFactor(b1.surfaces[0].results.janbu.F)}`);
  assert.equal(singleLabel(t.rows[0], null), 'C1');
  assert.equal(singleLabel({ id: 'X', valid: false, code: 'I_DIRECTION', methods: {} }, 'bishop'), 'X  I_DIRECTION');
  assert.equal(singleLabel({ id: 'Y', valid: true, methods: { bishop: { code: 'I_MALPHA' } } }, 'bishop'), 'Y  I_MALPHA');
});

test('overlay: chosen circle strong and last, label with F; method change moves the selection, no new result', () => {
  const grid = b1Model.search.grid;
  const before = snapshot(b1);
  const a = buildResultOverlay(b1, { method: 'bishop', contour: true, grid });
  assert.deepEqual(a.circles.map((c) => c.method), ['janbu', 'janbuCorrected', 'bishop']);
  assert.deepEqual(a.circles.map((c) => c.selected), [false, false, true]);
  assert.equal(a.circles[2].label, factorLabel(b1.critical.bishop.F));
  assert.equal(a.circles[0].label, null);
  assert.equal(a.circles[2].xc, b1.critical.bishop.xc);
  const b = buildResultOverlay(b1, { method: 'janbuCorrected', contour: true, grid });
  assert.equal(b.circles[b.circles.length - 1].method, 'janbuCorrected');
  assert.equal(b.circles[b.circles.length - 1].label, factorLabel(b1.critical.janbuCorrected.F));
  assert.equal(b.singles.C1, singleLabel(surfacesTable(b1).rows[0], 'janbuCorrected'));
  assert.equal(snapshot(b1), before);
  assert.equal(a.contourAvailable, true);
  assert.deepEqual(a.methods, ['bishop', 'janbu', 'janbuCorrected']);
  assert.ok(a.contour.polygons.length >= (grid.nx - 1) * (grid.nz - 1), 'at least one polygon per square between four centres (colour bands, SPEC_ETAPPE2 8.2 version 1.7)');
  const noSearch = buildResultOverlay({ surfaces: b1.surfaces }, { method: null, contour: true, grid });
  assert.equal(noSearch.contourAvailable, false);
  assert.equal(noSearch.contour, null);
  assert.deepEqual(noSearch.circles, []);
  assert.equal(Object.keys(noSearch.singles).length, 3, 'single circles keep their labels without search');
  assert.equal(buildResultOverlay(null, { method: 'bishop', contour: true, grid }), null);
  assert.equal(buildResultOverlay(b1, { method: 'bishop', contour: false, grid }).contour, null, 'contour off');
});

test('formatters: rounding only in the display', () => {
  assert.equal(formatFactor(1.13912), '1.139');
  assert.equal(formatFactor(0.9995), '1.000');
  assert.equal(formatFactor(null), '');
  assert.equal(formatAngle(30.52703857421875), '30.53');
  assert.equal(formatPoint([81.84826787136053, 50]), '(81.85; 50.00)');
  assert.equal(formatPoint(null), '');
});
