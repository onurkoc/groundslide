// Effective layer boundaries (SPEC 4, version 1.8). A boundary `top` that does not cover the model width is
// continued horizontally from its first and last point; where it lies above the ground, the ground counts:
// z_eff(x) = min(z_top(x), z_ground(x)). The input stays unchanged; the calculation uses the effective line.

import { heightAt } from './geometry.js';

const EPS = 1e-9;

/** Height of a boundary at x, constant (horizontal) outside its x-range. */
function zExtended(top, x) {
  if (x <= top[0][0]) return top[0][1];
  if (x >= top[top.length - 1][0]) return top[top.length - 1][1];
  return heightAt(top, x, 'max');
}

/**
 * The boundary over exactly [xMin, xMax]: points strictly inside kept, a point at each edge
 * (interpolated inside the line, the z of the nearest end point outside it).
 */
export function extendBoundary(top, xMin, xMax) {
  const out = [[xMin, zExtended(top, xMin)]];
  for (const [x, z] of top) if (x > xMin && x < xMax) out.push([x, z]);
  out.push([xMax, zExtended(top, xMax)]);
  return out;
}

/** The non-vertical ground segment over (a, b), as a function of x. */
function groundOn(ground, a, b) {
  const mid = (a + b) / 2;
  for (let i = 0; i < ground.length - 1; i++) {
    const [x0, z0] = ground[i];
    const [x1, z1] = ground[i + 1];
    if (x1 - x0 > EPS && mid >= x0 && mid <= x1) return (x) => z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return null;
}

/**
 * The effective boundary: `top` extended to the ground width and clipped at the ground. At a vertical
 * ground segment both ends are given, in the order of the ground line.
 */
export function effectiveBoundary(top, ground) {
  const xMin = ground[0][0];
  const xMax = ground[ground.length - 1][0];
  const ext = extendBoundary(top, xMin, xMax);
  // boundary x values within EPS of a ground x are taken at that ground x (no spike beside a vertical step)
  const gxs = ground.map((p) => p[0]);
  const snap = (x) => gxs.find((g) => Math.abs(g - x) < EPS) ?? x;
  const xs = [...new Set([...ext.map((p) => snap(p[0])), ...gxs])].sort((a, b) => a - b);

  // crossings of the boundary with the ground inside each interval (both lines are straight there)
  const crossings = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    if (b - a <= EPS) continue;
    const g = groundOn(ground, a, b);
    if (!g) continue;
    const da = zExtended(ext, a) - g(a);
    const db = zExtended(ext, b) - g(b);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) crossings.push(a + ((b - a) * da) / (da - db));
  }
  const all = [...xs, ...crossings].sort((a, b) => a - b);

  const out = [];
  const push = (x, z) => {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - x) < EPS && Math.abs(last[1] - z) < EPS) return;
    out.push([x, z]);
  };
  for (const x of all) {
    const zt = zExtended(ext, x);
    const atX = ground.filter((p) => Math.abs(p[0] - x) < EPS);
    if (atX.length > 1) {
      for (const [, zg] of atX) push(x, Math.min(zt, zg)); // vertical ground segment
    } else {
      push(x, Math.min(zt, heightAt(ground, x, 'min')));
    }
  }
  return out;
}

/** Effective boundaries of all layers, index-aligned with `layers`; null for the top layer. */
export function effectiveLayerTops(ground, layers) {
  return layers.map((l, k) => (k === 0 ? null : effectiveBoundary(l.top, ground)));
}

/** Shallow copy of model `m` whose layer boundaries are the effective ones. `m` is not modified. */
export function withEffectiveLayerTops(m) {
  const tops = effectiveLayerTops(m.ground, m.layers);
  return { ...m, layers: m.layers.map((l, k) => (k === 0 ? l : { ...l, top: tops[k] })) };
}
