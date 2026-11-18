// Spencer method (SPEC chapter 9).
// Works in the calculation frame (slope falls to the right, sliding towards +x).
// Pure function, no DOM or browser access.

import { searchSpencerAngles } from './theta-search.js';

export const SPENCER_SINGULARITY_EPS = 1e-8;
export const SPENCER_MIN_NI = 0.2; // SPEC 9.5 (version 1.5), analogous to the m_alpha limit
const relativeNi = (ni, cos, friction) => Math.abs(ni) / Math.max(1, Math.abs(cos) + Math.abs(friction));

const DEG = Math.PI / 180;
const fail = (code, message) => ({ valid: false, code, message });

/** Candidate rejected because a slice has n_i < SPENCER_MIN_NI (SPEC 9.5); classified like m_alpha. */
const lowNi = (minNi, details = {}) => ({ ...details, ...fail('I_MALPHA', 'n_i < ' + SPENCER_MIN_NI + ' (min ' + minNi + ')'), reason: 'n_i_low', minNi });

/**
 * Support force sums of a slice (SPEC_ETAPPE3 4.2, 4.3), FULL values (not divided by F):
 * tangential and normal components of the active (anchor) and passive (nail, pile, shotcrete)
 * forces on the base chord, and the moments about the circle centre of the force vectors at
 * their intersection points (MA, MP, kN m per metre, driving positive). Passive forces enter
 * divided by F (4.1), so they are scaled where F is known. Slices without the fields (no
 * supports) have all sums 0, which leaves every equation exactly as in SPEC 9.
 */
const supportSums = (s) => ({
  PtA: s.PtA || 0, PnA: s.PnA || 0, PtP: s.PtP || 0, PnP: s.PnP || 0, MA: s.MA || 0, MP: s.MP || 0,
});

/**
 * Per-slice quantities that do not depend on F or theta (SPEC 9.1, 9.2; SPEC_ETAPPE3 4.2).
 * R_i = R0_i + (PnP/F) tan(phi) and D_i = D0_i + PtP/F (passive part divided by F), M_S = MA + MP/F:
 * the F-dependent parts are formed in every step with the current F (SPEC_ETAPPE3 4.4).
 */
function prepare(slices, circle, kh, kv) {
  // general slip surface (SPEC_ETAPPE4 4.2): `circle.pivot` = [x_M, z_M] instead of the circle; the moment is formed completely
  // about this point (4.2.1). Without `pivot` everything is as before (SPEC 9.3).
  const general = Array.isArray(circle.pivot);
  const { xc, zc, R } = general ? { xc: 0, zc: 0, R: 1 } : circle;
  const n = slices.length;
  const pre = {
    n,
    alpha: new Float64Array(n),
    tanPhi: new Float64Array(n),
    R0: new Float64Array(n),
    D0: new Float64Array(n),
    PnP: new Float64Array(n),
    PtP: new Float64Array(n),
    Md: 0,
    MA: 0,
    MP: 0,
    R,
    passive: false,
    general,
    // general only: lever arms a_i (normal force) and r_i (shear force), E0_i = V cos a - H sin a, PnA_i, Me0 = external moment
    // of weights and horizontal loads about the pivot
    a: general ? new Float64Array(n) : null,
    r: general ? new Float64Array(n) : null,
    E0: general ? new Float64Array(n) : null,
    PnA: general ? new Float64Array(n) : null,
    Me0: 0,
  };
  for (let i = 0; i < n; i++) {
    const s = slices[i];
    const V = s.W * (1 + kv) + s.Q; // SPEC_ETAPPE4 7
    const Pw = s.Pw || 0; // water force in the tension crack, first slice (SPEC_ETAPPE4 6)
    const H = kh * s.W + Pw;
    const U = s.u * s.l;
    const tanPhi = Math.tan(s.phi);
    pre.alpha[i] = s.alpha;
    pre.tanPhi[i] = tanPhi;
    const { PtA, PnA, PtP, PnP, MA, MP } = supportSums(s);
    pre.R0[i] = s.c * s.l + (V * Math.cos(s.alpha) - H * Math.sin(s.alpha) - U + PnA) * tanPhi;
    pre.D0[i] = V * Math.sin(s.alpha) + H * Math.cos(s.alpha) + PtA;
    pre.PnP[i] = PnP;
    pre.PtP[i] = PtP;
    if (PnP !== 0 || PtP !== 0) pre.passive = true;
    if (general) {
      const [xM, zM] = circle.pivot;
      const dx = s.xm - xM;
      const dz = s.zb - zM;
      const sa = Math.sin(s.alpha);
      const ca = Math.cos(s.alpha);
      pre.a[i] = dx * ca - dz * sa;
      pre.r[i] = -dx * sa - dz * ca;
      pre.E0[i] = V * ca - H * sa;
      pre.PnA[i] = PnA;
      pre.Me0 += V * (xM - s.xm) + kh * s.W * (zM - s.zG) + (Pw ? Pw * (zM - s.zPw) : 0);
    } else {
      pre.Md += (V * (xc - s.xm)) / R + (kh * s.W * (zc - s.zG)) / R + (Pw ? (Pw * (zc - s.zPw)) / R : 0);
    }
    pre.MA += MA;
    pre.MP += MP;
  }
  return pre;
}

