// Content of the result document (SPEC_ETAPPE2 8.5): head with the values of the chosen method, slice table of the
// circle that the tab Slices shows. Values and rounding as in the overview (8.1) and the slice table (8.3).

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { translate } from '../../app/lib/i18n.js';
import { formatDateTime, documentHead, documentTable } from '../../app/lib/result-document.js';
import { overviewTable } from '../../app/lib/result-view.js';
import { resolveSurface, displayRows, SLICE_COLUMNS, columnHead } from '../../app/lib/slices-table.js';
import { formatFactor, formatCoordinate, formatAngle, formatPoint } from '../../app/lib/numbers.js';

const t = (lang) => (key, params) => translate(lang, key, params);
const NOW = new Date(2026, 10, 15, 9, 5);

// B1 as it is (31 x 41 grid): the values of the benchmark; one analyze()
const b1Model = loadBenchmark('B1_homogeneous');
const b1 = analyze(b1Model);

// B1 in mode sia with Spencer, coarse grid so that it is short; the file under tests/benchmarks/ is not changed
const siaModel = loadBenchmark('B1_homogeneous');
siaModel.analysis.mode = 'sia';
siaModel.analysis.methods = ['bishop', 'janbu', 'spencer'];
siaModel.partialFactors = { phi: 1.2, c: 1.5, gamma: 1, R: 1.1 };
siaModel.search = { grid: { xMin: 20, xMax: 80, zMin: 40, zMax: 120, nx: 7, nz: 9 }, radii: 12 };
siaModel.surfaces = [{ id: 'C1', xc: 50, zc: 80, R: 52 }, { id: 'bad', xc: 500, zc: 800, R: 1 }];
const sia = analyze(siaModel);

const get = (head, label) => head.entries.find((e) => e.label === label)?.value;

test('formatDateTime: local date and time "YYYY-MM-DD HH:MM", two digits each, nothing for a wrong date', () => {
  assert.equal(formatDateTime(new Date(2026, 10, 15, 9, 5)), '2026-11-15 09:05');
  assert.equal(formatDateTime(new Date(2027, 0, 2, 23, 59)), '2027-01-02 23:59');
  assert.equal(formatDateTime(new Date(NaN)), '');
  assert.equal(formatDateTime('2026-11-15'), '');
  assert.equal(formatDateTime(null), '');
});

test('head, Bishop on B1: name, date, method and the values of the overview (F 1.139, 2 decimals for the rest)', () => {
  const head = documentHead({ model: b1Model, result: b1, method: 'bishop', now: NOW, t: t('de') });
  assert.equal(head.title, b1Model.meta.name);
  assert.equal(head.dateTime, '2026-11-15 09:05');
  assert.equal(head.methodName, 'Bishop');
  assert.equal(head.note, null);
  assert.deepEqual(head.entries.map((e) => e.label), ['F', 'x_c [m]', 'z_c [m]', 'R [m]', 'Eintritt [m]', 'Austritt [m]'], 'no theta, no check');
  assert.equal(get(head, 'F'), '1.139', 'benchmark B1, Bishop');
  const c = b1.critical.bishop;
  assert.equal(get(head, 'x_c [m]'), formatCoordinate(c.xc));
  assert.equal(get(head, 'z_c [m]'), formatCoordinate(c.zc));
  assert.equal(get(head, 'R [m]'), formatCoordinate(c.R));
  assert.equal(get(head, 'Eintritt [m]'), formatPoint(c.entry));
  assert.equal(get(head, 'Austritt [m]'), formatPoint(c.exit));
  assert.match(get(head, 'Eintritt [m]'), /^\(\d+\.\d\d; \d+\.\d\d\)$/);
});

test('head: the same numbers as the overview row, for every method of the result, and the language changes only the texts', () => {
  for (const method of ['bishop', 'janbu', 'janbuCorrected']) {
    const row = overviewTable(b1).rows.find((r) => r.method === method);
    const de = documentHead({ model: b1Model, result: b1, method, now: NOW, t: t('de') });
    const en = documentHead({ model: b1Model, result: b1, method, now: NOW, t: t('en') });
    assert.equal(get(de, 'F'), formatFactor(row.F), method);
    assert.deepEqual(de.entries.map((e) => e.value), en.entries.map((e) => e.value), 'numbers with a point in both languages');
  }
  assert.equal(documentHead({ model: b1Model, result: b1, method: 'janbu', now: NOW, t: t('en') }).methodName, 'Janbu F₀');
  assert.equal(documentHead({ model: b1Model, result: b1, method: 'janbu', now: NOW, t: t('en') }).entries[4].label, 'Entry [m]');
});

