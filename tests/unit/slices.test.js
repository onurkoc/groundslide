// Slice tests (SPEC chapter 5, validity rules of 7.3 that concern geometry).
// T2 mirrored model, H1, H2, V03, loads, invalid surfaces.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlices, toInputFrame } from '../../core/slices.js';
import { circlePolylineIntersections, heightAt } from '../../core/geometry.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const DEG = 180 / Math.PI;

/** Height of the base chord at the inner slice boundaries (input frame, x ascending). */
function innerBaseHeights(slices) {
  const out = [];
  for (let i = 0; i < slices.length - 1; i++) {
    const s = slices[i];
    out.push(s.zb - 0.5 * s.b * Math.tan(s.alpha)); // right end of slice i
  }
  return out;
}

function printTable(title, r) {
  const rows = r.slices.map((s, i) => ({
    i: i + 1,
    xLeft: +s.xLeft.toFixed(3),
    xRight: +s.xRight.toFixed(3),
    b: +s.b.toFixed(3),
    xm: +s.xm.toFixed(3),
    zb: +s.zb.toFixed(3),
    alpha: +(s.alpha * DEG).toFixed(2),
    l: +s.l.toFixed(3),
    W: +s.W.toFixed(2),
    zG: +s.zG.toFixed(3),
    Q: +s.Q.toFixed(2),
    u: +s.u.toFixed(2),
    mat: s.material,
    c: s.c,
    phi: +(s.phi * DEG).toFixed(2),
  }));
  console.log(`\n${title}`);
  console.table(rows);
}

// ---------------------------------------------------------------- H1

test('H1 C1: slice boundaries, inner base heights, entry and exit', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = toInputFrame(buildSlices(m, m.surfaces[0]));
  assert.equal(r.valid, true);
  assert.equal(r.slices.length, 7);
  printTable('H1 C1 (input frame, x ascending, alpha in degrees)', r);

  const bounds = [r.slices[0].xLeft, ...r.slices.map((s) => s.xRight)];
  [10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5].forEach((x, i) => near(assert, bounds[i], x, 0.005, `boundary ${i}`));
  r.slices.forEach((s, i) => {
    if (i > 0) assert.equal(s.xLeft, r.slices[i - 1].xRight, 'slices are contiguous');
  });

  const zb = innerBaseHeights(r.slices);
  [9.614, 9.623, 10.029, 10.866, 12.215, 14.258].forEach((z, i) => near(assert, zb[i], z, 0.005, `base height ${i}`));

  // entry / exit as a set (input frame): (10, 10) and (27.5, 17.5)
  const pts = [r.entry, r.exit].sort((a, b) => a[0] - b[0]);
  near(assert, pts[0][0], 10, 0.005, 'x at (10,10)');
  near(assert, pts[0][1], 10, 0.005, 'z at (10,10)');
  near(assert, pts[1][0], 27.5, 0.005, 'x at (27.5,17.5)');
  near(assert, pts[1][1], 17.5, 0.005, 'z at (27.5,17.5)');
  // the entry is the higher point
  assert.ok(r.entry[1] > r.exit[1]);
});

test('H1 C1: dry, drained parameters, l = b / cos(alpha), W positive', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = buildSlices(m, m.surfaces[0]);
  for (const s of r.slices) {
    assert.equal(s.u, 0);
    assert.equal(s.Q, 0);
    assert.equal(s.material, 'M1');
    assert.equal(s.c, 20);
    near(assert, s.phi, (20 * Math.PI) / 180, 1e-12);
    near(assert, s.l, s.b / Math.cos(s.alpha), 1e-12);
    assert.ok(s.W > 0);
    assert.ok(s.zG > s.zb);
  }
  // calculation frame: alpha > 0 where the base falls towards +x, i.e. the slice
  // order runs entry -> exit and alpha falls from positive to negative
  assert.ok(r.slices[0].alpha > 0 && r.slices[r.slices.length - 1].alpha < 0);
});

test('H1: weight of one slice equals the analytic trapezoid area', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = toInputFrame(buildSlices(m, m.surfaces[0]));
  // slice 4 (17.5 .. 20): ground linear (slope 0.5), chord from the slice outputs
  const s = r.slices[3];
  const gL = heightAt(m.ground, s.xLeft);
  const gR = heightAt(m.ground, s.xRight);
  const zL = s.zb + 0.5 * s.b * Math.tan(s.alpha);
  const zR = s.zb - 0.5 * s.b * Math.tan(s.alpha);
  const area = 0.5 * ((gL - zL) + (gR - zR)) * s.b;
  near(assert, s.W, 20 * area, 1e-9, 'W');
});

