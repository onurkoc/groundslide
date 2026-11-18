// Order 23 (SPEC_ETAPPE3 10): result of the supports. Overview (note, Bishop / Janbu with the code, only Spencer to choose, names in mode
// sia with supports), table of the supports for one circle, text for copying, columns sum P_t / sum P_n of the slice table.
// The functions are fed with real output of analyze() (coarse search so that it is short); the benchmark files are not changed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { translate, MESSAGES } from '../../app/lib/i18n.js';
import { overviewTable, methodChoices } from '../../app/lib/result-view.js';
import { initialResultState, reduceResult } from '../../app/lib/result-state.js';
import { documentHead } from '../../app/lib/result-document.js';
import {
  resultHasSupports, resultHasSupportLists, supportOnlyMethods, supportListFor, supportRows, supportCells, supportHeads, supportTsv, supportsView, SUPPORT_RESULT_COLUMNS,
} from '../../app/lib/supports-result.js';

const t = (lang) => (key, params) => translate(lang, key, params);
const NOW = new Date(2026, 10, 17, 9, 5);
const COARSE = { grid: { xMin: 42, xMax: 43.5, zMin: 77, zMax: 78.5, nx: 2, nz: 2 }, radii: 3 };

/** S6 (four piles) with a coarse search; `edit` changes the model before the run. */
function s6(edit = () => {}) {
  const m = loadBenchmark('S6_piles');
  delete m.expected;
  m.search = structuredClone(COARSE);
  m.analysis.methods = ['bishop', 'janbu', 'spencer'];
  edit(m);
  return m;
}
const run = (model) => analyze(model);

const withSupports = run(s6());
const sia = run(s6((m) => { m.analysis.mode = 'sia'; m.partialFactors = { phi: 1.2, c: 1.5, cu: 1.5, gamma: 1, G: 1, Q: 1.3, R: 1.1 }; }));
// the same soil without supports
const plainModel = loadBenchmark('B1_homogeneous');
delete plainModel.expected;
plainModel.search = structuredClone(COARSE);
plainModel.analysis.methods = ['bishop', 'janbu', 'spencer'];
const plain = run(plainModel);

// ---------- overview ----------

test('with supports: the run holds the lists, the note applies; without supports nothing of it', () => {
  assert.equal(resultHasSupportLists(withSupports), true);
  assert.equal(resultHasSupports(withSupports), true);
  assert.equal(resultHasSupportLists(plain), false);
  assert.equal(resultHasSupports(plain), false);
  for (const none of [null, undefined, {}, { critical: {} }, 5, []]) {
    assert.equal(resultHasSupports(none), false);
    assert.equal(resultHasSupportLists(none), false);
  }
  // a run in which no circle is valid: the refusal counted per method still shows that supports took part
  assert.equal(resultHasSupports({ critical: { spencer: null }, countsByMethod: { bishop: { total: 3, valid: 0, invalid: { I_SUPPORT_SPENCER_ONLY: 3 } } } }), true);
  assert.equal(resultHasSupports({ check: { gammaR: 1.1, withSupports: true, required: 1 } }), true);
});

