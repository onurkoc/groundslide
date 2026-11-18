// Content of the legend (SPEC_ETAPPE2 6, 8.2, 8.4): one list for the screen and for the graphic export.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { translate } from '../../app/lib/i18n.js';
import { buildSketch } from '../../app/lib/sketch-model.js';
import { buildResultOverlay } from '../../app/lib/result-sketch.js';
import { legendModel } from '../../app/lib/legend.js';
import { contourLegend } from '../../app/lib/contour.js';

const model = loadBenchmark('B1_homogeneous');
model.search = { grid: { xMin: 20, xMax: 80, zMin: 40, zMax: 120, nx: 5, nz: 6 }, radii: 8 };
const result = analyze(model);
const sketch = buildSketch(model);
const t = (lang) => (key, params) => translate(lang, key, params);

test('materials: one entry per layer material, "id – name", colour class of the sketch', () => {
  const legend = legendModel({ sketch, overlay: null, t: t('de') });
  assert.deepEqual(legend.materials, [{ cls: 'mat-0', text: 'M1 – Soil 1' }]);
  assert.deepEqual(legend.methods, []);
  assert.equal(legend.contour, null);
  assert.equal(legend.note, null);
});

test('with a result: line samples of the methods in the order of the overlay, the chosen one marked; colour scale of the contour', () => {
  const overlay = buildResultOverlay(result, { method: 'janbu', contour: true, grid: model.search.grid });
  const legend = legendModel({ sketch, overlay, t: t('de') });
  assert.deepEqual(legend.methods.map((m) => m.method), overlay.circles.map((c) => c.method));
  assert.deepEqual(legend.methods.map((m) => m.selected), overlay.circles.map((c) => c.selected));
  assert.equal(legend.methods.filter((m) => m.selected).length, 1);
  assert.equal(legend.methods.find((m) => m.selected).method, 'janbu');
  assert.equal(legend.methods.find((m) => m.method === 'bishop').text, 'Bishop');
  assert.equal(legend.contour.title, 'Kontur von F – Janbu F₀');
  assert.deepEqual(legend.contour.items.map((i) => i.text), ['< 1.0', '1.0–1.1', '1.1–1.2', '1.2–1.3', '1.3–1.5', '1.5–2.0', '≥ 2.0', 'Keine gültige Fläche']);
  assert.equal(legend.contour.items.length, contourLegend().length);
  assert.deepEqual(legend.contour.items.map((i) => i.cls), ['contour-0', 'contour-1', 'contour-2', 'contour-3', 'contour-4', 'contour-5', 'contour-6', 'contour-none']);
});

test('contour switched off or without contour: no colour scale; a grid of one row gives the note', () => {
  const off = buildResultOverlay(result, { method: 'bishop', contour: false, grid: model.search.grid });
  const legendOff = legendModel({ sketch, overlay: off, t: t('de') });
  assert.equal(legendOff.contour, null);
  assert.equal(legendOff.note, null);
  assert.ok(legendOff.methods.length > 0, 'the line samples stay');

  const oneRow = { ...model, search: { grid: { ...model.search.grid, nz: 1 }, radii: 8 } };
  const rowResult = analyze(oneRow);
  const overlay = buildResultOverlay(rowResult, { method: 'bishop', contour: true, grid: oneRow.search.grid });
  const legend = legendModel({ sketch, overlay, t: t('de') });
  assert.equal(legend.contour, null);
  assert.equal(legend.note, translate('de', 'ui.contour.single'));
});

test('texts follow the language', () => {
  const overlay = buildResultOverlay(result, { method: 'bishop', contour: true, grid: model.search.grid });
  const en = legendModel({ sketch, overlay, t: t('en') });
  assert.equal(en.contour.title, 'Contour of F – Bishop');
  assert.equal(en.contour.items.at(-1).text, 'No valid surface');
  assert.equal(en.methods.find((m) => m.method === 'janbu').text, 'Janbu F₀');
});

test('no sketch (model without geometry): empty lists, nothing breaks', () => {
  const legend = legendModel({ sketch: buildSketch(null), overlay: null, t: t('en') });
  assert.deepEqual(legend, { materials: [], methods: [], contour: null, note: null });
});