// ---------------------------------------------------------------- H2

test('H2 C1: pore pressure u = 9.81 * (ground height at xm - zb), u > 0', () => {
  const m = loadBenchmark('H2_handcalc_wet');
  const r = toInputFrame(buildSlices(m, m.surfaces[0]));
  assert.equal(r.valid, true);
  assert.equal(r.slices.length, 7);
  printTable('H2 C1 (input frame, x ascending, alpha in degrees)', r);
  for (const s of r.slices) {
    assert.ok(s.u > 0, `u > 0 at xm=${s.xm}`);
    near(assert, s.u, 9.81 * (heightAt(m.ground, s.xm) - s.zb), 1e-9, `u at xm=${s.xm}`);
  }
  // geometry and weights are those of H1 (water does not change gamma = gammaSat = 20)
  const h1 = loadBenchmark('H1_handcalc_dry');
  const r1 = toInputFrame(buildSlices(h1, h1.surfaces[0]));
  r.slices.forEach((s, i) => {
    near(assert, s.W, r1.slices[i].W, 1e-9, `W slice ${i}`);
    near(assert, s.zG, r1.slices[i].zG, 1e-9, `zG slice ${i}`);
  });
});

test('water below the slip surface: u = 0 and weight unchanged', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  m.water = [[0, 2], [35, 2]];
  const dry = buildSlices(loadBenchmark('H1_handcalc_dry'), m.surfaces[0]);
  const wet = buildSlices(m, m.surfaces[0]);
  wet.slices.forEach((s, i) => {
    assert.equal(s.u, 0);
    near(assert, s.W, dry.slices[i].W, 1e-9);
  });
});

test('water inside the slice: gamma above, gammaSat below the water line', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  m.materials.M1.gammaSat = 22; // gamma = 20
  m.water = [[0, 10], [35, 10]]; // horizontal at z = 10, the circle goes below it
  const r = buildSlices(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  // slice 2 (12.5 .. 15 in the input frame): base around 9.6, ground 11.25..12.5, water 10
  const s = toInputFrame(r).slices[1];
  const zL = s.zb + 0.5 * s.b * Math.tan(s.alpha);
  const zR = s.zb - 0.5 * s.b * Math.tan(s.alpha);
  const gL = heightAt(m.ground, s.xLeft);
  const gR = heightAt(m.ground, s.xRight);
  const dry = 0.5 * ((gL - 10) + (gR - 10)) * s.b; // above z = 10
  const wet = 0.5 * ((10 - zL) + (10 - zR)) * s.b; // below z = 10
  near(assert, s.W, 20 * dry + 22 * wet, 1e-9, 'W');
  near(assert, s.u, 9.81 * (10 - s.zb), 1e-9, 'u');
});

// ---------------------------------------------------------------- T2

for (const [name, circleOf] of [
  ['H1_handcalc_dry', (m) => m.surfaces[0]],
  ['H2_handcalc_wet', (m) => m.surfaces[0]],
  ['V03_acads_1c', () => ({ xc: 34.43, zc: 42.74, R: 18.35 })],
]) {
  test(`T2 mirrored model gives the same slices (${name})`, () => {
    const a = loadBenchmark(name);
    const b = mirrorModelForTest(a);
    const ca = circleOf(a);
    const cb = { xc: -ca.xc, zc: ca.zc, R: ca.R };
    const ra = buildSlices(a, ca);
    const rb = buildSlices(b, cb);
    assert.equal(ra.valid, true);
    assert.equal(rb.valid, true);
    assert.notEqual(ra.mirrored, rb.mirrored, 'exactly one of the two models is mirrored internally');
    assert.equal(ra.slices.length, rb.slices.length);

    // calculation frame: identical in every quantity
    ra.slices.forEach((s, i) => {
      const t = rb.slices[i];
      for (const k of ['xLeft', 'xRight', 'b', 'xm', 'zb', 'alpha', 'l', 'W', 'zG', 'Q', 'u', 'c', 'phi']) {
        near(assert, s[k], t[k], 1e-9, `${k} slice ${i}`);
      }
      assert.equal(s.material, t.material);
    });

    // input frame: same b, W, u and |alpha|; x coordinates and alpha with opposite sign
    const ia = toInputFrame(ra);
    const ib = toInputFrame(rb);
    const n = ia.slices.length;
    ia.slices.forEach((s, i) => {
      const t = ib.slices[n - 1 - i]; // mirror reverses the x order
      near(assert, s.b, t.b, 1e-9, 'b');
      near(assert, s.W, t.W, 1e-9, 'W');
      near(assert, s.u, t.u, 1e-9, 'u');
      near(assert, s.xm, -t.xm, 1e-9, 'xm');
      near(assert, s.xLeft, -t.xRight, 1e-9, 'xLeft');
      near(assert, s.alpha, -t.alpha, 1e-9, 'alpha');
    });
    near(assert, ia.entry[0], -ib.entry[0], 1e-9, 'entry x');
    near(assert, ia.exit[0], -ib.exit[0], 1e-9, 'exit x');
  });
}

