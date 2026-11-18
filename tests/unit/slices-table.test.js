// Slice table (SPEC_ETAPPE2 8.3): columns, degrees, display, text for the clipboard, choice of the surface.
// B1 is calculated once in this file (analyze); analyzeSurface calls are short.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeSurface } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';
import { SLICE_COLUMNS, columnHead, sliceRows, displayRows, sliceTsv, toDegrees, resolveSurface, surfaceFactors } from '../../app/lib/slices-table.js';

const model = loadBenchmark('B1_homogeneous');
const result = analyze(model);
const crit = result.critical.bishop;
const surface = analyzeSurface(model, { xc: crit.xc, zc: crit.zc, R: crit.R });
const slices = surface.slices;

test('columns after SPEC chapter 8 with units: x_m, b, alpha, W, Q, u, c, phi, N\' (Bishop), m_alpha', () => {
  assert.deepEqual(SLICE_COLUMNS.map((c) => c.key), ['xm', 'b', 'alpha', 'W', 'Q', 'u', 'c', 'phi', 'Nprime', 'mAlpha']);
  assert.deepEqual(SLICE_COLUMNS.map(columnHead), [
    'x_m [m]', 'b [m]', 'α [°]', 'W [kN/m]', 'Q [kN/m]', 'u [kPa]', 'c [kPa]', 'φ [°]', "N' (Bishop) [kN/m]", 'm_α [-]',
  ]);
  assert.deepEqual(SLICE_COLUMNS.filter((c) => c.degrees).map((c) => c.key), ['alpha', 'phi']);
});

test('B1 Bishop: F of analyzeSurface equals F of the overview (same circle)', () => {
  assert.equal(surface.valid, true);
  assert.ok(Math.abs(surface.results.bishop.F - crit.F) < 1e-9, `${surface.results.bishop.F} vs ${crit.F}`);
  assert.equal(surfaceFactors(surface)[0].method, 'bishop');
  assert.equal(surfaceFactors(surface)[0].F, surface.results.bishop.F);
  assert.deepEqual(surfaceFactors(surface).map((f) => f.method), ['bishop', 'janbu', 'janbuCorrected']);
});

test('rows: alpha and phi in degrees (the core delivers radians), the rest as it is', () => {
  const rows = sliceRows(slices);
  assert.equal(rows.length, slices.length);
  assert.ok(rows.length > 10);
  slices.forEach((s, i) => {
    const r = rows[i];
    assert.equal(r.length, 10);
    assert.equal(r[0], s.xm);
    assert.equal(r[1], s.b);
    assert.ok(Math.abs(r[2] - (s.alpha * 180) / Math.PI) < 1e-12);
    assert.equal(r[3], s.W);
    assert.equal(r[4], s.Q);
    assert.equal(r[5], s.u);
    assert.equal(r[6], s.c);
    assert.ok(Math.abs(r[7] - (s.phi * 180) / Math.PI) < 1e-12);
    assert.equal(r[8], s.Nprime);
    assert.equal(r[9], s.mAlpha);
  });
  // B1: phi = 30 degrees, c = 5 kPa
  for (const r of rows) {
    assert.ok(Math.abs(r[7] - 30) < 1e-9, `phi ${r[7]}`);
    assert.equal(r[6], 5);
  }
  assert.ok(rows.some((r) => Math.abs(r[2]) > 1), 'alpha in degrees is not a radian value');
  assert.ok(Math.abs(toDegrees(Math.PI) - 180) < 1e-12);
});

test('display: 3 decimals after the point', () => {
  const rows = displayRows(slices);
  for (const row of rows) for (const cell of row) assert.match(cell, /^-?\d+\.\d{3}$/);
  assert.equal(rows[0][0], slices[0].xm.toFixed(3));
  assert.equal(rows[0][2], toDegrees(slices[0].alpha).toFixed(3));
  assert.deepEqual(displayRows(null), []);
  assert.equal(displayRows([{ xm: 1, Nprime: null }])[0][8], '', 'empty cell stays empty');
});

