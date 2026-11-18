// Sketch fills the height (SPEC_ETAPPE2 1.3, 6, version 1.8): checks of the style sheet and of the wiring that need no
// browser. The behaviour of the view when the size changes is tested in view.test.js (resizeView).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const css = read('app', 'style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const sketch = read('app', 'ui', 'sketch.js');

/** The text between the braces of the first rule whose selector is exactly `selector`. */
function rule(selector) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `rule ${selector}`);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}
const mobileStart = css.indexOf('@media (max-width: 899.98px)');
assert.ok(mobileStart > 0);
const desktop = css.slice(0, mobileStart);
const mobile = css.slice(mobileStart, css.indexOf('\n}\n', mobileStart));

test('from 900 px: the page fills the window and does not scroll as a whole; input and result scroll for themselves', () => {
  assert.match(rule('body'), /height:\s*100dvh/);
  assert.match(rule('body'), /overflow:\s*hidden/);
  assert.match(rule('body'), /flex-direction:\s*column/);
  assert.match(rule('.layout'), /flex:\s*1 1 auto/);
  assert.match(rule('.layout'), /min-height:\s*0/);
  assert.doesNotMatch(rule('.layout'), /\n\s*height:/, 'no height calculated from the header height');
  assert.match(rule('.inputs,\n.output'), /overflow:\s*auto/);
  assert.match(desktop, /\.area-result \.result-panels \{[^}]*overflow:\s*auto/, 'the tab Result scrolls for itself');
  assert.match(desktop, /\.output \{ overflow: hidden; \}/, 'the tab Sketch does not scroll');
});

test('the drawing area has no fixed height: it takes what tool bar and legends leave', () => {
  const canvas = rule('.sketch-canvas');
  assert.match(canvas, /flex:\s*1 1 0/);
  assert.doesNotMatch(canvas, /(^|[\s;])height:/, 'no height (px, rem, vh, clamp) on the drawing area');
  assert.match(canvas, /min-height:/);
});

test('below 900 px: input above the tabs, the page scrolls, the drawing area is at least 360 px high', () => {
  assert.match(mobile, /body \{[^}]*height:\s*auto[^}]*overflow:\s*visible/s);
  assert.match(mobile, /\.layout \{\s*display:\s*block/);
  assert.match(mobile, /\.sketch-canvas \{[^}]*height:\s*clamp\(360px[^}]*min-height:\s*360px/);
  assert.match(mobile, /\.area-result \.result-panels \{ overflow:\s*visible/);
});

test('the view keeps scale and centre when the size of the drawing area changes (resizeView), also from a hidden tab', () => {
  assert.match(sketch, /import \{[^}]*\bresizeView\b[^}]*\} from '\.\.\/lib\/view\.js'/);
  const setSize = sketch.slice(sketch.indexOf('function setSize'), sketch.indexOf('/** Fit the whole model'));
  assert.match(setSize, /const usable = width > 0 && height > 0/);
  assert.match(setSize, /resizeView\(view, lastSize, size\)/);
  // a hidden area (size 0) must not change the view: resizeView is only called with a usable size
  assert.match(setSize, /if \(usable\) \{[^}]*resizeView/s);
  // the observer only reports the size; it never fits
  const observer = sketch.slice(sketch.indexOf('new ResizeObserver'), sketch.indexOf('.observe(canvas)'));
  assert.match(observer, /setSize\(r\.width, r\.height\)/);
  assert.doesNotMatch(observer, /fit\(/);
});

test('tabs.js handles only the direct panels of its container (two tab levels)', () => {
  assert.match(read('app', 'ui', 'tabs.js'), /querySelectorAll\(':scope > \[role="tabpanel"\]'\)/);
});