/**
 * Solve F_f(theta) (force equilibrium) and F_m(theta) (moment equilibrium), each by its own
 * damped iteration (start 1.0, new value averaged with the old one, SPEC 9.3).
 * Returns { valid, Fm, Ff, iterations } or an invalid result with I_NO_CONVERGENCE.
 */
function solveForTheta(pre, thetaDeg, opts) {
  const { n, alpha, tanPhi, R0, D0, PnP, PtP, Md, passive } = pre;
  // R_i(F), D_i(F) and M_S(F)/R with the current F (SPEC_ETAPPE3 4.2 to 4.4); exactly R0, D0 and 0 without passive supports
  const Rv = passive ? (i, F) => R0[i] + (PnP[i] * tanPhi[i]) / F : (i) => R0[i];
  const Dv = passive ? (i, F) => D0[i] + PtP[i] / F : (i) => D0[i];
  const MSR = (F) => (pre.MA + pre.MP / F) / pre.R;
  const th = thetaDeg * DEG;
  const cosT = new Float64Array(n); // cos(alpha - theta)
  const sinT = new Float64Array(n); // sin(alpha - theta)
  for (let i = 0; i < n; i++) {
    cosT[i] = Math.cos(alpha[i] - th);
    sinT[i] = Math.sin(alpha[i] - th);
  }

  // generic damped fixed-point iteration; `step(F)` returns F_new or NaN on failure
  const iterate = (step) => {
    let F = 1;
    for (let it = 1; it <= opts.maxIterations; it++) {
      const Fnew = step(F);
      if (!Number.isFinite(Fnew) || Fnew === 0) return { ok: false, why: `F became ${Fnew}` };
      if (Math.abs(Fnew - F) < opts.tolerance) return { ok: true, F: Fnew, iterations: it };
      F = 0.5 * (F + Fnew);
      if (F === 0) return { ok: false, why: 'F became 0' };
    }
    return { ok: false, why: `no convergence after ${opts.maxIterations} iterations` };
  };

  const ff = iterate((F) => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const ni = cosT[i] + (sinT[i] * tanPhi[i]) / F;
      if (!Number.isFinite(ni) || relativeNi(ni, cosT[i], sinT[i] * tanPhi[i] / F) <= SPENCER_SINGULARITY_EPS) return NaN;
      num += Rv(i, F) / ni;
      den += Dv(i, F) / ni;
    }
    return den > 0 ? num / den : NaN;
  });
  if (!ff.ok) return fail('I_NO_CONVERGENCE', `F_f at theta=${thetaDeg}: ${ff.why}`);

  // general surface (SPEC_ETAPPE4 4.2.1): F_m = sum(R_i g_i) / (M_e + sum(E_i a_i) - sum(D_i (r_i - g_i))),
  // g_i = (cos(alpha - theta) r_i + sin(alpha - theta) a_i) / n_i, E_i = V cos a - H sin a + P_n,eff, M_e with M_S = MA + MP / F
  const fm = pre.general ? iterate((F) => {
    let num = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const ni = cosT[i] + (sinT[i] * tanPhi[i]) / F;
      if (!Number.isFinite(ni) || relativeNi(ni, cosT[i], sinT[i] * tanPhi[i] / F) <= SPENCER_SINGULARITY_EPS) return NaN;
      const gi = (cosT[i] * pre.r[i] + sinT[i] * pre.a[i]) / ni;
      const Ei = pre.E0[i] + pre.PnA[i] + PnP[i] / F;
      num += Rv(i, F) * gi;
      sum += Ei * pre.a[i] - Dv(i, F) * (pre.r[i] - gi);
    }
    const den = pre.Me0 + pre.MA + pre.MP / F + sum;
    return den > 0 ? num / den : NaN;
  }) : iterate((F) => {
    let num = 0;
    let sumD = 0;
    for (let i = 0; i < n; i++) {
      const ni = cosT[i] + (sinT[i] * tanPhi[i]) / F;
      if (!Number.isFinite(ni) || relativeNi(ni, cosT[i], sinT[i] * tanPhi[i] / F) <= SPENCER_SINGULARITY_EPS) return NaN;
      const ki = cosT[i] / ni;
      num += Rv(i, F) * ki;
      sumD += Dv(i, F) * (1 - ki);
    }
    const den = Md + MSR(F) - sumD;
    return den > 0 ? num / den : NaN;
  });
  if (!fm.ok) return fail('I_NO_CONVERGENCE', `F_m at theta=${thetaDeg}: ${fm.why}`);

  if (!(fm.F > 0 && ff.F > 0)) return fail('I_NO_CONVERGENCE', 'Nonpositive inner solution.');
  const branch = [];
  let innerMinNi = Infinity;
  for (const F of [fm.F, ff.F]) for (let i = 0; i < n; i++) {
    const friction = sinT[i] * tanPhi[i] / F;
    const ni = cosT[i] + friction;
    if (!Number.isFinite(ni) || relativeNi(ni, cosT[i], friction) <= SPENCER_SINGULARITY_EPS)
      return fail('I_NO_CONVERGENCE', 'singular_n_i');
    branch.push(Math.sign(ni));
    innerMinNi = Math.min(innerMinNi, ni);
  }
  return { valid: true, Fm: fm.F, Ff: ff.F, iterations: fm.iterations, branch, innerMinNi };
}