// ---------------------------------------------------------------- V03

test('V03: sum of weights = 19.5 * area between ground and chords; base materials', () => {
  const m = loadBenchmark('V03_acads_1c');
  const circle = { xc: 34.43, zc: 42.74, R: 18.35 };
  const r = buildSlices(m, circle); // calculation frame (mirrored), entry -> exit
  assert.equal(r.valid, true);
  assert.equal(r.mirrored, true);
  const ri = toInputFrame(r);

  // independent area: integral of the ground minus the chord polyline through the
  // slice boundaries on the circle
  const zArc = (x) => circle.zc - Math.sqrt(circle.R ** 2 - (x - circle.xc) ** 2);
  const bounds = [ri.slices[0].xLeft, ...ri.slices.map((s) => s.xRight)];
  let chordArea = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    chordArea += 0.5 * (zArc(bounds[i]) + zArc(bounds[i + 1])) * (bounds[i + 1] - bounds[i]);
  }
  let groundArea = 0;
  const xa = bounds[0];
  const xb = bounds[bounds.length - 1];
  for (let i = 0; i < m.ground.length - 1; i++) {
    const [x0, z0] = m.ground[i];
    const [x1, z1] = m.ground[i + 1];
    const a = Math.max(x0, xa);
    const b = Math.min(x1, xb);
    if (b <= a) continue;
    const zAt = (x) => z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    groundArea += 0.5 * (zAt(a) + zAt(b)) * (b - a);
  }
  const sumW = ri.slices.reduce((acc, s) => acc + s.W, 0);
  near(assert, sumW, 19.5 * (groundArea - chordArea), 1e-8, 'sum of slice weights');

  // base materials, entry -> exit (calculation frame order)
  const seq = [];
  for (const s of r.slices) if (seq[seq.length - 1] !== s.material) seq.push(s.material);
  console.log(`\nV03 base materials, entry -> exit: ${seq.join(' -> ')}`);
  const inputSeq = [];
  for (const s of ri.slices) if (inputSeq[inputSeq.length - 1] !== s.material) inputSeq.push(s.material);
  console.log(`V03 base materials, x ascending (input frame): ${inputSeq.join(' -> ')}`);

  // order follows the layer order (each material appears once, top layer first)
  const layerIds = m.layers.map((l) => l.material);
  const layerIdx = seq.map((id) => layerIds.indexOf(id));
  assert.equal(new Set(seq).size, seq.length, 'each material appears in one run only');
  assert.deepEqual(layerIdx, [...layerIdx].sort((x, y) => x - y), 'layer order top to bottom');

  // parameters belong to the material
  for (const s of r.slices) {
    const mat = m.materials[s.material];
    assert.equal(s.c, mat.c);
    near(assert, s.phi, (mat.phi * Math.PI) / 180, 1e-12);
    assert.equal(s.u, 0);
  }
});

// ---------------------------------------------------------------- loads

test('B5: strip load on the crest is split at x1 and x2 and summed as q * overlap', () => {
  const m = loadBenchmark('B5_surcharge'); // load x 80..95, q = 50, direction left
  const r = toInputFrame(buildSlices(m, m.surfaces[0]));
  assert.equal(r.valid, true);
  const xEntry = Math.max(r.entry[0], r.exit[0]);
  const sumQ = r.slices.reduce((acc, s) => acc + s.Q, 0);
  near(assert, sumQ, 50 * (xEntry - 80), 1e-9, 'sum of Q');
  assert.ok(r.slices.some((s) => Math.abs(s.xLeft - 80) < 1e-9), 'boundary at x1 = 80');
  for (const s of r.slices) {
    assert.ok(s.Q === 0 || Math.abs(s.Q - 50 * s.b) < 1e-9, 'Q is q*b or 0');
  }
});

