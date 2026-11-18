// Simplified Bishop method (SPEC 6.1, limit cases 6.3).
// Works in the calculation frame (slope falls to the right, sliding towards +x).
// Pure function, no DOM or browser access.

/**
 * @param {object[]} slices  slices from buildSlices()
 * @param {{xc:number, zc:number, R:number}} circle  circle in the calculation frame
 * @param {{kh?:number, tolerance:number, maxIterations:number}} opts
 * @returns {{valid:true, F:number, iterations:number, mAlpha:number[], N:number[],
 *   negativeN:number} | {valid:false, code:string, message:string}}
 *   N[i] is the effective base normal force N' of slice i, mAlpha[i] the
 *   auxiliary quantity m_alpha, both from the last iteration.
 */
export function bishop(slices, circle, opts) {
  const { xc, zc, R } = circle;
  const kh = opts.kh || 0;
  const kv = opts.kv || 0; // vertical earthquake force k_v * W, positive downwards (SPEC_ETAPPE4 7): V = W (1 + k_v) + Q

  // driving moment (denominator), independent of F
  let den = 0;
  for (const s of slices) {
    // P_w: water force in the tension crack (SPEC_ETAPPE4 6), first slice only, own height z_Pw
    den += ((s.W * (1 + kv) + s.Q) * (xc - s.xm)) / R + (kh * s.W * (zc - s.zG)) / R + (s.Pw ? (s.Pw * (zc - s.zPw)) / R : 0);
  }
  if (!(den > 0)) {
    return { valid: false, code: 'I_NO_DRIVING', message: `Driving moment is not positive (${den}).` };
  }

  let F = 1;
  let mAlpha = new Array(slices.length);
  let N = new Array(slices.length);
  for (let it = 1; it <= opts.maxIterations; it++) {
    let num = 0;
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const tanA = Math.tan(s.alpha);
      const tanP = Math.tan(s.phi);
      const m = Math.cos(s.alpha) * (1 + (tanA * tanP) / F);
      if (m === 0) {
        return { valid: false, code: 'I_MALPHA', message: `m_alpha = 0 at slice ${i + 1}.` };
      }
      mAlpha[i] = m;
      const V = s.W * (1 + kv) + s.Q;
      num += (s.c * s.b + (V - s.u * s.b) * tanP) / m;
      // vertical equilibrium without interslice shear: N' = (W + Q - u b - c b tan(alpha) / F) / m_alpha
      N[i] = (V - s.u * s.b - (s.c * s.b * tanA) / F) / m;
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
      return {
        valid: true,
        F: Fnew,
        iterations: it,
        mAlpha,
        N,
        negativeN: N.filter((n) => n < 0).length,
      };
    }
    F = Fnew;
  }
  return { valid: false, code: 'I_NO_CONVERGENCE', message: `No convergence after ${opts.maxIterations} iterations.` };
}
