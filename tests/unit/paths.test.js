// Mapping of error paths to the input areas (SPEC_ETAPPE2 5.1, 5.2).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionForPath, countBySection, SECTIONS } from '../../app/lib/paths.js';
import { validateModel } from '../../core/index.js';
import { loadBenchmark } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('sectionForPath: examples', () => {
  const cases = {
    ground: 'ground', 'ground[2]': 'ground', bottom: 'bottom', materials: 'materials', 'materials.M1': 'materials', 'materials.M1.model': 'materials',
    layers: 'layers', 'layers[1].material': 'layers', 'layers[1].top': 'layers', 'layers[2].top[3]': 'layers',
    water: 'water', 'water[4]': 'water', gammaW: 'water', loads: 'loads', 'loads[0]': 'loads', 'loads[0].type': 'loads',
    'seismic.kh': 'seismic', analysis: 'analysis', 'analysis.mode': 'analysis', 'analysis.methods': 'analysis',
    'partialFactors.phi': 'partialFactors', partialFactors: 'partialFactors', 'search.grid': 'search', 'search.radii': 'search',
    surfaces: 'surfaces', 'surfaces[2].R': 'surfaces', 'meta.name': 'project', '': 'project',
  };
  for (const [p, s] of Object.entries(cases)) assert.equal(sectionForPath(p), s, p);
  assert.equal(sectionForPath('nonsense'), null);
  assert.equal(sectionForPath('[0]'), null);
});

test('all areas of SPEC_ETAPPE2 5.1, the area Supports (SPEC_ETAPPE3 8) and the area Tension crack (SPEC_ETAPPE4 11) are reachable', () => {
  assert.equal(SECTIONS.length, 14);
  assert.equal(SECTIONS[SECTIONS.indexOf('loads') + 1], 'supports'); // Supports follow Loads
  for (const s of SECTIONS) assert.ok(SECTIONS.includes(s));
});

// --- every path the core can produce ---

/** Model with one rule violated. */
const violate = (base, mutate) => {
  const m = loadBenchmark(base);
  mutate(m);
  return m;
};

const VIOLATIONS = {
  E_GROUND_INVALID: [(m) => { m.ground = [[0, 1]]; }, (m) => { m.ground = [[0, 1], [0, 2]]; }, (m) => { m.ground = [[0, null], [3, 1]]; }],
  E_GROUND_ORDER: [(m) => { m.ground = [[0, 1], [5, 2], [3, 2]]; }],
  E_BOTTOM_MISSING: [(m) => { delete m.bottom; }, (m) => { m.bottom = null; }],
  E_BOTTOM_ABOVE_GROUND: [(m) => { m.bottom = 1000; }],
  E_LAYERS_MISSING: [(m) => { m.layers = []; }, (m) => { m.layers = [null]; }],
  E_LAYER_TOP_FIRST: [(m) => { m.layers[0].top = [[0, 1], [1, 1]]; }],
  E_LAYER_TOP_MISSING: [(m) => { m.layers[1].top = null; }, (m) => { m.layers[1].top = []; }],
  E_LAYER_ORDER: [(m) => { m.layers[1].top = [[0, 30], [60, 31], [50, 31], [130, 35]]; }],
  E_LAYER_WIDTH: [(m) => { m.layers[1].top = [[10, 30], [130, 35]]; }],
  E_LAYER_CROSS: [(m) => { m.layers[1].top = [[0, 90], [130, 90]]; }],
  E_MATERIAL_UNKNOWN: [(m) => { m.layers[0].material = 'ZZ'; }, (m) => { m.layers[0].material = null; }],
  E_MATERIAL_INVALID: [(m) => { m.materials.M1.gamma = null; }, (m) => { m.materials.M1.model = 'x'; }, (m) => { m.materials.M1.phi = 95; }, (m) => { m.materials.M2.model = 'undrained'; }, (m) => { m.materials.M1 = 5; }],
  E_WATER_INVALID: [(m) => { m.water = [[0, 1]]; }, (m) => { m.water = []; }],
  E_WATER_ORDER: [(m) => { m.water = [[0, 10], [60, 10], [50, 10], [130, 10]]; }],
  E_WATER_WIDTH: [(m) => { m.water = [[10, 10], [130, 10]]; }],
  E_WATER_ABOVE_GROUND: [(m) => { m.water = [[0, 100], [130, 100]]; }],
  E_LOAD_INVALID: [(m) => { m.loads = [{ x1: 5, x2: 2, q: 1, type: 'G' }]; }, (m) => { m.loads = [{ x1: null, x2: 2, q: 1, type: 'G' }]; }, (m) => { m.loads = [{ x1: 1, x2: 2, q: -1, type: 'G' }]; }, (m) => { m.loads = 5; }],
  E_LOAD_TYPE: [(m) => { m.loads = [{ x1: 80, x2: 90, q: 1, type: 'X' }]; }, (m) => { m.loads = [{ x1: 80, x2: 90, q: 1, type: null }]; }],
  E_LOAD_OUT_OF_MODEL: [(m) => { m.loads = [{ x1: 80, x2: 900, q: 1, type: 'G' }]; }],
  E_SEISMIC_INVALID: [(m) => { m.seismic = { kh: -1 }; }, (m) => { m.seismic = { kh: null }; }],
  E_ANALYSIS_INVALID: [(m) => { m.analysis = null; }, (m) => { m.analysis.mode = 'x'; }, (m) => { m.analysis.methods = []; }, (m) => { m.analysis.slices = 2.5; }, (m) => { m.analysis.tolerance = null; }, (m) => { m.analysis.maxIterations = 0; }],
  E_DIRECTION_INVALID: [(m) => { m.analysis.direction = 'up'; }],
  E_DIRECTION_AUTO: [(m) => { m.analysis.direction = 'auto'; m.ground = [[0, 30], [50, 40], [130, 30]]; }],
  E_FACTORS_INVALID: [(m) => { m.partialFactors.phi = 0; }, (m) => { m.partialFactors.gamma = 1.1; }, (m) => { m.partialFactors = 3; }, (m) => { m.partialFactors.R = null; }],
  E_GAMMAW_INVALID: [(m) => { m.gammaW = 0; }, (m) => { m.gammaW = 'x'; }],
  E_SEARCH_INVALID: [(m) => { m.search.grid.nx = 1.5; }, (m) => { m.search.grid = { xMin: null }; }, (m) => { m.search.radii = null; }, (m) => { m.search = { grid: null, radii: 3 }; }],
};

