// Helpers of the graphic export (SPEC_ETAPPE2 8.4): colours of computed styles as fixed values, flow layout of the
// legend, check that an SVG text is complete by itself. The drawing itself needs a browser (see the hand check).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCssColor, pxNumber, dashArray, flowLayout, standaloneProblems, prefixIds, PNG_SCALE, EXPORT_FONT } from '../../app/lib/svg-export.js';

test('parseCssColor: rgb and rgba in every syntax a browser reports -> #rrggbb and opacity', () => {
  assert.deepEqual(parseCssColor('rgb(43, 49, 64)'), { color: '#2b3140', opacity: 1 });
  assert.deepEqual(parseCssColor('rgb(43 49 64)'), { color: '#2b3140', opacity: 1 });
  assert.deepEqual(parseCssColor('rgba(29, 94, 216, 0.14)'), { color: '#1d5ed8', opacity: 0.14 });
  assert.deepEqual(parseCssColor('rgb(29 94 216 / 0.14)'), { color: '#1d5ed8', opacity: 0.14 });
  assert.deepEqual(parseCssColor('rgb(29 94 216 / 14%)'), { color: '#1d5ed8', opacity: 0.14 });
  assert.deepEqual(parseCssColor('RGB(255, 255, 255)'), { color: '#ffffff', opacity: 1 });
  assert.deepEqual(parseCssColor('rgba(0, 0, 0, 0)'), { color: '#000000', opacity: 0 });
  assert.deepEqual(parseCssColor('color(srgb 1 0 0.5 / 0.5)'), { color: '#ff0080', opacity: 0.5 });
});

test('parseCssColor: none and transparent; things it does not know give null (the export then refuses to write)', () => {
  assert.deepEqual(parseCssColor('none'), { color: 'none', opacity: 1 });
  assert.deepEqual(parseCssColor('transparent'), { color: 'none', opacity: 1 });
  for (const bad of ['var(--x)', 'light-dark(#fff, #000)', 'url(#g)', 'hsl(0 0% 0%)', 'color(display-p3 1 0 0)', 'rgb(a, b, c)', 'rgb(1, 2)', '', null, undefined]) {
    assert.equal(parseCssColor(bad), null, String(bad));
  }
});

test('pxNumber and dashArray: computed lengths as plain numbers', () => {
  assert.equal(pxNumber('1.75px'), '1.75');
  assert.equal(pxNumber('12px'), '12');
  assert.equal(pxNumber('0.6'), '0.6');
  assert.equal(pxNumber('-2px'), '-2');
  assert.equal(pxNumber('auto'), null);
  assert.equal(pxNumber('2em'), null);
  assert.equal(dashArray('8px, 3px'), '8 3');
  assert.equal(dashArray('9px, 3px, 2px, 3px'), '9 3 2 3');
  assert.equal(dashArray('1px 4px'), '1 4');
  assert.equal(dashArray('none'), null);
  assert.equal(dashArray(''), null);
  assert.equal(dashArray('5%'), null);
});

test('flowLayout: items left to right, a new row when the next one would end behind the width', () => {
  assert.deepEqual(flowLayout([], 100, 10), { positions: [], rows: 0 });
  assert.deepEqual(flowLayout([40], 100, 10), { positions: [{ x: 0, row: 0 }], rows: 1 });
  const three = flowLayout([40, 40, 40], 100, 10);
  assert.deepEqual(three.positions, [{ x: 0, row: 0 }, { x: 50, row: 0 }, { x: 0, row: 1 }]);
  assert.equal(three.rows, 2);
  // an item that fits exactly stays in the row
  assert.deepEqual(flowLayout([45, 45], 100, 10).positions.map((p) => p.row), [0, 0]);
  // an item wider than the row stands alone, the next one starts a new row
  const wide = flowLayout([30, 200, 30], 100, 10);
  assert.deepEqual(wide.positions, [{ x: 0, row: 0 }, { x: 0, row: 1 }, { x: 0, row: 2 }]);
  // nothing overlaps: in one row, every item starts behind the end of the one before (plus the gap)
  const widths = [34, 71, 12, 88, 40, 40, 40, 5, 90];
  const { positions } = flowLayout(widths, 160, 6);
  for (let i = 1; i < widths.length; i++) {
    if (positions[i].row === positions[i - 1].row) assert.ok(positions[i].x >= positions[i - 1].x + widths[i - 1] + 6, `item ${i}`);
    assert.ok(positions[i].row >= positions[i - 1].row);
  }
});

