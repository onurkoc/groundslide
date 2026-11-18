// Basic checks of core/geometry.js

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arcHeight,
  circlePolylineIntersections,
  heightAt,
  polygonAreaCentroid,
} from '../../core/geometry.js';
import { near } from './helpers.js';

test('heightAt: interpolation, ends, vertical segment, outside', () => {
  const poly = [[0, 10], [10, 10], [20, 20], [20, 30], [30, 30]];
  assert.equal(heightAt(poly, 5), 10);
  assert.equal(heightAt(poly, 15), 15);
  assert.equal(heightAt(poly, 0), 10);
  assert.equal(heightAt(poly, 30), 30);
  assert.equal(heightAt(poly, 20), 30); // vertical: max
  assert.equal(heightAt(poly, 20, 'min'), 20);
  assert.ok(Number.isNaN(heightAt(poly, -1)));
  assert.ok(Number.isNaN(heightAt(poly, 31)));
});

test('polygonAreaCentroid: rectangle, triangle, vertex order', () => {
  const r = polygonAreaCentroid([[0, 0], [4, 0], [4, 2], [0, 2]]);
  near(assert, r.area, 8, 1e-12);
  near(assert, r.cx, 2, 1e-12);
  near(assert, r.cz, 1, 1e-12);
  const t = polygonAreaCentroid([[0, 0], [0, 3], [3, 0]]); // clockwise
  near(assert, t.area, 4.5, 1e-12);
  near(assert, t.cx, 1, 1e-12);
  near(assert, t.cz, 1, 1e-12);
});

test('circlePolylineIntersections: two crossings, vertex hit counted once', () => {
  const circle = { xc: 5, zc: 5, R: 5 };
  const flat = [[0, 5], [10, 5]];
  const h = circlePolylineIntersections(circle, flat);
  assert.equal(h.length, 2);
  near(assert, h[0].x, 0, 1e-9);
  near(assert, h[1].x, 10, 1e-9);

  // circle passes exactly through the vertex (5, 0)
  const bent = [[0, 3], [5, 0], [10, 3]];
  const hb = circlePolylineIntersections(circle, bent);
  const atVertex = hb.filter((p) => Math.abs(p.x - 5) < 1e-6);
  assert.ok(atVertex.length <= 1, 'vertex counted at most once');

  assert.equal(circlePolylineIntersections({ xc: 5, zc: 50, R: 5 }, flat).length, 0);
});

test('circlePolylineIntersections: vertical segment', () => {
  const circle = { xc: 0, zc: 0, R: 5 };
  const poly = [[3, -10], [3, 10]];
  const h = circlePolylineIntersections(circle, poly);
  assert.equal(h.length, 2);
  near(assert, h[0].z, -4, 1e-9);
  near(assert, h[1].z, 4, 1e-9);
});

test('arcHeight: lower arc', () => {
  near(assert, arcHeight({ xc: 0, zc: 10, R: 5 }, 0), 5, 1e-12);
  near(assert, arcHeight({ xc: 0, zc: 10, R: 5 }, 3), 6, 1e-12);
  assert.ok(Number.isNaN(arcHeight({ xc: 0, zc: 10, R: 5 }, 6)));
});
