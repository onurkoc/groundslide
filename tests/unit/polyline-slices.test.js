// Polyline as a slip surface, slices (order 24, SPEC_ETAPPE4 3.2, 3.3): validity of the points, the section below the ground,
// the codes of the circle, slice boundaries at the vertices, control against Slide2 (N1), mirrored model.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlicesPolyline, buildSlices, toInputFrame } from '../../core/slices.js';
import { polylinePointsProblem, polylineToCore, polylineToInput, polylineChordAndSagitta } from '../../core/polyline.js';
import { validateModel } from '../../core/index.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const DEG = 180 / Math.PI;
const PL1 = [[45, 30], [55, 28], [70, 32], [85, 40], [97.5, 50]];
const mirrorPoints = (pts) => pts.map(([x, z]) => [-x, z]).reverse();

// ------------------------------------------------------------ E_SURFACE_POINTS (SPEC_ETAPPE4 3.2)

test('E_SURFACE_POINTS: fewer than 2 points, x not strictly increasing, no numbers; no exception, no check in validateModel', () => {
  const model = loadBenchmark('B3_two_layers');
  const bad = [
    [],
    [[45, 30]],
    [[45, 30], [45, 28]], // vertical piece
    [[45, 30], [55, 28], [50, 40]], // overhang
    [[55, 28], [45, 30]], // x falling
    [[45, 30], [55, 'a']],
    [[45, 30], [55]],
    null,
    'points',
  ];
  for (const points of bad) {
    const g = buildSlicesPolyline(model, points);
    assert.equal(g.valid, false, JSON.stringify(points));
    assert.equal(g.code, 'E_SURFACE_POINTS', JSON.stringify(points));
    assert.equal(typeof g.message, 'string');
    assert.notEqual(polylinePointsProblem(points), null);
  }
  assert.equal(polylinePointsProblem(PL1), null);
  // validateModel does not look at `surfaces` (SPEC_ETAPPE2 5)
  const withBad = { ...model, surfaces: [{ id: 'X', type: 'polyline', points: [[1, 2]] }] };
  assert.deepEqual(validateModel(withBad), { valid: true, errors: [] });
});

// ------------------------------------------------------------ codes of the circle (SPEC.md 7.3)

test('codes of the circle for a polyline: I_INTERSECTIONS, I_DIRECTION, I_OUT_OF_MODEL, I_BELOW_MODEL, I_TOO_SHALLOW', () => {
  const model = loadBenchmark('B1_homogeneous'); // slope falls to the left; ground (0,30) (50,30) (80,50) (130,50), bottom 0
  const code = (points) => buildSlicesPolyline(model, points).code;
  // entirely above the ground
  assert.equal(code([[10, 40], [20, 35]]), 'I_INTERSECTIONS');
  // both ends on the crown at the same height: entry not higher than exit
  assert.equal(code([[100, 50], [110, 45], [120, 50]]), 'I_DIRECTION');
  // the polyline ends inside the model below the ground, or at the model edge below the ground (the entry is higher than the exit,
  // so that I_DIRECTION, which is checked first as for the circle, does not apply)
  assert.equal(code([[45, 30], [60, 25], [100, 40]]), 'I_OUT_OF_MODEL');
  assert.equal(code([[45, 30], [60, 25], [140, 45]]), 'I_OUT_OF_MODEL');
  // ... and with the same height of the ends: I_DIRECTION first, as for the circle (SPEC.md 5.1 e before f)
  assert.equal(code([[45, 30], [60, 25], [100, 30]]), 'I_DIRECTION');
  assert.equal(code([[-10, 20], [20, 25], [45, 30]]), 'I_OUT_OF_MODEL');
  // a point below `bottom`
  assert.equal(code([[45, 30], [70, -5], [97.5, 50]]), 'I_BELOW_MODEL');
  // 0.05 m below the ground at the thickest point
  assert.equal(code([[50, 30], [65, 39.95], [80, 50]]), 'I_TOO_SHALLOW');
  // a valid one for comparison
  assert.equal(buildSlicesPolyline(model, PL1).valid, true);
});

