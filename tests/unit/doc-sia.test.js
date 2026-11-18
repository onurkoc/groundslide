// Order 29 (SPEC_ETAPPE4 13b): "Verification SIA 267" in the result document (mode sia), partial factors of the supports.
// No DOM: the pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../core/index.js';
import { DEFAULT_PARTIAL_FACTORS } from '../../core/model.js';
import { documentVerification, SIA_DEFAULT_FACTORS, SIA_FACTORS } from '../../app/lib/sia-verification.js';
import { documentHead, documentSupports, withSupportFactors, supportFactorCells } from '../../app/lib/result-document.js';
import { FACTOR_DEFAULTS } from '../../app/lib/supports-edit.js';
import { translate } from '../../app/lib/i18n.js';
import { loadBenchmark } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

const t = (lang) => (key, params) => translate(lang, key, params);

// ------------------------------------------------------------ 3 verification SIA 267 in the result document

/** B3 or S1 in mode sia with a small search; S1 has a nail (only Spencer). */
function siaResult(name, extra = {}) {
  const m = loadBenchmark(name);
  m.analysis.mode = 'sia';
  if (name !== 'S1_nail_head') m.analysis.methods = ['bishop', 'janbu', 'spencer'];
  m.search = { grid: { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 3, nz: 3 }, radii: 6 };
  if (name === 'S1_nail_head') m.search.grid = { xMin: 49, xMax: 51, zMin: 47, zMax: 49, nx: 2, nz: 2 };
  m.surfaces = [];
  Object.assign(m, extra);
  return { model: m, result: analyze(m) };
}
/** All tokens of a formula as text, and all tags used. */
function flatten(node, out = { text: [], tags: new Set() }) {
  out.tags.add(node.tag);
  if (node.text !== undefined) out.text.push(node.text);
  for (const c of node.children || []) flatten(c, out);
  return out;
}
const formulaText = (f) => flatten(f).text.join('');

test('mode characteristic: no section (the document stays as it is); no model or no result: none', () => {
  const m = loadBenchmark('B3_two_layers');
  m.search = { grid: { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 2, nz: 2 }, radii: 3 };
  const result = analyze(m);
  assert.equal(m.analysis.mode, 'characteristic');
  assert.equal(documentVerification({ model: m, result, method: 'bishop', t: t('de') }), null);
  assert.equal(documentVerification({ model: null, result, method: 'bishop', t: t('de') }), null);
});

test('mode sia without supports: factors of the model, the rule with F_d >= gamma_R and eta = gamma_R / F_d, the numbers, the table per method', () => {
  const { model, result } = siaResult('B3_two_layers', { partialFactors: { phi: 1.25, c: 1.5, cu: 1.5, gamma: 1.0, G: 1.0, Q: 1.3, R: 1.1 } });
  const v = documentVerification({ model, result, method: 'bishop', t: t('de') });
  assert.equal(v.title, 'Nachweis SIA 267');
  // (a) factors as calculated: the values of the model, gamma_R from the verification of the result
  assert.deepEqual(v.factors.head, ['γ_γ', 'γ_φ', 'γ_c', 'γ_cu', 'γ_G', 'γ_Q', 'γ_R']);
  assert.deepEqual(v.factors.values, ['1.000', '1.250', '1.500', '1.500', '1.000', '1.300', '1.100']);
  assert.equal(v.factors.values[6], (result.check.gammaR).toFixed(3));
  // (b) the rule: set formulas (MathML nodes) and the text
  assert.equal(v.rule.withSupports, false);
  const design = v.rule.design.map(formulaText);
  assert.deepEqual(design, ['Xd=Xkγm', 'tanφ′d=tanφ′kγφ']);
  assert.deepEqual(v.rule.check.map(formulaText), ['Fd≥γR', 'η=γRFd']);
  assert.ok(v.rule.design.concat(v.rule.check).every((f) => f.tag === 'mrow'));
  assert.ok(flatten({ tag: 'mrow', children: v.rule.design.concat(v.rule.check) }).tags.has('mfrac'), 'fractions are set as fractions');
  assert.equal(v.rule.source, 'Quelle: SIA 267, Gl. (19) und (20).');
  // the same inequality with the numbers of the chosen method
  const row = result.check.bishop;
  assert.ok(row);
  assert.equal(formulaText(v.numbers.math), `Fd=${row.F.toFixed(3)}${row.ok ? '≥' : '<'}γR=${result.check.gammaR.toFixed(3)},η=${row.utilisation.toFixed(3)}`);
  assert.equal(v.numbers.verdict, row.ok ? 'Erfüllt' : 'Nicht erfüllt');
  assert.match(v.numbers.title, /Bishop/);
  // (c) the table per method as in the overview; Janbu F0 without verification
  assert.equal(v.methods.kind, 'table');
  assert.deepEqual(v.methods.head, ['Verfahren', 'F', 'erforderlich', 'Ausnutzung', 'Nachweis']);
  const byName = Object.fromEntries(v.methods.rows.map((r) => [r.cells[0], r.cells]));
  assert.deepEqual(Object.keys(byName), ['Bishop', 'Janbu F₀', 'Janbu korrigiert', 'Spencer']);
  assert.deepEqual(byName['Janbu F₀'].slice(2), ['–', '–', '–']);
  assert.deepEqual(byName.Spencer.slice(1, 4), [result.check.spencer.F.toFixed(3), '1.100', result.check.spencer.utilisation.toFixed(3)]);
  assert.equal(byName.Spencer[4], result.check.spencer.ok ? 'Erfüllt' : 'Nicht erfüllt');
});

