// Axes and grid of the sketch (SPEC_ETAPPE2 6, version 1.7): step, marks, labels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { tickStep, ticksInRange, viewTicks, decimalsFor, MIN_PX, MAX_PX } from '../../app/lib/axes.js';

const isNice = (step) => {
  const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
  return [1, 2, 5].some((m) => Math.abs(mantissa - m) < 1e-9);
};

test('step is 1, 2 or 5 times a power of ten for all scales from 0.001 to 100000 px/m', () => {
  for (let e = -3; e <= 5; e += 0.05) {
    const scale = 10 ** e;
    const step = tickStep(scale);
    assert.ok(isNice(step), `scale ${scale}: step ${step}`);
  }
});

test('distance of the marks on the screen: at least 60 px, below 150 px; the next smaller step would be below 60 px', () => {
  for (let e = -3; e <= 5; e += 0.01) {
    const scale = 10 ** e;
    const step = tickStep(scale);
    const px = step * scale;
    assert.ok(px >= MIN_PX && px < MAX_PX, `scale ${scale}: ${px} px`);
    // the smaller step of the series 1, 2, 5 (previous one) is too close
    const m = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
    const smaller = Math.abs(m - 5) < 1e-9 ? step / 2.5 : step / 2; // previous step of the series 1, 2, 5
    assert.ok(smaller * scale < MIN_PX, `scale ${scale}: smaller step ${smaller} would have ${smaller * scale} px`);
  }
});

test('examples: small, normal and large scales', () => {
  assert.equal(tickStep(5), 20); // 100 px
  assert.equal(tickStep(10), 10); // 100 px
  assert.equal(tickStep(1), 100); // 100 px
  assert.equal(tickStep(20), 5); // 100 px
  assert.equal(tickStep(60), 1); // 60 px, the lower limit counts
  assert.equal(tickStep(59.9), 2);
  assert.equal(tickStep(0.01), 10000);
  assert.equal(tickStep(1000), 0.1);
  assert.equal(tickStep(1e5), 0.001);
  assert.equal(tickStep(0), 1, 'no scale: a safe value');
  assert.equal(tickStep(NaN), 1);
});

test('marks lie exactly on multiples of the step and inside the range; the limits are included when they are multiples', () => {
  const t = ticksInRange(-10, 10, 5).map((x) => x.value);
  assert.deepEqual(t, [-10, -5, 0, 5, 10]);
  const u = ticksInRange(-12, 7, 5).map((x) => x.value);
  assert.deepEqual(u, [-10, -5, 0, 5]);
  const f = ticksInRange(0.05, 0.95, 0.1).map((x) => x.value);
  assert.deepEqual(f, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], 'no rounding noise (0.30000000000000004)');
  for (const [min, max, step] of [[-17.3, 41.9, 5], [123.4, 130.1, 0.5], [-0.37, 0.41, 0.02], [-3000, 4500, 1000], [1e-3, 9e-3, 1e-3]]) {
    const ticks = ticksInRange(min, max, step);
    assert.ok(ticks.length > 0);
    assert.ok(ticks[0].value >= min - 1e-12 && ticks[0].value - step < min, `first of ${min}..${max}`);
    assert.ok(ticks.at(-1).value <= max + 1e-12 && ticks.at(-1).value + step > max, `last of ${min}..${max}`);
    for (let i = 1; i < ticks.length; i++) assert.ok(Math.abs(ticks[i].value - ticks[i - 1].value - step) < step * 1e-9);
  }
});

test('negative coordinates and zero; no "-0" label', () => {
  const ticks = ticksInRange(-2, 2, 1);
  assert.deepEqual(ticks.map((x) => x.label), ['-2', '-1', '0', '1', '2']);
  const small = ticksInRange(-0.5, 0.5, 0.5);
  assert.deepEqual(small.map((x) => x.label), ['-0.5', '0.0', '0.5']);
  assert.ok(Object.is(ticksInRange(-1, 1, 1)[1].value, 0) || ticksInRange(-1, 1, 1)[1].value === 0);
});