test('clipboard text: head with units, tabs, point, unrounded, alpha and phi in degrees', () => {
  const text = sliceTsv(slices);
  const lines = text.split('\n');
  assert.equal(lines.length, slices.length + 1);
  assert.equal(lines[0], SLICE_COLUMNS.map(columnHead).join('\t'));
  assert.equal(lines[0].split('\t').length, 10);
  assert.ok(!text.includes('\r'));
  assert.ok(!text.endsWith('\n'));
  const rows = sliceRows(slices);
  lines.slice(1).forEach((line, i) => {
    const fields = line.split('\t');
    assert.equal(fields.length, 10, `line ${i + 1}`);
    fields.forEach((f, k) => {
      assert.doesNotMatch(f, /,/, 'a point, never a comma');
      assert.equal(Number(f), rows[i][k], `line ${i + 1} column ${k}: exactly the unrounded value`);
    });
  });
  // unrounded: the text is not cut to 3 decimals
  assert.ok(lines.slice(1).some((l) => l.split('\t').some((f) => /\.\d{6,}/.test(f))));
  // alpha in the text is in degrees
  assert.equal(Number(lines[1].split('\t')[2]), toDegrees(slices[0].alpha));
});

test('clipboard text: empty cell for a missing value, a table without slices is only the head', () => {
  const t = sliceTsv([{ xm: 1, b: 2, alpha: 0, W: 3, Q: 0, u: 0, c: 5, phi: Math.PI / 6, Nprime: null, mAlpha: null }]);
  const [, row] = t.split('\n');
  assert.equal(row, `1\t2\t0\t3\t0\t0\t5\t${toDegrees(Math.PI / 6)}\t\t`);
  assert.equal(sliceTsv([]), SLICE_COLUMNS.map(columnHead).join('\t'));
  assert.equal(sliceTsv(undefined), SLICE_COLUMNS.map(columnHead).join('\t'));
});

test('an invalid circle gives code and text instead of a table (and no slices)', () => {
  const bad = analyzeSurface(model, { xc: 20, zc: 40, R: 5 });
  assert.equal(bad.valid, false);
  assert.equal(bad.code, 'I_INTERSECTIONS');
  assert.ok(bad.message);
  assert.equal(bad.slices, undefined);
  assert.deepEqual(surfaceFactors(bad), []);
});

test('surface of the table: critical circle of the chosen method, or a single circle', () => {
  const a = resolveSurface(result, 'bishop', { kind: 'critical' });
  assert.deepEqual(a.circle, { xc: crit.xc, zc: crit.zc, R: crit.R });
  assert.equal(a.key, JSON.stringify([crit.xc, crit.zc, crit.R]));
  const b = resolveSurface(result, 'janbu', { kind: 'critical' });
  assert.deepEqual(b.circle, { xc: result.critical.janbu.xc, zc: result.critical.janbu.zc, R: result.critical.janbu.R });
  assert.notEqual(a.key, b.key, 'another method: another request');
  const c = resolveSurface(result, 'bishop', { kind: 'single', id: 'C1' });
  assert.deepEqual(c.circle, { xc: 50, zc: 80, R: 52 });
  assert.equal(c.label, 'C1');
  assert.equal(resolveSurface(result, 'bishop', { kind: 'single', id: 'nope' }).reason, 'unknown-single');
  assert.equal(resolveSurface(result, 'spencer', { kind: 'critical' }).reason, 'no-valid-surface', 'method not calculated');
  assert.equal(resolveSurface({ critical: { bishop: null } }, 'bishop', { kind: 'critical' }).reason, 'no-valid-surface');
  assert.equal(resolveSurface(null, 'bishop', { kind: 'critical' }).reason, 'no-result');
  assert.equal(resolveSurface(result, 'bishop', undefined).circle.xc, crit.xc, 'default target is the critical circle');
});

test('the single circle C1 can be calculated like the result of analyze: F per method the same', () => {
  const c1 = resolveSurface(result, 'bishop', { kind: 'single', id: 'C1' });
  const s = analyzeSurface(model, c1.circle);
  const inResult = result.surfaces.find((x) => x.id === 'C1');
  for (const m of ['bishop', 'janbu', 'janbuCorrected']) assert.ok(Math.abs(s.results[m].F - inResult.results[m].F) < 1e-12, m);
});
