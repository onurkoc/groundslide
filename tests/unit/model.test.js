// T6 (SPEC 10.1): every input rule of chapter 4 violated on its own,
// expected error code. Plus normalisation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel, normalizeModel, circleToCore, xToInput, pointToInput, angleToInput } from '../../core/model.js';
import { BENCHMARK_NAMES, loadBenchmark } from './helpers.js';

const base = () => loadBenchmark('H1_handcalc_dry');

/** Violate exactly one rule and expect the given code. */
function violates(code, mutate, label = code) {
  test(`T6 ${label}`, () => {
    const m = base();
    mutate(m);
    const before = JSON.stringify(m);
    const { valid, errors } = validateModel(m);
    assert.equal(valid, false, 'model must be invalid');
    assert.ok(
      errors.some((e) => e.code === code),
      `expected ${code}, got ${errors.map((e) => e.code).join(', ') || 'no error'}`,
    );
    for (const e of errors) {
      assert.equal(typeof e.message, 'string');
      assert.ok(e.message.length > 0);
    }
    assert.equal(JSON.stringify(m), before, 'validateModel must not modify the model');
  });
}

test('T6 valid models: all benchmark files pass', () => {
  for (const name of BENCHMARK_NAMES) {
    const { valid, errors } = validateModel(loadBenchmark(name));
    assert.deepEqual(errors, [], `${name} should be valid`);
    assert.equal(valid, true);
  }
});

test('T6 water = null and missing water are both dry (valid)', () => {
  const m = base();
  delete m.water;
  assert.equal(validateModel(m).valid, true);
  m.water = null;
  assert.equal(validateModel(m).valid, true);
});

test('T6 a layer boundary may touch the layer above', () => {
  const m = base();
  m.materials.M2 = { name: '', gamma: 20, gammaSat: 20, model: 'drained', c: 0, phi: 30 };
  m.layers.push({ material: 'M2', top: [[0, 10], [10, 10], [25, 17.5], [35, 17.5]] }); // = ground
  assert.equal(validateModel(m).valid, true);
});

test('T6 E_MODEL_INVALID null model', () => {
  const { valid, errors } = validateModel(null);
  assert.equal(valid, false);
  assert.equal(errors[0].code, 'E_MODEL_INVALID');
});

test('T6 null layer between valid layers reports E_LAYERS_MISSING instead of throwing', () => {
  const m = base();
  m.layers = [m.layers[0], null, { material: 'M1', top: [[0, 5], [35, 5]] }];
  const before = JSON.stringify(m);
  let result;
  assert.doesNotThrow(() => { result = validateModel(m); });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.code === 'E_LAYERS_MISSING' && e.path === 'layers[1]'));
  assert.equal(JSON.stringify(m), before);
});

test('T6 validateModel never throws when any model field is replaced with null, number, string or empty array', () => {
  // Include nested object fields, array entries, coordinates and the root.
  // All benchmarks together cover water, layers, loads, search and both soil models.
  function* paths(value, prefix = []) {
    yield prefix;
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) yield* paths(value[key], [...prefix, key]);
    }
  }
  let checked = 0;
  for (const name of BENCHMARK_NAMES) {
    const original = loadBenchmark(name);
    for (const keys of paths(original)) {
      for (const replacement of [null, 42, 'invalid', []]) {
        let m = structuredClone(original);
        if (keys.length === 0) m = replacement;
        else {
          let parent = m;
          for (const key of keys.slice(0, -1)) parent = parent[key];
          parent[keys.at(-1)] = replacement;
        }
        const label = `${name}.${keys.join('.')} = ${JSON.stringify(replacement)}`;
        const before = JSON.stringify(m);
        let result;
        assert.doesNotThrow(() => { result = validateModel(m); }, label);
        assert.equal(typeof result.valid, 'boolean', label);
        assert.ok(Array.isArray(result.errors), label);
        assert.equal(result.valid, result.errors.length === 0, label);
        for (const error of result.errors) {
          assert.match(error.code, /^E_/, label);
          assert.equal(typeof error.message, 'string', label);
          assert.ok(error.message.length > 0, label);
        }
        assert.equal(JSON.stringify(m), before, label);
        checked++;
      }
    }
  }
  console.log(`T6 non-throwing validation: ${checked} field replacements checked`);
});

test('T6 sparse geometry, layer and method arrays report validation errors', () => {
  for (const mutate of [
    m => { m.ground = new Array(2); },
    m => { m.layers = new Array(1); },
    m => { m.analysis.methods = new Array(1); },
  ]) {
    const m = base();
    mutate(m);
    assert.equal(validateModel(m).valid, false);
  }
});