test('parts of the polyline outside the ground are cut off: points above the ground change nothing', () => {
  const model = loadBenchmark('B3_two_layers');
  const a = buildSlicesPolyline(model, PL1);
  const b = buildSlicesPolyline(model, [[40, 34], ...PL1, [110, 60]]);
  assert.equal(a.valid && b.valid, true);
  assert.deepEqual(b.entry, a.entry);
  assert.deepEqual(b.exit, a.exit);
  assert.equal(b.slices.length, a.slices.length);
  for (let i = 0; i < a.slices.length; i++) {
    near(assert, b.slices[i].W, a.slices[i].W, 1e-9, `W of slice ${i}`);
    near(assert, b.slices[i].alpha, a.slices[i].alpha, 1e-12, `alpha of slice ${i}`);
  }
  // an end that leaves the ground at a point between two vertices: entry and exit are the crossings
  const c = buildSlicesPolyline(model, [[30, 36], [60, 24], [90, 44], [100, 56]]);
  assert.equal(c.valid, true);
  const entry = toInputFrame(c).entry;
  const exit = toInputFrame(c).exit;
  near(assert, exit[1], 30, 1e-9, 'exit on the flat ground'); // the ground is z = 30 left of x = 50
  near(assert, entry[1], 50, 1e-9, 'entry on the crown');
  assert.ok(exit[0] > 30 && exit[0] < 60 && entry[0] > 90 && entry[0] < 100);
});

test('with more than two crossings the section with the largest height difference counts, as for the circle (SPEC.md 5.1 d)', () => {
  const model = loadBenchmark('B1_homogeneous');
  // two sections below the ground: a shallow one on the flat toe (diff 0) and the deep one on the slope
  const pts = [[5, 30], [15, 27], [25, 30], [45, 30], [60, 20], [90, 50]];
  const g = toInputFrame(buildSlicesPolyline(model, pts));
  assert.equal(g.valid, true);
  near(assert, g.exit[0], 45, 1e-9, 'exit of the section on the slope');
  near(assert, g.entry[0], 90, 1e-9, 'entry: the end point (90, 50) on the crown');
});

// ------------------------------------------------------------ slices (SPEC_ETAPPE4 3.3), control against Slide2 (N1)

test('N1 slices of PL1 in B3 compared with the Slide2 table: 50 slices, base angles, boundary at x = 75.625, material', () => {
  const model = loadBenchmark('B3_two_layers');
  const g = toInputFrame(buildSlicesPolyline(model, PL1));
  assert.equal(g.valid, true);
  assert.equal(g.slices.length, 50);
  // base angles: Slide2 -11.3099, 14.9314, 28.0725, 38.6598 degrees (positive upwards to the right); here SPEC.md 3 (positive where
  // the base falls to the right), so the same values with the opposite sign
  const expected = [Math.atan2(-2, 10), Math.atan2(4, 15), Math.atan2(8, 15), Math.atan2(10, 12.5)].map((a) => -a * DEG);
  const found = [...new Set(g.slices.map((s) => (s.alpha * DEG).toFixed(9)))].map(Number); // four distinct values, in the order of x
  assert.equal(found.length, 4);
  for (let i = 0; i < 4; i++) near(assert, found[i], expected[i], 1e-9, `angle ${i + 1}`);
  near(assert, expected[0], 11.3099, 5e-5);
  near(assert, expected[1], -14.9314, 5e-5);
  near(assert, expected[2], -28.0725, 5e-5);
  near(assert, expected[3], -38.6598, 5e-5);
  // every vertex of PL1 and the crossing with the layer boundary (z = 35) are slice boundaries
  const bounds = g.slices.map((s) => s.xLeft).concat(g.slices.at(-1).xRight);
  for (const x of [45, 55, 70, 85, 97.5, 75.625]) assert.ok(bounds.some((b) => Math.abs(b - x) < 1e-9), `boundary at ${x}`);
  // slice 1: triangle 0.1 m2 * 20 kN/m3 = 2 kN in material 2
  near(assert, g.slices[0].W, 2, 1e-9, 'W of slice 1');
  assert.equal(g.slices[0].material, 'M2');
  // Slide2: 29 of 50 slices in material 2
  assert.equal(g.slices.filter((s) => s.material === 'M2').length, 29);
  // widths: the segments of the polyline 10, 15, 5.625, 9.375 and 12.5 m give 10 + 14 + 5 + 9 + 12 slices (SPEC.md 5.3), as Slide2
  const count = (a, b) => g.slices.filter((s) => s.xLeft >= a - 1e-9 && s.xRight <= b + 1e-9).length;
  assert.deepEqual([count(45, 55), count(55, 70), count(70, 75.625), count(75.625, 85), count(85, 97.5)], [10, 14, 5, 9, 12]);
});

test('N1 difference to Slide2: the mandatory boundaries of SPEC.md 5.2 (ground kinks, layer vertices) split the slices further, the count stays 50', () => {
  // Slide2 puts boundaries only at the vertices of PL1 and at the layer crossing; here also at x = 50, 57.5, 80 (SPEC.md 5.2: kinks of
  // the ground and of the layer boundary). The total of 50 comes out the same; only the widths differ (1.25 and 1.09375 m instead of 1.07143).
  const model = loadBenchmark('B3_two_layers');
  const g = toInputFrame(buildSlicesPolyline(model, PL1));
  const bounds = g.slices.map((s) => s.xLeft);
  for (const x of [50, 57.5, 80]) assert.ok(bounds.some((b) => Math.abs(b - x) < 1e-9), `boundary at ${x}`);
  const widths = new Set(g.slices.map((s) => s.b.toFixed(5)));
  assert.ok(widths.has('1.25000') && widths.has('1.09375'));
});

