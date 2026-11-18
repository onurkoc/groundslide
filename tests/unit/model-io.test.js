// U2 and U3 (SPEC_ETAPPE2 chapter 10): reading and writing the model file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModel, writeModel, createNewModel, fileNameFor, sketchFileNameFor, baseNameFor, FORMAT_VERSION } from '../../app/lib/model-io.js';
import { MESSAGES } from '../../app/lib/i18n.js';
import { validateModel } from '../../core/index.js';

const benchDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks');
const benchFiles = readdirSync(benchDir).filter((f) => f.endsWith('.json'));

test('U2 sanity: benchmark files found', () => {
  assert.ok(benchFiles.length >= 15, `files: ${benchFiles.length}`);
});

for (const file of benchFiles) {
  test(`U2 read and write ${file}: content equal except the added formatVersion`, () => {
    const text = readFileSync(path.join(benchDir, file), 'utf8');
    const original = JSON.parse(text);

    const r = readModel(text);
    assert.equal(r.ok, true);
    const written = writeModel(r.model);
    assert.deepEqual(JSON.parse(written), { formatVersion: 1, ...original });

    // unknown fields (expected, surfaces) survive, also a second round
    const again = readModel(written);
    assert.equal(again.ok, true);
    assert.deepEqual(again.model, r.model);
    assert.equal(writeModel(again.model), written);
    if (original.expected) assert.deepEqual(JSON.parse(written).expected, original.expected);
  });
}

test('U2 output has 2 spaces indent and formatVersion first', () => {
  const written = writeModel({ meta: { name: 'x' }, extra: { deep: [1, 2] } });
  assert.ok(written.startsWith('{\n  "formatVersion": 1,\n  "meta": {\n    "name": "x"\n  },'));
  assert.equal(JSON.parse(written).formatVersion, FORMAT_VERSION);
});

test('U2 unknown fields of any kind are kept, a stale formatVersion in the model is replaced', () => {
  const model = { custom: { a: [1, { b: null }] }, expected: { x: null }, formatVersion: 1 };
  const out = JSON.parse(writeModel(model));
  assert.deepEqual(out, { formatVersion: 1, custom: { a: [1, { b: null }] }, expected: { x: null } });
  assert.throws(() => writeModel(null), TypeError);
  assert.throws(() => writeModel([]), TypeError);
});

// --- U3 ---

const withVersion = (v) => JSON.stringify({ ...JSON.parse(readFileSync(path.join(benchDir, 'B1_homogeneous.json'), 'utf8')), ...(v === undefined ? {} : { formatVersion: v }) });

test('U3 formatVersion missing -> 1', () => {
  const r = readModel(withVersion(undefined));
  assert.equal(r.ok, true);
  assert.equal(r.formatVersion, 1);
});

test('U3 formatVersion 1 -> 1', () => {
  const r = readModel(withVersion(1));
  assert.equal(r.ok, true);
  assert.equal(r.formatVersion, 1);
  assert.ok(!('formatVersion' in r.model));
});

test('U3 formatVersion 2 -> error APP_FORMAT_VERSION, file not loaded, text in both languages', () => {
  for (const lang of ['de', 'en']) {
    const r = readModel(withVersion(2), lang);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'APP_FORMAT_VERSION');
    assert.equal(r.model, undefined);
    assert.ok(r.error.message.includes('2'), r.error.message);
    assert.ok(!r.error.message.includes('{'), 'placeholders filled');
    assert.notEqual(r.error.message, 'APP_FORMAT_VERSION');
  }
  assert.notEqual(readModel(withVersion(2), 'de').error.message, readModel(withVersion(2), 'en').error.message);
});

test('U3 formatVersion that is not a positive integer is refused as well', () => {
  for (const v of [0, -1, 1.5, '1', null, true, [], {}]) {
    const r = readModel(withVersion(v));
    assert.equal(r.ok, false, JSON.stringify(v));
    assert.equal(r.error.code, 'APP_FORMAT_VERSION', JSON.stringify(v));
  }
});