test('head, Spencer in mode sia: theta in degrees, gamma_R, utilisation, verdict (Erfüllt / Nicht erfüllt)', () => {
  const head = documentHead({ model: siaModel, result: sia, method: 'spencer', now: NOW, t: t('de') });
  assert.deepEqual(head.entries.map((e) => e.label), ['F', 'x_c [m]', 'z_c [m]', 'R [m]', 'Eintritt [m]', 'Austritt [m]', 'θ [°]', 'γ_R', 'Ausnutzung', 'Nachweis']);
  const row = overviewTable(sia).rows.find((r) => r.method === 'spencer');
  assert.equal(get(head, 'θ [°]'), formatAngle(row.theta));
  assert.equal(get(head, 'γ_R'), formatFactor(row.check.gammaR));
  assert.equal(get(head, 'Ausnutzung'), formatFactor(row.check.utilisation));
  assert.equal(get(head, 'Nachweis'), row.check.ok ? 'Erfüllt' : 'Nicht erfüllt');
  assert.equal(get(documentHead({ model: siaModel, result: sia, method: 'spencer', now: NOW, t: t('en') }), 'Check'), row.check.ok ? 'Satisfied' : 'Not satisfied');
});

test('head, mode sia: Bishop has the check but no theta; Janbu F0 has no verdict ("–" as in the overview)', () => {
  const bishop = documentHead({ model: siaModel, result: sia, method: 'bishop', now: NOW, t: t('de') });
  assert.deepEqual(bishop.entries.map((e) => e.label).slice(6), ['γ_R', 'Ausnutzung', 'Nachweis']);
  const janbu = documentHead({ model: siaModel, result: sia, method: 'janbu', now: NOW, t: t('de') });
  assert.deepEqual(janbu.entries.slice(6).map((e) => e.value), ['–', '–', '–']);
});

test('head: a method without a valid surface, no search, no name', () => {
  const noValid = { critical: { bishop: null, janbu: { F: 1.2, xc: 1, zc: 2, R: 3, entry: [0, 0], exit: [1, 0] } }, surfaces: [] };
  const head = documentHead({ model: b1Model, result: noValid, method: 'bishop', now: NOW, t: t('de') });
  assert.equal(head.note, 'Keine gültige Fläche');
  assert.deepEqual(head.entries, []);
  assert.equal(head.methodName, 'Bishop');
  const noSearch = documentHead({ model: b1Model, result: { critical: {}, surfaces: [] }, method: null, now: NOW, t: t('de') });
  assert.equal(noSearch.note, translate('de', 'ui.result.noSearch'));
  assert.equal(noSearch.methodName, null);
  assert.equal(documentHead({ model: { meta: { name: '  ' } }, result: b1, method: 'bishop', now: NOW, t: t('de') }).title, '(ohne Namen)');
  assert.equal(documentHead({ model: null, result: b1, method: 'bishop', now: NOW, t: t('en') }).title, '(unnamed)');
});

// --- table

const slicesOf = (model, circle) => analyzeSurface(model, circle);
const critical = { kind: 'critical' };

test('table of the governing circle: all slices, "#" and the columns with units, 3 decimals, angles in degrees', () => {
  const c = b1.critical.bishop;
  const surface = slicesOf(b1Model, { xc: c.xc, zc: c.zc, R: c.R });
  const key = resolveSurface(b1, 'bishop', critical).key;
  const table = documentTable({ result: b1, method: 'bishop', target: critical, slices: { key, status: 'ok', result: surface }, t: t('de') });
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.head, ['#', ...SLICE_COLUMNS.map(columnHead)]);
  assert.equal(table.head.length, 11);
  assert.equal(table.rows.length, surface.slices.length);
  assert.equal(table.rows.length, 50, 'all rows, none left out');
  assert.deepEqual(table.rows[0].slice(1), displayRows(surface.slices)[0]);
  assert.equal(table.rows[0][0], '1');
  assert.equal(table.rows.at(-1)[0], '50');
  for (const row of table.rows) {
    assert.equal(row.length, 11);
    for (const cell of row.slice(1)) assert.match(cell, /^(-?\d+\.\d{3})?$/, cell);
  }
  // alpha in degrees: the core gives radians
  const alpha = Number(table.rows[0][1 + SLICE_COLUMNS.findIndex((col) => col.key === 'alpha')]);
  assert.ok(Math.abs(alpha - (surface.slices[0].alpha * 180) / Math.PI) < 0.0005);
  assert.equal(table.which, 'Massgebender Kreis – Bishop');
  assert.match(table.circle, /^Kreis: x_c = \d+\.\d\d m, z_c = \d+\.\d\d m, R = \d+\.\d\d m$/);
});

