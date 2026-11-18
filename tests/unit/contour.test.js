// Contour of the safety factors (SPEC_ETAPPE2 8.2, version 1.7): classes at their limits, colour bands (isobands with
// linear interpolation along the edges), grey squares for "no valid surface". B1 is calculated once in this file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { contourClass, contourCssClass, contourLegend, legendRange, contourBands, squareBands, polygonArea, groupByClass, CONTOUR_LIMITS, CONTOUR_CLASS_COUNT } from '../../app/lib/contour.js';

const model = loadBenchmark('B1_homogeneous');
const result = analyze(model);
const grid = model.search.grid;

test('classes: the lower limit belongs to the class (0.999, 1.0, 1.1, 2.0 and the other limits)', () => {
  assert.equal(contourClass(0.999), 0);
  assert.equal(contourClass(0.9999999), 0);
  assert.equal(contourClass(1.0), 1);
  assert.equal(contourClass(1.0999999), 1);
  assert.equal(contourClass(1.1), 2);
  assert.equal(contourClass(1.1999999), 2);
  assert.equal(contourClass(1.2), 3);
  assert.equal(contourClass(1.3), 4);
  assert.equal(contourClass(1.4999999), 4);
  assert.equal(contourClass(1.5), 5);
  assert.equal(contourClass(1.9999999), 5);
  assert.equal(contourClass(2.0), 6);
  assert.equal(contourClass(12.5), 6);
  assert.equal(contourClass(0), 0);
  assert.equal(contourClass(-3), 0);
  assert.equal(CONTOUR_CLASS_COUNT, 7);
  assert.deepEqual(CONTOUR_LIMITS, [1.0, 1.1, 1.2, 1.3, 1.5, 2.0]);
});

test('no valid surface: class null (grey)', () => {
  for (const v of [null, undefined, NaN, Infinity, '1.2', {}]) assert.equal(contourClass(v), null, String(v));
  assert.equal(contourCssClass(null), 'contour-none');
  assert.equal(contourCssClass(0), 'contour-0');
  assert.equal(contourCssClass(6), 'contour-6');
});

test('legend: seven classes from the lowest, then the grey entry; texts of the ranges', () => {
  const legend = contourLegend();
  assert.equal(legend.length, 8);
  assert.deepEqual(legend.map((l) => l.cls), [0, 1, 2, 3, 4, 5, 6, null]);
  assert.deepEqual(legend.slice(0, 7).map(legendRange), ['< 1.0', '1.0–1.1', '1.1–1.2', '1.2–1.3', '1.3–1.5', '1.5–2.0', '≥ 2.0']);
  assert.equal(legendRange(legend[7]), '');
});


// --- one square: unit square, corners counter-clockwise (lower left, lower right, upper right, upper left) ---

const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];
const areaOf = (polys) => polys.reduce((s, p) => s + polygonArea(p.points), 0);
const byClass = (polys, cls) => polys.filter((p) => p.cls === cls);
const clsAreas = (polys) => {
  const o = {};
  for (const p of polys) o[p.cls] = (o[p.cls] || 0) + polygonArea(p.points);
  return o;
};

test('square, four values in one class: one polygon, the whole square', () => {
  for (const v of [[0.5, 0.6, 0.7, 0.8], [1.12, 1.15, 1.18, 1.11], [2.5, 3, 9, 2], [1.0, 1.0, 1.0, 1.0]]) {
    const polys = squareBands(UNIT, v);
    assert.equal(polys.length, 1, JSON.stringify(v));
    assert.deepEqual(polys[0].points, UNIT);
    assert.equal(polys[0].cls, contourClass(v[0]));
  }
});

