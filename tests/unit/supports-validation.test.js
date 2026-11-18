// S-T8 (SPEC_ETAPPE3 7.1): every rule of table 2.2 violated on its own ->
// expected code; one valid element per type; SIA 267 eq. 60 in mode "sia"
// and the same element in mode "characteristic". Plus mirroring (2.2 "Spiegeln").

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel, normalizeModel } from '../../core/model.js';
import { supportModel, nailFormA, anchorOf, pileOf, shotcreteOf } from './supports-helpers.js';

const codes = (model) => validateModel(model).errors.map((e) => e.code);

/** Violate one rule: the expected code must be reported (at the expected path). */
function violates(code, label, build, path) {
  test(`S-T8 ${code}: ${label}`, () => {
    const model = build();
    const before = JSON.stringify(model);
    const { valid, errors } = validateModel(model);
    assert.equal(valid, false);
    const hit = errors.filter((e) => e.code === code);
    assert.ok(hit.length > 0, `expected ${code}, got ${errors.map((e) => e.code).join(', ') || 'no error'}`);
    if (path !== undefined) assert.ok(hit.some((e) => e.path === path), `paths: ${hit.map((e) => e.path).join(', ')}`);
    assert.equal(JSON.stringify(model), before, 'validateModel must not modify the model');
  });
}

const withSupport = (s, mode) => () => supportModel([s], mode);
const nailWith = (patch) => withSupport({ ...nailFormA(), ...patch });
const without = (s, key) => {
  const c = { ...s };
  delete c[key];
  return c;
};

// ---- valid input ----

test('S-T8 valid: one element of each type gives no message', () => {
  for (const s of [nailFormA(), nailFormA({ bond: { q: 30 }, hasHead: false }), anchorOf(), pileOf(), shotcreteOf()]) {
    const r = validateModel(supportModel([s]));
    assert.deepEqual(r.errors, [], s.id);
    assert.equal(r.valid, true);
  }
});

test('S-T8 valid: all four types together, optional partial factors given', () => {
  const list = [
    nailFormA({ id: 'N1', gammaM: 1.35 }),
    anchorOf({ id: 'A1', gammaA: 1.0, gammaM: 1.35 }),
    pileOf({ id: 'P1', gammaM: 1.4 }),
    shotcreteOf({ id: 'S1', gammaC: 1.5 }),
  ];
  assert.deepEqual(validateModel(supportModel(list, 'sia')).errors, []);
});

test('S-T8 supports missing, undefined, null or [] -> no message (also without spencer)', () => {
  const m = supportModel();
  delete m.supports;
  assert.deepEqual(validateModel(m).errors, []);
  for (const v of [undefined, null, []]) {
    const m2 = supportModel();
    m2.supports = v;
    m2.analysis.methods = ['bishop', 'janbu'];
    assert.deepEqual(validateModel(m2).errors, [], String(v));
  }
});

// ---- E_SUPPORT_INVALID ----

