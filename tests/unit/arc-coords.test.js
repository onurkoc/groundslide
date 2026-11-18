// Order 29 (SPEC_ETAPPE4 13b): the arc of a circle in the result document (the view of paint), the display of the coordinates inside the drawing area.
// No DOM: the pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arcPathData } from '../../app/lib/result-sketch.js';
import { worldToScreen, fitView } from '../../app/lib/view.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

// ------------------------------------------------------------ 1 the arc in a view other than the screen's

test('the arc is made for the view it is given: start and end of the path are worldToScreen of this view at entry and exit', () => {
  const circle = { xc: 45.77, zc: 71.96, R: 42.175 };
  const entry = [81.78, 50];
  const exit = [50.0, 30.0];
  const screen = { scale: 5.69, x0: -20, z0: 125 };
  const page = fitView({ xMin: 0, xMax: 130, zMin: 0, zMax: 120 }, { width: 680, height: 330 }); // the document graphic: another size and scale
  assert.notDeepEqual(page, screen);
  for (const view of [screen, page]) {
    const d = arcPathData(view, circle, entry, exit);
    const m = d.match(/^M([-\d.]+),([-\d.]+)A([-\d.]+),([-\d.]+) 0 0 0 ([-\d.]+),([-\d.]+)$/);
    assert.ok(m, d);
    const [x1, y1] = worldToScreen(view, exit[0], exit[1]); // the left point first
    const [x2, y2] = worldToScreen(view, entry[0], entry[1]);
    assert.deepEqual([Number(m[1]), Number(m[2]), Number(m[5]), Number(m[6])], [Number(x1.toFixed(2)), Number(y1.toFixed(2)), Number(x2.toFixed(2)), Number(y2.toFixed(2))]);
    assert.equal(Number(m[3]), Number((circle.R * view.scale).toFixed(2)), 'radius in pixels of this view');
  }
  // the two paths differ: a view of the screen must not be used for the page
  assert.notEqual(arcPathData(screen, circle, entry, exit), arcPathData(page, circle, entry, exit));
  // order of entry and exit does not matter; unusable data and a radius above the limit give null
  assert.equal(arcPathData(screen, circle, exit, entry), arcPathData(screen, circle, entry, exit));
  assert.equal(arcPathData(screen, circle, null, exit), null);
  assert.equal(arcPathData(null, circle, entry, exit), null);
  assert.equal(arcPathData(screen, circle, entry, exit, 10), null);
});

test('sketch.js: every call of arcPath hands over the view of paint; the functions that paint() calls use their own parameter `view`, not the one of the module', () => {
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /const arcPath = \(view, c, entry, exit\) => arcPathData\(view, c, entry, exit, MAX_CIRCLE_PX\);/);
  const calls = [...sketch.matchAll(/arcPath\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => !a.startsWith('view, c, entry'));
  assert.equal(calls.length, 3, 'searchCircle, the circles of the methods, the single circles');
  for (const args of calls) assert.ok(args.startsWith('view,'), args);
  // functions between "drawLoads" and the end of paint(): when they use the view they take it as a parameter (the module's `view` is the screen's)
  const region = sketch.slice(sketch.indexOf('  function drawLoads('), sketch.indexOf('  function setSize('));
  const screenOnly = ['render', 'drawPreview', 'drawHandles', 'paint'];
  for (const m of region.matchAll(/\n {2}function (\w+)\(([^)]*)\) \{([\s\S]*?)\n {2}\}\n/g)) {
    const [, name, params, body] = m;
    if (screenOnly.includes(name)) continue;
    if (/worldToScreen\(view|pts\(view|view\.scale/.test(body)) assert.match(params, /\bview\b/, `${name} uses the view: it must be a parameter`);
  }
  // paint() itself passes its view on to every drawing function that needs it
  const paint = sketch.slice(sketch.indexOf('  function paint('), sketch.indexOf('  function setSize('));
  for (const call of ['drawGridLines(svg, view, size)', 'drawContour(svg, view)', 'drawSlipBody(svg, view)', 'drawLoads(loadsLayer, view)', 'drawSupports(svg, view)', 'drawResultCircles(svg, view, labels)', 'drawCracks(svg, view)', 'drawSupportPoints(svg, view, labels)', 'drawAxes(svg, view, size)']) {
    assert.ok(paint.includes(call), call);
  }
  assert.doesNotMatch(paint, /arcPath\((?!view)/);
});

// ------------------------------------------------------------ 2 coordinates inside the drawing area

test('coordinates: inside the drawing area at the top right, lightly backed; not in the bar; the last value stays when the pointer leaves; empty until the first move', () => {
  const sketch = read('app', 'ui', 'sketch.js');
  const css = read('app', 'style.css');
  assert.match(sketch, /canvas\.append\(drawNote, coords\);/);
  const bar = sketch.slice(sketch.indexOf('bar.replaceChildren('), sketch.indexOf('if (methodHadFocus'));
  assert.doesNotMatch(bar, /\bcoords\b/, 'no longer a part of the bar: the area cannot change its size');
  // the pointer leaving does not clear the text; only the first move (and a new model without bounds) sets or clears it
  const leave = sketch.slice(sketch.indexOf("canvas.addEventListener('pointerleave'"), sketch.indexOf("canvas.addEventListener('click'"));
  assert.doesNotMatch(leave, /coords/);
  assert.match(sketch, /coords\.textContent = sketch\.bounds \? t\('ui\.sketch\.coords'/);
  assert.equal([...sketch.matchAll(/coords\.textContent =/g)].length, 1, 'set in showCoords only');
  const move = sketch.slice(sketch.indexOf("canvas.addEventListener('pointermove'"), sketch.indexOf('if (!drag && drawing)'));
  assert.match(move, /showCoords\(e\);/);
  const rule = css.match(/\.sketch-coords \{[^}]*\}/)[0];
  assert.match(rule, /position: absolute;/);
  assert.match(rule, /top: var\(--space-2\);/);
  assert.match(rule, /right: var\(--space-2\);/);
  assert.match(rule, /background: color-mix\(in srgb, var\(--color-surface\)/, 'lightly backed with the surface colour: light and dark');
  assert.match(rule, /pointer-events: none;/);
  assert.match(css, /\.sketch-coords:empty \{ display: none; \}/, 'invisible before the first move');
  assert.doesNotMatch(css, /\.sketch-coords \{[^}]*margin-left: auto/);
  // not in the export and the document: paint() and the SVG export know nothing of it
  const paint = sketch.slice(sketch.indexOf('  function paint('), sketch.indexOf('  function setSize('));
  assert.doesNotMatch(paint, /coords/);
  assert.doesNotMatch(read('app', 'ui', 'sketch-export.js'), /coords/);
});