test('Bishop, Janbu F0 and Janbu corrected: rows with I_SUPPORT_SPENCER_ONLY instead of "no valid surface"; only Spencer can be chosen', () => {
  assert.deepEqual(Object.keys(withSupports.critical), ['spencer'], 'the core searches Spencer only');
  assert.deepEqual(supportOnlyMethods(withSupports), ['bishop', 'janbu', 'janbuCorrected']);
  assert.equal(translate('de', 'I_SUPPORT_SPENCER_ONLY'), MESSAGES.de.I_SUPPORT_SPENCER_ONLY);
  assert.ok(MESSAGES.en.I_SUPPORT_SPENCER_ONLY);
  // the choice (overview, tool bar of the sketch) offers Spencer only, and Spencer is the default after the run
  assert.deepEqual(methodChoices(withSupports), ['spencer']);
  assert.deepEqual(overviewTable(withSupports).rows.map((r) => r.method), ['spencer']);
  const state = reduceResult(initialResultState(), { type: 'run-done', result: withSupports, timeMs: 1 });
  assert.equal(state.method, 'spencer');
  assert.equal(reduceResult(state, { type: 'select-method', method: 'bishop' }), state, 'Bishop cannot be chosen');
  // only the methods the run was asked for
  const onlyBishop = run(s6((m) => { m.analysis.methods = ['bishop', 'spencer']; }));
  assert.deepEqual(supportOnlyMethods(onlyBishop), ['bishop']);
  const spencerOnly = run(s6((m) => { m.analysis.methods = ['spencer']; }));
  assert.deepEqual(supportOnlyMethods(spencerOnly), []);
  assert.equal(resultHasSupports(spencerOnly), true, 'the note still applies');
  // without supports: all methods have a row, none is "refused"
  assert.deepEqual(supportOnlyMethods(plain), []);
  assert.deepEqual(methodChoices(plain), ['bishop', 'janbu', 'janbuCorrected', 'spencer']);
});

test('single circles keep the code text of Bishop and Janbu and the F of Spencer (as today)', () => {
  const s = withSupports.surfaces[0];
  assert.equal(s.valid, true);
  for (const m of ['bishop', 'janbu', 'janbuCorrected']) assert.equal(s.results[m].code, 'I_SUPPORT_SPENCER_ONLY');
  assert.equal(s.results.spencer.valid, true);
});

test('mode sia with supports: names and values of SPEC_ETAPPE3 10; without supports the overview is as before', () => {
  assert.equal(sia.check.withSupports, true);
  const table = overviewTable(sia);
  assert.equal(table.withSupports, true);
  assert.equal(table.required, 1);
  assert.equal(table.hasCheck, true);
  assert.equal(table.gammaR, 1.1);
  const row = table.rows[0];
  assert.deepEqual(Object.keys(row.check), ['gammaR', 'utilisation', 'ok', 'required']);
  assert.equal(row.check.required, 1);
  assert.equal(row.check.utilisation, 1 / row.F, 'utilisation = 1 / F_d');
  assert.equal(row.check.ok, row.F >= 1);
  // characteristic with supports: no check at all
  assert.equal(overviewTable(withSupports).hasCheck, false);
  assert.equal(overviewTable(withSupports).withSupports, false);
  assert.equal(overviewTable(withSupports).required, null);
  // sia without supports: the old format (F >= gamma_R), nothing new in the check of a row
  const siaPlainModel = structuredClone(plainModel);
  siaPlainModel.analysis.mode = 'sia';
  siaPlainModel.partialFactors = { phi: 1.2, c: 1.5, cu: 1.5, gamma: 1, G: 1, Q: 1.3, R: 1.1 };
  const siaPlain = run(siaPlainModel);
  const old = overviewTable(siaPlain);
  assert.equal(old.withSupports, false);
  assert.equal(old.required, null);
  for (const r of old.rows.filter((x) => x.check)) assert.deepEqual(Object.keys(r.check), ['gammaR', 'utilisation', 'ok']);
  assert.equal(old.rows.find((r) => r.method === 'bishop').check.utilisation, 1.1 / old.rows.find((r) => r.method === 'bishop').F);
});