test('undrained material: c = cu, phi = 0, u = 0 even below water', () => {
  const m = loadBenchmark('B4_undrained');
  m.water = [[0, 20], [100, 10]];
  // lower water below ground: keep water <= ground
  m.water = [[0, 19], [30, 19], [50, 10], [100, 10]];
  const r = buildSlices(m, m.surfaces[0]);
  assert.equal(r.valid, true);
  for (const s of r.slices) {
    const mat = m.materials[s.material];
    if (mat.model === 'undrained') {
      assert.equal(s.c, mat.cu);
      assert.equal(s.phi, 0);
      assert.equal(s.u, 0);
    }
  }
});

// ---------------------------------------------------------------- invalid surfaces

test('invalid: I_INTERSECTIONS (circle does not touch the ground)', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  const r = buildSlices(m, { xc: 15, zc: 100, R: 5 });
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_INTERSECTIONS');
});

test('invalid: I_OUT_OF_MODEL (circle swallows the whole ground line: arc below the ground at both model edges)', () => {
  // before SPEC 1.2: I_INTERSECTIONS or I_OUT_OF_MODEL accepted; now the section ends at the model boundary
  const m = loadBenchmark('H1_handcalc_dry');
  const r = buildSlices(m, { xc: 17, zc: 14, R: 500 });
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_OUT_OF_MODEL');
});

test('invalid: I_DIRECTION (old I_OUT_OF_MODEL circle: section to the model edge is not higher on the left)', () => {
  // before SPEC 1.2 this circle gave I_OUT_OF_MODEL (exit beyond x = 35). With SPEC 5.1 d) the section
  // between the slope point and the model edge is rated first: it is not higher on the left (e).
  const m = loadBenchmark('H1_handcalc_dry'); // model x 0 .. 35
  const r = buildSlices(m, { xc: 30, zc: 26, R: 10 });
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_DIRECTION');
});

test('invalid: I_OUT_OF_MODEL (chosen section ends at the model boundary)', () => {
  const m = loadBenchmark('H1_handcalc_dry'); // model x 0 .. 35, slope falls to the left
  const r = buildSlices(m, { xc: 28, zc: 20, R: 8 }); // arc below the ground at x = 35
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_OUT_OF_MODEL');
});

test('invalid: I_DIRECTION (circle cuts the slope the wrong way round)', () => {
  const m = loadBenchmark('H1_handcalc_dry'); // slope falls to the left, calculation frame mirrors
  // a circle that crosses the plateau (z = 17.5) twice: entry and exit have the same height
  const flat = buildSlices(m, { xc: 30, zc: 20, R: 4 });
  assert.equal(flat.valid, false);
  assert.equal(flat.code, 'I_DIRECTION');
  // explicit wrong direction: the same circle as C1 is invalid when the model is read as right-falling
  const wrong = structuredClone(m);
  wrong.analysis.direction = 'right';
  const r = buildSlices(wrong, m.surfaces[0]);
  assert.equal(r.valid, false);
  assert.ok(['I_DIRECTION', 'I_INTERSECTIONS', 'I_OUT_OF_MODEL'].includes(r.code));
});

test('invalid: I_BELOW_MODEL', () => {
  const m = loadBenchmark('H1_handcalc_dry'); // C1 reaches z = 9.569
  m.bottom = 9.8;
  const r = buildSlices(m, m.surfaces[0]);
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_BELOW_MODEL');
  m.bottom = 9.5;
  assert.equal(buildSlices(m, m.surfaces[0]).valid, true);
});

test('invalid: I_TOO_SHALLOW (thin cap on the slope)', () => {
  const m = loadBenchmark('H1_handcalc_dry'); // slope z = 10 + 0.5 (x - 10), x 10 .. 25
  const R = 10;
  const depth = 0.05;
  const h = Math.sqrt(1.25);
  const nx = -0.5 / h;
  const nz = 1 / h;
  const circle = { xc: 17 + (R - depth) * nx, zc: 13.5 + (R - depth) * nz, R };
  const r = buildSlices(m, circle);
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_TOO_SHALLOW');
  // twice as deep (about 0.22 m thick) is accepted
  const deeper = { xc: 17 + (R - 0.2) * nx, zc: 13.5 + (R - 0.2) * nz, R };
  assert.equal(buildSlices(m, deeper).valid, true);
});

test('buildSlices throws ModelError on an invalid model', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  delete m.bottom;
  assert.throws(() => buildSlices(m, m.surfaces[0]), (e) => e.code === 'E_BOTTOM_MISSING');
});

