// Throttling of progress messages (SPEC_ETAPPE2 7.2) with an artificial clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressThrottle, PROGRESS_INTERVAL_MS } from '../../app/lib/progress.js';

function clock(start = 0) {
  let t = start;
  return { now: () => t, set: (v) => { t = v; }, advance: (d) => { t += d; } };
}

const grid = (done, total) => ({ phase: 'grid', done, total });

test('interval is 100 ms by default', () => {
  assert.equal(PROGRESS_INTERVAL_MS, 100);
});

test('at most one message per 100 ms', () => {
  const c = clock();
  const throttle = createProgressThrottle({ now: c.now });
  const forwarded = [];
  // 1000 messages, one per millisecond, total 5000 so none is the last
  for (let i = 1; i <= 1000; i++) {
    c.set(i);
    if (throttle(grid(i, 5000))) forwarded.push(i);
  }
  assert.equal(forwarded[0], 1, 'the first message is forwarded');
  for (let k = 1; k < forwarded.length; k++) assert.ok(forwarded[k] - forwarded[k - 1] >= 100, `${forwarded[k - 1]} -> ${forwarded[k]}`);
  assert.equal(forwarded.length, 10);
});

test('exactly at the interval is forwarded, 1 ms before is not', () => {
  const c = clock();
  const throttle = createProgressThrottle({ now: c.now });
  assert.equal(throttle(grid(1, 10)), true);
  c.set(99);
  assert.equal(throttle(grid(2, 10)), false);
  c.set(100);
  assert.equal(throttle(grid(3, 10)), true);
  c.set(199);
  assert.equal(throttle(grid(4, 10)), false);
});

test('the last grid message (done = total) is always forwarded', () => {
  const c = clock();
  const throttle = createProgressThrottle({ now: c.now });
  assert.equal(throttle(grid(1, 3)), true);
  c.set(1);
  assert.equal(throttle(grid(2, 3)), false);
  c.set(2);
  assert.equal(throttle(grid(3, 3)), true, 'last grid message, 2 ms after the previous one');
});

test('the refine message is always forwarded, also directly after another message', () => {
  const c = clock();
  const throttle = createProgressThrottle({ now: c.now });
  assert.equal(throttle(grid(5, 5)), true);
  assert.equal(throttle({ phase: 'refine', done: 0, total: 0 }), true, 'same millisecond');
});

test('forwarded forced messages restart the interval', () => {
  const c = clock();
  const throttle = createProgressThrottle({ now: c.now });
  assert.equal(throttle({ phase: 'refine', done: 0, total: 0 }), true);
  c.set(50);
  assert.equal(throttle(grid(1, 9)), false, 'less than 100 ms after the forced message');
  c.set(100);
  assert.equal(throttle(grid(2, 9)), true);
});

test('a total of 1: the single grid message is forwarded', () => {
  const throttle = createProgressThrottle({ now: clock().now });
  assert.equal(throttle(grid(1, 1)), true);
});

test('custom interval; each throttle has its own state', () => {
  const c = clock();
  const a = createProgressThrottle({ intervalMs: 10, now: c.now });
  const b = createProgressThrottle({ intervalMs: 1000, now: c.now });
  assert.equal(a(grid(1, 9)), true);
  assert.equal(b(grid(1, 9)), true);
  c.set(10);
  assert.equal(a(grid(2, 9)), true);
  assert.equal(b(grid(2, 9)), false);
});

test('runs with the real clock as well', () => {
  const throttle = createProgressThrottle();
  assert.equal(throttle(grid(1, 9)), true);
  assert.equal(throttle(grid(2, 9)), false);
});