test('square, a limit exactly on a corner (F = 1.0): the lower limit belongs to the class, as with 1.5', () => {
  assert.equal(squareBands(UNIT, [1.0, 1.0, 1.0, 1.0])[0].cls, 1);
  assert.equal(squareBands(UNIT, [1.5, 1.5, 1.5, 1.5])[0].cls, 5);
  assert.equal(squareBands(UNIT, [2.0, 2.0, 2.0, 2.0])[0].cls, 6);
  // 0.9 at one corner, 1.0 at the others: class 0 only around the corner with 0.9, the rest (value 1.0) is class 1
  const polys = squareBands(UNIT, [0.9, 1.0, 1.0, 1.0]);
  const a = clsAreas(polys);
  assert.deepEqual(Object.keys(a).sort(), ['0', '1']);
  assert.ok(Math.abs(a[0] - 0.5) < 1e-12 && Math.abs(a[1] - 0.5) < 1e-12, JSON.stringify(a));
  // 1.4 at one corner, 1.5 at the others: class 5 (>= 1.5) is the half with the 1.5 corners, class 4 the other half
  const b = clsAreas(squareBands(UNIT, [1.4, 1.5, 1.5, 1.5]));
  assert.deepEqual(Object.keys(b).sort(), ['4', '5']);
  assert.ok(Math.abs(b[5] - 0.5) < 1e-12 && Math.abs(b[4] - 0.5) < 1e-12);
  // a single corner with exactly 1.5 among 1.4: the region at or above 1.5 is only that point, no polygon of class 5
  const c = squareBands(UNIT, [1.5, 1.4, 1.4, 1.4]);
  assert.deepEqual(c.map((p) => p.cls), [4]);
  assert.ok(Math.abs(areaOf(c) - 1) < 1e-12);
});

test('square, linear position of a limit on an edge: 0.9 and 1.1 give the limit 1.0 in the middle', () => {
  const polys = squareBands(UNIT, [0.9, 1.1, 1.1, 0.9]);
  assert.equal(polys.length, 2);
  const low = byClass(polys, 0)[0];
  const high = byClass(polys, 1)[0];
  assert.ok(low.points.every((p) => p[0] <= 0.5 + 1e-12) && low.points.some((p) => Math.abs(p[0] - 0.5) < 1e-12));
  assert.ok(high.points.every((p) => p[0] >= 0.5 - 1e-12));
  assert.ok(Math.abs(polygonArea(low.points) - 0.5) < 1e-12 && Math.abs(polygonArea(high.points) - 0.5) < 1e-12);
  // another position: 0.8 and 1.2 over the edge, limit 1.0 in the middle, 1.1 at 3/4 (1.1 - 0.8) / 0.4
  const t = squareBands(UNIT, [0.8, 1.2, 1.2, 0.8]);
  const a = clsAreas(t);
  assert.ok(Math.abs(a[0] - 0.5) < 1e-12, JSON.stringify(a));
  assert.ok(Math.abs(a[1] - 0.25) < 1e-12, 'limits 1.0 and 1.1: the band 1.0-1.1 is a quarter of the width');
  assert.ok(Math.abs(a[2] - 0.25) < 1e-12 || Math.abs((a[2] || 0) + (a[3] || 0) - 0.25) < 1e-12);
  // a limit on an edge between 0.9 and 1.3 lies at 0.25 for 1.0 and at 0.5 for 1.1
  const e = squareBands(UNIT, [0.9, 1.3, 1.3, 0.9]);
  const xs = e.flatMap((p) => p.points.map((q) => q[0])).filter((x) => x > 1e-9 && x < 1 - 1e-9).map((x) => Number(x.toFixed(9)));
  assert.ok([0.25, 0.5, 0.75].every((x) => xs.includes(x)), JSON.stringify([...new Set(xs)]));
});