test('names in DE and EN (interface texts) and the head of the result document with supports in mode sia', () => {
  const de = t('de');
  const en = t('en');
  assert.equal(de('ui.col.Fd'), 'F_d (Boden / γ_R)');
  assert.equal(de('ui.col.required'), 'erforderlich');
  assert.equal(de('ui.col.utilisationFd'), 'Ausnutzung 1/F_d');
  assert.equal(de('ui.col.verdictFd'), 'Erfüllt/Nicht erfüllt');
  assert.equal(de('ui.result.supportsHint'), 'Stützmittel nur mit Spencer');
  assert.equal(en('ui.result.supportsHint'), 'Supports with Spencer only');
  assert.equal(de('ui.result.gammaRNote', { gammaR: '1.100' }), 'γ_R = 1.100, auf die Bodenkennwerte angewendet');
  const model = s6();
  const head = documentHead({ model, result: sia, method: 'spencer', target: { kind: 'critical' }, now: NOW, t: de });
  assert.deepEqual(head.entries.map((e) => e.label), ['F_d (Boden / γ_R)', 'x_c [m]', 'z_c [m]', 'R [m]', 'Eintritt [m]', 'Austritt [m]', 'θ [°]', 'γ_R', 'erforderlich', 'Ausnutzung 1/F_d', 'Erfüllt/Nicht erfüllt']);
  const value = (label) => head.entries.find((e) => e.label === label).value;
  assert.equal(value('γ_R'), '1.100, auf die Bodenkennwerte angewendet');
  assert.equal(value('erforderlich'), '1.000');
  assert.equal(value('Ausnutzung 1/F_d'), (1 / sia.critical.spencer.F).toFixed(3));
  assert.equal(value('Erfüllt/Nicht erfüllt'), sia.check.spencer.ok ? 'Erfüllt' : 'Nicht erfüllt');
  const headEn = documentHead({ model, result: sia, method: 'spencer', target: { kind: 'critical' }, now: NOW, t: en });
  assert.deepEqual(headEn.entries.filter((e) => /F_d|required|Utilisation|Satisfied/.test(e.label)).map((e) => e.label), ['F_d (soil / γ_R)', 'required', 'Utilisation 1/F_d', 'Satisfied/Not satisfied']);
  // without supports the head is as before
  const headPlain = documentHead({ model: plainModel, result: plain, method: 'bishop', target: { kind: 'critical' }, now: NOW, t: de });
  assert.deepEqual(headPlain.entries.map((e) => e.label), ['F', 'x_c [m]', 'z_c [m]', 'R [m]', 'Eintritt [m]', 'Austritt [m]']);
});

// ---------- table of the supports ----------

test('rows: one per element in the order of `supports`; no intersection: id and type only; applied null stays null', () => {
  const list = [
    { id: 'N1', type: 'nail', intersects: true, point: [70, 40], slice: 3, T: 120, governs: 'pulloutBack', perMetre: 80, applied: 64.5, direction: [1, 1] },
    { id: 'N2', type: 'nail', intersects: false },
    { id: 'A1', type: 'anchor', intersects: true, T: 40, governs: 'anchor', perMetre: 40, applied: 40 },
    { id: 'P1', type: 'pile', intersects: true, T: 20, governs: 'shear', perMetre: 20, applied: null },
  ];
  assert.deepEqual(supportRows(list), [
    { id: 'N1', type: 'nail', intersects: true, T: 120, governs: 'pulloutBack', perMetre: 80, applied: 64.5 },
    { id: 'N2', type: 'nail', intersects: false, T: null, governs: null, perMetre: null, applied: null },
    { id: 'A1', type: 'anchor', intersects: true, T: 40, governs: 'anchor', perMetre: 40, applied: 40 },
    { id: 'P1', type: 'pile', intersects: true, T: 20, governs: 'shear', perMetre: 20, applied: null },
  ]);
  assert.deepEqual(supportRows(undefined), []);
  assert.deepEqual(supportRows([null, 5, 'x']), []);
  const de = t('de');
  assert.deepEqual(supportHeads(de), ['ID', 'Typ', 'Schnitt', 'T [kN]', 'Massgebende Grenze', 'je Laufmeter [kN/m]', 'wirksam [kN/m]']);
  assert.deepEqual(supportHeads(t('en')), ['ID', 'Type', 'Intersection', 'T [kN]', 'Governing limit', 'per metre [kN/m]', 'applied [kN/m]']);
  assert.equal(SUPPORT_RESULT_COLUMNS.length, 7);
  const rows = supportRows(list);
  assert.deepEqual(supportCells(rows[0], de), ['N1', 'Nagel', 'ja', '120.0', 'Herausziehen hinten', '80.0', '64.5']);
  assert.deepEqual(supportCells(rows[1], de), ['N2', 'Nagel', 'nein', '', '', '', ''], 'no intersection: the other cells are empty');
  assert.deepEqual(supportCells(rows[2], de), ['A1', 'Anker', 'ja', '40.0', 'Ankerkraft (freie Länge)', '40.0', '40.0']);
  assert.deepEqual(supportCells(rows[3], de), ['P1', 'Pfahl', 'ja', '20.0', 'Scherwiderstand', '20.0', '–'], 'applied null: "–"');
  assert.deepEqual(supportCells(rows[0], t('en')), ['N1', 'Nail', 'yes', '120.0', 'Pull-out (behind)', '80.0', '64.5']);
});

