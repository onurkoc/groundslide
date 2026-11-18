// Order 29 (SPEC_ETAPPE4 13b): rounding of drawn supports (angle 0.01 degree, lengths 0.01 m).
// No DOM: the pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDrawing, acceptPoint, isComplete, applyDrawing, round2, nailFromClicks, anchorFromClicks } from '../../app/lib/drawing.js';
import { loadBenchmark, mirrorModelForTest } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

// ------------------------------------------------------------ 4 rounding of drawn supports

const clicks = (kind, model, points) => {
  const d = newDrawing(kind);
  for (const p of points) {
    const r = acceptPoint(d, p, model);
    assert.equal(r.ok, true, `${kind} ${JSON.stringify(p)}`);
    d.points.push(r.point);
    if (isComplete(d)) break;
  }
  return d;
};
const twoDecimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

test('rounding: nail, anchor and pile get the angle to 0.01 degree and the lengths to 0.01 m; the head x, z stay as clicked; the end lies within the rounding of the click', () => {
  assert.equal(round2(14.931417178137554), 14.93);
  assert.equal(round2(15.524174696260024), 15.52);
  assert.equal(round2(-3.456), -3.46);
  assert.equal(round2(9), 9);
  assert.equal(String(round2(0.1 + 0.2)), '0.3');
  for (const flip of [false, true]) {
    const model = flip ? mirrorModelForTest(loadBenchmark('B1_homogeneous')) : loadBenchmark('B1_homogeneous');
    const sign = flip ? -1 : 1;
    // nail
    const nailClicks = [[sign * 60.123, 38.456], [sign * 72.371, 32.789]];
    const nail = applyDrawing(clicks('nail', model, nailClicks), model);
    const n = model.supports[nail.support];
    assert.deepEqual([n.x, n.z], nailClicks[0], 'the head as clicked');
    assert.ok(twoDecimals(n.angle) && twoDecimals(n.length), `${n.angle} ${n.length}`);
    // anchor
    const anchorClicks = [[sign * 60.123, 38.456], [sign * 70.987, 32.111], [sign * 90.5, 26.2]];
    const anchor = applyDrawing(clicks('anchor', model, anchorClicks), model);
    const a = model.supports[anchor.support];
    assert.deepEqual([a.x, a.z], anchorClicks[0]);
    assert.ok(twoDecimals(a.angle) && twoDecimals(a.freeLength) && twoDecimals(a.bondLength), `${a.angle} ${a.freeLength} ${a.bondLength}`);
    // pile
    const pile = applyDrawing(clicks('pile', model, [[sign * 100.5, 50], [sign * 100.5, 40.123]]), model);
    const p = model.supports[pile.support];
    assert.deepEqual([p.x, p.z], [sign * 100.5, 50]);
    assert.equal(p.length, 9.88, '9.877 -> 9.88');
  }
  // the rounding is the only difference to the exact values: at most 0.005 m or 0.005 degree
  const exact = { angle: (Math.atan2(6.333, 12.248) * 180) / Math.PI, length: Math.hypot(12.248, 6.333) };
  const rounded = nailFromClicks([[60, 38], [72.248, 31.667]], 'left');
  assert.ok(Math.abs(rounded.angle - exact.angle) <= 0.005 + 1e-9 && Math.abs(rounded.length - exact.length) <= 0.005 + 1e-9);
  const free = anchorFromClicks([[60, 38], [70, 32], [90, 20]], 'left');
  assert.ok(twoDecimals(free.freeLength) && twoDecimals(free.bondLength));
  // the shotcrete has no length and keeps the clicked x
  const model = loadBenchmark('B1_homogeneous');
  const shot = applyDrawing(clicks('shotcrete', model, [[55.123, 33], [75.456, 47]]), model);
  assert.deepEqual([model.supports[shot.support].x1, model.supports[shot.support].x2], [55.123, 75.456]);
});
