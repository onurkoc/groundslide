// Simplified Janbu method, uncorrected and corrected (SPEC 6.2, limit cases 6.3).
// Works in the calculation frame (slope falls to the right, sliding towards +x).
// Pure function, no DOM or browser access.

import { polylineChordAndSagitta } from './polyline.js';

/**
 * Chord length L between entry and exit point and the largest distance d of
 * the slip surface (lower arc) from this chord, measured at right angles to
 * the chord (SPEC 6.2).
 */
export function chordAndSagitta(circle, entry, exit) {
  const { xc, zc, R } = circle;
  const dx = exit[0] - entry[0];
  const dz = exit[1] - entry[1];
  const L = Math.hypot(dx, dz);
  // unit normal of the chord; the farthest arc point lies on the line through
  // the centre along this normal: C +/- R n
  const nx = -dz / L;
  const nz = dx / L;
  const xa = Math.min(entry[0], exit[0]);
  const xb = Math.max(entry[0], exit[0]);
  const tol = 1e-9;
  let d = 0;
  for (const sign of [1, -1]) {
    const px = xc + sign * R * nx;
    const pz = zc + sign * R * nz;
    // the point must belong to the lower arc between entry and exit
    if (pz <= zc + tol && px >= xa - tol && px <= xb + tol) {
      d = Math.max(d, Math.abs((px - entry[0]) * nx + (pz - entry[1]) * nz));
    }
  }
  return { L, d };
}

/** b1 of the Janbu correction from the materials at the slice bases (SPEC 6.2). */
export function janbuB1(slices) {
  if (new Set(slices.map((s) => s.material)).size > 1) return 0.5;
  let onlyC = true;
  let onlyPhi = true;
  for (const s of slices) {
    const hasC = s.c > 0;
    const hasPhi = s.phi > 0;
    if (!(hasC && !hasPhi)) onlyC = false;
    if (!(!hasC && hasPhi)) onlyPhi = false;
  }
  if (onlyC) return 0.69;
  if (onlyPhi) return 0.31;
  return 0.5;
}

/**
 * @param {object[]} slices  slices from buildSlices()
 * @param {{xc:number, zc:number, R:number}|{points:number[][]}} circle  calculation frame; for a polyline (SPEC_ETAPPE4 4.4)
 *   `{ points }` with entry, vertices, exit: L and d are then taken from the polyline
 * @param {number[]} entry  entry point [x, z] (calculation frame)
 * @param {number[]} exit   exit point [x, z]
 * @param {{kh?:number, tolerance:number, maxIterations:number}} opts
 * @returns {{valid:true, F0:number, f0:number, F:number, b1:number, d:number, L:number,
 *   iterations:number, mAlpha:number[]} | {valid:false, code:string, message:string}}
 *   F0 is "janbu", F = f0 * F0 is "janbuCorrected".
 */
export function janbu(slices, circle, entry, exit, opts) {
  const kh = opts.kh || 0;
  const kv = opts.kv || 0; // SPEC_ETAPPE4 7: V = W (1 + k_v) + Q

  let den = 0;
  // + P_w: horizontal water force in the tension crack (SPEC_ETAPPE4 6), first slice only
  for (const s of slices) den += (s.W * (1 + kv) + s.Q) * Math.tan(s.alpha) + kh * s.W + (s.Pw || 0);
  if (!(den > 0)) {
    return { valid: false, code: 'I_NO_DRIVING', message: `Driving force is not positive (${den}).` };
  }

  let F = 1;
  const mAlpha = new Array(slices.length);
  for (let it = 1; it <= opts.maxIterations; it++) {
    let num = 0;
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const tanP = Math.tan(s.phi);
      const m = Math.cos(s.alpha) * (1 + (Math.tan(s.alpha) * tanP) / F);
      if (m === 0) {
        return { valid: false, code: 'I_MALPHA', message: `m_alpha = 0 at slice ${i + 1}.` };
      }
      mAlpha[i] = m;
      num += (s.c * s.b + (s.W * (1 + kv) + s.Q - s.u * s.b) * tanP) / (Math.cos(s.alpha) * m);
    }
    const Fnew = num / den;
    if (!Number.isFinite(Fnew) || Fnew === 0) {
      return { valid: false, code: 'I_NO_CONVERGENCE', message: `F became ${Fnew} in iteration ${it}.` };
    }
    if (Math.abs(Fnew - F) < opts.tolerance) {
      const low = mAlpha.findIndex((m) => m < 0.2);
      if (low >= 0) {
        return { valid: false, code: 'I_MALPHA', message: `m_alpha = ${mAlpha[low]} < 0.2 at slice ${low + 1}.` };
      }
      if (Fnew < 0) {
        return { valid: false, code: 'I_NO_CONVERGENCE', message: `Converged to a negative F (${Fnew}).` };
      }
      const { L, d } = Array.isArray(circle.points) ? polylineChordAndSagitta(circle.points) : chordAndSagitta(circle, entry, exit);
      const b1 = janbuB1(slices);
      const f0 = 1 + b1 * (d / L - 1.4 * (d / L) ** 2);
      return { valid: true, F0: Fnew, f0, F: f0 * Fnew, b1, d, L, iterations: it, mAlpha };
    }
    F = Fnew;
  }
  return { valid: false, code: 'I_NO_CONVERGENCE', message: `No convergence after ${opts.maxIterations} iterations.` };
}