test('governing limits: every value of the core has a text in both languages', () => {
  const gov = ['pulloutBack', 'pulloutFront', 'tensile', 'anchor', 'bondZone', 'shear'];
  for (const lang of ['de', 'en']) for (const g of gov) assert.equal(typeof MESSAGES[lang][`ui.supgov.${g}`], 'string', `${lang} ${g}`);
  // an unknown value is shown as it is
  assert.equal(supportCells({ id: 'X', type: 'nail', intersects: true, T: 1, governs: 'newLimit', perMetre: 1, applied: 1 }, t('de'))[4], 'newLimit');
  assert.equal(supportCells({ id: 'X', type: 'cable', intersects: false }, t('de'))[1], 'cable', 'unknown type as it is');
});

test('text for copying: head with units, tabs and "\\n", values unrounded with a point, applied null empty', () => {
  const rows = supportRows([
    { id: 'N1', type: 'nail', intersects: true, T: 120.123456, governs: 'tensile', perMetre: 80.05, applied: 64.54321 },
    { id: 'N2', type: 'nail', intersects: false },
    { id: 'P1', type: 'pile', intersects: true, T: 20, governs: 'shear', perMetre: 20, applied: null },
  ]);
  const tsv = supportTsv(rows, t('de'));
  const lines = tsv.split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'ID\tTyp\tSchnitt\tT [kN]\tMassgebende Grenze\tje Laufmeter [kN/m]\twirksam [kN/m]');
  assert.equal(lines[1], 'N1\tNagel\tja\t120.123456\tStangenzug\t80.05\t64.54321');
  assert.equal(lines[2], 'N2\tNagel\tnein\t\t\t\t');
  assert.equal(lines[3], 'P1\tPfahl\tja\t20\tScherwiderstand\t20\t');
  assert.ok(lines.every((l) => l.split('\t').length === 7));
  assert.equal(supportTsv([], t('en')).split('\n').length, 1, 'only the head without elements');
});

test('S6: the table of the governing Spencer circle: four piles, 20.0 kN/m each, applied 16.5; same circle as the slice table', () => {
  const de = t('de');
  const view = supportsView({ result: withSupports, method: 'spencer', target: { kind: 'critical' }, t: de });
  assert.equal(view.kind, 'table');
  assert.equal(view.which, 'Massgebender Kreis – Spencer');
  assert.match(view.circle, /^Kreis: x_c = 42\.30 m, z_c = 78\.57 m, R = 49\.18 m$/);
  assert.equal(view.rows.length, 4);
  assert.deepEqual(view.rows.map((r) => r[0]), ['P1', 'P2', 'P3', 'P4']);
  for (const r of view.rows) assert.deepEqual([r[1], r[2], r[3], r[4], r[5], r[6]], ['Pfahl', 'ja', '20.0', 'Scherwiderstand', '20.0', '16.5']);
  assert.equal(view.head.length, 7);
  assert.equal(view.copy.split('\n').length, 5);
  const c = withSupports.critical.spencer;
  assert.match(view.copy.split('\n')[1], new RegExp(`\\t${c.supports[0].applied}$`), 'unrounded in the copy');
  // the single circle: its own list, the target decides
  const single = supportsView({ result: withSupports, method: 'spencer', target: { kind: 'single', id: 'SL2' }, t: de });
  assert.equal(single.kind, 'table');
  assert.equal(single.which, 'Einzelkreis SL2');
  assert.equal(single.rows.length, 4);
  assert.equal(supportListFor(withSupports, 'spencer', { kind: 'single', id: 'SL2' }).list, withSupports.surfaces[0].supports);
  assert.notEqual(single.circle, view.circle, 'another circle');
});

