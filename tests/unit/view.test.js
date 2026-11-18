// U6 (SPEC_ETAPPE2 chapter 10): scale and coordinate conversion of the sketch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fitView, worldToScreen, screenToWorld, zoomAt, panBy, resizeView, boundsOf, MIN_SCALE, MAX_SCALE } from '../../app/lib/view.js';

const FRAMES = {
  wide: { xMin: 0, xMax: 130, zMin: 0, zMax: 50 },
  tall: { xMin: -5, xMax: 5, zMin: -200, zMax: 400 },
  square: { xMin: 10, xMax: 20, zMin: 10, zMax: 20 },
  negative: { xMin: -300, xMax: -100, zMin: -80, zMax: -10 },
  huge: { xMin: 0, xMax: 5000, zMin: 0, zMax: 2000 },
  tiny: { xMin: 0, xMax: 0.01, zMin: 0, zMax: 0.004 },
};
const AREAS = [{ width: 800, height: 500 }, { width: 300, height: 900 }, { width: 1400, height: 300 }, { width: 100, height: 100 }, { width: 640, height: 640 }];

test('U6 same scale in x and z: fitted frame keeps its aspect ratio on screen', () => {
  for (const [name, b] of Object.entries(FRAMES)) {
    for (const size of AREAS) {
      const view = fitView(b, size, 24);
      const [x1, y1] = worldToScreen(view, b.xMin, b.zMax);
      const [x2, y2] = worldToScreen(view, b.xMax, b.zMin);
      const dxPx = x2 - x1;
      const dzPx = y2 - y1;
      const ratioWorld = (b.xMax - b.xMin) / (b.zMax - b.zMin);
      assert.ok(Math.abs(dxPx / dzPx - ratioWorld) <= 1e-9 * ratioWorld, `${name} ${size.width}x${size.height}`);
      // one scale: 1 m in x and 1 m in z are the same number of pixels
      const a = worldToScreen(view, 7, 3);
      const bx = worldToScreen(view, 8, 3);
      const bz = worldToScreen(view, 7, 4);
      assert.ok(Math.abs(Math.hypot(bx[0] - a[0], bx[1] - a[1]) - Math.hypot(bz[0] - a[0], bz[1] - a[1])) <= 1e-9 * view.scale);
      assert.ok(Math.abs(bx[0] - a[0] - view.scale) <= 1e-9 * view.scale);
      assert.ok(Math.abs(a[1] - bz[1] - view.scale) <= 1e-9 * view.scale);
    }
  }
});

test('U6 z points up: higher z gives a smaller screen y', () => {
  const view = fitView(FRAMES.wide, AREAS[0]);
  assert.ok(worldToScreen(view, 0, 50)[1] < worldToScreen(view, 0, 0)[1]);
  assert.ok(worldToScreen(view, 0, 0)[0] < worldToScreen(view, 130, 0)[0]);
});

test('U6 world -> screen -> world for many points: |delta| <= 1e-9 m', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let worst = 0;
  for (const b of Object.values(FRAMES)) {
    for (const size of AREAS) {
      let view = fitView(b, size);
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 200; i++) {
          const x = b.xMin + (b.xMax - b.xMin) * (rnd() * 3 - 1);
          const z = b.zMin + (b.zMax - b.zMin) * (rnd() * 3 - 1);
          const [sx, sy] = worldToScreen(view, x, z);
          const [x2, z2] = screenToWorld(view, sx, sy);
          worst = Math.max(worst, Math.abs(x2 - x), Math.abs(z2 - z));
        }
        // after zooming and panning as well
        view = panBy(zoomAt(view, rnd() * size.width, rnd() * size.height, 0.5 + rnd() * 2), rnd() * 200 - 100, rnd() * 200 - 100);
      }
    }
  }
  assert.ok(worst <= 1e-9, `worst delta ${worst}`);
});