/**
 * F_m and F_f for a given theta (degrees). Exported for tests (F_m(0) equals Bishop).
 * @returns {{valid:true, Fm:number, Ff:number, iterations:number} | {valid:false, code:string, message:string}}
 */
export function spencerForTheta(slices, circle, thetaDeg, opts) {
  return solveForTheta(prepare(slices, circle, opts.kh || 0, opts.kv || 0), thetaDeg, opts);
}

/**
 * Spencer method with theta from the sign change of g = F_m - F_f (SPEC 9.4).
 *
 * @param {object[]} slices  slices from buildSlices()
 * @param {{xc:number, zc:number, R:number}} circle  calculation frame
 * @param {{kh?:number, tolerance:number, maxIterations:number}} opts
 * @returns {{valid:true, F:number, theta:number, Fm:number, Ff:number, iterations:number,
 *   mAlpha:number[]} | {valid:false, code:string, message:string}}
 *   theta in degrees; F = F_m(theta).
 */
export function spencer(slices, circle, opts) {
  const pre = prepare(slices, circle, opts.kh || 0, opts.kv || 0);
  const inner = { ...opts, tolerance: Math.min(1e-8, opts.tolerance * 0.01) };
  const result = searchSpencerAngles(theta => solveForTheta(pre, theta, inner), (r, theta) => {
    const check = spencerEquilibrium(slices, circle, r.Fm, theta, opts);
    // n_i limit at the converged inner solutions F_m and F_f (the final value is checked inside)
    if (check.valid && r.innerMinNi < SPENCER_MIN_NI) return lowNi(r.innerMinNi, check);
    return check;
  }, opts.tolerance);
  if (!result.valid) return result;
  const r = result.evaluation;
  return { valid: true, F: r.Fm, theta: result.theta, Fm: r.Fm, Ff: r.Ff,
    iterations: r.iterations, mAlpha: result.acceptance.mAlpha,
    equilibrium: result.acceptance, diagnostics: result.diagnostics };
}

