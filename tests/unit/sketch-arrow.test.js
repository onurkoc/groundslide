// Load arrow of the sketch (SPEC_ETAPPE2 6): the head is three points of finite numbers, tip on the ground line, 7 px wide.
// Regression: the arrow was built from the text of toFixed, `${x + 3.5}` appended text instead of adding ("396.913.5").

import test from 'node:test';
import assert from 'node:assert/strict';
import { arrowGeometry, pointsText, HEAD_LENGTH, HEAD_HALF_WIDTH } from '../../app/lib/arrow.js';

test('arrow head: three points, two finite numbers each, tip on the ground line, 7 px wide', () => {
  const { head, shaft } = arrowGeometry(396.91, 120.5, 94.5);
  assert.equal(head.length, 3);
  for (const point of head) {
    assert.equal(point.length, 2);
    for (const v of point) assert.ok(typeof v === 'number' && Number.isFinite(v), `finite number: ${v}`);
  }
  const [tip, left, right] = head;
  assert.deepEqual(tip, [396.91, 120.5], 'tip on the ground line');
  assert.ok(Math.abs(right[0] - left[0] - 7) < 1e-9, 'width 7 px');
  assert.ok(Math.abs(left[0] - (396.91 - 3.5)) < 1e-9 && Math.abs(right[0] - (396.91 + 3.5)) < 1e-9);
  assert.equal(left[1], 120.5 - HEAD_LENGTH);
  assert.equal(right[1], left[1]);
  assert.equal(HEAD_HALF_WIDTH * 2, 7);
  assert.deepEqual(shaft, [[396.91, 94.5], [396.91, 120.5]], 'shaft from the tail to the tip');
});

test('arrow head as attribute text: every number has at most one decimal point', () => {
  const text = pointsText(arrowGeometry(396.913, 120.5, 94.5).head);
  assert.equal(text, '396.91,120.50 393.41,113.50 400.41,113.50');
  for (const number of text.split(/[ ,]/)) assert.match(number, /^-?\d+(\.\d+)?$/, number);
});
