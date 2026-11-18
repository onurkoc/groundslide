// Order 28 (SPEC_ETAPPE4 12a, 13a): the arc of a circle between entry and exit, favicon, column "Typ".
// No DOM: the pure functions of app/lib; the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../core/index.js';
import { slopeDirection } from '../../app/lib/supports-sketch.js';
import { buildResultOverlay, circleArcPoints, circleBody, circleSection, singleArcs } from '../../app/lib/result-sketch.js';
import { MESSAGES } from '../../app/lib/i18n.js';
import { loadBenchmark, mirrorModelForTest, near } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

// ------------------------------------------------------------ the circle between entry and exit

const B1_CIRCLE = { xc: 45.771484375, zc: 71.962890625, R: 42.175302001600194 }; // the Spencer circle of the search in B3 (the circle ends at the toe): it also lies under the flat ground left of the toe (lowest z 29.79), where it is not a slip body

test('a circle is drawn between entry and exit only: the arc points start at the entry and end at the exit, all on the circle, none beyond', () => {
  const model = loadBenchmark('B1_homogeneous');
  model.search = null;
  model.surfaces = [{ id: 'C1', ...B1_CIRCLE }];
  const r = analyze(model);
  const s = r.surfaces[0];
  assert.equal(s.valid, true);
  const arc = circleArcPoints(B1_CIRCLE, s.entry, s.exit);
  assert.deepEqual(arc[0], s.exit[0] < s.entry[0] ? s.exit : s.entry, 'from the left point');
  assert.deepEqual(arc.at(-1), s.exit[0] < s.entry[0] ? s.entry : s.exit, 'to the right point');
  const xs = arc.map((p) => p[0]);
  assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1]), 'x increasing');
  assert.ok(Math.min(...xs) >= Math.min(s.entry[0], s.exit[0]) - 1e-9 && Math.max(...xs) <= Math.max(s.entry[0], s.exit[0]) + 1e-9, 'nothing beyond the ends');
  for (const p of arc) near(assert, Math.hypot(p[0] - B1_CIRCLE.xc, p[1] - B1_CIRCLE.zc), B1_CIRCLE.R, 1e-6, 'on the circle');
  // the circle itself reaches under the ground left of the toe (x < 50, z = 30), where the arc is NOT drawn
  const lowest = B1_CIRCLE.zc - B1_CIRCLE.R;
  assert.ok(lowest < 30 && B1_CIRCLE.xc < 50);
  assert.ok(Math.min(s.entry[0], s.exit[0]) > 49.5, 'the exit is at the toe of the slope: the part left of it (x about 41.6 to 49.9, under the flat ground) is another section');
  const left = arc.filter((p) => p[0] < 49.5);
  assert.equal(left.length, 0, 'nothing of the circle left of the toe is drawn');
  // the slip body polygon: the arc, then the ground back
  const body = circleBody(B1_CIRCLE, s.entry, s.exit, model.ground);
  assert.deepEqual(body[0], arc[0]);
  assert.ok(body.length > arc.length);
  assert.deepEqual(circleArcPoints({ xc: 1, zc: 1, R: 0 }, [0, 0], [1, 1]), []);
});