test('table of a single circle (the tab Slices shows C1): its own surface and name', () => {
  const surface = slicesOf(siaModel, { xc: 50, zc: 80, R: 52 });
  const target = { kind: 'single', id: 'C1' };
  const key = resolveSurface(sia, 'bishop', target).key;
  const table = documentTable({ result: sia, method: 'bishop', target, slices: { key, status: 'ok', result: surface }, t: t('en') });
  assert.equal(table.kind, 'table');
  assert.equal(table.which, 'Single circle C1');
  assert.equal(table.circle, 'Circle: x_c = 50.00 m, z_c = 80.00 m, R = 52.00 m');
  assert.equal(table.rows.length, surface.slices.length);
});

test('table: invalid circle or failed calculation show code and text; not calculated yet / other circle is "pending"; no surface is "none"', () => {
  const key = resolveSurface(b1, 'bishop', critical).key;
  const invalid = documentTable({ result: b1, method: 'bishop', target: critical, slices: { key, status: 'invalid', result: { valid: false, code: 'I_TOO_SHALLOW' } }, t: t('de') });
  assert.deepEqual([invalid.kind, invalid.code, invalid.text], ['invalid', 'I_TOO_SHALLOW', translate('de', 'I_TOO_SHALLOW')]);
  assert.ok(invalid.circle && invalid.which);
  const failed = documentTable({ result: b1, method: 'bishop', target: critical, slices: { key, status: 'error', code: 'APP_RUN_FAILED', message: 'x' }, t: t('de') });
  assert.deepEqual([failed.kind, failed.code], ['invalid', 'APP_RUN_FAILED']);
  assert.equal(documentTable({ result: b1, method: 'bishop', target: critical, slices: null, t: t('de') }).kind, 'pending');
  assert.equal(documentTable({ result: b1, method: 'bishop', target: critical, slices: { key, status: 'loading' }, t: t('de') }).kind, 'pending');
  assert.equal(documentTable({ result: b1, method: 'bishop', target: critical, slices: { key: 'another', status: 'ok', result: { slices: [] } }, t: t('de') }).kind, 'pending', 'a table of another circle is not shown');
  const none = documentTable({ result: { critical: { bishop: null }, surfaces: [] }, method: 'bishop', target: critical, slices: null, t: t('de') });
  assert.deepEqual([none.kind, none.text], ['none', 'Keine gültige Fläche']);
  assert.equal(documentTable({ result: b1, method: 'bishop', target: { kind: 'single', id: 'nope' }, slices: null, t: t('de') }).kind, 'none');
  assert.deepEqual(documentTable({ result: { critical: {}, surfaces: [] }, method: null, target: critical, slices: null, t: t('de') }), { kind: 'none', text: translate('de', 'ui.result.noSearch') });
});

// --- single circle in the head (SPEC_ETAPPE2 8.5, version 1.11)

const single = (id) => ({ kind: 'single', id });
const headOf = (result, method, target, lang = 'de', model = siaModel) => documentHead({ model, result, method, target, now: NOW, t: t(lang) });

