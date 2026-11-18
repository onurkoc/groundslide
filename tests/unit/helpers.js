// Shared helpers for the unit tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const benchDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks');

/** Load a benchmark JSON file by file name (without .json). */
export function loadBenchmark(name) {
  return JSON.parse(readFileSync(path.join(benchDir, `${name}.json`), 'utf8'));
}

/** Names of all benchmark files. */
export const BENCHMARK_NAMES = [
  'B1_homogeneous',
  'B2_water',
  'B3_two_layers',
  'B4_undrained',
  'B5_surcharge',
  'B6_seismic',
  'H1_handcalc_dry',
  'H2_handcalc_wet',
  'V01_acads_1a',
  'V03_acads_1c',
  'V04_acads_1d',
  'V14_arai_tagyo_1',
  'V16_arai_tagyo_3',
  'V17_yamagami_ueta',
  'V24_low_undrained',
];

const mirrorPts = (pts) => pts.map(([x, z]) => [-x, z]).reverse();

/** Mirror a whole model (and optionally a circle) at x -> -x. Test helper, independent of core/. */
export function mirrorModelForTest(model) {
  const copy = structuredClone(model);
  copy.ground = mirrorPts(copy.ground);
  copy.layers = copy.layers.map((l) => (l.top ? { ...l, top: mirrorPts(l.top) } : l));
  if (copy.water) copy.water = mirrorPts(copy.water);
  if (copy.loads) copy.loads = copy.loads.map((l) => ({ ...l, x1: -l.x2, x2: -l.x1 }));
  const d = copy.analysis.direction;
  copy.analysis.direction = d === 'left' ? 'right' : d === 'right' ? 'left' : d;
  return copy;
}

/** Assert helper: |a - b| <= tol with a readable message. */
export function near(assert, actual, expected, tol, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${expected} +/- ${tol}, got ${actual}`,
  );
}