test('S3: elements without an intersection stand in the table with "nein" and empty cells', () => {
  const m = loadBenchmark('S3_three_nails');
  delete m.expected;
  m.search = structuredClone(COARSE);
  m.surfaces = [{ id: 'SL2', xc: 69.722, zc: 47.295, R: 4.884 }, { id: 'FAR', xc: 42.39, zc: 77.844, R: 48.426 }];
  const result = run(m);
  const view = supportsView({ result, method: 'spencer', target: { kind: 'single', id: 'SL2' }, t: t('de') });
  assert.equal(view.kind, 'table');
  assert.deepEqual(view.rows.map((r) => r[0]), ['N1', 'N2', 'N3'], 'order of `supports`');
  const hits = view.rows.filter((r) => r[2] === 'ja');
  const misses = view.rows.filter((r) => r[2] === 'nein');
  assert.ok(hits.length >= 1 && misses.length >= 1, `hits ${hits.length}, misses ${misses.length}`);
  for (const r of misses) assert.deepEqual(r.slice(3), ['', '', '', '']);
  for (const r of hits) assert.match(r[3], /^\d+\.\d$/);
});

test('invalid circle: code and text instead of the table; no circle: a note', () => {
  const bad = run(s6((m) => { m.surfaces = [{ id: 'bad', xc: 500, zc: 800, R: 1 }, { id: 'SL2', xc: 42.714, zc: 77.494, R: 48.022 }]; }));
  const de = t('de');
  const view = supportsView({ result: bad, method: 'spencer', target: { kind: 'single', id: 'bad' }, t: de });
  assert.equal(view.kind, 'invalid');
  assert.equal(view.code, bad.surfaces[0].code);
  assert.equal(view.text, de(bad.surfaces[0].code));
  assert.equal(view.which, 'Einzelkreis bad');
  assert.equal(supportsView({ result: bad, method: 'spencer', target: { kind: 'single', id: 'nope' }, t: de }).kind, 'none');
  assert.equal(supportsView({ result: bad, method: null, target: { kind: 'critical' }, t: de }).kind, 'none', 'no search, no governing circle');
  assert.equal(supportsView({ result: { critical: { spencer: null } }, method: 'spencer', target: { kind: 'critical' }, t: de }).text, 'Keine gültige Fläche');
  // a circle of a model without supports has no list
  assert.deepEqual(supportListFor(plain, 'bishop', { kind: 'critical' }), { none: true });
  assert.equal(supportsView({ result: plain, method: 'bishop', target: { kind: 'critical' }, t: de }).kind, 'none');
});

test('analyzeSurface (what the slice table uses) carries the same list for the same circle', () => {
  const c = withSupports.critical.spencer;
  const s = analyzeSurface(s6(), { xc: c.xc, zc: c.zc, R: c.R });
  assert.deepEqual(supportRows(s.supports), supportRows(c.supports));
});

// ---------- slice table: columns sum P_t and sum P_n (SPEC_ETAPPE3 6, 10) ----------

