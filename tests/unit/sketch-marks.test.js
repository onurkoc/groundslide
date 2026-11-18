// Sketch (SPEC_ETAPPE2 6, version 1.6): grid centres hidden exactly while the contour is visible; single circles keep
// centre and id (with F or code after a run) even when they do not meet the soil. No calculation needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBenchmark } from './helpers.js';
import { buildSketch } from '../../app/lib/sketch-model.js';
import { centresVisible, singleMarks } from '../../app/lib/result-sketch.js';

const polygon = { cls: 3, points: [[20, 40], [22, 40], [22, 42], [20, 42]] };

test('centres: shown without result, with contour off, without polygons; hidden exactly with contour polygons', () => {
  assert.equal(centresVisible(null), true, 'no result');
  assert.equal(centresVisible({ contour: null }), true, 'contour switched off');
  assert.equal(centresVisible({ contour: { polygons: [], reason: 'single-row' } }), true, 'grid with one row: no contour, dots stay');
  assert.equal(centresVisible({ contour: { polygons: [], reason: 'no-search' } }), true);
  assert.equal(centresVisible({ contour: { polygons: [polygon], reason: null } }), false, 'contour visible');
  assert.equal(centresVisible(undefined), true);
});

test('the grid rectangle and the centres stay in the model description (only the drawing hides the dots)', () => {
  const sketch = buildSketch(loadBenchmark('B1_homogeneous'));
  assert.ok(sketch.grid);
  assert.equal(sketch.grid.centers.length, 31 * 41, 'centres are still computed (zoom to fit uses the grid)');
});

test('single circle that does not meet the soil keeps centre and id; fit still includes its centre', () => {
  const model = loadBenchmark('B1_homogeneous');
  model.surfaces = [{ id: 'C1', xc: 50, zc: 80, R: 52 }, { id: 'FAR', xc: 60, zc: 500, R: 1 }];
  const sketch = buildSketch(model);
  const marks = singleMarks(sketch.surfaces, null);
  assert.deepEqual(marks.map((m) => [m.id, m.xc, m.zc, m.label]), [['C1', 50, 80, 'C1'], ['FAR', 60, 500, 'FAR']]);
  assert.ok(sketch.bounds.zMax >= 500, 'Einpassen: the centre is part of the frame');
  // after a run: the text comes from the overlay (F or code), the centre stays
  const overlay = { singles: { C1: 'C1  F = 1.507', FAR: 'FAR  I_INTERSECTIONS' } };
  const after = singleMarks(sketch.surfaces, overlay);
  assert.deepEqual(after.map((m) => m.label), ['C1  F = 1.507', 'FAR  I_INTERSECTIONS']);
  assert.deepEqual(after.map((m) => [m.xc, m.zc, m.R]), [[50, 80, 52], [60, 500, 1]]);
});

test('single circle without id: centre, no text', () => {
  const marks = singleMarks([{ id: '', xc: 1, zc: 2, R: 3 }], { singles: {} });
  assert.deepEqual(marks, [{ id: '', xc: 1, zc: 2, R: 3, label: '' }]);
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sketchSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'ui', 'sketch.js'), 'utf8').split(String.fromCharCode(13)).join('');

test('sketch.js: arcs of single circles and result circles use the clip path of the soil body; dots depend on centresVisible', () => {
  const singleLine = sketchSource.split(String.fromCharCode(10)).find((l) => l.includes("class: 'sk-circle'"));
  assert.ok(singleLine && singleLine.includes('clip-path') && singleLine.includes('url(#sk-clip)'), singleLine);
  assert.ok(sketchSource.includes("'clip-path': 'url(#sk-clip)'"));
  assert.ok(sketchSource.includes('g.centers && centresVisible(overlay)'));
});

// --- radius lines (SPEC_ETAPPE2 8.2, version 1.7) and dashed water line (6) ---

import { radiusLines, buildResultOverlay } from '../../app/lib/result-sketch.js';

const fake = {
  critical: {
    bishop: { F: 1.1, xc: 40, zc: 80, R: 50, entry: [81.8, 50], exit: [50, 30] },
    janbu: { F: 1.2, xc: 45, zc: 70, R: 40, entry: [80, 50], exit: [51, 30.5] },
    spencer: null,
  },
  grid: [],
  surfaces: [],
};

test('radius lines: centre to entry and to exit of the chosen method; they follow the method', () => {
  assert.deepEqual(radiusLines(fake, 'bishop'), [{ x1: 40, z1: 80, x2: 81.8, z2: 50 }, { x1: 40, z1: 80, x2: 50, z2: 30 }]);
  assert.deepEqual(radiusLines(fake, 'janbu'), [{ x1: 45, z1: 70, x2: 80, z2: 50 }, { x1: 45, z1: 70, x2: 51, z2: 30.5 }]);
  assert.deepEqual(buildResultOverlay(fake, { method: 'janbu', contour: false, grid: null }).radii, radiusLines(fake, 'janbu'));
  assert.deepEqual(buildResultOverlay(fake, { method: 'bishop', contour: false, grid: null }).radii, radiusLines(fake, 'bishop'));
});

test('radius lines: none without valid surface, for a method that was not calculated, without result, with broken entry', () => {
  assert.deepEqual(radiusLines(fake, 'spencer'), []);
  assert.deepEqual(radiusLines(fake, 'janbuCorrected'), []);
  assert.deepEqual(radiusLines(null, 'bishop'), []);
  assert.deepEqual(radiusLines({ surfaces: [] }, 'bishop'), []);
  assert.deepEqual(radiusLines({ critical: { bishop: { xc: 1, zc: 2, entry: [1, NaN], exit: [3, 4] } } }, 'bishop'), [{ x1: 1, z1: 2, x2: 3, z2: 4 }]);
  assert.deepEqual(buildResultOverlay(fake, { method: 'spencer', contour: false, grid: null }).radii, []);
});

test('style.css: the water line is dashed, the radius lines are dashed', () => {
  const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'style.css'), 'utf8').split(String.fromCharCode(13)).join('');
  assert.match(css, /[.]sk-water [{][^}]*stroke-dasharray: *\d+ \d+/);
  assert.match(css, /[.]rs-radius [{][^}]*stroke-dasharray: *\d+ \d+/);
});