test('square, saddle: the mean of the four corners decides which corners stay connected', () => {
  // corners 0 and 2 below 1.0, corners 1 and 3 above: mean below the limit -> the low corners stay connected
  const low = squareBands(UNIT, [0.9, 1.05, 0.9, 1.05]);
  assert.equal(byClass(low, 0).length, 1, 'class 0: one polygon (connected through the middle)');
  assert.equal(byClass(low, 1).length, 2, 'class 1: two separate corner pieces');
  // mean exactly at the limit (0.95 + 1.05) / 2 = 1.0 -> at or above: the high corners stay connected
  const at = squareBands(UNIT, [0.95, 1.05, 0.95, 1.05]);
  assert.equal(byClass(at, 1).length, 1);
  assert.equal(byClass(at, 0).length, 2);
  const high = squareBands(UNIT, [0.99, 1.09, 0.99, 1.09]);
  assert.equal(byClass(high, 1).length, 1, 'mean 1.04: the corners above stay connected');
  assert.equal(byClass(high, 0).length, 2);
  for (const polys of [low, at, high]) assert.ok(Math.abs(areaOf(polys) - 1) < 1e-12);
  // the other diagonal gives the mirrored picture
  const other = squareBands(UNIT, [1.05, 0.9, 1.05, 0.9]);
  assert.equal(byClass(other, 0).length, 1);
  assert.equal(byClass(other, 1).length, 2);
});

test('square, a null value in any corner: the whole square grey', () => {
  for (let i = 0; i < 4; i++) {
    const v = [1.2, 1.3, 1.4, 1.5];
    v[i] = null;
    const polys = squareBands(UNIT, v);
    assert.equal(polys.length, 1);
    assert.equal(polys[0].cls, null);
    assert.deepEqual(polys[0].points, UNIT);
  }
  assert.equal(squareBands(UNIT, [null, null, null, null])[0].cls, null);
  assert.equal(squareBands(UNIT, [1, NaN, 1, 1])[0].cls, null);
});

