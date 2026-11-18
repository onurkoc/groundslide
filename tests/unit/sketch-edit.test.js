// Editing with the mouse in the sketch (SPEC_ETAPPE2 6.1): wiring of handles, drag, double click, input field, locking, export.
// The logic is in lib/handles.js (handles.test.js); here the sources are checked for the rules that need a browser to run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const sketch = read('app', 'ui', 'sketch.js');
const editor = read('app', 'ui', 'node-editor.js');
const main = read('app', 'main.js');
const css = read('app', 'style.css');

/** Source of `function name(...)` up to the closing brace at the same indent. */
function fn(source, name, indent = '') {
  const start = source.indexOf(`${indent}function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf(`\n${indent}}\n`, start));
}

test('handles are drawn on the screen only: render() adds them, paint() (used by the export too) does not', () => {
  assert.doesNotMatch(fn(sketch, 'paint', '  '), /drawHandles|buildHandles|handleList/);
  const render = fn(sketch, 'render', '  ');
  assert.match(render, /drawHandles\(svg, handleList\)/);
  assert.match(render, /edit && edit\.canEdit\(\) && modelRef/, 'no handles while locked (run)');
  assert.doesNotMatch(read('app', 'ui', 'sketch-export.js'), /handle/i);
  assert.match(sketch, /paint: \(target\) => \{ if \(sketch\.bounds\) paint\(target, exportView, area\); \}/);
});

test('press: a handle in the catch area is moved, beside it the view is panned; a movement under 3 px is no drag', () => {
  assert.match(sketch, /pickHandle\(handleList, sx, sy, toScreen\)/);
  assert.match(sketch, /kind: handle \? 'handle' : 'pan'/);
  assert.match(sketch, /Math\.hypot\(e\.clientX - drag\.startX, e\.clientY - drag\.startY\) < DRAG_MIN_PX\) return/);
  assert.match(sketch, /canvas\.setPointerCapture\(e\.pointerId\)/);
  // the move is allowed only when the page says so (not during a run); then it is one step from pressing to releasing
  assert.match(sketch, /if \(!edit \|\| !edit\.begin\(\)\)/);
  const end = sketch.slice(sketch.indexOf('const endDrag'), sketch.indexOf("canvas.addEventListener('pointerup'"));
  assert.match(end, /edit\.end\(\)/);
  assert.match(end, /finished\.kind === 'handle' && finished\.active/, 'pressing a handle without moving changes nothing');
});

test('drag: snapping only with the snap switch on (not the grid switch, version 1.12), to the grid width; the value goes into the model through setHandleValues', () => {
  assert.match(sketch, /const snapStep = \(\) => snapStepFor\(snapOn, gridChoice, view\.scale\)/);
  assert.doesNotMatch(sketch, /showGrid \?/, 'the grid switch has no effect on snapping');
  const move = fn(sketch, 'moveNode', '  ');
  assert.match(move, /dragValues\(handle, \{ x, z \}, snapStep\(\)\)/);
  assert.match(move, /edit\.change\(\(model\) => setHandleValues\(model, handle, values\)\)/);
  assert.match(move, /ui\.sketch\.coords/, 'the coordinate at the node while dragging');
  assert.doesNotMatch(move, /Math\.max|Math\.min|clamp/, 'nothing is limited or corrected');
});

test('double click: handle -> input field, line -> insert a point, free space -> nothing; the double click does not pan or zoom', () => {
  const body = sketch.slice(sketch.indexOf("canvas.addEventListener('dblclick'"), sketch.indexOf('// keyboard: arrows pan'));
  assert.match(body, /e\.preventDefault\(\)/);
  assert.match(body, /if \(handle\) \{\s*openEditor\(handle\);\s*return;\s*\}/);
  assert.match(body, /if \(!hitSegment\(lineTargets\(modelRef\), sx, sy, toScreen\)\) return/, 'free space: nothing');
  assert.match(body, /edit\.commit\(/, 'inserting is one step');
  assert.match(body, /insertOnSegment\(hit, x, step\)/);
  assert.match(body, /const step = snapStep\(\)/);
  const open = fn(sketch, 'openEditor', '  ');
  assert.match(open, /editFields\(handle\)/);
  assert.match(open, /canDeleteHandle\(handle\)/);
  assert.match(open, /edit\.commit\(\(model\) => setHandleValues\(model, handle, values\)\)/);
  assert.match(open, /edit\.commit\(\(model\) => deleteHandlePoint\(model, handle\)\)/);
  assert.match(open, /canvas\.focus\(\)/, 'back to the sketch afterwards');
});

test('input field: Enter takes over, Esc and a click beside it discard, numbers as in 5.3, no snapping, focus in the first field', () => {
  assert.match(editor, /e\.key === 'Enter' && e\.target\.matches\('input'\)/);
  assert.match(editor, /e\.key === 'Escape'/);
  assert.match(editor, /document\.addEventListener\('pointerdown', outside, true\)/);
  assert.match(editor, /parseNumber\(input\.value\)/);
  assert.match(editor, /parsed\.ok && parsed\.value !== null/, 'an empty field is not a number either');
  assert.match(editor, /t\('APP_NUMBER_INVALID'\)/);
  assert.match(editor, /aria-invalid/);
  assert.match(editor, /inputs\[0\]\.input\.focus\(\)/);
  assert.match(editor, /formatNumber\(f\.value\)/, 'the value unrounded');
  assert.doesNotMatch(editor, /snapValue|gridStep/, 'no snapping in the input field');
  assert.match(editor, /unit', text: 'm'/);
  // an unreadable number: the field stays open, nothing is taken over
  const apply = editor.slice(editor.indexOf('function apply()'), editor.indexOf('// a form with two text fields'));
  assert.ok(apply.indexOf('first.focus()') < apply.indexOf('onApply(values)'));
  assert.match(apply, /if \(first\) \{[^}]*return;/s);
});

test('main.js: the mouse changes the model in the same way as the input; locked during a run; one history step per move', () => {
  assert.match(main, /canEdit: \(\) => !state\.running && state\.model !== null/);
  assert.match(main, /edit: sketchEdit/);
  const begin = main.slice(main.indexOf('begin() {'), main.indexOf('change(mutate)'));
  assert.match(begin, /if \(state\.running \|\| !state\.model\) return false/);
  assert.match(begin, /moveBefore = snapshotModel\(state\.model\)/);
  const end = main.slice(main.indexOf('end() {'), main.indexOf('commit(mutate)'));
  assert.match(end, /history\.record\(moveBefore\)/);
  assert.match(end, /snapshotModel\(state\.model\) !== moveBefore/, 'a move that changed nothing is no step');
  assert.match(end, /runValidation\(\)/, 'the error of an invalid position shows at once at the end');
  assert.match(main.slice(main.indexOf('change(mutate) {'), main.indexOf('end() {')), /scheduleValidation\(false\)/);
  assert.match(main, /sketch\.redraw\(\); \/\/ the handles are locked during a run/);
  // the input areas follow, at most once per frame
  assert.match(main, /requestAnimationFrame\(/);
});

test('style: handles and the input field use CSS variables for their colours (light and dark)', () => {
  assert.match(css, /--handle-fill: light-dark\(/);
  assert.match(css, /--handle-stroke: light-dark\(/);
  assert.match(css, /\.sk-handle \{[^}]*var\(--handle-fill\)[^}]*var\(--handle-stroke\)/);
  assert.match(css, /\.node-editor \{[^}]*var\(--color-surface\)/);
});

test('texts of editing exist in German and English; the hint of the tool bar names the new operations', () => {
  for (const lang of ['de', 'en']) {
    for (const key of ['ui.edit.dialog', 'ui.edit.hint', 'ui.edit.deletePoint', 'ui.edit.readoutX', 'ui.edit.readoutR', 'ui.sketch.hint', 'APP_NUMBER_INVALID']) {
      assert.ok(MESSAGES[lang][key] && MESSAGES[lang][key].trim() !== '', `${lang}:${key}`);
    }
  }
  assert.match(MESSAGES.de['ui.sketch.hint'], /Mausrad: Zoom\. Ziehen: Verschieben\./);
  assert.match(MESSAGES.de['ui.sketch.hint'], /Doppelklick/);
  assert.match(MESSAGES.en['ui.sketch.hint'], /Double click/);
  assert.equal(MESSAGES.de['ui.edit.deletePoint'], 'Punkt löschen');
});