test('slice table with supports: two more columns at the end, 3 decimals, also in the copy; without supports none', async () => {
  const { sliceColumnsFor, SLICE_COLUMNS, columnHead, displayRows, sliceTsv, sliceRows } = await import('../../app/lib/slices-table.js');
  const c = withSupports.critical.spencer;
  const surface = analyzeSurface(s6(), { xc: c.xc, zc: c.zc, R: c.R });
  assert.equal(surface.valid, true);
  const slices = surface.slices;
  assert.ok(slices.every((s) => Number.isFinite(s.sumPt) && Number.isFinite(s.sumPn)), 'the core delivers sumPt and sumPn for every slice');
  const columns = sliceColumnsFor(slices);
  assert.equal(columns.length, SLICE_COLUMNS.length + 2);
  assert.deepEqual(columns.slice(0, SLICE_COLUMNS.length), SLICE_COLUMNS, 'the old columns stay as they are, in front');
  assert.deepEqual(columns.slice(-2).map(columnHead), ['ΣP_t [kN/m]', 'ΣP_n [kN/m]']);
  const rows = displayRows(slices);
  assert.equal(rows.length, slices.length);
  assert.ok(rows.every((r) => r.length === SLICE_COLUMNS.length + 2));
  assert.equal(rows[0].at(-2), slices[0].sumPt.toFixed(3));
  assert.equal(rows[0].at(-1), slices[0].sumPn.toFixed(3));
  assert.match(rows[0].at(-1), /^-?\d+\.\d{3}$/);
  // some slice carries a support force (the four piles act on slices)
  assert.ok(slices.some((s) => Math.abs(s.sumPn) > 1e-9), 'at least one slice has a support force');
  assert.equal(sliceRows(slices)[0].length, 12);
  // copy: head with units, unrounded values
  const lines = sliceTsv(slices).split('\n');
  assert.equal(lines.length, slices.length + 1);
  assert.equal(lines[0].split('\t').slice(-2).join('|'), 'ΣP_t [kN/m]|ΣP_n [kN/m]');
  assert.equal(lines[1].split('\t').at(-2), String(slices[0].sumPt));
  assert.equal(lines[1].split('\t').at(-1), String(slices[0].sumPn));
  assert.ok(lines.every((l) => l.split('\t').length === 12));
  // without supports: 10 columns, exactly as before
  const plainSurface = analyzeSurface(plainModel, { xc: 50, zc: 80, R: 52 });
  assert.equal(sliceColumnsFor(plainSurface.slices), SLICE_COLUMNS);
  assert.equal(sliceColumnsFor(plainSurface.slices).length, 10);
  assert.equal(displayRows(plainSurface.slices)[0].length, 10);
  assert.equal(sliceTsv(plainSurface.slices).split('\n')[0].split('\t').length, 10);
  assert.equal(sliceColumnsFor([]), SLICE_COLUMNS);
  assert.equal(sliceColumnsFor(undefined), SLICE_COLUMNS);
  assert.equal(sliceColumnsFor([{ sumPt: 'x' }]), SLICE_COLUMNS, 'not numbers: no columns');
});

test('the tab Supports: shown when the result holds lists, with the same circle choice as the tab Slices', () => {
  // the circle of the table is the circle that resolveSurface gives for method and target (the slice table uses the same call)
  const target = { kind: 'single', id: 'SL2' };
  const v1 = supportsView({ result: withSupports, method: 'spencer', target, t: t('en') });
  assert.equal(v1.which, 'Single circle SL2');
  assert.equal(v1.head[2], 'Intersection');
  assert.equal(v1.rows[0][1], 'Pile');
  assert.equal(resultHasSupportLists(withSupports) && !resultHasSupportLists(plain), true, 'the tab is hidden without supports in the result');
});

// ---------- result document: table "Supports" after the slice table (SPEC_ETAPPE3 10) ----------

