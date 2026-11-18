// Tension crack (SPEC_ETAPPE4 6): where the crack lies on a slip surface and the water force in it.
// Calculation frame (slope falls to the right, sliding towards +x). Pure functions, no DOM or browser access.

/** Sorted x values without duplicates closer than `tol`. */
function uniqueSorted(values, tol) {
  const s = [...values].sort((a, b) => a - b);
  const out = [s[0]];
  for (let i = 1; i < s.length; i++) if (s[i] - out[out.length - 1] > tol) out.push(s[i]);
  return out;
}

/**
 * x of the crack base: seen from the crown (the entry side, smallest x) the first place between xa and xb where the slip surface
 * lies `depth` (vertically) below the ground (SPEC_ETAPPE4 6). Null when the surface does not get that deep anywhere (the whole
 * slip body is inside the crack zone).
 *
 * @param {number[][]} ground  ground line
 * @param {function(number): number} surfaceHeight  height of the slip surface between xa and xb
 * @param {number} xa  entry x
 * @param {number} xb  exit x
 * @param {number} depth  crack depth (m, > 0)
 * @param {number[]} kinkXs  x of the vertices of the slip surface (a polyline); for a circle empty
 *
 * Between two neighbouring vertices (of the ground and of the surface) the thickness ground - surface is concave (the lower arc of
 * a circle is convex, a polyline piece is straight), so the first crossing is found from the maximum of the interval by bisection.
 */
export function crackBaseX(ground, surfaceHeight, xa, xb, depth, kinkXs = []) {
  const heightOfGround = (x) => {
    // highest ground point at x (vertical ground segments allowed)
    let best = NaN;
    for (let i = 0; i < ground.length - 1; i++) {
      const [x0, z0] = ground[i];
      const [x1, z1] = ground[i + 1];
      if (x < x0 - 1e-12 || x > x1 + 1e-12) continue;
      const z = x1 - x0 < 1e-12 ? Math.max(z0, z1) : z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
      best = Number.isNaN(best) ? z : Math.max(best, z);
    }
    return best;
  };
  const thickness = (x) => heightOfGround(x) - surfaceHeight(x);
  const xs = [xa, xb];
  for (const p of ground) if (p[0] > xa && p[0] < xb) xs.push(p[0]);
  for (const x of kinkXs) if (x > xa && x < xb) xs.push(x);
  const bp = uniqueSorted(xs, 1e-12);
  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i];
    const b = bp[i + 1];
    if (thickness(a) >= depth) return a;
    // thickness(a) < depth. When thickness(b) >= depth the set {thickness >= depth} of a concave function is an interval that
    // contains b: bisect on [a, b]. Otherwise look for the maximum (ternary search) and bisect up to it, if it reaches depth.
    let lo = a;
    let hi = b;
    if (!(thickness(b) >= depth)) {
      for (let k = 0; k < 80; k++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (thickness(m1) < thickness(m2)) lo = m1;
        else hi = m2;
      }
      const xMax = 0.5 * (lo + hi);
      if (!(thickness(xMax) >= depth)) continue;
      hi = xMax;
      lo = a;
    }
    // thickness(lo) < depth <= thickness(hi), non-decreasing on [lo, hi]
    for (let k = 0; k < 70; k++) {
      const mid = 0.5 * (lo + hi);
      if (thickness(mid) >= depth) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return null;
}

/**
 * Water force in the crack (SPEC_ETAPPE4 6): h_w = waterFill * depth, P_w = 1/2 gamma_w h_w^2, horizontal in sliding direction,
 * acting h_w / 3 above the crack base. `zBase` = height of the crack base.
 */
export function crackWaterForce(crack, gammaW, zBase) {
  const hw = crack.waterFill * crack.depth;
  return { Pw: 0.5 * gammaW * hw * hw, zPw: zBase + hw / 3 };
}

/** Crack of a result in the input frame (x already mapped): { x, depth, Pw } or null without a crack (SPEC_ETAPPE4 9). */
export const crackOutput = (crack) => (crack ? { x: crack.x, depth: crack.depth, Pw: crack.Pw } : null);