test('U6 screen -> world -> screen for pixels: |delta| <= 1e-6 px', () => {
  const view = fitView(FRAMES.wide, AREAS[0]);
  for (let sx = 0; sx <= 800; sx += 37) {
    for (let sy = 0; sy <= 500; sy += 41) {
      const [x, z] = screenToWorld(view, sx, sy);
      const [sx2, sy2] = worldToScreen(view, x, z);
      assert.ok(Math.abs(sx2 - sx) <= 1e-6 && Math.abs(sy2 - sy) <= 1e-6);
    }
  }
});

test('U6 fit contains all points inside the area minus the margin, and is centred', () => {
  for (const [name, b] of Object.entries(FRAMES)) {
    for (const size of AREAS) {
      const margin = 24;
      const view = fitView(b, size, margin);
      const corners = [[b.xMin, b.zMin], [b.xMin, b.zMax], [b.xMax, b.zMin], [b.xMax, b.zMax]];
      const eps = 1e-6;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, z] of corners) {
        const [sx, sy] = worldToScreen(view, x, z);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      const inner = { w: Math.max(size.width - 2 * margin, 1), h: Math.max(size.height - 2 * margin, 1) };
      assert.ok(maxX - minX <= inner.w + eps && maxY - minY <= inner.h + eps, `${name}: inside the usable area`);
      assert.ok(Math.abs(maxX - minX - inner.w) <= eps || Math.abs(maxY - minY - inner.h) <= eps, `${name}: touches the limit in one direction`);
      assert.ok(Math.abs((minX + maxX) / 2 - size.width / 2) <= eps && Math.abs((minY + maxY) / 2 - size.height / 2) <= eps, `${name}: centred`);
    }
  }
});

test('U6 fit: a point or a line is fitted by its other extent; never NaN', () => {
  const size = { width: 800, height: 500 };
  for (const b of [{ xMin: 5, xMax: 5, zMin: 3, zMax: 3 }, { xMin: 0, xMax: 100, zMin: 7, zMax: 7 }, { xMin: 2, xMax: 2, zMin: 0, zMax: 50 }]) {
    const v = fitView(b, size);
    assert.ok(Number.isFinite(v.scale) && v.scale > 0 && Number.isFinite(v.x0) && Number.isFinite(v.z0));
    const [sx, sy] = worldToScreen(v, (b.xMin + b.xMax) / 2, (b.zMin + b.zMax) / 2);
    assert.ok(Math.abs(sx - 400) < 1e-6 && Math.abs(sy - 250) < 1e-6);
  }
  const small = fitView(FRAMES.wide, { width: 10, height: 10 }, 24); // area smaller than the margins
  assert.ok(small.scale > 0 && Number.isFinite(small.scale));
});

test('U6 zoom keeps the world point under the mouse fixed', () => {
  let view = fitView(FRAMES.wide, AREAS[0]);
  for (const [sx, sy, f] of [[400, 250, 2], [0, 0, 0.5], [799, 499, 1.15], [123.4, 321.9, 8], [10, 400, 0.01], [650, 20, 3.3]]) {
    const before = screenToWorld(view, sx, sy);
    const next = zoomAt(view, sx, sy, f);
    const after = screenToWorld(next, sx, sy);
    assert.ok(Math.abs(after[0] - before[0]) <= 1e-9 && Math.abs(after[1] - before[1]) <= 1e-9, `factor ${f}`);
    assert.ok(Math.abs(next.scale - view.scale * f) <= 1e-9 * next.scale * f || next.scale === MIN_SCALE || next.scale === MAX_SCALE);
    view = next;
  }
});