test('every code of the error table is produced by a violating model (the cases are effective)', () => {
  for (const [code, mutations] of Object.entries(VIOLATIONS)) {
    for (const mutate of mutations) {
      const m = violate('B3_two_layers', mutate);
      const codes = validateModel(m).errors.map((e) => e.code);
      assert.ok(codes.includes(code), `${code}: got ${codes.join(',') || 'none'}`);
    }
  }
  assert.equal(validateModel(null).errors[0].code, 'E_MODEL_INVALID');
});

test('every path of every error of the core belongs to an area of 5.1', () => {
  const seen = new Set();
  const check = (model) => {
    for (const e of validateModel(model).errors) {
      seen.add(e.path);
      assert.ok(SECTIONS.includes(sectionForPath(e.path)), `${e.code} path "${e.path}"`);
    }
  };
  check(null);
  check(5);
  check([]);
  for (const mutations of Object.values(VIOLATIONS)) for (const mutate of mutations) check(violate('B3_two_layers', mutate));
  assert.ok(seen.size >= 20, `paths seen: ${seen.size}`);
});

test('every path literal in core/model.js belongs to an area of 5.1', () => {
  const src = readFileSync(path.join(root, 'core', 'model.js'), 'utf8');
  // third argument of err(code, message, path): a string or a template literal starting with a model key
  const literals = [...src.matchAll(/,\s*[`']((?:\$\{path\}|ground|bottom|materials|layers|water|loads|seismic|analysis|partialFactors|search|gammaW)[^`']*)[`']\s*,?\s*\)/g)].map((m) => m[1]);
  assert.ok(literals.length >= 35, `literals: ${literals.length}`);
  for (const lit of literals) assert.ok(SECTIONS.includes(sectionForPath(lit.replaceAll('${path}', 'layers[0]'))), lit);
  // path variables of the core: `${path}` is layers[k], loads[i] or materials.id
  assert.match(src, /const path = `layers\[\$\{k\}\]`/);
  assert.match(src, /const path = `materials\.\$\{id\}`/);
  assert.match(src, /const path = `loads\[\$\{i\}\]`/);
});

test('countBySection counts per area, ignores unknown paths', () => {
  const c = countBySection([{ path: 'ground[1]' }, { path: 'ground' }, { path: 'bottom' }, { path: 'surfaces[0].R' }, { path: 'zzz' }]);
  assert.equal(c.ground, 2);
  assert.equal(c.bottom, 1);
  assert.equal(c.surfaces, 1);
  assert.equal(c.water, 0);
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), 4);
});

// --- SPEC_ETAPPE2 5.1 (version 1.3): partial factors area and gamma ---

import { partialFactorsVisible, gammaEditable } from '../../app/lib/paths.js';

test('partial factors area: visible in sia, in characteristic only with an error', () => {
  assert.equal(partialFactorsVisible('sia', 0), true);
  assert.equal(partialFactorsVisible('sia', 3), true);
  assert.equal(partialFactorsVisible('characteristic', 0), false);
  assert.equal(partialFactorsVisible('characteristic', 1), true);
  assert.equal(partialFactorsVisible(undefined, 0), false);
  assert.equal(partialFactorsVisible('x', 2), true);
});

test('an error in the partial factors comes from the core and belongs to the area (so the area is shown)', () => {
  const m = loadBenchmark('B1_homogeneous');
  assert.equal(m.analysis.mode, 'characteristic');
  m.partialFactors.phi = 0;
  const errors = validateModel(m).errors;
  assert.equal(countBySection(errors).partialFactors, 1);
  assert.equal(partialFactorsVisible(m.analysis.mode, countBySection(errors).partialFactors), true);
  assert.equal(sectionForPath(errors[0].path), 'partialFactors');
  m.partialFactors.phi = 1.2;
  assert.equal(partialFactorsVisible(m.analysis.mode, countBySection(validateModel(m).errors).partialFactors), false);
});

test('gamma: not editable while 1 (or absent), editable when it is not 1', () => {
  assert.equal(gammaEditable({ gamma: 1 }), false);
  assert.equal(gammaEditable({ phi: 1.2 }), false);
  assert.equal(gammaEditable(undefined), false);
  assert.equal(gammaEditable(null), false);
  assert.equal(gammaEditable({ gamma: 1.1 }), true);
  assert.equal(gammaEditable({ gamma: 0.9 }), true);
  assert.equal(gammaEditable({ gamma: null }), true, 'emptied or unreadable');
  assert.equal(gammaEditable({ gamma: 'x' }), true);
  const m = loadBenchmark('B1_homogeneous');
  assert.equal(gammaEditable(m.partialFactors), false);
  m.partialFactors.gamma = 1.1;
  assert.equal(gammaEditable(m.partialFactors), true);
  assert.ok(validateModel(m).errors.some((e) => e.path === 'partialFactors.gamma'));
  m.partialFactors.gamma = 1;
  assert.equal(gammaEditable(m.partialFactors), false);
  assert.equal(validateModel(m).valid, true);
});