test('T6 inaccessible model properties return E_MODEL_INVALID', () => {
  const m = { get ground() { throw new TypeError('unreadable property'); } };
  let result;
  assert.doesNotThrow(() => { result = validateModel(m); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'E_MODEL_INVALID');
});

violates('E_GROUND_INVALID', (m) => { m.ground = [[0, 10]]; }, 'E_GROUND_INVALID (one point)');
violates('E_GROUND_INVALID', (m) => { m.ground = [[0, 10], [0, 12]]; }, 'E_GROUND_INVALID (zero width)');
violates('E_GROUND_INVALID', (m) => { m.ground = [[0, 10], ['a', 12]]; }, 'E_GROUND_INVALID (non-numeric)');
violates('E_GROUND_ORDER', (m) => { m.ground = [[0, 10], [10, 10], [5, 12], [35, 17.5]]; });
violates('E_BOTTOM_MISSING', (m) => { delete m.bottom; });
violates('E_BOTTOM_ABOVE_GROUND', (m) => { m.bottom = 12; });

violates('E_LAYERS_MISSING', (m) => { m.layers = []; });
violates('E_LAYER_TOP_FIRST', (m) => { m.layers[0].top = [[0, 5], [35, 5]]; });
violates('E_LAYER_TOP_MISSING', (m) => {
  m.layers.push({ material: 'M1', top: null });
});
violates('E_LAYER_ORDER', (m) => {
  m.layers.push({ material: 'M1', top: [[0, 5], [20, 5], [20, 6], [35, 6]] });
});
violates('E_LAYER_WIDTH', (m) => {
  m.layers.push({ material: 'M1', top: [[0, 5], [30, 5]] });
});
violates('E_LAYER_CROSS', (m) => {
  m.layers.push({ material: 'M1', top: [[0, 5], [20, 18], [35, 5]] }); // above the ground at x = 20
});
violates('E_LAYER_CROSS', (m) => {
  m.layers.push({ material: 'M1', top: [[0, 8], [35, 8]] });
  m.layers.push({ material: 'M1', top: [[0, 7], [35, 9]] }); // crosses the boundary above
}, 'E_LAYER_CROSS (between two layer boundaries)');
violates('E_MATERIAL_UNKNOWN', (m) => { m.layers[0].material = 'X9'; });
violates('E_MATERIAL_INVALID', (m) => { m.materials.M1.phi = -5; }, 'E_MATERIAL_INVALID (phi < 0)');
violates('E_MATERIAL_INVALID', (m) => { m.materials.M1.gamma = 0; }, 'E_MATERIAL_INVALID (gamma = 0)');
violates('E_MATERIAL_INVALID', (m) => { m.materials.M1.model = 'foo'; }, 'E_MATERIAL_INVALID (model)');
violates('E_MATERIAL_INVALID', (m) => {
  m.materials.M1 = { name: '', gamma: 20, gammaSat: 20, model: 'undrained' };
}, 'E_MATERIAL_INVALID (cu missing)');

violates('E_WATER_INVALID', (m) => { m.water = [[0, 5]]; });
violates('E_WATER_ORDER', (m) => { m.water = [[0, 5], [20, 5], [20, 6], [35, 6]]; });
violates('E_WATER_WIDTH', (m) => { m.water = [[5, 5], [35, 5]]; });
violates('E_WATER_ABOVE_GROUND', (m) => { m.water = [[0, 5], [35, 18]]; });
violates('E_WATER_ABOVE_GROUND', (m) => { m.water = [[0, 11], [35, 11]]; }, 'E_WATER_ABOVE_GROUND (above ground at the left end)');

violates('E_LOAD_INVALID', (m) => { m.loads = [{ x1: 5, x2: 2, q: 10, type: 'G' }]; }, 'E_LOAD_INVALID (x1 >= x2)');
violates('E_LOAD_INVALID', (m) => { m.loads = [{ x1: 1, x2: 2, type: 'G' }]; }, 'E_LOAD_INVALID (q missing)');
violates('E_LOAD_TYPE', (m) => { m.loads = [{ x1: 1, x2: 2, q: 10, type: 'X' }]; });
violates('E_LOAD_OUT_OF_MODEL', (m) => { m.loads = [{ x1: 30, x2: 40, q: 10, type: 'Q' }]; });

violates('E_SEISMIC_INVALID', (m) => { m.seismic = { kh: -0.1 }; });
violates('E_ANALYSIS_INVALID', (m) => { m.analysis.mode = 'foo'; }, 'E_ANALYSIS_INVALID (mode)');
violates('E_ANALYSIS_INVALID', (m) => { m.analysis.slices = 0; }, 'E_ANALYSIS_INVALID (slices)');
violates('E_ANALYSIS_INVALID', (m) => { m.analysis.methods = ['foo']; }, 'E_ANALYSIS_INVALID (methods)');
violates('E_ANALYSIS_INVALID', (m) => { m.analysis.tolerance = 0; }, 'E_ANALYSIS_INVALID (tolerance)');
violates('E_ANALYSIS_INVALID', (m) => { m.analysis.maxIterations = 1.5; }, 'E_ANALYSIS_INVALID (maxIterations)');
violates('E_ANALYSIS_INVALID', (m) => { delete m.analysis; }, 'E_ANALYSIS_INVALID (missing)');
violates('E_DIRECTION_INVALID', (m) => { m.analysis.direction = 'up'; });
violates('E_DIRECTION_AUTO', (m) => {
  m.analysis.direction = 'auto';
  m.ground = [[0, 10], [35, 10]];
});
violates('E_FACTORS_INVALID', (m) => { m.partialFactors.phi = 0; });
violates('E_GAMMAW_INVALID', (m) => { m.gammaW = -1; });

test('T6 every violation is reported, none repaired (several errors at once)', () => {
  const m = base();
  m.bottom = 'x';
  m.water = [[0, 5]];
  m.loads = [{ x1: 1, x2: 2, q: 10, type: 'X' }];
  const codes = validateModel(m).errors.map((e) => e.code);
  for (const c of ['E_BOTTOM_MISSING', 'E_WATER_INVALID', 'E_LOAD_TYPE']) assert.ok(codes.includes(c), c);
});

// ---- normalisation (SPEC 3) ----

test('normalizeModel: direction "auto" from the ground line', () => {
  const m = base(); // ground rises to the right -> slope falls to the left
  m.analysis.direction = 'auto';
  assert.equal(normalizeModel(m).direction, 'left');
  assert.equal(normalizeModel(m).mirrored, true);

  const r = structuredClone(m);
  r.ground = [[0, 17.5], [10, 17.5], [25, 10], [35, 10]]; // higher end on the left
  assert.equal(normalizeModel(r).direction, 'right');
  assert.equal(normalizeModel(r).mirrored, false);
});

test('normalizeModel: explicit direction wins, input is not modified', () => {
  const m = base();
  const before = JSON.stringify(m);
  const n = normalizeModel(m); // direction "left"
  assert.equal(n.mirrored, true);
  assert.equal(JSON.stringify(m), before);
  // mirrored ground: x -> -x, ascending, higher end on the left
  assert.deepEqual(n.model.ground, [[-35, 17.5], [-25, 17.5], [-10, 10], [0, 10]]);
  assert.ok(n.model.ground[0][1] > n.model.ground[n.model.ground.length - 1][1]);

  m.analysis.direction = 'right';
  const r = normalizeModel(m);
  assert.equal(r.mirrored, false);
  assert.deepEqual(r.model.ground, m.ground);
});

test('normalizeModel: layers, water and loads are mirrored too', () => {
  const m = loadBenchmark('V16_arai_tagyo_3'); // water, direction left
  m.loads = [{ x1: 50, x2: 60, q: 20, type: 'Q' }];
  const n = normalizeModel(m);
  assert.equal(n.mirrored, true);
  assert.deepEqual(n.model.water, [[-66, 32], [-48, 29], [-30, 23], [-18, 15], [0, 15]]);
  assert.deepEqual(n.model.loads, [{ x1: -60, x2: -50, q: 20, type: 'Q' }]);
});

test('back-mapping functions', () => {
  const info = { mirrored: true };
  assert.deepEqual(circleToCore({ xc: 13, zc: 25, R: 16 }, info), { xc: -13, zc: 25, R: 16 });
  assert.equal(xToInput(-4, info), 4);
  assert.deepEqual(pointToInput([-4, 7], info), [4, 7]);
  assert.equal(angleToInput(0.3, info), -0.3);
  const id = { mirrored: false };
  assert.equal(xToInput(-4, id), -4);
  assert.equal(angleToInput(0.3, id), 0.3);
});

// ---- SPEC 1.1 additions ----

violates('E_FACTORS_INVALID', (m) => { m.partialFactors.gamma = 1.1; }, 'E_FACTORS_INVALID (gamma != 1.0)');

test('T6 partialFactors.gamma = 1.0 is accepted', () => {
  const m = base();
  m.partialFactors.gamma = 1.0;
  assert.equal(validateModel(m).valid, true);
});

violates('E_SEARCH_INVALID', (m) => { m.search = { grid: { xMin: 5, xMax: 0, zMin: 0, zMax: 1, nx: 3, nz: 3 }, radii: 10 }; }, 'E_SEARCH_INVALID (xMin > xMax)');
violates('E_SEARCH_INVALID', (m) => { m.search = { grid: { xMin: 0, xMax: 5, zMin: 0, zMax: 1, nx: 0, nz: 3 }, radii: 10 }; }, 'E_SEARCH_INVALID (nx = 0)');
violates('E_SEARCH_INVALID', (m) => { m.search = { grid: { xMin: 0, xMax: 5, zMin: 0, zMax: 1, nx: 3, nz: 3 }, radii: 0 }; }, 'E_SEARCH_INVALID (radii)');
