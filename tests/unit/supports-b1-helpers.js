// Fixtures for the Spencer-with-supports tests (order 21). Not a test file.
// Geometry and soil as B1 (read from the benchmark file, never changed there);
// the elements are those of SPEC_ETAPPE3 7.2.1 (heads on the slope line
// z = 30 + (x - 50) * 2/3, input frame: the slope of B1 falls to the left).

import { loadBenchmark } from './helpers.js';

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const angleOf = (a, b) => (Math.atan(Math.abs(b[1] - a[1]) / Math.abs(b[0] - a[0])) * 180) / Math.PI;

/** B1 with Spencer only, without the expected values, with the given supports (a copy). */
export function b1With(supports, mode = 'characteristic') {
  const m = loadBenchmark('B1_homogeneous');
  delete m.expected;
  m.analysis.methods = ['spencer'];
  m.analysis.mode = mode;
  m.supports = supports;
  return m;
}

/** Nail from head a to end b (7.2.1): bond q 50 kN/m, rod 300 kN, spacing 1. */
export function nailFromTo(id, a, b, hasHead = true, extra = {}) {
  return {
    id, type: 'nail', x: a[0], z: a[1], angle: angleOf(a, b), length: dist(a, b),
    spacing: 1, bond: { q: 50 }, tensile: 300, hasHead, ...extra,
  };
}

/** Anchor from head a to end b with the given free length (bond length = rest). P0 40, Rk 40. */
export function anchorFromTo(a, b, freeLength, extra = {}) {
  return {
    id: 'A1', type: 'anchor', x: a[0], z: a[1], angle: angleOf(a, b), freeLength,
    bondLength: dist(a, b) - freeLength, spacing: 1, P0: 40, Rk: 40, ...extra,
  };
}

export const NAIL_S1 = [[66.7124382544835, 41.141625502989], [75.9633662653296, 29.3339868339687]];
export const NAIL_S3_2 = [[58.1066728277689, 35.4044485518459], [66.475, 24.06]];
export const NAIL_S3_3 = [[74.1831506872668, 46.1221004581779], [83.287, 34.076]];
export const ANCHOR_S4 = [[65.5028196489086, 40.3352130992724], [73.6209366479538, 34.4960199709529]];
export const PILE_X = [75.1675240564717, 69.3431719961068, 63.5188199357419, 57.694467875377];

export const CIRCLE_S1 = { xc: 50.032, zc: 48.297, R: 18.296 };
export const CIRCLE_S4 = { xc: 42.39, zc: 77.844, R: 48.426 };
export const CIRCLE_S6 = { xc: 42.714, zc: 77.494, R: 48.022 };

export const pilesS6 = () =>
  PILE_X.map((x, i) => ({ id: `P${i + 1}`, type: 'pile', x, z: 30 + ((x - 50) * 2) / 3, length: 15, shear: 20, spacing: 1 }));

/** Mirror a whole input model at x -> -x (ground, layers, water, loads, surfaces, supports, search grid, direction). */
export function mirrorWithSupports(model) {
  const c = structuredClone(model);
  const mp = (pts) => pts.map(([x, z]) => [-x, z]).reverse();
  c.ground = mp(c.ground);
  c.layers = c.layers.map((l) => (l.top ? { ...l, top: mp(l.top) } : l));
  if (c.water) c.water = mp(c.water);
  if (c.loads) c.loads = c.loads.map((l) => ({ ...l, x1: -l.x2, x2: -l.x1 }));
  if (c.surfaces) c.surfaces = c.surfaces.map((s) => ({ ...s, xc: -s.xc }));
  if (c.search) c.search.grid = { ...c.search.grid, xMin: -c.search.grid.xMax, xMax: -c.search.grid.xMin };
  c.supports = c.supports.map((s) => (s.type === 'shotcrete' ? { ...s, x1: -s.x2, x2: -s.x1 } : { ...s, x: -s.x }));
  const d = c.analysis.direction;
  c.analysis.direction = d === 'left' ? 'right' : d === 'right' ? 'left' : d;
  return c;
}
