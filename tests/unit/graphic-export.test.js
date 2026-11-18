// Graphic export (SPEC_ETAPPE2 8.4): buttons, menu, wiring, texts. The pieces that need a browser (drawing, computed
// styles, canvas) are in the hand check; here the structure and the rules that can be read from the sources.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const html = read('app', 'index.html');
const main = read('app', 'main.js');
const menu = read('app', 'ui', 'menu.js');
const exporter = read('app', 'ui', 'sketch-export.js');
const sketch = read('app', 'ui', 'sketch.js');
const css = read('app', 'style.css');

test('index.html: "Grafik exportieren" with a menu of PNG and SVG in the row of the tab list, outside both panels', () => {
  const head = html.slice(html.indexOf('class="output-head"'), html.indexOf('id="main-panels"'));
  assert.match(head, /<button[^>]*id="btn-graphic"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="graphic-menu"/);
  assert.match(head, /<ul class="menu" id="graphic-menu" role="menu"[^>]*\bhidden>/);
  assert.match(head, /<button[^>]*role="menuitem"[^>]*data-format="png"/);
  assert.match(head, /<button[^>]*role="menuitem"[^>]*data-format="svg"/);
  assert.doesNotMatch(head, /btn-graphic[^>]*\bdisabled\b/, 'usable without a result');
  assert.doesNotMatch(html, /btn-export/, 'the JSON export is gone');
});

test('main.js: the export is locked during a run, uses the file name function and the PNG scale, and shows failures as a message', () => {
  const fn = main.slice(main.indexOf('async function exportGraphic'), main.indexOf('// ---------- language and light/dark'));
  assert.match(fn, /if \(state\.running \|\| !state\.model\) return/);
  assert.match(fn, /sketch\.exportSvg\(\)/);
  assert.match(fn, /sketchFileNameFor\(state\.model, format\)/);
  assert.match(fn, /svgToPngBlob\(drawing\.text, drawing\.width, drawing\.height, PNG_SCALE\)/);
  assert.match(fn, /'image\/svg\+xml'/);
  assert.match(fn, /APP_EXPORT_FAILED/);
  assert.match(main, /\$\('btn-graphic'\)\.disabled = running/);
  assert.match(main, /createMenu\(\{ button: \$\('btn-graphic'\), menu: \$\('graphic-menu'\), onSelect: exportGraphic \}\)/);
  // the export does not touch the model, the result or the view
  assert.doesNotMatch(fn, /applyEdit|changeModel|dispatchResult|sketch\.fit|sketch\.update|setTheme|dataset\.theme/);
});

test('the menu is usable with the keyboard: arrows, Home, End, Enter/Space (buttons), Esc closes, aria-expanded kept', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) assert.match(menu, new RegExp(`['"]?${key}['"]?`), key);
  assert.match(menu, /setAttribute\('aria-expanded', 'true'\)/);
  assert.match(menu, /setAttribute\('aria-expanded', 'false'\)/);
  assert.match(menu, /close\(\{ focus: true \}\)/, 'Esc and a choice give the focus back to the button');
  assert.match(menu, /if \(button\.disabled\) return/);
});

test('sketch-export.js: light scheme in a hidden box, computed values as attributes, no class, checked before it is returned; the page is not touched', () => {
  assert.match(exporter, /color-scheme:light/);
  assert.match(exporter, /position:fixed;left:-100000px/);
  assert.match(exporter, /host\.remove\(\)/);
  assert.match(exporter, /finally/);
  assert.match(exporter, /getComputedStyle/);
  assert.match(exporter, /removeAttribute\('class'\)/);
  assert.match(exporter, /standaloneProblems\(text\)/);
  assert.match(exporter, /new XMLSerializer\(\)/);
  // the class names go only after all elements were read: ".sk-centres circle" and similar rules need the class of the parent
  const inline = exporter.slice(exporter.indexOf('function inlineStyles'), exporter.indexOf('Standalone SVG of the sketch'));
  assert.ok(inline.indexOf("querySelectorAll('[class]')") > inline.lastIndexOf('getComputedStyle'));
  assert.equal([...inline.matchAll(/removeAttribute\('class'\)/g)].length, 1, 'one place, after the loop');
  assert.doesNotMatch(exporter, /dataset\.theme|documentElement|localStorage|setTheme/, 'the colour scheme of the page stays');
  // white ground comes from a variable in :root, not from a literal in the style sheet rules
  assert.match(css, /--export-ground:\s*#ffffff/);
  assert.match(css, /\.ex-ground \{ fill: var\(--export-ground\)/);
});

test('sketch.js: the export draws with the same function as the screen (paint), with the view and size of the screen', () => {
  assert.match(sketch, /function paint\(svg, view, size\)/);
  assert.match(sketch, /paint\(svg, view, size\);/, 'the screen');
  assert.match(sketch, /exportSvg\(\) \{[\s\S]*paint\(target, exportView, area\)/, 'the export');
  assert.match(sketch, /lastSize \|\| \{ width: 800, height: 500 \}/, 'hidden tab: the last size, not 0');
  assert.match(sketch, /legendModel\(\{ sketch, overlay, t \}\)/, 'the legend of the export and of the screen is one list');
  // the legend on the screen is built from the same list
  assert.match(sketch, /legendModel\(\{ sketch, overlay: null, t \}\)\.materials/);
  assert.match(sketch, /const \{ methods, contour, note \} = legendModel/);
});

test('texts: every key of the export exists in German and English; the JSON export texts are gone', () => {
  for (const lang of ['de', 'en']) {
    for (const key of ['ui.export.graphic', 'ui.export.graphicTitle', 'ui.export.png', 'ui.export.svg', 'ui.msg.exported', 'APP_EXPORT_FAILED']) {
      assert.ok(MESSAGES[lang][key] && MESSAGES[lang][key].trim() !== '', `${lang}:${key}`);
    }
    assert.ok(!('ui.export' in MESSAGES[lang]) && !('ui.export.title' in MESSAGES[lang]), `${lang}: old texts removed`);
    assert.match(MESSAGES[lang].APP_EXPORT_FAILED, /\{message\}/);
  }
  // every key written in index.html (data-i18n, -title, -aria-label) exists in both languages
  const keys = new Set([...html.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([\w.]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 30);
  for (const lang of ['de', 'en']) for (const k of keys) assert.ok(Object.hasOwn(MESSAGES[lang], k), `${lang}:${k}`);
});