test('labels have just the decimals of the step', () => {
  assert.equal(decimalsFor(5), 0);
  assert.equal(decimalsFor(1000), 0);
  assert.equal(decimalsFor(0.5), 1);
  assert.equal(decimalsFor(0.1), 1);
  assert.equal(decimalsFor(0.02), 2);
  assert.equal(decimalsFor(0.001), 3);
  assert.deepEqual(ticksInRange(0, 1, 0.2).map((x) => x.label), ['0.0', '0.2', '0.4', '0.6', '0.8', '1.0']);
  assert.deepEqual(ticksInRange(0, 2000, 500).map((x) => x.label), ['0', '500', '1000', '1500', '2000']);
});

test('empty or wrong ranges give no marks', () => {
  assert.deepEqual(ticksInRange(5, 1, 1), []);
  assert.deepEqual(ticksInRange(NaN, 1, 1), []);
  assert.deepEqual(ticksInRange(0, 1, 0), []);
  assert.deepEqual(ticksInRange(0.2, 0.4, 1), []);
});

test('view: marks of x and z in the visible area, positions in pixels, same step in x and z', () => {
  const view = { scale: 10, x0: -25, z0: 60 }; // 800 x 400 px: x -25 ... 55, z 20 ... 60
  const size = { width: 800, height: 400 };
  const t = viewTicks(view, size);
  assert.equal(t.step, 10);
  assert.deepEqual(t.x.map((x) => x.value), [-20, -10, 0, 10, 20, 30, 40, 50]);
  assert.deepEqual(t.z.map((x) => x.value), [20, 30, 40, 50, 60]);
  assert.deepEqual(t.x.map((x) => x.px), [50, 150, 250, 350, 450, 550, 650, 750]);
  assert.deepEqual(t.z.map((x) => x.px), [400, 300, 200, 100, 0], 'z grows upwards, pixel y downwards');
  for (const m of [...t.x, ...t.z]) assert.ok(m.px >= 0 && m.px <= 800);
});

test('view: follows zoom and pan', () => {
  const size = { width: 900, height: 500 };
  const a = viewTicks({ scale: 10, x0: 0, z0: 100 }, size);
  const panned = viewTicks({ scale: 10, x0: 33, z0: 100 }, size);
  assert.equal(panned.step, a.step);
  assert.notDeepEqual(panned.x.map((x) => x.value), a.x.map((x) => x.value));
  assert.ok(panned.x[0].value >= 33);
  const zoomed = viewTicks({ scale: 100, x0: 0, z0: 100 }, size);
  assert.ok(zoomed.step < a.step);
  assert.equal(zoomed.step, 1);
  const out = viewTicks({ scale: 0.5, x0: 0, z0: 100 }, size);
  assert.ok(out.step > a.step);
});

// --- colours (style.css): axis text readable on the sketch background in light and dark, grid line a CSS variable ---

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'style.css'), 'utf8').split(String.fromCharCode(13)).join('');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), css.indexOf(':root {')));
const pair = (name) => {
  const m = rootBlock.match(new RegExp('--' + name + ': *light-dark[(](#[0-9a-fA-F]{6}), *(#[0-9a-fA-F]{6})[)]'));
  assert.ok(m, name);
  return { light: m[1], dark: m[2] };
};
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('axis labels reach 4.5:1 on the sketch background in light and dark; grid line variable exists', () => {
  const axis = pair('sketch-axis');
  const bg = pair('sketch-bg');
  assert.ok(contrast(axis.light, bg.light) >= 4.5, `light ${contrast(axis.light, bg.light)}`);
  assert.ok(contrast(axis.dark, bg.dark) >= 4.5, `dark ${contrast(axis.dark, bg.dark)}`);
  assert.match(rootBlock, /--sketch-gridline:/);
});