test('document: table of the supports for the same circle; left out without supports; invalid circle: code and text', async () => {
  const { documentSupports, documentTable } = await import('../../app/lib/result-document.js');
  const de = t('de');
  assert.equal(documentSupports({ result: plain, method: 'bishop', target: { kind: 'critical' }, t: de }), null, 'no supports in the result: no table');
  assert.equal(documentSupports({ result: null, method: null, target: { kind: 'critical' }, t: de }), null);
  const table = documentSupports({ result: withSupports, method: 'spencer', target: { kind: 'critical' }, t: de });
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.head, ['ID', 'Typ', 'Schnitt', 'T [kN]', 'Massgebende Grenze', 'je Laufmeter [kN/m]', 'wirksam [kN/m]']);
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.numeric, [false, false, false, true, false, true, true]);
  assert.equal('copy' in table, false, 'the document has no clipboard text');
  // the same words for the circle as the slice table of the document
  const sliceTable = documentTable({ result: withSupports, method: 'spencer', target: { kind: 'critical' }, slices: null, t: de });
  assert.equal(sliceTable.which, table.which);
  assert.equal(sliceTable.circle, table.circle);
  // a single circle, EN
  const single = documentSupports({ result: withSupports, method: 'spencer', target: { kind: 'single', id: 'SL2' }, t: t('en') });
  assert.equal(single.which, 'Single circle SL2');
  assert.equal(single.head[4], 'Governing limit');
  // invalid single circle
  const bad = run(s6((m) => { m.surfaces = [{ id: 'bad', xc: 500, zc: 800, R: 1 }, { id: 'SL2', xc: 42.714, zc: 77.494, R: 48.022 }]; }));
  const invalid = documentSupports({ result: bad, method: 'spencer', target: { kind: 'single', id: 'bad' }, t: de });
  assert.equal(invalid.kind, 'invalid');
  assert.equal(invalid.code, bad.surfaces[0].code);
  assert.equal(invalid.text, de(bad.surfaces[0].code));
});

test('document wiring: main.js hands the table to the print area, the print view repeats its head, text columns left; Ctrl+P also', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (...p) => readFileSync(new URL(`../../${p.join('/')}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const main = read('app', 'main.js');
  const build = main.slice(main.indexOf('function buildPrintDocument'), main.indexOf('// ---------- language and light/dark'));
  assert.match(build, /supports: documentSupports\(\{ result: state\.result, method: state\.rs\.method, target: state\.rs\.target, t \}\)/);
  assert.match(build, /supports: t\('ui\.doc\.supports'\)/);
  const printDoc = read('app', 'ui', 'print-doc.js');
  assert.match(printDoc, /supports \? supportsSection\(supports, texts\) : null/, 'without supports the section is left out');
  assert.match(printDoc, /class: 'pd-table pd-supports'/, 'the print style of the slice table (head repeated on every page)');
  const css = read('app', 'style.css');
  assert.match(css, /\.pd-table thead \{ display: table-header-group; \}/);
  assert.match(css, /\.pd-table td\.txt \{ text-align: left; \}/);
  for (const lang of ['de', 'en']) assert.equal(typeof MESSAGES[lang]['ui.doc.supports'], 'string');
});

test('slice table, Spencer without F for the circle: the columns ΣP_t / ΣP_n are there, the cells empty (order 23a)', async () => {
  const { sliceColumnsFor, SLICE_COLUMNS, displayRows, sliceTsv } = await import('../../app/lib/slices-table.js');
  const surface = analyzeSurface(s6(), { xc: 35, zc: 45, R: 35 });
  assert.equal(surface.valid, true);
  assert.equal(surface.results.spencer.valid, false);
  const slices = surface.slices;
  assert.ok(slices.every((s) => s.sumPt === null && s.sumPn === null));
  assert.equal(sliceColumnsFor(slices).length, SLICE_COLUMNS.length + 2);
  const rows = displayRows(slices);
  assert.ok(rows.every((r) => r.length === 12 && r.at(-1) === '' && r.at(-2) === ''), 'empty cells like other null values');
  const lines = sliceTsv(slices).split('\n');
  assert.equal(lines[0].split('\t').length, 12);
  assert.ok(lines.slice(1).every((l) => l.endsWith('\t')), 'empty cells at the end of every line');
  // without supports still no columns
  const plainSurface = analyzeSurface(plainModel, { xc: 50, zc: 80, R: 52 });
  assert.equal(sliceColumnsFor(plainSurface.slices), SLICE_COLUMNS);
});