const GOOD = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="870" height="540" viewBox="0 0 870 540"><defs><clipPath id="a"><rect width="5" height="5"/></clipPath></defs><g clip-path="url(#a)"><rect fill="#fff" stroke="none" width="5" height="5"/></g></svg>';

test('standaloneProblems: a complete SVG has none', () => {
  assert.deepEqual(standaloneProblems(GOOD), []);
  assert.deepEqual(standaloneProblems(GOOD.replace('<?xml version="1.0" encoding="UTF-8"?>\n', '')), []);
});

test('standaloneProblems: root element needs xmlns, width, height and viewBox', () => {
  assert.deepEqual(standaloneProblems('<g/>'), ['no <svg> element']);
  assert.deepEqual(standaloneProblems(''), ['no <svg> element']);
  assert.ok(standaloneProblems(GOOD.replace(' xmlns="http://www.w3.org/2000/svg"', '')).includes('xmlns missing'));
  assert.ok(standaloneProblems(GOOD.replace(' width="870"', '')).includes('width missing'));
  assert.ok(standaloneProblems(GOOD.replace(' height="540"', '')).includes('height missing'));
  assert.ok(standaloneProblems(GOOD.replace(' viewBox="0 0 870 540"', '')).includes('viewBox missing'));
});

test('standaloneProblems: no CSS variables, no classes, no style sheet, no outside references, no new colour syntax', () => {
  const withInside = (extra) => GOOD.replace('<g clip-path', `${extra}<g clip-path`);
  const cases = [
    ['<rect fill="var(--mat-1)"/>', 'CSS variable var(--'],
    ['<rect style="fill: var(--x)"/>', 'CSS variable var(--'],
    ['<rect class="sk-mat mat-0"/>', 'class attribute'],
    ['<rect fill="light-dark(#fff, #000)"/>', 'light-dark()'],
    ['<rect fill="color-mix(in srgb, red, blue)"/>', 'color-mix()'],
    ['<rect fill="color(srgb 1 0 0)"/>', 'color(srgb …)'],
    ['<style>.a{fill:red}</style>', '<style> element'],
    ['<image href="a.png"/>', 'image, foreignObject or script'],
    ['<foreignObject><div/></foreignObject>', 'image, foreignObject or script'],
    ['<use href="other.svg#x"/>', 'reference to something outside the file'],
    ['<rect fill="url(http://x/y.svg#g)"/>', 'url() that does not point inside the file'],
  ];
  for (const [extra, what] of cases) assert.ok(standaloneProblems(withInside(extra)).includes(what), `${extra} -> ${what}`);
  // references inside the file are fine
  assert.deepEqual(standaloneProblems(withInside('<use href="#a"/><rect fill="url(#a)"/>')), []);
});

test('constants: PNG is twice the screen, the font list has no web font', () => {
  assert.equal(PNG_SCALE, 2);
  assert.doesNotMatch(EXPORT_FONT, /url\(|@/);
  assert.match(EXPORT_FONT, /sans-serif$/);
});

test('prefixIds: ids and the references to them get the prefix (an SVG next to another one with the same ids)', () => {
  const text = '<svg><defs><clipPath id="sk-clip"><rect/></clipPath><clipPath id="ex-area"><rect/></clipPath></defs><g clip-path="url(#sk-clip)"/><g clip-path="url(#ex-area)"/><use href="#sk-clip"/></svg>';
  const out = prefixIds(text, 'pd-');
  assert.equal(out, '<svg><defs><clipPath id="pd-sk-clip"><rect/></clipPath><clipPath id="pd-ex-area"><rect/></clipPath></defs><g clip-path="url(#pd-sk-clip)"/><g clip-path="url(#pd-ex-area)"/><use href="#pd-sk-clip"/></svg>');
  assert.equal(prefixIds(out, 'x-'), out.replaceAll('pd-', 'x-pd-'), 'applying it again prefixes again, nothing breaks');
  assert.equal(prefixIds('<svg/>', 'pd-'), '<svg/>');
  assert.equal(prefixIds('', 'pd-'), '');
  // still standalone after the change
  const good = '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5" viewBox="0 0 5 5"><clipPath id="a"/><g clip-path="url(#a)"/></svg>';
  assert.deepEqual(standaloneProblems(prefixIds(good, 'pd-')), []);
});