violates('E_SUPPORT_INVALID', 'supports is not a list', () => {
  const m = supportModel();
  m.supports = { id: 'N1' };
  return m;
}, 'supports');
violates('E_SUPPORT_INVALID', 'element is not an object', () => supportModel([5]), 'supports[0]');
violates('E_SUPPORT_INVALID', 'element is null', () => supportModel([null]), 'supports[0]');
violates('E_SUPPORT_INVALID', 'nail without length', withSupport(without(nailFormA(), 'length')), 'supports[0].length');
violates('E_SUPPORT_INVALID', 'x is text', nailWith({ x: '5' }), 'supports[0].x');
violates('E_SUPPORT_INVALID', 'z is NaN', nailWith({ z: NaN }), 'supports[0].z');
violates('E_SUPPORT_INVALID', 'angle missing', withSupport(without(nailFormA(), 'angle')), 'supports[0].angle');
violates('E_SUPPORT_INVALID', 'nail length 0', nailWith({ length: 0 }), 'supports[0].length');
violates('E_SUPPORT_INVALID', 'nail spacing negative', nailWith({ spacing: -1 }), 'supports[0].spacing');
violates('E_SUPPORT_INVALID', 'nail tensile < 0', nailWith({ tensile: -1 }), 'supports[0].tensile');
violates('E_SUPPORT_INVALID', 'nail bond.diameter 0', nailWith({ bond: { tau: 80, diameter: 0 } }), 'supports[0].bond.diameter');
violates('E_SUPPORT_INVALID', 'nail bond.tau < 0', nailWith({ bond: { tau: -80, diameter: 0.1 } }), 'supports[0].bond.tau');
violates('E_SUPPORT_INVALID', 'nail bond.q < 0', nailWith({ bond: { q: -1 } }), 'supports[0].bond.q');
violates('E_SUPPORT_INVALID', 'nail bond.tau without diameter', nailWith({ bond: { tau: 80 } }), 'supports[0].bond.diameter');
violates('E_SUPPORT_INVALID', 'nail hasHead is not true/false', nailWith({ hasHead: 'yes' }), 'supports[0].hasHead');
violates('E_SUPPORT_INVALID', 'anchor freeLength 0', withSupport(anchorOf({ freeLength: 0 })), 'supports[0].freeLength');
violates('E_SUPPORT_INVALID', 'anchor bondLength < 0', withSupport(anchorOf({ bondLength: -2 })), 'supports[0].bondLength');
violates('E_SUPPORT_INVALID', 'anchor P0 < 0', withSupport(anchorOf({ P0: -1 })), 'supports[0].P0');
violates('E_SUPPORT_INVALID', 'anchor Rk missing', withSupport(without(anchorOf(), 'Rk')), 'supports[0].Rk');
violates('E_SUPPORT_INVALID', 'pile length 0', withSupport(pileOf({ length: 0 })), 'supports[0].length');
violates('E_SUPPORT_INVALID', 'pile spacing 0', withSupport(pileOf({ spacing: 0 })), 'supports[0].spacing');
violates('E_SUPPORT_INVALID', 'pile shear < 0', withSupport(pileOf({ shear: -5 })), 'supports[0].shear');
violates('E_SUPPORT_INVALID', 'shotcrete thickness 0', withSupport(shotcreteOf({ thickness: 0 })), 'supports[0].thickness');
violates('E_SUPPORT_INVALID', 'shotcrete tau < 0', withSupport(shotcreteOf({ tau: -1 })), 'supports[0].tau');
violates('E_SUPPORT_INVALID', 'shotcrete x2 missing', withSupport(without(shotcreteOf(), 'x2')), 'supports[0].x2');
violates('E_SUPPORT_INVALID', 'shotcrete x1 >= x2', withSupport(shotcreteOf({ x1: 10, x2: 10 })), 'supports[0]');
violates('E_SUPPORT_INVALID', 'path of the third element', () =>
  supportModel([nailFormA({ id: 'a' }), pileOf({ id: 'b' }), pileOf({ id: 'c', length: -1 })]), 'supports[2].length');

test('S-T8 force or stress equal to 0 is allowed (only < 0 is an error)', () => {
  assert.deepEqual(codes(supportModel([nailFormA({ tensile: 0, bond: { tau: 0, diameter: 0.1 } })])), []);
  assert.deepEqual(codes(supportModel([shotcreteOf({ tau: 0 })])), []);
});

// ---- E_SUPPORT_TYPE ----

violates('E_SUPPORT_TYPE', 'unknown type', nailWith({ type: 'wall' }), 'supports[0].type');
violates('E_SUPPORT_TYPE', 'type missing', withSupport(without(nailFormA(), 'type')), 'supports[0].type');

// ---- E_SUPPORT_ID ----

violates('E_SUPPORT_ID', 'id empty', nailWith({ id: '' }), 'supports[0].id');
violates('E_SUPPORT_ID', 'id missing', withSupport(without(nailFormA(), 'id')), 'supports[0].id');
violates('E_SUPPORT_ID', 'id not a text', nailWith({ id: 7 }), 'supports[0].id');
violates('E_SUPPORT_ID', 'id twice', () => supportModel([nailFormA({ id: 'X' }), pileOf({ id: 'X' })]), 'supports[1].id');

// ---- E_SUPPORT_BOND ----

violates('E_SUPPORT_BOND', 'neither form of bond', nailWith({ bond: {} }), 'supports[0].bond');
violates('E_SUPPORT_BOND', 'both forms of bond', nailWith({ bond: { tau: 80, diameter: 0.1, q: 30 } }), 'supports[0].bond');
violates('E_SUPPORT_BOND', 'bond missing', withSupport(without(nailFormA(), 'bond')), 'supports[0].bond');
test('S-T8 both forms of bond alone are valid', () => {
  assert.deepEqual(codes(supportModel([nailFormA({ bond: { q: 30 } })])), []);
  assert.deepEqual(codes(supportModel([nailFormA({ bond: { tau: 80, diameter: 0.1 } })])), []);
});