test('entry and exit of a single circle without a calculation: the section the core takes (largest height difference), in both directions', () => {
  for (const flip of [false, true]) {
    const model = flip ? mirrorModelForTest(loadBenchmark('B1_homogeneous')) : loadBenchmark('B1_homogeneous');
    const circle = flip ? { xc: -B1_CIRCLE.xc, zc: B1_CIRCLE.zc, R: B1_CIRCLE.R } : B1_CIRCLE;
    model.search = null;
    model.surfaces = [{ id: 'C1', ...circle }];
    const s = analyze(model).surfaces[0];
    const section = circleSection(circle, model.ground, slopeDirection(model));
    assert.ok(section, flip ? 'mirrored' : 'as is');
    near(assert, section.entry[0], s.entry[0], 1e-6, 'x of the entry');
    near(assert, section.entry[1], s.entry[1], 1e-6, 'z of the entry');
    near(assert, section.exit[0], s.exit[0], 1e-6, 'x of the exit');
    near(assert, section.exit[1], s.exit[1], 1e-6, 'z of the exit');
  }
  // a circle above the ground has no section; one that leaves the model at an edge has none (the core: I_OUT_OF_MODEL)
  assert.equal(circleSection({ xc: 50, zc: 200, R: 10 }, [[0, 30], [50, 30], [80, 50], [130, 50]], 'left'), null);
  assert.equal(circleSection(null, [[0, 0], [1, 1]], 'left'), null);
  const sketch = read('app', 'ui', 'sketch.js');
  assert.match(sketch, /const span = known \|\| circleSection\(c, sketch\.ground, slopeDirection\(modelRef\)\);/, 'single circles: the result when there is one, else worked out');
  assert.doesNotMatch(sketch, /s\('circle', \{ class: '(?:sk-circle|rs-halo|rs-circle|rs-search|rs-body)'/, 'no full circle element any more');
});

test('the overlay carries entry and exit of the circle of every method, of searchCircle and of the valid single circles', () => {
  const model = loadBenchmark('B3_two_layers');
  model.analysis.methods = ['bishop', 'janbu', 'spencer'];
  model.search = { grid: { xMin: 40, xMax: 60, zMin: 70, zMax: 90, nx: 3, nz: 3 }, radii: 6, optimize: { points: 9 } };
  model.surfaces = [{ id: 'C1', xc: 50, zc: 80, R: 52 }, { id: 'BAD', xc: 50, zc: 300, R: 10 }];
  const result = analyze(model);
  const overlay = buildResultOverlay(result, { method: 'spencer', contour: false, grid: model.search.grid });
  const bishop = overlay.circles.find((c) => c.method === 'bishop');
  assert.deepEqual(bishop.entry, result.critical.bishop.entry);
  assert.deepEqual(bishop.exit, result.critical.bishop.exit);
  const sc = result.critical.spencer.searchCircle;
  assert.deepEqual(overlay.searchCircle, { xc: sc.xc, zc: sc.zc, R: sc.R, entry: sc.entry, exit: sc.exit });
  assert.deepEqual(Object.keys(overlay.singleArcs), ['C1'], 'only valid single circles');
  assert.deepEqual(overlay.singleArcs.C1, { entry: result.surfaces[0].entry, exit: result.surfaces[0].exit });
  assert.deepEqual(singleArcs(null), {});
});

// ------------------------------------------------------------ corrections of order 27: column Typ, favicon

test('favicon: app/favicon.svg with the two paths of the logo in the header, the light accent colour as a fixed colour; index.html points to it', () => {
  const file = path.join(root, 'app', 'favicon.svg');
  assert.ok(existsSync(file));
  const svg = read('app', 'favicon.svg');
  const html = read('app', 'index.html');
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  assert.doesNotMatch(html, /href="data:,"/);
  // the two paths are those of the logo in the header
  const logo = html.slice(html.indexOf('<div class="brand">'), html.indexOf('</div>', html.indexOf('<div class="brand">')));
  for (const d of ['M2 17 L9 17 L15 8 L22 8', 'M5 21 A 11 11 0 0 0 19 12']) {
    assert.ok(logo.includes(`d="${d}"`), `header: ${d}`);
    assert.ok(svg.includes(`d="${d}"`), `favicon: ${d}`);
  }
  assert.ok(svg.includes('stroke-dasharray="2 3"'));
  // the accent colour of the light scheme as a fixed colour (no CSS variable in a file used as an icon)
  const css = read('app', 'style.css');
  const accent = css.match(/--color-accent: light-dark\((#[0-9a-fA-F]{6}),/)[1].toLowerCase();
  assert.match(svg, new RegExp(`stroke="${accent}"`));
  assert.doesNotMatch(svg, /var\(/);
});

test('single surfaces table: the narrow cells let "Kreis" and "Polylinie" show completely without a horizontal scroll bar (rules in style.css)', () => {
  const css = read('app', 'style.css');
  const rules = css.slice(css.indexOf('/* table of the single surfaces:'));
  assert.match(rules, /\.table-block\[data-path="surfaces"\] table\.compact td \{ padding: 0 2px; \}|\.table-block\[data-path="surfaces"\] table\.compact th,\n\.table-block\[data-path="surfaces"\] table\.compact td \{ padding: 0 2px; \}/);
  assert.match(rules, /td\.surf-type select \{ min-width: 9ch;/);
  const sections = read('app', 'ui', 'sections-analysis.js');
  assert.match(sections, /\{ label: 'ID', cls: 'surf-id' \}, \{ label: ctx\.t\('ui\.col\.type'\), cls: 'surf-type' \}/);
  assert.equal(MESSAGES.de['ui.surf.circle'], 'Kreis');
  assert.equal(MESSAGES.de['ui.surf.polyline'], 'Polylinie');
});