test('single circle, valid: ID, F of this circle for the chosen method, centre, radius, entry, exit (theta for Spencer); no check values', () => {
  const surface = sia.surfaces.find((s) => s.id === 'C1');
  const bishop = headOf(sia, 'bishop', single('C1'));
  assert.deepEqual(bishop.entries.map((e) => e.label), ['ID', 'F', 'x_c [m]', 'z_c [m]', 'R [m]', 'Eintritt [m]', 'Austritt [m]']);
  assert.equal(get(bishop, 'ID'), 'C1');
  assert.equal(get(bishop, 'F'), formatFactor(surface.results.bishop.F), 'F of the single circle, not of the governing circle');
  assert.notEqual(get(bishop, 'F'), formatFactor(sia.critical.bishop.F));
  assert.equal(get(bishop, 'x_c [m]'), '50.00');
  assert.equal(get(bishop, 'z_c [m]'), '80.00');
  assert.equal(get(bishop, 'R [m]'), '52.00');
  assert.equal(get(bishop, 'Eintritt [m]'), formatPoint(surface.entry));
  assert.equal(get(bishop, 'Austritt [m]'), formatPoint(surface.exit));
  assert.equal(bishop.methodName, 'Bishop');
  assert.equal(bishop.note, null);
  // the mode sia has gamma_R, utilisation and verdict only for the governing circle: none for a single circle
  assert.ok(!bishop.entries.some((e) => ['γ_R', 'Ausnutzung', 'Nachweis'].includes(e.label)));
  const spencer = headOf(sia, 'spencer', single('C1'));
  assert.equal(get(spencer, 'F'), formatFactor(surface.results.spencer.F));
  assert.equal(get(spencer, 'θ [°]'), formatAngle(surface.results.spencer.theta));
  assert.equal(get(headOf(sia, 'janbu', single('C1')), 'F'), formatFactor(surface.results.janbu.F));
  assert.equal(get(headOf(sia, 'bishop', single('C1'), 'en'), 'Entry [m]'), formatPoint(surface.entry));
});

test('single circle, invalid: the code instead of F, with its text; no entry, exit or theta', () => {
  const head = headOf(sia, 'bishop', single('bad'));
  assert.deepEqual(head.entries.map((e) => e.label), ['ID', 'F', 'x_c [m]', 'z_c [m]', 'R [m]']);
  assert.equal(get(head, 'F'), 'I_INTERSECTIONS');
  assert.equal(get(head, 'ID'), 'bad');
  assert.equal(get(head, 'R [m]'), '1.00');
  assert.equal(head.note, translate('de', 'I_INTERSECTIONS'));
  assert.equal(headOf(sia, 'bishop', single('bad'), 'en').note, translate('en', 'I_INTERSECTIONS'));
});

test('single circle valid, but the method is invalid for it: the code of the method, no theta', () => {
  const result = { critical: { spencer: null }, surfaces: [{ id: 'C2', valid: true, circle: { xc: 1, zc: 2, R: 3 }, entry: [0, 0], exit: [5, 0], results: { bishop: { valid: true, F: 1.5 }, spencer: { valid: false, code: 'I_NO_THETA', message: 'x' } } }] };
  const head = headOf(result, 'spencer', single('C2'));
  assert.equal(get(head, 'F'), 'I_NO_THETA');
  assert.equal(head.note, translate('de', 'I_NO_THETA'));
  assert.ok(!head.entries.some((e) => e.label === 'θ [°]'));
  assert.equal(get(headOf(result, 'bishop', single('C2')), 'F'), '1.500');
});

test('single circle without search (no chosen method): F for every method that was calculated for the circle', () => {
  const result = { critical: {}, surfaces: [{ id: 'C1', valid: true, circle: { xc: 50, zc: 80, R: 52 }, entry: [92.47, 50], exit: [35.72, 30], results: { bishop: { valid: true, F: 1.236 }, janbuCorrected: { valid: false, code: 'I_MALPHA' }, spencer: { valid: true, F: 1.24, theta: 20.15 } } }] };
  const head = headOf(result, null, single('C1'));
  assert.equal(head.methodName, null);
  assert.deepEqual(head.entries.slice(0, 4).map((e) => [e.label, e.value]), [['ID', 'C1'], ['F – Bishop', '1.236'], ['F – Janbu korrigiert', 'I_MALPHA'], ['F – Spencer', '1.240']]);
  assert.ok(!head.entries.some((e) => e.label === 'θ [°]'), 'theta only with a chosen Spencer');
});

test('single circle that the result does not have: note, no values; target critical or missing is as before', () => {
  const head = headOf(sia, 'bishop', single('nope'));
  assert.deepEqual(head.entries, []);
  assert.equal(head.note, translate('de', 'ui.slices.unknown'));
  for (const target of [undefined, null, { kind: 'critical' }]) {
    const h = headOf(sia, 'bishop', target);
    assert.equal(get(h, 'F'), formatFactor(sia.critical.bishop.F));
    assert.equal(get(h, 'Nachweis'), sia.check.bishop.ok ? 'Erfüllt' : 'Nicht erfüllt');
    assert.ok(!h.entries.some((e) => e.label === 'ID'));
  }
});
