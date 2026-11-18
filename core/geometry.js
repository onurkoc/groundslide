// Plane geometry helpers for the slope-stability core.
// Pure functions, no DOM or browser access (SPEC chapter 11).
// Points are [x, z] pairs; a polyline is an array of points with
// non-decreasing x (vertical segments are allowed).

const T_TOL = 1e-9;

/**
 * Height of a polyline at x.
 * At a vertical segment the highest (mode "max") or lowest ("min") value is
 * returned. Outside the x-range of the polyline the result is NaN.
 */
export function heightAt(poly, x, mode = 'max') {
  const n = poly.length;
  if (n === 0) return NaN;
  const eps = 1e-12;
  if (x < poly[0][0] - eps || x > poly[n - 1][0] + eps) return NaN;
  let best = NaN;
  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[i + 1];
    if (x < x0 - eps || x > x1 + eps) continue;
    let z;
    if (x1 - x0 < eps) {
      z = mode === 'min' ? Math.min(z0, z1) : Math.max(z0, z1);
    } else {
      z = z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
    if (Number.isNaN(best)) best = z;
    else best = mode === 'min' ? Math.min(best, z) : Math.max(best, z);
  }
  if (Number.isNaN(best) && n === 1 && Math.abs(x - poly[0][0]) < eps) best = poly[0][1];
  return best;
}

/**
 * Linear piece of a polyline over the interval [xa, xb] that contains no
 * polyline vertex in its interior. Returns [z(xa), z(xb)] taken from the
 * non-vertical segment that covers the interval midpoint.
 */
export function linearOn(poly, xa, xb) {
  const xm = 0.5 * (xa + xb);
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[i + 1];
    if (x1 - x0 < 1e-12) continue;
    if (xm >= x0 && xm <= x1) {
      const s = (z1 - z0) / (x1 - x0);
      return [z0 + s * (xa - x0), z0 + s * (xb - x0)];
    }
  }
  return [NaN, NaN];
}

/** Height of the lower arc of a circle at x (NaN outside the circle). */
export function arcHeight(circle, x) {
  const dx = x - circle.xc;
  const d2 = circle.R * circle.R - dx * dx;
  if (d2 < 0) return NaN;
  return circle.zc - Math.sqrt(d2);
}

/**
 * Intersections of a circle with the segment p -> q.
 * Roots are accepted for the parameter range [-tol, 1 - tol) so that a
 * circle passing exactly through a polyline vertex is counted once. With
 * `includeEnd` the end point of the segment is accepted too (last segment).
 * Tangent contacts (discriminant <= 0) are not counted.
 */
export function circleSegmentIntersections(circle, p, q, includeEnd = false) {
  const { xc, zc, R } = circle;
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  const fx = p[0] - xc;
  const fz = p[1] - zc;
  const a = dx * dx + dz * dz;
  if (a === 0) return [];
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - R * R;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return [];
  const sq = Math.sqrt(disc);
  const out = [];
  const hi = includeEnd ? 1 + T_TOL : 1 - T_TOL;
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t >= -T_TOL && t < hi) {
      out.push({ t, x: p[0] + t * dx, z: p[1] + t * dz });
    }
  }
  return out;
}

/**
 * All intersections of a circle with a polyline, sorted by x.
 * Each entry: { x, z, seg, t }.
 */
export function circlePolylineIntersections(circle, poly) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n - 1; i++) {
    const hits = circleSegmentIntersections(circle, poly[i], poly[i + 1], i === n - 2);
    for (const h of hits) out.push({ x: h.x, z: h.z, seg: i, t: h.t });
  }
  out.sort((a, b) => a.x - b.x || a.z - b.z);
  return out;
}

/**
 * Area and centroid of a simple polygon (shoelace formula).
 * The area is returned positive regardless of the vertex order.
 * Degenerate polygons (area 0) return the mean of the vertices as centroid.
 */
export function polygonAreaCentroid(points) {
  const n = points.length;
  let a2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % n];
    const cr = x0 * z1 - x1 * z0;
    a2 += cr;
    cx += (x0 + x1) * cr;
    cz += (z0 + z1) * cr;
  }
  if (Math.abs(a2) < 1e-300) {
    let mx = 0;
    let mz = 0;
    for (const [x, z] of points) {
      mx += x;
      mz += z;
    }
    return { area: 0, cx: mx / (n || 1), cz: mz / (n || 1) };
  }
  return { area: Math.abs(a2) / 2, cx: cx / (3 * a2), cz: cz / (3 * a2) };
}

/** Distance from point (x, z) to the segment p -> q. */
export function distanceToSegment(x, z, p, q) {
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((x - p[0]) * dx + (z - p[1]) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (p[0] + t * dx), z - (p[1] + t * dz));
}

/** Smallest distance from point (x, z) to a polyline (over its segments). */
export function distanceToPolyline(poly, x, z) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    best = Math.min(best, distanceToSegment(x, z, poly[i], poly[i + 1]));
  }
  return best;
}

/** Largest distance from point (x, z) to any vertex of a polyline. */
export function maxVertexDistance(poly, x, z) {
  let best = 0;
  for (const p of poly) best = Math.max(best, Math.hypot(x - p[0], z - p[1]));
  return best;
}