/** Small deterministic random numbers. */
function rng(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('square, areas of the polygons add up to the area of the square (1e-9 relative), all inside, counter-clockwise', () => {
  const rand = rng(12345);
  const pool = [0.4, 0.9, 0.999, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 1.7, 2.0, 2.4];
  let squares = 0;
  for (let n = 0; n < 4000; n++) {
    const values = [0, 1, 2, 3].map(() => (rand() < 0.5 ? pool[Math.floor(rand() * pool.length)] : 0.5 + rand() * 2.2));
    const w = 0.5 + rand() * 4;
    const h = 0.5 + rand() * 4;
    const x0 = rand() * 100 - 50;
    const z0 = rand() * 100 - 50;
    const corners = [[x0, z0], [x0 + w, z0], [x0 + w, z0 + h], [x0, z0 + h]];
    const polys = squareBands(corners, values);
    const total = polys.reduce((s, p) => s + polygonArea(p.points), 0);
    assert.ok(Math.abs(total - w * h) <= 1e-9 * w * h, `${JSON.stringify(values)}: ${total} vs ${w * h}`);
    for (const p of polys) {
      assert.ok(polygonArea(p.points) > 0, `counter-clockwise: ${JSON.stringify(values)}`);
      assert.ok(p.points.every(([x, z]) => x >= x0 - 1e-9 && x <= x0 + w + 1e-9 && z >= z0 - 1e-9 && z <= z0 + h + 1e-9), 'inside the square');
      assert.ok(p.cls >= 0 && p.cls <= 6);
    }
    squares++;
  }
  assert.equal(squares, 4000);
});

test('square: a corner is only part of a band of its own class (or of the class below when it lies exactly on the limit); other vertices lie on the edges', () => {
  const rand = rng(777);
  const onEdge = ([x, z]) => [x, z].some((v) => Math.abs(v) < 1e-9 || Math.abs(v - 1) < 1e-9);
  for (let n = 0; n < 3000; n++) {
    const values = [0, 1, 2, 3].map(() => [0.7, 0.99, 1.0, 1.05, 1.1, 1.3, 1.5, 1.9, 2.0, 2.6][Math.floor(rand() * 10)] + (rand() < 0.5 ? 0 : rand() * 0.04));
    for (const p of squareBands(UNIT, values)) {
      p.points.forEach(([x, z]) => {
        assert.ok(onEdge([x, z]), `vertex on the border of the square: ${JSON.stringify(values)}`);
        const ci = UNIT.findIndex(([cx, cz]) => Math.abs(cx - x) < 1e-12 && Math.abs(cz - z) < 1e-12);
        if (ci >= 0) {
          const k = contourClass(values[ci]);
          assert.ok(k === p.cls || (k === p.cls + 1 && values[ci] === CONTOUR_LIMITS[p.cls]), `corner ${ci} (${values[ci]}, class ${k}) in a band of class ${p.cls}`);
        }
      });
    }
  }
});

// --- the whole grid (B1) ---

test('B1: the polygons cover the grid rectangle exactly (sum of areas = rectangle, 1e-9 relative)', () => {
  const t0 = performance.now();
  const { polygons, reason } = contourBands(result, 'bishop', grid);
  const ms = performance.now() - t0;
  assert.equal(reason, null);
  const rect = (grid.xMax - grid.xMin) * (grid.zMax - grid.zMin);
  const total = polygons.reduce((s, p) => s + polygonArea(p.points), 0);
  assert.ok(Math.abs(total - rect) <= 1e-9 * rect, `${total} vs ${rect}`);
  assert.ok(polygons.every((p) => p.points.every(([x, z]) => x >= grid.xMin - 1e-9 && x <= grid.xMax + 1e-9 && z >= grid.zMin - 1e-9 && z <= grid.zMax + 1e-9)));
  assert.ok(ms < 1000, `time ${ms.toFixed(1)} ms`);
  console.log(`# contourBands B1 (${grid.nx} x ${grid.nz}): ${polygons.length} polygons in ${ms.toFixed(1)} ms`);
});

test('B1: squares with a centre without valid surface are grey and whole; the lower left square is grey', () => {
  const { polygons } = contourBands(result, 'bishop', grid);
  const dx = (grid.xMax - grid.xMin) / (grid.nx - 1);
  const dz = (grid.zMax - grid.zMin) / (grid.nz - 1);
  const value = new Map(result.grid.map((r) => [`${r.xc}|${r.zc}`, r.bishop]));
  let expectedGrey = 0;
  for (let iz = 0; iz < grid.nz - 1; iz++) {
    for (let ix = 0; ix < grid.nx - 1; ix++) {
      const x = [grid.xMin + dx * ix, grid.xMin + dx * (ix + 1)];
      const z = [grid.zMin + dz * iz, grid.zMin + dz * (iz + 1)];
      const four = [[x[0], z[0]], [x[1], z[0]], [x[1], z[1]], [x[0], z[1]]].map(([a, b]) => value.get(`${a}|${b}`));
      if (four.some((v) => v === null || v === undefined)) expectedGrey++;
    }
  }
  const grey = polygons.filter((p) => p.cls === null);
  assert.equal(grey.length, expectedGrey);
  assert.ok(expectedGrey > 0);
  for (const g of grey) assert.ok(Math.abs(polygonArea(g.points) - dx * dz) <= 1e-9 * dx * dz, 'a grey polygon is the whole square');
  assert.ok(grey.some((g) => g.points[0][0] === grid.xMin && g.points[0][1] === grid.zMin), 'square at x_c = 20, z_c = 40');
});

test('B1: every polygon of a class has F inside the class at its vertices on the grid corners; the method changes the bands', () => {
  const a = contourBands(result, 'bishop', grid).polygons;
  const b = contourBands(result, 'janbu', grid).polygons;
  assert.notDeepEqual(a.map((p) => p.cls).slice(0, 200), b.map((p) => p.cls).slice(0, 200));
  const value = new Map(result.grid.map((r) => [`${r.xc}|${r.zc}`, r.bishop]));
  for (const p of a.filter((x) => x.cls !== null)) {
    for (const [x, z] of p.points) {
      const v = value.get(`${x}|${z}`);
      if (v === undefined || v === null) continue; // a vertex that is not a centre (on an edge)
      // a vertex on a centre: its value is on the border of the class or inside
      const k = contourClass(v);
      assert.ok(Math.abs(k - p.cls) <= 1);
    }
  }
  const g = groupByClass(a);
  assert.deepEqual(g.map((x) => x.cls), [...new Set(g.map((x) => x.cls))]);
  assert.equal(g.reduce((s, x) => s + x.polygons.length, 0), a.length);
});

test('no contour: without search, method not calculated, unreadable grid, grid with one column or row', () => {
  assert.equal(contourBands({ surfaces: [] }, 'bishop', grid).reason, 'no-search');
  assert.deepEqual(contourBands({ surfaces: [] }, 'bishop', grid).polygons, []);
  assert.equal(contourBands(result, 'spencer', grid).reason, 'no-method');
  assert.equal(contourBands(result, 'bishop', null).reason, 'no-grid');
  assert.equal(contourBands(result, 'bishop', { ...grid, nx: 1.5 }).reason, 'no-grid');
  assert.equal(contourBands(result, 'bishop', { ...grid, xMin: null }).reason, 'no-grid');
  assert.equal(contourBands(result, 'bishop', { ...grid, nx: 1 }).reason, 'single-row');
  assert.equal(contourBands(result, 'bishop', { ...grid, nz: 1 }).reason, 'single-row');
  assert.equal(contourBands(null, 'bishop', grid).reason, 'no-search');
});

test('the result is not changed by drawing the contour', () => {
  const before = JSON.stringify(result.grid);
  contourBands(result, 'bishop', grid);
  assert.equal(JSON.stringify(result.grid), before);
});

// --- colours (style.css, SPEC_ETAPPE2 8.2 version 1.7): the seven colours of the specification, the same in light and dark ---

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'style.css'), 'utf8').split(String.fromCharCode(13)).join('');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), css.indexOf(':root {')));
const SPEC_COLOURS = ['#d73027', '#fc8d59', '#fee090', '#ffffbf', '#e0f3f8', '#91bfdb', '#4575b4'];

