// Operating hint of the sketch as a tooltip (SPEC_ETAPPE2 6, version 1.12): no line of text in the bar, a "?" button that
// shows the text on mouse over and on keyboard focus; same text in German and English. The page needs a browser; the
// sources are checked here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const read = (file) => readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const sketch = read('ui/sketch.js');
const css = read('style.css');

test('the hint is no longer a line in the bar; a "?" button carries it', () => {
  assert.doesNotMatch(sketch, /class: 'hint sketch-hint'/);
  assert.match(sketch, /\n {6}helpTip\.element,/, 'the button is part of the bar');
  const tip = sketch.slice(sketch.indexOf('function createHelpTip()'), sketch.indexOf('const helpTip = createHelpTip()'));
  assert.match(sketch, /helpTip\.setText\(t\('ui\.sketch\.hint'\)\)/, 'the text of the hint, in the language of the interface');
  assert.match(tip, /type: 'button'/, 'a button: reachable with Tab');
  assert.match(tip, /'aria-label', text/, 'accessible name = the text');
  assert.match(tip, /text: '\?'/);
  assert.match(tip, /Escape/, 'the tooltip can be dismissed');
  assert.match(tip, /mouseenter/);
  assert.match(tip, /'focus'/, 'keyboard focus shows it');
});

test('hidden tooltip is out of the layout (no scroll bar from it); shown tooltip is fixed and placed inside the window (version 1.13)', () => {
  assertTipRules(css);
  const tip = sketch.slice(sketch.indexOf('function createHelpTip()'), sketch.indexOf('const helpTip = createHelpTip()'));
  assert.match(tip, /placeTooltip\(\{ anchor: a, tip: \{ width: box\.width, height: box\.height \}, viewport: view \}\)/);
  assert.match(tip, /tooltipMaxWidth\(view\.width\)/);
  assert.match(tip, /document\.documentElement\.clientWidth/, 'the visible window without the scroll bar');
  assert.match(tip, /addEventListener\('resize'/);
  // the bar is rebuilt often: the tooltip is built once, so listeners are not added again and again and the focus stays
  assert.equal((sketch.match(/createHelpTip\(\)/g) || []).length, 2, 'defined once, called once');
});

/** The rules that keep the hidden tooltip out of the overflow of every element and the shown one out of every clip. */
function assertTipRules(sheet) {
  const rule = sheet.slice(sheet.indexOf('.sketch-help-tip {'), sheet.indexOf('.sketch-coords {'));
  assert.match(rule, /display: none;/, 'hidden: not in the layout, so it adds nothing to scrollWidth (visibility: hidden would)');
  assert.match(rule, /position: fixed;/, 'not cut off by a parent with overflow');
  assert.doesNotMatch(rule, /visibility: hidden|opacity: 0/, 'no hiding that leaves the box in the layout');
  assert.match(rule, /max-width: min\(26rem, calc\(100vw - 16px\)\)/, 'never wider than the window');
  assert.match(rule, /background: var\(--color-surface\)/);
  assert.match(rule, /color: var\(--color-text\)/, 'colours from the variables that follow light and dark');
  assert.doesNotMatch(rule, /#[0-9a-f]{3,6}\b|rgb\(/i, 'no fixed colours');
  assert.match(sheet, /\.sketch-help\.is-open \.sketch-help-tip \{ display: block; \}/);
  assert.doesNotMatch(sheet, /\.sketch-help:hover|\.sketch-help:focus-within/, 'state is set by the script, not by :hover');
}

test('the rule of the old state (1.12) is caught by the check: visibility/opacity hiding, position absolute', () => {
  const old = readFileSync(path.join(root, 'style.css'), 'utf8').replaceAll('\r\n', '\n').replace(
    /\.sketch-help-tip \{[^}]*\}/,
    '.sketch-help-tip { position: absolute; top: calc(100% + 6px); left: 0; width: max-content; max-width: min(26rem, 80vw); background: var(--color-surface); color: var(--color-text); visibility: hidden; opacity: 0; }',
  );
  assert.throws(() => assertTipRules(old));
});

test('hint text unchanged, German and English', () => {
  assert.equal(MESSAGES.de['ui.sketch.hint'], 'Mausrad: Zoom. Ziehen: Verschieben. Griff ziehen: Knoten bewegen. Doppelklick: Wert eingeben, auf einer Linie Punkt einfügen.');
  assert.equal(MESSAGES.en['ui.sketch.hint'], 'Mouse wheel: zoom. Drag: pan. Drag a handle: move the node. Double click: enter a value, on a line insert a point.');
});