test('U6 zoom is limited to a sane scale range and keeps the point fixed at the limit', () => {
  let view = fitView(FRAMES.wide, AREAS[0]);
  const before = screenToWorld(view, 300, 200);
  for (let i = 0; i < 100; i++) view = zoomAt(view, 300, 200, 10);
  assert.equal(view.scale, MAX_SCALE);
  const after = screenToWorld(view, 300, 200);
  assert.ok(Math.abs(after[0] - before[0]) <= 1e-6 && Math.abs(after[1] - before[1]) <= 1e-6);
  for (let i = 0; i < 100; i++) view = zoomAt(view, 300, 200, 0.1);
  assert.equal(view.scale, MIN_SCALE);
});

test('U6 pan moves the drawing with the mouse', () => {
  const view = fitView(FRAMES.wide, AREAS[0]);
  const p = worldToScreen(view, 40, 20);
  const moved = panBy(view, 30, -12);
  const q = worldToScreen(moved, 40, 20);
  assert.ok(Math.abs(q[0] - p[0] - 30) <= 1e-9 && Math.abs(q[1] - p[1] + 12) <= 1e-9);
  assert.equal(moved.scale, view.scale);
});

test('boundsOf ignores points that are not usable', () => {
  assert.equal(boundsOf([]), null);
  assert.equal(boundsOf([[null, 1], [NaN, 2], 'x', null]), null);
  assert.deepEqual(boundsOf([[1, 2], [null, 9], [-3, 7], [4, -1]]), { xMin: -3, xMax: 4, zMin: -1, zMax: 7 });
});

// --- size of the drawing area changes (window, splitter, full screen, hidden tab): SPEC_ETAPPE2 6, version 1.8 ---

const middle = (view, size) => screenToWorld(view, size.width / 2, size.height / 2);

test('resizeView keeps scale and the world point in the middle, for growing and shrinking areas', () => {
  const view = zoomAt(fitView(FRAMES.wide, { width: 800, height: 400 }), 120, 80, 2.5); // an arbitrary zoomed and shifted view
  const small = { width: 800, height: 400 };
  for (const next of [{ width: 800, height: 700 }, { width: 1200, height: 300 }, { width: 333, height: 211 }, { width: 800, height: 400 }]) {
    const [x, z] = middle(view, small);
    const resized = resizeView(view, small, next);
    assert.equal(resized.scale, view.scale);
    const [x2, z2] = middle(resized, next);
    assert.ok(Math.abs(x2 - x) <= 1e-9 && Math.abs(z2 - z) <= 1e-9, JSON.stringify(next));
    // and back again: the view of the start
    const back = resizeView(resized, next, small);
    assert.ok(Math.abs(back.x0 - view.x0) <= 1e-9 && Math.abs(back.z0 - view.z0) <= 1e-9);
  }
});

test('resizeView: a world point keeps its distance to the middle of the area (the drawing does not jump)', () => {
  const view = fitView(FRAMES.wide, { width: 900, height: 500 });
  const old = { width: 900, height: 500 };
  const next = { width: 1100, height: 640 };
  const resized = resizeView(view, old, next);
  const [sx, sy] = worldToScreen(view, 40, 20);
  const [tx, ty] = worldToScreen(resized, 40, 20);
  assert.ok(Math.abs(tx - sx - (next.width - old.width) / 2) <= 1e-9);
  assert.ok(Math.abs(ty - sy - (next.height - old.height) / 2) <= 1e-9);
});

test('resizeView: an area without size (hidden tab) gives the same view back, nothing is derived from it', () => {
  const view = zoomAt(fitView(FRAMES.wide, { width: 800, height: 400 }), 50, 50, 3);
  const frozen = JSON.stringify(view);
  const size = { width: 800, height: 400 };
  for (const hidden of [{ width: 0, height: 0 }, { width: 0, height: 400 }, { width: 800, height: 0 }, null, undefined]) {
    assert.equal(resizeView(view, size, hidden), view);
    assert.equal(resizeView(view, hidden, size), view);
  }
  // hidden and shown again at the same size: exactly the same view (no rounding error)
  assert.equal(resizeView(view, size, size), view);
  assert.equal(JSON.stringify(view), frozen, 'the input is not changed');
});
