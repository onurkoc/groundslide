// Graphic of the result document (SPEC_ETAPPE2 8.5 point 2, version 1.12): size and cut of the section, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageGraphic, mmToPx, ptToPx, PAGE_WIDTH_PX, PAGE_WIDTH_MM, MAX_HEIGHT_MM, FONT_PX } from '../../app/lib/page-graphic.js';
import { tickStep } from '../../app/lib/axes.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('constants: 180 mm wide (A4 portrait between the margins), text 8 pt, at most half of 267 mm high', () => {
  assert.equal(PAGE_WIDTH_MM, 180);
  assert.equal(PAGE_WIDTH_PX, 680); // 180 mm at 96 dpi = 680.3 px
  near(ptToPx(8), 10.6667, 1e-3);
  near(FONT_PX, ptToPx(8));
  near(MAX_HEIGHT_MM, 133.5);
  near(mmToPx(25.4), 96);
});

test('flat screen area (wide): same section, width 680, height by the aspect ratio, not cut', () => {
  const view = { scale: 8, x0: 5, z0: 40 };
  const size = { width: 1000, height: 400 }; // 125 m x 50 m visible
  const page = pageGraphic({ view, size });
  assert.equal(page.width, 680);
  near(page.height, 400 * 0.68);
  assert.equal(page.cropped, false);
  // the visible world range is the same as on the screen
  near(page.width / page.view.scale, size.width / view.scale);
  near(page.height / page.view.scale, size.height / view.scale);
  assert.equal(page.view.x0, 5);
  assert.equal(page.view.z0, 40, 'top edge unchanged without cut');
});

test('tall screen area: higher than half a page -> cut at the top and bottom, the middle stays, the scale is not reduced', () => {
  const view = { scale: 10, x0: 0, z0: 60 };
  const size = { width: 500, height: 900 }; // 50 m x 90 m visible
  const maxHeightPx = mmToPx(133.5);
  const page = pageGraphic({ view, size });
  const factor = 680 / 500;
  near(page.view.scale, 10 * factor, 1e-9);
  assert.equal(page.cropped, true);
  near(page.height, maxHeightPx);
  assert.ok(page.height < 900 * factor, 'lower than the uncut drawing');
  // the middle of the section stays: world z of the middle of the screen area = world z of the middle of the page graphic
  const zMidScreen = view.z0 - size.height / 2 / view.scale;
  const zMidPage = page.view.z0 - page.height / 2 / page.view.scale;
  near(zMidPage, zMidScreen, 1e-9);
  // the section is narrower in z by the cut: same visible width in x
  near(page.width / page.view.scale, size.width / view.scale);
  assert.ok(page.height / page.view.scale < size.height / view.scale);
  assert.ok(page.view.z0 < view.z0, 'the top edge moves down by half the cut');
});

test('a limit that the legend takes from: the drawing gets the smaller height', () => {
  const view = { scale: 10, x0: 0, z0: 60 };
  const size = { width: 500, height: 900 };
  const page = pageGraphic({ view, size, maxHeightPx: 400 });
  near(page.height, 400);
  const free = pageGraphic({ view, size, maxHeightPx: 300 });
  near(free.height, 300);
  const zMid = (p) => p.view.z0 - p.height / 2 / p.view.scale;
  near(zMid(page), zMid(free), 1e-9);
});

test('exactly at the limit: not cut', () => {
  const size = { width: 680, height: 400 };
  const page = pageGraphic({ view: { scale: 5, x0: 0, z0: 0 }, size, maxHeightPx: 400 });
  assert.equal(page.cropped, false);
  assert.equal(page.height, 400);
});

test('the axes are divided for the new size (tick step from the new scale)', () => {
  const view = { scale: 2, x0: 0, z0: 100 }; // large screen, 2 px per m: step 50 m
  const size = { width: 2000, height: 800 };
  const page = pageGraphic({ view, size });
  near(page.view.scale, 0.68);
  assert.equal(tickStep(view.scale), 50);
  assert.equal(tickStep(page.view.scale), 100, 'fewer marks on the smaller drawing: 60 to 150 px apart');
});

test('not usable input gives null', () => {
  const ok = { view: { scale: 1, x0: 0, z0: 0 }, size: { width: 100, height: 50 } };
  assert.ok(pageGraphic(ok));
  assert.equal(pageGraphic({ ...ok, size: { width: 0, height: 50 } }), null);
  assert.equal(pageGraphic({ ...ok, size: { width: 100, height: NaN } }), null);
  assert.equal(pageGraphic({ ...ok, view: { scale: 0, x0: 0, z0: 0 } }), null);
  assert.equal(pageGraphic({ ...ok, view: { scale: 1, x0: NaN, z0: 0 } }), null);
  assert.equal(pageGraphic({ ...ok, view: null }), null);
  assert.equal(pageGraphic({ ...ok, widthPx: 0 }), null);
});

// --- wiring (needs a browser to run; the sources are checked here)

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const read = (file) => readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');

test('sketch.js: pageSvg draws with the same paint as the screen and the export, in the page size and with 8 pt; exportSvg is untouched', () => {
  const sketch = read('ui/sketch.js');
  const body = sketch.slice(sketch.indexOf('pageSvg() {'), sketch.indexOf('Result of a run (lib/result-sketch.js)'));
  assert.match(body, /pageGraphic\(\{ view: exportView, size: area/);
  assert.match(body, /paint\(target, page\.view, \{ width: page\.width, height: page\.height \}\)/);
  assert.match(body, /fontPx: FONT_PX/);
  assert.match(body, /maxHeightPx: Math\.max\(limit - legendPx, 1\)/, 'the legend counts to half a page');
  assert.match(sketch, /exportSvg\(\) \{[\s\S]*paint\(target, exportView, area\)/, 'the graphic export keeps the size of the screen');
  assert.doesNotMatch(sketch.slice(sketch.indexOf('exportSvg() {'), sketch.indexOf('pageSvg() {')), /pageGraphic|FONT_PX/);
});

test('style sheet: the figure is 180 mm wide and shrinks only on a narrower page; the page size is still not set', () => {
  const css = read('style.css');
  assert.match(css, /\.pd-figure svg \{[^}]*width: 180mm; max-width: 100%/);
  assert.doesNotMatch(css.slice(css.indexOf('@page'), css.indexOf('@page') + 30), /size/);
});
