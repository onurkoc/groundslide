// Placement of labels in the sketch: no overlap where there is room, priority kept, deterministic.

import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutLabels } from '../../app/lib/label-layout.js';

const overlap = (a, b, w = 6.8, h = 14) => a.x < b.x + b.text.length * w && b.x < a.x + a.text.length * w && a.y - h + 3 < b.y + 3 && b.y - h + 3 < a.y + 3;

test('labels that do not touch stay where they want to be', () => {
  const labels = [{ x: 10, y: 20, text: 'F = 1.139' }, { x: 200, y: 20, text: 'C1  F = 1.507' }, { x: 10, y: 80, text: 'S_janbu' }];
  assert.deepEqual(layoutLabels(labels), labels.map(({ x, y }) => ({ x, y })));
});

test('the first label keeps its place, a label on top of it is moved down', () => {
  const labels = [{ x: 10, y: 20, text: 'F = 1.139' }, { x: 12, y: 22, text: 'C1  F = 1.507' }];
  const [a, b] = layoutLabels(labels);
  assert.deepEqual(a, { x: 10, y: 20 });
  assert.equal(b.x, 12, 'only vertical');
  assert.ok(b.y !== 22);
  assert.ok(!overlap({ ...a, text: labels[0].text }, { ...b, text: labels[1].text }));
});

test('several labels at nearly the same point: none overlaps another', () => {
  const labels = [
    { x: 100, y: 100, text: 'F = 0.918' },
    { x: 106, y: 94, text: 'C1  F = 1.236' },
    { x: 104, y: 98, text: 'S_bishop  F = 0.922' },
    { x: 108, y: 100, text: 'S_janbu  F = 0.943' },
  ];
  const out = layoutLabels(labels).map((p, i) => ({ ...p, text: labels[i].text }));
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i], out[j]), `${i}/${j}`);
});

test('no room within the tries: the label stays at the wanted place (never lost)', () => {
  const labels = Array.from({ length: 12 }, () => ({ x: 0, y: 50, text: 'same' }));
  const out = layoutLabels(labels);
  assert.equal(out.length, 12);
  assert.ok(out.every((p) => p.x === 0 && Number.isFinite(p.y)));
});

test('deterministic and pure: same input, same output; the input is not changed', () => {
  const labels = [{ x: 5, y: 5, text: 'a' }, { x: 5, y: 5, text: 'b' }];
  const copy = JSON.parse(JSON.stringify(labels));
  assert.deepEqual(layoutLabels(labels), layoutLabels(labels));
  assert.deepEqual(labels, copy);
  assert.deepEqual(layoutLabels([]), []);
});