/** Independently reconstruct the original slice force and global moment equations
 * at one common F. No cached reduced Ri/Di or inner-solver quotients are used. */
export function spencerEquilibrium(slices, circle, F, thetaDeg, opts) {
  const invalid = (reason, details = {}) => ({ ...fail('I_NO_CONVERGENCE', reason), reason, ...details });
  if (!(Number.isFinite(F) && F > 0 && Number.isFinite(thetaDeg))) return invalid('invalid_common_solution');
  const theta = thetaDeg * DEG;
  const general = Array.isArray(circle.pivot);
  let force = 0, momentOverR = 0, forceScale = 0, momentScale = 0, sliceResidual = 0;
  let minRelativeNi = Infinity, minAbsNi = Infinity, minNi = Infinity;
  const mAlpha = [];
  for (const s of slices) {
    const Pw = s.Pw || 0;
    const V = s.W * (1 + (opts.kv || 0)) + s.Q, H = (opts.kh || 0) * s.W + Pw, U = s.u * s.l;
    // effective support forces at this F (SPEC_ETAPPE3 4.1 to 4.4): passive divided by F, active full
    const { PtA, PnA, PtP, PnP, MA, MP } = supportSums(s);
    const PtE = PtA + PtP / F, PnE = PnA + PnP / F, MSi = general ? MA + MP / F : (MA + MP / F) / circle.R;
    const sa = Math.sin(s.alpha), ca = Math.cos(s.alpha), tp = Math.tan(s.phi);
    const sd = Math.sin(s.alpha - theta), cd = Math.cos(s.alpha - theta);
    const friction = sd * tp / F, ni = cd + friction;
    const relative = relativeNi(ni, cd, friction);
    minRelativeNi = Math.min(minRelativeNi, relative);
    minAbsNi = Math.min(minAbsNi, Math.abs(ni));
    minNi = Math.min(minNi, ni);
    if (!Number.isFinite(ni) || relative <= SPENCER_SINGULARITY_EPS) return invalid('singular_n_i', { minRelativeNi, minAbsNi });
    const Z = (s.c * s.l / F + (V * ca - H * sa - U + PnE) * tp / F - V * sa - H * ca - PtE) / ni;
    const normal = V * ca - H * sa - U + PnE - Z * sd;
    const T = (s.c * s.l + normal * tp) / F;
    const scale = Math.abs(V) + Math.abs(H) + Math.abs(U) + Math.abs(s.c * s.l / F) + Math.abs(PtE) + Math.abs(PnE);
    force += Z;
    forceScale += scale;
    if (general) {
      // moment about the pivot (SPEC_ETAPPE4 4.2.1): sum T r = M_e + sum (N' + U) a, base normal force N = N' + U at the middle of the base
      const [xM, zM] = circle.pivot;
      const dx = s.xm - xM, dz = s.zb - zM;
      const a = dx * ca - dz * sa, r = -dx * sa - dz * ca;
      const extV = V * (xM - s.xm), extH = (opts.kh || 0) * s.W * (zM - s.zG) + (Pw ? Pw * (zM - s.zPw) : 0), Na = (normal + U) * a;
      momentOverR += T * r - extV - extH - MSi - Na; // here the moment itself (kN m per metre), reported as `moment`
      momentScale += Math.abs(T * r) + Math.abs(extV) + Math.abs(extH) + Math.abs(MSi) + Math.abs(Na);
    } else {
      const driveV = V * (circle.xc - s.xm) / circle.R;
      const driveH = ((opts.kh || 0) * s.W * (circle.zc - s.zG) + (Pw ? Pw * (circle.zc - s.zPw) : 0)) / circle.R;
      momentOverR += T - driveV - driveH - MSi; // moment of the support forces at their intersection points (4.3)
      momentScale += Math.abs(T) + Math.abs(driveV) + Math.abs(driveH) + Math.abs(MSi);
    }
    sliceResidual = Math.max(sliceResidual, Math.abs(T - V * sa - H * ca - PtE - Z * cd) / Math.max(scale, Number.MIN_VALUE));
    mAlpha.push(ca * (1 + Math.tan(s.alpha) * tp / F));
  }
  const forceResidual = Math.abs(force) / Math.max(forceScale, Number.MIN_VALUE);
  const momentResidual = Math.abs(momentOverR) / Math.max(momentScale, Number.MIN_VALUE);
  const details = { force, ...(general ? { moment: momentOverR } : { momentOverR }), forceScale, momentScale, forceResidual, momentResidual,
    sliceResidual, minRelativeNi, minAbsNi, minNi, mAlpha };
  if (![forceResidual, momentResidual, sliceResidual, ...mAlpha].every(Number.isFinite)) return invalid('nonfinite_equilibrium', details);
  if (Math.min(...mAlpha) < 0.2) return { ...fail('I_MALPHA', 'm_alpha < 0.2'), reason: 'm_alpha', ...details };
  if (Math.max(forceResidual, momentResidual, sliceResidual) > opts.tolerance) return invalid('equilibrium_residual', details);
  if (minNi < SPENCER_MIN_NI) return lowNi(minNi, details);
  return { valid: true, ...details };
}

