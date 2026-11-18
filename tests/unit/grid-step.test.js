// Grid width of the sketch (SPEC_ETAPPE2 6, "Gitterweite"): choice, step for snapping, lines that are drawn, snapping.

import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_CHOICES, MIN_LINE_PX, isGridChoice, gridStep, snapStepFor, snapValue, lineStride, gridLines } from '../../app/lib/grid-step.js';
import { dragValues } from '../../app/lib/handles.js';
import { tickStep, viewTicks } from '../../app/lib/axes.js';

test('choices: Auto first, then 0.1, 0.2, 0.5, 1, 2, 5, 10 m', () => {
  assert.deepEqual(GRID_CHOICES, ['auto', 0.1, 0.2, 0.5, 1, 2, 5, 10]);
  for (const c of GRID_CHOICES) assert.ok(isGridChoice(c));
  for (const c of [0, 3, '1', 'x', null, undefined, NaN]) assert.equal(isGridChoice(c), false, String(c));
});

test('step: a fixed width is the width, "auto" is the step of the axes at this scale (follows the zoom)', () => {
  for (const c of GRID_CHOICES.slice(1)) assert.equal(gridStep(c, 7), c);
  for (const scale of [0.5, 3, 12.5, 100, 4000]) assert.equal(gridStep('auto', scale), tickStep(scale));
  assert.notEqual(gridStep('auto', 1), gridStep('auto', 100), 'another zoom, another step');
  assert.equal(gridStep('unknown', 10), tickStep(10), 'an unknown choice counts as auto');
  assert.equal(gridStep(3, 10), tickStep(10), 'a width that is not offered counts as auto');
});

test('snapValue: nearest multiple, also for negative values and on the half', () => {
  assert.equal(snapValue(12.34, 0.5), 12.5);
  assert.equal(snapValue(12.2, 0.5), 12);
  assert.equal(snapValue(-12.34, 0.5), -12.5);
  assert.equal(snapValue(-12.2, 0.5), -12);
  assert.equal(snapValue(7.4, 1), 7);
  assert.equal(snapValue(7.6, 1), 8);
  assert.equal(snapValue(-7.6, 1), -8);
  assert.equal(snapValue(23, 5), 25);
  assert.equal(snapValue(22, 5), 20);
  assert.equal(snapValue(-23, 5), -25);
  assert.equal(snapValue(46, 10), 50);
  assert.equal(snapValue(0.34, 0.2), 0.4);
  assert.equal(snapValue(-0.34, 0.2), -0.4);
  assert.equal(snapValue(0, 0.1), 0);
});

test('snapValue: width 0.1 gives no remainders of floating point arithmetic (0.30000000000000004, 0.7000000000000001, ...)', () => {
  assert.equal(0.1 * 3, 0.30000000000000004, 'what the plain multiplication gives');
  assert.equal(snapValue(0.31, 0.1), 0.3);
  assert.equal(snapValue(0.69, 0.1), 0.7);
  assert.equal(snapValue(1.23, 0.1), 1.2);
  assert.equal(snapValue(-0.31, 0.1), -0.3);
  // every multiple of every width, with a little noise around it: the exact decimal number, with its short text
  for (const step of GRID_CHOICES.slice(1)) {
    const decimals = step < 1 ? 1 : 0;
    for (let k = -300; k <= 300; k++) {
      for (const noise of [0, 1e-9, -1e-9, step * 0.3, -step * 0.3]) {
        const value = snapValue(k * step + noise, step);
        assert.equal(value, Number((k * step).toFixed(decimals)), `${k} * ${step} + ${noise}`);
        assert.ok(String(value).length <= 12, `${value} has remainders`);
        assert.ok(!Object.is(value, -0), 'no negative zero');
      }
    }
  }
  // large coordinates
  assert.equal(snapValue(123456.789, 0.1), 123456.8);
  assert.equal(snapValue(-123456.789, 0.1), -123456.8);
});

test('snapValue: no negative zero; no snapping for values or steps that cannot be used', () => {
  assert.ok(Object.is(snapValue(-0.04, 0.1), 0));
  assert.ok(Object.is(snapValue(-0.2, 1), 0));
  assert.equal(snapValue(5.5, 0), 5.5);
  assert.equal(snapValue(5.5, -1), 5.5);
  assert.equal(snapValue(5.5, NaN), 5.5);
  assert.ok(Number.isNaN(snapValue(NaN, 1)));
  assert.equal(snapValue(Infinity, 1), Infinity);
});

test('snapValue: the width of "auto" (1, 2, 5 times a power of ten, also small) gives clean numbers too', () => {
  for (let e = -2; e <= 4; e += 0.1) {
    const scale = 10 ** e;
    const step = tickStep(scale);
    const snapped = snapValue(12.3456789, step);
    assert.equal(Math.round(snapped / step) * step === snapped || Math.abs(snapped / step - Math.round(snapped / step)) < 1e-9, true, `scale ${scale}`);
    assert.ok(String(snapped).length <= 12, `scale ${scale}: ${snapped}`);
  }
});