// ---- E_SUPPORT_ANGLE ----

violates('E_SUPPORT_ANGLE', 'nail angle 90', nailWith({ angle: 90 }), 'supports[0].angle');
violates('E_SUPPORT_ANGLE', 'nail angle -90', nailWith({ angle: -90 }), 'supports[0].angle');
violates('E_SUPPORT_ANGLE', 'nail angle 120', nailWith({ angle: 120 }), 'supports[0].angle');
violates('E_SUPPORT_ANGLE', 'anchor angle -95', withSupport(anchorOf({ angle: -95 })), 'supports[0].angle');
test('S-T8 angle inside -90 < angle < 90 (also negative and 0) is valid', () => {
  for (const a of [-89.9, -15, 0, 15, 89.9]) assert.deepEqual(codes(supportModel([nailFormA({ angle: a })])), [], String(a));
});

// ---- E_SUPPORT_OUT_OF_MODEL (ground z = 0 for x <= -8, model x -30 .. 40) ----

violates('E_SUPPORT_OUT_OF_MODEL', 'nail head left of the model', nailWith({ x: -30.5 }), 'supports[0].x');
violates('E_SUPPORT_OUT_OF_MODEL', 'anchor head right of the model', withSupport(anchorOf({ x: 41, z: -14 })), 'supports[0].x');
violates('E_SUPPORT_OUT_OF_MODEL', 'pile head outside', withSupport(pileOf({ x: 50 })), 'supports[0].x');
violates('E_SUPPORT_OUT_OF_MODEL', 'head above the ground (0.5 m)', nailWith({ x: -10, z: 0.5 }), 'supports[0].z');
violates('E_SUPPORT_OUT_OF_MODEL', 'head 0.02 m above the ground (tolerance 0.01)', nailWith({ x: -10, z: 0.02 }), 'supports[0].z');
violates('E_SUPPORT_OUT_OF_MODEL', 'pile head above the ground', withSupport(pileOf({ x: -8, z: 1 })), 'supports[0].z');
violates('E_SUPPORT_OUT_OF_MODEL', 'shotcrete x1 left of the model', withSupport(shotcreteOf({ x1: -40 })), 'supports[0]');
violates('E_SUPPORT_OUT_OF_MODEL', 'shotcrete x2 right of the model', withSupport(shotcreteOf({ x2: 41 })), 'supports[0]');
test('S-T8 head within 0.01 m above the ground, below the ground, and on the model edge: valid', () => {
  assert.deepEqual(codes(supportModel([nailFormA({ x: -10, z: 0.005 })])), []);
  assert.deepEqual(codes(supportModel([nailFormA({ x: -10, z: -3 })])), []);
  assert.deepEqual(codes(supportModel([nailFormA({ x: -30, z: 0 })])), []);
  // ground slope: z = -7(x+8)/13 -> at x=5 z=-7
  assert.deepEqual(codes(supportModel([nailFormA({ x: 5, z: -7.009 })])), []);
  // SPEC_ETAPPE3 3.4 (5): shotcrete exactly at the model edge is valid (inclusive, like loads)
  assert.deepEqual(codes(supportModel([shotcreteOf({ x1: -30, x2: 40 })])), []);
});

// ---- E_SUPPORT_FACTORS ----

violates('E_SUPPORT_FACTORS', 'gammaM = 0', nailWith({ gammaM: 0 }), 'supports[0].gammaM');
violates('E_SUPPORT_FACTORS', 'gammaA < 0', withSupport(anchorOf({ gammaA: -1 })), 'supports[0].gammaA');
violates('E_SUPPORT_FACTORS', 'gammaC is text', withSupport(shotcreteOf({ gammaC: 'x' })), 'supports[0].gammaC');
violates('E_SUPPORT_FACTORS', 'gammaM null is not > 0', withSupport(pileOf({ gammaM: null })), 'supports[0].gammaM');

// SIA 267 eq. 60: gammaA * P0 <= Rk / gammaM
violates('E_SUPPORT_FACTORS', 'eq. 60 in mode sia with the defaults (1.0*500 > 600/1.35 = 444.4)',
  withSupport(anchorOf({ P0: 500, Rk: 600 }), 'sia'), 'supports[0]');