test('contour colours: exactly the values of the specification, plain values (same in light and dark), no fixed colour elsewhere', () => {
  for (let k = 1; k <= 7; k++) {
    const m = rootBlock.match(new RegExp('--contour-' + k + ': *(#[0-9a-fA-F]{6});'));
    assert.ok(m, `--contour-${k} is one plain colour (no light-dark pair)`);
    assert.equal(m[1].toLowerCase(), SPEC_COLOURS[k - 1], `--contour-${k}`);
  }
  assert.match(rootBlock, /--contour-none: *light-dark[(]#[0-9a-fA-F]{6}, *#[0-9a-fA-F]{6}[)];/);
});

test('contour colours: no green among them (red over yellow to blue), the grey differs from every class', () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const hex of SPEC_COLOURS) {
    const [r, g, b] = rgb(hex);
    assert.ok(!(g > r && g > b), `${hex} is not green`);
  }
  const none = rootBlock.match(/--contour-none: *light-dark[(](#[0-9a-fA-F]{6}), *(#[0-9a-fA-F]{6})[)]/);
  for (const grey of [none[1], none[2]]) {
    const [r, g, b] = rgb(grey);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 30, 'grey');
    assert.ok(!SPEC_COLOURS.includes(grey.toLowerCase()));
  }
});

test('style.css: bands are drawn with a stroke in the fill colour (no hair lines between polygons of one class)', () => {
  const rule = css.match(/[.]sk-band [{][^}]*[}]/)[0];
  assert.match(rule, /fill: *var[(]--cell[)]/);
  assert.match(rule, /stroke: *var[(]--cell[)]/);
  assert.match(rule, /stroke-width: *0[.]\d+/);
});