test('slice count follows SPEC 5.3 (scales with `slices`)', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  m.analysis.slices = 50;
  const r = buildSlices(m, m.surfaces[0]);
  assert.ok(r.slices.length >= 48 && r.slices.length <= 52, `got ${r.slices.length}`);
  const widest = Math.max(...r.slices.map((s) => s.b));
  assert.ok(widest < 0.4);
});

// ---------------------------------------------------------------- slip surface rule (SPEC 5.1 a) to f))

test('upper half circle intersections are ignored (valid surface)', () => {
  // Two terraces: z = 0 (x < 10), z = 10 (20 < x < 30), z = 30 (x > 40). The centre (19, 29) lies below
  // the upper terrace: the circle meets the ground at (40, 30) on its UPPER half.
  // (Replaces the wall circle of the SPEC 1.1 test: its arc lay above the toe plateau between the two
  // lower-half intersections and is rejected by SPEC 5.1 b).)
  const m = {
    ground: [[0, 0], [10, 0], [20, 10], [30, 10], [40, 30], [60, 30]],
    bottom: -20,
    layers: [{ material: 'M', top: null }],
    materials: { M: { name: '', gamma: 20, gammaSat: 20, model: 'drained', c: 5, phi: 30 } },
    water: null,
    loads: [],
    seismic: { kh: 0 },
    analysis: { mode: 'characteristic', methods: ['bishop'], direction: 'auto', slices: 20, tolerance: 1e-4, maxIterations: 100 },
  };
  const circle = { xc: 19, zc: 29, R: 21 };
  const all = circlePolylineIntersections(circle, m.ground);
  assert.ok(all.some((h) => h.z > circle.zc), 'the circle does meet the ground on its upper half');
  assert.equal(all.filter((h) => h.z <= circle.zc).length, 3);
  const r = toInputFrame(buildSlices(m, circle));
  assert.equal(r.valid, true, r.message);
  near(assert, r.entry[1], 10, 1e-6, 'entry on the terrace z = 10');
  near(assert, r.exit[1], 8.02, 0.01, 'exit on the slope');
});

test('B1 (a): four intersections, the section between crest and slope is the slip surface', () => {
  const m = loadBenchmark('B1_homogeneous');
  // SPEC 1.2 example. The circle of the order (xc 41.22, zc 79.13, R 49.91) lies 0.002 m BELOW the toe
  // (50, 30) and therefore exits on the toe plateau (see next test). With R = 49.90 the arc passes 0.009 m
  // above the toe and the circle has four lower-half intersections.
  const circle = { xc: 41.22, zc: 79.13, R: 49.9 };
  const lower = circlePolylineIntersections(circle, m.ground).filter((h) => h.z <= circle.zc);
  assert.equal(lower.length, 4);
  const r = toInputFrame(buildSlices(m, circle));
  assert.equal(r.valid, true, r.message);
  near(assert, r.entry[1], 50, 1e-6, 'entry on z = 50');
  assert.ok(r.exit[0] > 50 && r.exit[1] > 30, `exit on the slope: ${r.exit}`);
});

test('B1 (a) with the circle of the order: valid, exit on the toe plateau', () => {
  const m = loadBenchmark('B1_homogeneous');
  const r = toInputFrame(buildSlices(m, { xc: 41.22, zc: 79.13, R: 49.91 }));
  assert.equal(r.valid, true, r.message);
  near(assert, r.entry[1], 50, 1e-6, 'entry on z = 50');
  assert.ok(r.entry[0] > 80, 'entry on the upper plateau');
  near(assert, r.exit[1], 30, 1e-6, 'exit on z = 30');
  console.log(`B1 circle 41.22/79.13/49.91: entry ${r.entry.map((v) => v.toFixed(3))} exit ${r.exit.map((v) => v.toFixed(3))}`);
});

test('(b) circle below level ground: both intersections at the same height, I_DIRECTION', () => {
  const m = loadBenchmark('H1_handcalc_dry');
  m.ground = [[0, 10], [35, 10]];
  m.analysis.direction = 'right';
  const r = buildSlices(m, { xc: 15, zc: 15, R: 8 });
  assert.equal(r.valid, false);
  assert.equal(r.code, 'I_DIRECTION');
});

test('slip surface: the section with the largest height difference wins (second dip is ignored)', () => {
  const m = loadBenchmark('B1_homogeneous');
  const r = toInputFrame(buildSlices(m, { xc: 41.22, zc: 79.13, R: 49.9 }));
  assert.ok(r.entry[0] > 80 && r.exit[0] > 50.0 && r.exit[0] < 51, `exit x = ${r.exit[0]}`);
});