/**
 * Stresses at the base of every slice from the Spencer solution (SPEC_ETAPPE4 8): same slice forces as spencerEquilibrium()
 * (support forces, k_h, k_v and the crack water force included). Returns, per slice and in kPa,
 *   tauMob = T / l           mobilised shear stress (= tauF / F)
 *   tauF = c' + sigma'_n tan(phi')  (c_u for undrained material)
 *   sigmaN = (N' + U) / l    total normal stress
 *   sigmaNEff = N' / l       effective normal stress
 * with T the shear force and N' the effective base normal force of the slice at the common F and theta (degrees).
 */
export function spencerSliceStresses(slices, F, thetaDeg, opts) {
  const theta = thetaDeg * DEG;
  return slices.map((s) => {
    const V = s.W * (1 + (opts.kv || 0)) + s.Q, H = (opts.kh || 0) * s.W + (s.Pw || 0), U = s.u * s.l;
    const { PtA, PnA, PtP, PnP } = supportSums(s);
    const PtE = PtA + PtP / F, PnE = PnA + PnP / F;
    const sa = Math.sin(s.alpha), ca = Math.cos(s.alpha), tp = Math.tan(s.phi);
    const sd = Math.sin(s.alpha - theta), cd = Math.cos(s.alpha - theta);
    const ni = cd + sd * tp / F;
    const Z = (s.c * s.l / F + (V * ca - H * sa - U + PnE) * tp / F - V * sa - H * ca - PtE) / ni;
    const normal = V * ca - H * sa - U + PnE - Z * sd; // N'
    const T = (s.c * s.l + normal * tp) / F;
    return {
      tauMob: T / s.l,
      tauF: s.c + (normal / s.l) * tp,
      sigmaN: (normal + U) / s.l,
      sigmaNEff: normal / s.l,
    };
  });
}