test('lineStride: every line while they are at least 8 px apart, else every 2nd, 5th, 10th, ... line', () => {
  assert.equal(MIN_LINE_PX, 8);
  assert.equal(lineStride(1, 100), 1);
  assert.equal(lineStride(1, 8), 1, 'exactly 8 px is enough');
  assert.equal(lineStride(1, 7.9), 2);
  assert.equal(lineStride(1, 4), 2);
  assert.equal(lineStride(1, 3), 5, '2 * 3 = 6 px is too close, 5 * 3 = 15 px');
  assert.equal(lineStride(1, 1), 10);
  assert.equal(lineStride(1, 0.3), 50);
  assert.equal(lineStride(0.1, 20), 5, '0.1 m at 20 px/m is 2 px: every 5th line is 10 px');
  assert.equal(lineStride(0.1, 1000), 1);
  assert.equal(lineStride(10, 0.5), 2);
  // never closer than 8 px, and the next smaller factor would be too close
  const series = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const step of [0.1, 0.2, 0.5, 1, 2, 5, 10]) {
    for (let e = -3; e <= 4; e += 0.1) {
      const scale = 10 ** e;
      const k = lineStride(step, scale);
      assert.ok(step * k * scale >= MIN_LINE_PX - 1e-9, `${step} @ ${scale}`);
      const i = series.indexOf(k);
      if (i > 0) assert.ok(step * series[i - 1] * scale < MIN_LINE_PX, `${step} @ ${scale}: ${series[i - 1]} would do`);
    }
  }
  assert.equal(lineStride(0, 10), 1);
  assert.equal(lineStride(1, 0), 1);
});

const AREA = { width: 600, height: 400 };

test('gridLines "auto": the lines of the axes, one per mark, stride 1, the step follows the zoom', () => {
  for (const view of [{ scale: 10, x0: -20, z0: 50 }, { scale: 3.3, x0: 7.7, z0: 120 }, { scale: 500, x0: 0.1, z0: 0.3 }]) {
    const lines = gridLines(view, AREA, 'auto');
    const ticks = viewTicks(view, AREA);
    assert.equal(lines.step, ticks.step);
    assert.equal(lines.stride, 1);
    assert.deepEqual(lines.x, ticks.x.map((m) => m.px));
    assert.deepEqual(lines.z, ticks.z.map((m) => m.px));
  }
});

test('gridLines fixed width: lines at multiples of the width inside the area, positions in pixels', () => {
  const view = { scale: 100, x0: 0.25, z0: 3.1 }; // 100 px per metre, 0.5 m is 50 px
  const lines = gridLines(view, AREA, 0.5);
  assert.equal(lines.step, 0.5);
  assert.equal(lines.stride, 1);
  // vertical lines at x = 0.5, 1, 1.5, ... : (x - x0) * scale
  assert.ok(Math.abs(lines.x[0] - 25) < 1e-9, String(lines.x[0]));
  assert.ok(lines.x.every((px, i) => i === 0 || Math.abs(px - lines.x[i - 1] - 50) < 1e-9));
  assert.ok(lines.x.every((px) => px >= 0 && px <= AREA.width));
  // horizontal lines at z = ..., 2.5, 3: (z0 - z) * scale, z0 = 3.1 -> the line at 3.0 is 10 px from the top
  assert.ok(Math.abs(lines.z.at(-1) - 10) < 1e-9, String(lines.z.at(-1))); // the values ascend, so the pixels descend
  assert.ok(lines.z.every((px) => px >= 0 && px <= AREA.height));
  // the lines of the same width and zoom are the same whether the choice says 0.5 or the axes step happens to be 0.5
  const auto = gridLines({ scale: 150, x0: 0, z0: 0 }, AREA, 'auto');
  assert.equal(auto.step, 0.5);
  assert.deepEqual(gridLines({ scale: 150, x0: 0, z0: 0 }, AREA, 0.5).x, auto.x);
});

test('gridLines fixed width, too close: every 2nd, 5th, 10th ... line; the step for snapping stays the chosen width', () => {
  const view = { scale: 3, x0: 0, z0: 100 }; // 1 m = 3 px
  const lines = gridLines(view, AREA, 1);
  assert.equal(lines.step, 1, 'snapping width as chosen');
  assert.equal(lines.stride, 5);
  assert.ok(Math.abs(lines.x[1] - lines.x[0] - 15) < 1e-9, 'every 5th metre: 15 px');
  assert.ok(lines.x.every((px, i) => i === 0 || px - lines.x[i - 1] >= MIN_LINE_PX));
  // the drawn lines are multiples of the chosen width times the stride: 0, 5, 10, ... m
  assert.ok(Math.abs(lines.x[0] - 0) < 1e-9);
  const fine = gridLines({ scale: 20, x0: 0, z0: 0 }, AREA, 0.1);
  assert.equal(fine.step, 0.1);
  assert.equal(fine.stride, 5);
  assert.ok(Math.abs(fine.x[1] - fine.x[0] - 10) < 1e-9, '0.5 m at 20 px/m');
});