test('mode sia with supports: the soil values also divided by gamma_R, F_d >= 1.0, eta = 1 / F_d; the methods supports exclude with code and text', () => {
  const { model, result } = siaResult('S1_nail_head');
  model.analysis.methods = ['bishop', 'janbu', 'spencer']; // asked for, but supports act in Spencer only
  const r = analyze(model);
  const v = documentVerification({ model, result: r, method: 'spencer', t: t('en') });
  assert.equal(v.title, 'Verification SIA 267');
  assert.equal(v.rule.withSupports, true);
  assert.deepEqual(v.rule.design.map(formulaText), ["c′d=c′kγc·γR", 'tanφ′d=tanφ′kγφ·γR', 'cu,d=cu,kγcu·γR']);
  assert.deepEqual(v.rule.check.map(formulaText), ['Fd≥1.0', 'η=1Fd']);
  assert.match(v.rule.text[1], /ΔR_d/);
  const row = r.check.spencer;
  assert.equal(formulaText(v.numbers.math), `Fd=${row.F.toFixed(3)}${row.ok ? '≥' : '<'}1.000,η=${row.utilisation.toFixed(3)}`);
  assert.ok(Math.abs(row.utilisation - 1 / row.F) < 1e-12, 'eta = 1 / F_d');
  assert.equal(v.methods.head[1], 'F_d (soil / γ_R)');
  const rows = Object.fromEntries(v.methods.rows.map((x) => [x.name || x.cells[0], x]));
  assert.equal(rows.Spencer.cells[2], '1.000', 'required 1.0');
  for (const name of ['Bishop', 'Janbu F₀', 'Janbu corrected']) assert.match(rows[name].note, /^I_SUPPORT_SPENCER_ONLY /, name);
  // gamma_R in the first table is still the factor of the model
  assert.equal(v.factors.values[6], r.check.gammaR.toFixed(3));
});

test('the factors fall back to the defaults of SPEC.md 2.2 where the model has none; the defaults are those of the core', () => {
  assert.deepEqual({ ...SIA_DEFAULT_FACTORS }, { ...DEFAULT_PARTIAL_FACTORS });
  assert.deepEqual(SIA_FACTORS.map(([key]) => key), ['gamma', 'phi', 'c', 'cu', 'G', 'Q', 'R']);
  const { model, result } = siaResult('B3_two_layers');
  delete model.partialFactors.phi;
  const v = documentVerification({ model, result, method: null, t: t('de') });
  assert.equal(v.factors.values[1], '1.200');
  assert.equal(v.numbers, null, 'no chosen method: no line with numbers');
});

test('without a search there is no check: factors and rule stay, the table says so', () => {
  const { model } = siaResult('B3_two_layers');
  model.search = null;
  model.surfaces = [{ id: 'C1', xc: 50, zc: 80, R: 52 }];
  const v = documentVerification({ model, result: analyze(model), method: null, t: t('de') });
  assert.equal(v.methods.kind, 'none');
  assert.match(v.methods.text, /Ohne Suche/);
  assert.equal(v.factors.values.length, 7);
});

