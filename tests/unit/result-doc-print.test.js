// Result document as a print view (SPEC_ETAPPE2 8.5): button, print area, print style sheet, wiring. The look of the
// pages is checked by hand (hand check: PDF of the print dialog); here the structure and the rules in the sources.

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
const css = read('app', 'style.css');
const printDoc = read('app', 'ui', 'print-doc.js');

test('index.html: "Ergebnisdokument" in the row of the tab list, locked at the start; the print area is a child of the body', () => {
  const head = html.slice(html.indexOf('class="output-head"'), html.indexOf('id="main-panels"'));
  assert.match(head, /<button[^>]*id="btn-doc"[^>]*\bdisabled\b/);
  assert.match(html, /<div id="print-doc" aria-hidden="true"><\/div>/);
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(body.indexOf('id="print-doc"') > body.indexOf('</main>'), 'after the main part, directly in the body');
  assert.doesNotMatch(html, /<script[^>]*>[^<]*print/, 'no script of its own for printing');
});

test('main.js: the button is usable with a result and not during a run; it waits for the slice table, then prints', () => {
  assert.match(main, /\$\('btn-doc'\)\.disabled = state\.result === null \|\| state\.running/);
  assert.match(main, /\$\('btn-doc'\)\.addEventListener\('click', openDocument\)/);
  const open = main.slice(main.indexOf('async function openDocument'), main.indexOf('function buildPrintDocument'));
  assert.match(open, /if \(state\.result === null \|\| state\.running\) return/);
  assert.ok(open.indexOf('await ensureSlices()') > 0 && open.indexOf('await ensureSlices()') < open.indexOf('window.print()'), 'waits first');
  // renderResult and setRunning both keep the button state
  assert.ok([...main.matchAll(/renderDocButton\(\);/g)].length >= 2);
});

test('main.js: the print area is filled before printing (also for Ctrl+P) and emptied after; without a result nothing is built', () => {
  assert.match(main, /window\.addEventListener\('beforeprint', buildPrintDocument\)/);
  assert.match(main, /window\.addEventListener\('afterprint', \(\) => clearPrintDocument\(\$\('print-doc'\)\)\)/);
  const build = main.slice(main.indexOf('function buildPrintDocument'), main.indexOf('// ---------- language and light/dark'));
  assert.match(build, /if \(state\.result === null\) return/);
  assert.match(build, /documentHead\(\{ model: state\.model, result: state\.result, method: state\.rs\.method/);
  assert.match(build, /documentTable\(\{ result: state\.result, method: state\.rs\.method, target: state\.rs\.target, slices: state\.rs\.slices/);
  assert.match(build, /prefixIds\(sketch\.pageSvg\(\)\.text, 'pd-'\)/, 'the graphic drawn again for the page (version 1.12), ids prefixed');
  // order 27 (SPEC_ETAPPE4 13a): the fixed note of SPEC_ETAPPE2 8.1 is gone; one line with the name, the kind of method and the licence instead
  assert.doesNotMatch(build, /ui\.result\.disclaimer/);
  assert.match(build, /licence: t\('ui\.doc\.licence', \{ url: LICENCE_URL \}\)/);
  // nothing of the page state is changed by printing
  assert.doesNotMatch(build, /dispatchResult|applyEdit|changeModel|mainTabs\.select|resultTabs\.select|sketch\.fit|setTheme|state\.status/);
});

test('slice table: calculated whichever tab is shown (so that the document and Ctrl+P have it), one request per surface, returns a promise', () => {
  const fn = main.slice(main.indexOf('function ensureSlices'), main.indexOf('/** Circles, contour and labels of the result in the sketch'));
  assert.doesNotMatch(fn, /mainTabs|resultTabs/, 'no condition on the tab');
  assert.match(fn, /if \(state\.running \|\| !state\.result\) return Promise\.resolve\(\)/);
  assert.match(fn, /slicesRequest = \{ key, promise \}/);
  assert.match(fn, /return ensureSlices\(\)/, 'asks again when the worker was replaced');
});

test('print style sheet: 15 mm margins, no paper size, the page is replaced by the document only when it is filled, always light', () => {
  const printStart = css.indexOf('/* ---------- result document: print view');
  assert.ok(printStart > 0);
  const sheet = css.slice(printStart);
  assert.match(sheet, /@page \{ margin: 15mm; \}/);
  assert.doesNotMatch(sheet.slice(sheet.indexOf('@page'), sheet.indexOf('@page') + 30), /size/, 'paper size and orientation come from the print dialog (version 1.11)');
  assert.match(sheet, /#print-doc \{ display: none; \}/, 'not on the screen');
  assert.match(sheet, /@media print \{/);
  assert.match(sheet, /body:has\(#print-doc:not\(:empty\)\) > :not\(#print-doc\) \{ display: none !important; \}/);
  assert.match(sheet, /#print-doc:not\(:empty\) \{[^}]*color-scheme: light/);
  assert.match(sheet, /\.pd-table thead \{ display: table-header-group; \}/, 'table head on every page');
  assert.match(sheet, /\.pd-table tr \{ break-inside: avoid; \}/, 'no row is split by a page break');
  assert.match(sheet, /\.pd-frame > tfoot \{ display: table-footer-group; \}/, 'footer on every page');
  assert.match(sheet, /\.pd-figure svg \{[^}]*width: 100%/, 'the graphic in the width of the page');
  // no colour literal in the rules (the test of the scaffold checks this for the whole file as well)
  assert.doesNotMatch(sheet, /#[0-9a-fA-F]{3,8}\b|\brgb\(/);
});

test('print-doc.js: head, graphic as SVG (vector), table with head group, footer in a footer group; emptied after printing', () => {
  assert.match(printDoc, /h\('h1', \{ text: head\.title \}\)/);
  assert.match(printDoc, /figure\.innerHTML = svgText/);
  assert.doesNotMatch(printDoc, /canvas|toDataURL|<img|\.png/i, 'no raster image');
  assert.match(printDoc, /h\('thead'/);
  assert.match(printDoc, /h\('tfoot'/);
  assert.match(printDoc, /texts\.licence/); // order 27 (SPEC_ETAPPE4 13a): the line "GroundSlide · LEM 2D · MIT-Lizenz <address>" replaces the note and the name
  assert.match(printDoc, /export function clearPrintDocument\(container\) \{\s*container\.replaceChildren\(\);/);
  // the document holds no list of inputs and no messages (8.5)
  assert.doesNotMatch(printDoc, /materials|layers|ground|messages|status/);
});

test('texts of the document exist in German and English', () => {
  for (const lang of ['de', 'en']) {
    for (const key of ['ui.export.doc', 'ui.export.docTitle', 'ui.doc.dateTime', 'ui.doc.method', 'ui.doc.slices', 'ui.doc.sketch', 'ui.doc.licence']) {
      assert.ok(MESSAGES[lang][key] && MESSAGES[lang][key].trim() !== '', `${lang}:${key}`);
    }
  }
  assert.equal(MESSAGES.de['ui.export.doc'], 'Ergebnisdokument');
  assert.equal(MESSAGES.de['ui.doc.licence'], 'GroundSlide · LEM 2D · MIT-Lizenz {url}');
  assert.equal(MESSAGES.en['ui.doc.licence'], 'GroundSlide · LEM 2D · MIT licence {url}');
  assert.equal(Object.hasOwn(MESSAGES.de, 'ui.result.disclaimer') || Object.hasOwn(MESSAGES.en, 'ui.result.disclaimer'), false, 'the fixed note is removed (SPEC_ETAPPE4 13a)');
});