test('U3 invalid JSON -> APP_JSON_INVALID with text; not an object likewise', () => {
  for (const text of ['', '{', 'not json', '[1,2]', '42', 'null', '"x"']) {
    for (const lang of ['de', 'en']) {
      const r = readModel(text, lang);
      assert.equal(r.ok, false, text);
      assert.equal(r.error.code, 'APP_JSON_INVALID', text);
      assert.equal(r.error.message, MESSAGES[lang].APP_JSON_INVALID);
    }
  }
});

test('U3 a UTF-8 byte order mark is accepted', () => {
  const r = readModel('﻿' + withVersion(1));
  assert.equal(r.ok, true);
});

// --- template "New" and file name ---

test('template New: geometry and parameters of B1, no expected, no surfaces, valid', () => {
  const b1 = JSON.parse(readFileSync(path.join(benchDir, 'B1_homogeneous.json'), 'utf8'));
  for (const lang of ['de', 'en']) {
    const m = createNewModel(lang);
    assert.equal(m.meta.name, MESSAGES[lang]['model.newName']);
    assert.ok(!('expected' in m) && !('surfaces' in m));
    const { meta: _m1, expected: _e, surfaces: _s, ...b1Rest } = b1;
    const { meta: _m2, ...mRest } = m;
    assert.deepEqual(mRest, b1Rest);
    assert.equal(validateModel(m).valid, true);
    // a fresh object each call
    assert.notEqual(createNewModel(lang), createNewModel(lang));
  }
  assert.equal(createNewModel('de').meta.name, 'Neues Modell');
  assert.equal(createNewModel('en').meta.name, 'New model');
});

test('template New survives write and read', () => {
  const m = createNewModel('de');
  const r = readModel(writeModel(m));
  assert.equal(r.ok, true);
  assert.deepEqual(r.model, m);
});

test('file name: <meta.name>.json, forbidden characters replaced, fallback "model"', () => {
  assert.equal(fileNameFor({ meta: { name: 'B1 homogeneous' } }), 'B1 homogeneous.json');
  assert.equal(fileNameFor({ meta: { name: 'a/b\\c:d*e?f"g<h>i|j' } }), 'a_b_c_d_e_f_g_h_i_j.json');
  assert.equal(fileNameFor({ meta: { name: '  ' } }), 'model.json');
  assert.equal(fileNameFor({ meta: { name: 'name. ' } }), 'name.json');
  assert.equal(fileNameFor({}), 'model.json');
  assert.equal(fileNameFor(null), 'model.json');
});

test('file name of the graphic export: same rules as when saving, "_sketch.png" / "_sketch.svg" instead of ".json" (SPEC_ETAPPE2 8.4)', () => {
  assert.equal(sketchFileNameFor({ meta: { name: 'B1 homogeneous' } }, 'png'), 'B1 homogeneous_sketch.png');
  assert.equal(sketchFileNameFor({ meta: { name: 'B1 homogeneous' } }, 'svg'), 'B1 homogeneous_sketch.svg');
  assert.equal(sketchFileNameFor({ meta: { name: 'a/b\\c:d*e?f"g<h>i|j' } }, 'svg'), 'a_b_c_d_e_f_g_h_i_j_sketch.svg');
  assert.equal(sketchFileNameFor({ meta: { name: '  ' } }, 'png'), 'model_sketch.png', 'empty name: model');
  assert.equal(sketchFileNameFor({ meta: { name: 'name. ' } }, 'png'), 'name_sketch.png', 'trailing dots and blanks are dropped');
  assert.equal(sketchFileNameFor({}, 'svg'), 'model_sketch.svg');
  assert.equal(sketchFileNameFor(null, 'png'), 'model_sketch.png');
  assert.equal(sketchFileNameFor({ meta: { name: 'x.json' } }, 'png'), 'x.json_sketch.png', 'a name that ends in .json keeps it');
  // the base of both file names is the same text
  for (const name of ['B1', 'a:b', '', 'ä ö ü']) {
    const model = { meta: { name } };
    assert.equal(fileNameFor(model), `${baseNameFor(model)}.json`);
    assert.equal(sketchFileNameFor(model, 'png'), `${baseNameFor(model)}_sketch.png`);
  }
});