test('the section stands right after the graphic and before the slice table; the formulas are MathML elements (no package, no image); main.js hands it over', () => {
  const doc = read('app', 'ui', 'print-doc.js');
  assert.match(doc, /const parts = \[header, figure, verification \? verificationSection\(verification\) : null, tableSection\(table, texts\), supports \? supportsSection\(supports, texts\) : null\];/);
  assert.match(doc, /const MATHML = 'http:\/\/www\.w3\.org\/1998\/Math\/MathML';/);
  assert.match(doc, /document\.createElementNS\(MATHML, node\.tag\)/);
  assert.match(doc, /document\.createElementNS\(MATHML, 'math'\)/);
  assert.match(doc, /el\.setAttribute\('display', 'block'\)/);
  assert.doesNotMatch(doc, /katex|mathjax|<img|\.png|toDataURL/i);
  const main = read('app', 'main.js');
  assert.match(main, /verification: documentVerification\(\{ model: state\.model, result: state\.result, method: state\.rs\.method, t \}\)/);
  assert.match(main, /doc\.supports = withSupportFactors\(doc\.supports, state\.model\);/);
  // the head of the document is as before
  const { model, result } = siaResult('B3_two_layers');
  const head = documentHead({ model, result, method: 'bishop', target: { kind: 'critical' }, now: new Date(2026, 10, 18), t: t('de') });
  assert.equal(head.entries[0].label, 'F');
  // the style sheet of the print view knows the new parts
  const css = read('app', 'style.css');
  for (const cls of ['.pd-math', '.pd-numbers', '.pd-verdict', '.pd-source', '.pd-verification h3']) assert.ok(css.includes(cls), cls);
});

test('table of the supports in the document, mode sia: three more columns gamma_M, gamma_A and gamma_C as calculated (the value of the element, else the default of its type)', () => {
  const { model, result } = siaResult('S1_nail_head');
  model.supports = [
    ...model.supports,
    { id: 'A1', type: 'anchor', x: 60, z: 35, angle: 15, freeLength: 5, bondLength: 5, spacing: 2, P0: 100, Rk: 500, gammaA: 1.1 },
    { id: 'P1', type: 'pile', x: 70, z: 42, length: 5, spacing: 2, shear: 100, gammaM: 1.5 },
    { id: 'S1', type: 'shotcrete', x1: 55, x2: 60, thickness: 0.1, tau: 1000 },
    { id: 'S2', type: 'shotcrete', x1: 60, x2: 62, thickness: 0.1, tau: 1000, gammaC: 2 },
  ];
  const r = analyze(model);
  const base = documentSupports({ result: r, method: 'spencer', target: { kind: 'critical' }, t: t('de') });
  const table = withSupportFactors(base, model);
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.head.slice(-3), ['γ_M', 'γ_A', 'γ_C']);
  assert.equal(table.numeric.length, table.head.length);
  assert.deepEqual(table.numeric.slice(-3), [true, true, true]);
  const cells = Object.fromEntries(table.rows.map((row) => [row[0], row.slice(-3)]));
  assert.deepEqual(cells.N1, [FACTOR_DEFAULTS.nail.gammaM.toFixed(3), '–', '–'], 'nail: the default of its type, no gamma_A, no gamma_C');
  assert.deepEqual(cells.A1, ['1.350', '1.100', '–'], 'anchor: default gamma_M, gamma_A of the element');
  assert.deepEqual(cells.P1, ['1.500', '–', '–'], 'pile: the value of the element');
  assert.deepEqual(cells.S1, ['–', '–', FACTOR_DEFAULTS.shotcrete.gammaC.toFixed(3)], 'shotcrete without gammaC in the model: the default of the core, 1.500');
  assert.deepEqual(cells.S2, ['–', '–', '2.000'], 'shotcrete with gammaC: the value of the element');
  assert.equal(FACTOR_DEFAULTS.shotcrete.gammaC, 1.5);
  // every row has the same number of cells; the old columns stay in front
  assert.ok(table.rows.every((row) => row.length === table.head.length));
  assert.deepEqual(supportFactorCells(model, 'nope'), ['–', '–', '–']);
  // mode characteristic: the table as before
  const plain = { ...model, analysis: { ...model.analysis, mode: 'characteristic' } };
  const before = withSupportFactors(base, plain);
  assert.equal(before.head.length, table.head.length - 3);
  assert.equal(before, base, 'mode characteristic: the same table');
  assert.equal(withSupportFactors({ kind: 'none', text: 'x' }, model).kind, 'none');
  assert.equal(withSupportFactors(null, model), null);
});

test('texts of the verification exist in both languages and name no other program', () => {
  const keys = ['title', 'factors', 'rule', 'design', 'check', 'designSupports', 'checkSupports', 'source', 'numbers', 'methods', 'verdict', 'noCheck', 'noVerdict'];
  for (const lang of ['de', 'en']) for (const key of keys) {
    const text = translate(lang, `ui.doc.sia.${key}`, { method: 'X' });
    assert.ok(text && !text.startsWith('ui.doc.sia.'), `${lang}:${key}`);
    assert.doesNotMatch(text, /Slide2|Rocscience/i);
  }
});