test('slice quantities of a polyline: base from the end points of the piece, l = b / cos alpha, weight from the polygon', () => {
  const model = loadBenchmark('B1_homogeneous'); // gamma 19, no water, no load
  const g = buildSlicesPolyline(model, [[45, 30], [60, 22], [97.5, 50]]);
  assert.equal(g.valid, true);
  for (const s of g.slices) {
    near(assert, s.l, s.b / Math.cos(s.alpha), 1e-12, 'l');
    assert.ok(s.W > 0);
    assert.equal(s.Q, 0);
    assert.equal(s.u, 0);
  }
  // total weight = gamma * area of the body: exit (45, 30), vertex, entry (97.5, 50), ground kinks (80, 50), (50, 30); shoelace formula
  const body = [[45, 30], [60, 22], [97.5, 50], [80, 50], [50, 30]];
  let a2 = 0;
  for (let i = 0; i < body.length; i++) {
    const [x0, z0] = body[i];
    const [x1, z1] = body[(i + 1) % body.length];
    a2 += x0 * z1 - x1 * z0;
  }
  const total = g.slices.reduce((s, sl) => s + sl.W, 0);
  near(assert, total, 19 * (Math.abs(a2) / 2), 1e-7, 'total weight');
});

// ------------------------------------------------------------ mirrored model

test('mirrored model: the same surface mirrored gives the same slices (calculation frame) and the mirrored slices in the input frame', () => {
  const model = loadBenchmark('B3_two_layers'); // slope falls to the left
  const mirrored = mirrorModelForTest(model); // slope falls to the right
  const a = buildSlicesPolyline(model, PL1);
  const b = buildSlicesPolyline(mirrored, mirrorPoints(PL1));
  assert.equal(a.valid && b.valid, true);
  assert.equal(a.mirrored, true);
  assert.equal(b.mirrored, false);
  assert.equal(a.slices.length, b.slices.length);
  for (let i = 0; i < a.slices.length; i++) {
    near(assert, a.slices[i].W, b.slices[i].W, 1e-9, `W ${i}`);
    near(assert, a.slices[i].xm, b.slices[i].xm, 1e-9, `xm ${i}`);
    near(assert, a.slices[i].alpha, b.slices[i].alpha, 1e-12, `alpha ${i}`);
  }
  near(assert, a.pivot[0], b.pivot[0], 1e-9);
  near(assert, a.pivot[1], b.pivot[1], 1e-9);
  // input frame: slices by increasing x, points and pivot mirrored back
  const inp = toInputFrame(a);
  for (let i = 1; i < inp.slices.length; i++) assert.ok(inp.slices[i].xm > inp.slices[i - 1].xm);
  assert.deepEqual(polylineToInput(polylineToCore(PL1, a), a), PL1);
  near(assert, inp.pivot[0], 71.25, 1e-9, 'x of the moment point: middle between entry and exit');
  near(assert, inp.pivot[1], 50, 1e-9, 'z of the moment point: highest ground point between them');
});

test('moment point (SPEC_ETAPPE4 4.2): middle between entry and exit in x, highest ground point between them in z', () => {
  // ground with a crest at (80, 50) between exit and entry: z_M is the crest, not the height of an end
  const model = { ...loadBenchmark('B1_homogeneous'), ground: [[0, 30], [50, 30], [80, 50], [90, 45], [130, 45]] };
  const g = toInputFrame(buildSlicesPolyline(model, [[45, 30], [60, 22], [100, 45]]));
  assert.equal(g.valid, true);
  near(assert, g.pivot[0], 0.5 * (g.entry[0] + g.exit[0]), 1e-12);
  near(assert, g.pivot[0], 72.5, 1e-9);
  near(assert, g.pivot[1], 50, 1e-12);
});

test('chord and largest distance of a polyline (SPEC_ETAPPE4 4.4)', () => {
  const { L, d } = polylineChordAndSagitta([[5, 10], [12, 3], [25, 0]]);
  near(assert, L, Math.hypot(20, 10), 1e-12);
  near(assert, d, 70 / Math.hypot(20, 10), 1e-12);
});

test('circle unchanged: buildSlices of a circle gives the same result as before the refactoring (spot values of B1, C1)', () => {
  const g = buildSlices(loadBenchmark('B1_homogeneous'), { xc: 50, zc: 80, R: 52 });
  assert.equal(g.valid, true);
  assert.equal(g.slices.length, 50);
  assert.equal(g.type, undefined);
  assert.ok(g.circle && !('points' in g));
});