violates('E_SUPPORT_FACTORS', 'eq. 60 in mode sia with own factors (1.2*400 = 480 > 600/1.35)',
  withSupport(anchorOf({ P0: 400, Rk: 600, gammaA: 1.2 }), 'sia'), 'supports[0]');
violates('E_SUPPORT_FACTORS', 'eq. 60 in mode sia with own gammaM (400 > 600/1.6 = 375)',
  withSupport(anchorOf({ P0: 400, Rk: 600, gammaM: 1.6 }), 'sia'), 'supports[0]');

test('S-T8 eq. 60: the same anchor in mode characteristic gives no message', () => {
  const a = anchorOf({ P0: 500, Rk: 600 });
  assert.ok(codes(supportModel([a], 'sia')).includes('E_SUPPORT_FACTORS'));
  assert.deepEqual(codes(supportModel([a], 'characteristic')), []);
});

test('S-T8 eq. 60 holds: 1.1*400 = 440 <= 600/1.35 = 444.4 (sia); equality 400 <= 540/1.35 is fine', () => {
  assert.deepEqual(codes(supportModel([anchorOf({ P0: 400, Rk: 600, gammaA: 1.1 })], 'sia')), []);
  assert.deepEqual(codes(supportModel([anchorOf({ P0: 400, Rk: 540 })], 'sia')), []);
});

// ---- E_SUPPORT_METHODS ----

violates('E_SUPPORT_METHODS', 'supports present, spencer not in methods', () => {
  const m = supportModel([nailFormA()]);
  m.analysis.methods = ['bishop', 'janbu'];
  return m;
}, 'analysis.methods');

test('S-T8 spencer among other methods is valid; empty supports need no spencer', () => {
  const a = supportModel([nailFormA()]);
  a.analysis.methods = ['bishop', 'spencer'];
  assert.deepEqual(codes(a), []);
  const b = supportModel([]);
  b.analysis.methods = ['bishop'];
  assert.deepEqual(codes(b), []);
});

test('S-T8 validateModel never throws on strange supports', () => {
  for (const v of [[undefined], [[]], ['nail'], [{ type: 'nail' }], [{ type: 'nail', bond: 5 }], 5, 'x', true]) {
    const m = supportModel();
    m.supports = v;
    assert.doesNotThrow(() => validateModel(m));
    assert.equal(validateModel(m).valid, false);
  }
});

// ---- mirroring (SPEC_ETAPPE3 2.2 "Spiegeln") ----

/** Same model in the input frame of a left-falling slope: x -> -x, ground reversed. */
function mirroredInput(model) {
  const c = structuredClone(model);
  const mp = (pts) => pts.map(([x, z]) => [-x, z]).reverse();
  c.ground = mp(c.ground);
  c.analysis.direction = 'left';
  c.supports = c.supports.map((s) => (s.type === 'shotcrete' ? { ...s, x1: -s.x2, x2: -s.x1 } : { ...s, x: -s.x }));
  return c;
}

test('S-T8 mirror: left-falling input gives the supports of the right-falling model (angle stays)', () => {
  const list = [nailFormA({ x: -10 }), anchorOf(), pileOf(), shotcreteOf({ x1: 0, x2: 10 })];
  const right = supportModel(list);
  const left = mirroredInput(right);
  assert.deepEqual(validateModel(left).errors, []);
  const before = JSON.stringify(left);
  const info = normalizeModel(left);
  assert.equal(info.mirrored, true);
  assert.deepEqual(info.model.supports, right.supports);
  assert.equal(info.model.supports[0].angle, 0);
  assert.equal(info.model.supports[1].angle, 45);
  assert.equal(JSON.stringify(left), before, 'the input model must not be changed');
  // the shotcrete range is swapped, not just negated
  assert.ok(info.model.supports[3].x1 < info.model.supports[3].x2);
});

test('S-T8 mirror: right-falling model keeps its supports; models without supports get none', () => {
  const right = supportModel([nailFormA(), shotcreteOf()]);
  assert.deepEqual(normalizeModel(right).model.supports, right.supports);
  const plain = supportModel();
  delete plain.supports;
  assert.equal('supports' in normalizeModel(plain).model, false);
  const plainLeft = mirroredInput(supportModel([]));
  delete plainLeft.supports;
  assert.equal('supports' in normalizeModel(plainLeft).model, false);
});