test('gridLines: a very small scale gives a bounded number of lines (never more than one per 8 px)', () => {
  for (const choice of GRID_CHOICES) {
    for (const scale of [0.01, 0.1, 1, 10, 1000]) {
      const lines = gridLines({ scale, x0: -1e4, z0: 1e4 }, AREA, choice);
      assert.ok(lines.x.length <= AREA.width / (choice === 'auto' ? 60 : MIN_LINE_PX) + 2, `${choice} @ ${scale}: ${lines.x.length}`);
      assert.ok(lines.z.length <= AREA.height / (choice === 'auto' ? 60 : MIN_LINE_PX) + 2);
    }
  }
});

// --- wiring in the sketch (needs a browser to run; the sources are checked here)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const sketchSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'ui', 'sketch.js'), 'utf8').replaceAll('\r\n', '\n');

test('sketch.js: the width is chosen in the tool bar (Auto is the default), draws the lines of lib/grid-step.js and is not stored', () => {
  assert.match(sketchSource, /let gridChoice = 'auto'/);
  assert.match(sketchSource, /GRID_CHOICES\.map/);
  assert.match(sketchSource, /gridLines\(view, size, gridChoice\)/);
  assert.match(sketchSource, /\.\.\.gridControl\(\)/);
  assert.doesNotMatch(sketchSource, /localStorage|sessionStorage/);
  for (const lang of ['de', 'en']) for (const key of ['ui.sketch.gridWidth', 'ui.sketch.gridAuto']) assert.ok(MESSAGES[lang][key], `${lang}:${key}`);
});

// --- snap switch, separate from the grid switch (SPEC_ETAPPE2 6 "Fang", 6.1, version 1.12)

test('snap on, lines hidden, Auto: snaps to the division of the axes at the current zoom (same width as with visible lines)', () => {
  for (const scale of [0.5, 1, 4, 10, 37, 120, 600]) {
    const step = snapStepFor(true, 'auto', scale);
    assert.equal(step, tickStep(scale), `scale ${scale}`);
    assert.equal(step, gridLines({ scale, x0: 0, z0: 0 }, AREA, 'auto').step, 'the width of the drawn lines');
  }
});

test('snap on with a fixed width: that width, whatever the zoom', () => {
  for (const choice of [0.1, 0.2, 0.5, 1, 2, 5, 10]) for (const scale of [0.5, 10, 600]) assert.equal(snapStepFor(true, choice, scale), choice);
});

test('snap off (grid lines visible or not): no snapping, the node moves freely', () => {
  for (const choice of GRID_CHOICES) assert.equal(snapStepFor(false, choice, 10), null, String(choice));
});

test('snap decision and drag values: on rounds x, z and R to the width, off keeps the pointer value', () => {
  const handle = { type: 'ground' };
  assert.deepEqual(dragValues(handle, { x: 3.26, z: 1.74 }, snapStepFor(true, 0.5, 10)), { x: 3.5, z: 1.5 });
  assert.deepEqual(dragValues(handle, { x: 3.26, z: 1.74 }, snapStepFor(false, 0.5, 10)), { x: 3.26, z: 1.74 });
  assert.deepEqual(dragValues({ type: 'radius', cx: 0, cz: 0 }, { x: 3, z: 4 }, snapStepFor(true, 2, 10)), { R: 6 });
  assert.deepEqual(dragValues({ type: 'load' }, { x: 3.26 }, snapStepFor(false, 2, 10)), { x: 3.26 });
});

test('sketch.js: the switch "Snap" is on by default, after "Grid", not stored; "Grid" does not enter the snapping', () => {
  assert.match(sketchSource, /let snapOn = true/);
  assert.match(sketchSource, /label: t\('ui\.sketch\.snap'\)/);
  assert.ok(sketchSource.indexOf("t('ui.sketch.grid')") < sketchSource.indexOf("t('ui.sketch.snap')"), 'Snap after Grid in the bar');
  assert.doesNotMatch(sketchSource, /showGrid \?/, 'the grid switch does not decide on snapping');
  assert.doesNotMatch(sketchSource, /localStorage|sessionStorage/);
  for (const lang of ['de', 'en']) assert.ok(MESSAGES[lang]['ui.sketch.snap'], lang);
  assert.equal(MESSAGES.de['ui.sketch.snap'], 'Fang');
});
