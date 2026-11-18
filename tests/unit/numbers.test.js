// Number input (SPEC_ETAPPE2 5.1, 5.3).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, formatNumber, formatCoordinate } from '../../app/lib/numbers.js';

test('parseNumber: valid forms', () => {
  const cases = { '1.5': 1.5, '1,5': 1.5, '-2': -2, '+2': 2, '1e3': 1000, '1E3': 1000, '1,5e-2': 0.015, '1.5e+2': 150, '.5': 0.5, ',5': 0.5, '5.': 5, '0': 0, '  7 ': 7, '1e-4': 0.0001, '-0,25': -0.25 };
  for (const [text, value] of Object.entries(cases)) {
    assert.deepEqual(parseNumber(text), { ok: true, value }, text);
  }
});

test('parseNumber: invalid forms', () => {
  for (const text of ['1,2,3', '1.2.3', 'abc', '1,5.0', '1.5,0', '--1', '1e', 'e3', '1 000', '1,5 e3', '0x10', 'Infinity', 'NaN', '1e999', '-', '.', ',', '1,,5', '1_000', '−2']) {
    assert.deepEqual(parseNumber(text), { ok: false }, text);
  }
});

test('parseNumber: empty -> null', () => {
  for (const text of ['', '   ', null, undefined]) assert.deepEqual(parseNumber(text), { ok: true, value: null });
});

test('parseNumber: the value is not rounded', () => {
  assert.equal(parseNumber('0,1234567890123456').value, 0.1234567890123456);
  assert.equal(parseNumber('1e-9').value, 1e-9);
  assert.equal(parseNumber('123456789.123456789').value, 123456789.123456789);
});

test('formatNumber: unrounded with point; empty for null and non-numbers', () => {
  assert.equal(formatNumber(1.5), '1.5');
  assert.equal(formatNumber(0.0001), '0.0001');
  assert.equal(formatNumber(42.184), '42.184');
  assert.equal(formatNumber(1 / 3), String(1 / 3));
  for (const v of [null, undefined, NaN, Infinity, 'x', {}]) assert.equal(formatNumber(v), '');
});

test('formatNumber and parseNumber agree for typical values (no loss)', () => {
  for (const v of [0, 1, -1, 0.1, 19, 47.656, 1e-4, 1234.5678, 5e-7, 123456789012]) {
    assert.equal(parseNumber(formatNumber(v)).value, v, String(v));
  }
});

test('formatCoordinate: 2 decimals with point', () => {
  assert.equal(formatCoordinate(1.005), '1.00'); // toFixed
  assert.equal(formatCoordinate(42.184), '42.18');
  assert.equal(formatCoordinate(-0.5), '-0.50');
  assert.equal(formatCoordinate(NaN), '');
});
