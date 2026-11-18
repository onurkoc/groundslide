// Numerical angle search for Spencer (SPEC 9.4). No equilibrium formula here.
const ANGLE_STEP = 2.5;
const ANGLE_EPS = 0.001;
const MAX_BISECTIONS = 80;

/** Search positive angles first, then negative angles, in traversal order.
 * evaluate(theta) supplies Fm, Ff and optionally the signs of all n_i on
 * both inner solutions. accept(result, theta) independently checks equilibrium.
 * Exported separately so gaps and rejected candidates can be regression-tested.
 */
export function searchSpencerAngles(evaluate, accept, tolerance) {
  const diagnostics = { evaluations: 0, rejectedAngles: [], rejectedCandidates: [] };
  const cache = new Map();
  const evalAt = (theta) => {
    if (!cache.has(theta)) {
      diagnostics.evaluations++;
      const r = evaluate(theta);
      const finite = r.valid && Number.isFinite(r.Fm) && Number.isFinite(r.Ff);
      const value = finite ? { ...r, g: r.Fm - r.Ff } : { ...r, valid: false };
      if (!value.valid) diagnostics.rejectedAngles.push({ theta, code: r.code || 'I_NO_CONVERGENCE', reason: r.message || 'nonfinite_inner_solution' });
      cache.set(theta, value);
    }
    return cache.get(theta);
  };
  const sameBranch = (a, b) => !a.branch || !b.branch ||
    a.branch.length === b.branch.length && a.branch.every((v, i) => v * b.branch[i] > 0);
  const reject = (from, to, reason, code = 'I_NO_CONVERGENCE') => {
    diagnostics.rejectedCandidates.push({ from, to, reason, code });
  };
  const accepted = (r, theta) => {
    const check = accept(r, theta);
    return check.valid && Math.abs(r.g) <= tolerance
      ? { valid: true, theta, evaluation: r, acceptance: check, diagnostics }
      : null;
  };

  function refine(a, ta, b, tb) {
    const from = ta, to = tb;
    if (!sameBranch(a, b)) {
      reject(from, to, 'n_i_sign_change');
      return null;
    }
    let lastReason = 'residual_not_met';
    for (let it = 0; it < MAX_BISECTIONS; it++) {
      const theta = 0.5 * (ta + tb);
      if (theta === ta || theta === tb) break;
      const r = evalAt(theta);
      if (!r.valid) {
        reject(from, to, 'invalid_angle_inside_candidate');
        return null;
      }
      if (!sameBranch(a, r) || !sameBranch(r, b)) {
        reject(from, to, 'n_i_sign_change_inside_candidate');
        return null;
      }
      if ((Math.abs(tb - ta) < ANGLE_EPS || r.g === 0) && Math.abs(r.g) <= tolerance) {
        const check = accept(r, theta);
        if (check.valid) return { valid: true, theta, evaluation: r, acceptance: check, diagnostics };
        lastReason = check.reason || check.message || 'equilibrium_rejected';
        if (check.code === 'I_MALPHA' || check.reason === 'singular_n_i') { // I_MALPHA covers m_alpha and n_i_low
          reject(from, to, lastReason, check.code);
          return null;
        }
      }
      if (a.g * r.g <= 0) { b = r; tb = theta; }
      else { a = r; ta = theta; }
    }
    reject(from, to, lastReason);
    return null;
  }

  for (const limit of [60, -45]) {
    let previous = null, previousTheta = 0;
    const step = Math.sign(limit) * ANGLE_STEP;
    for (let theta = 0; Math.abs(theta) <= Math.abs(limit); theta += step) {
      const current = evalAt(theta);
      if (!current.valid) { previous = null; continue; }
      if (current.g === 0) {
        const result = accepted(current, theta);
        if (result) return result;
        const check = accept(current, theta);
        reject(theta, theta, check.reason || 'equilibrium_rejected', check.code);
      } else if (previous && previous.g * current.g < 0) {
        const result = refine(previous, previousTheta, current, theta);
        if (result) return result;
      }
      previous = current;
      previousTheta = theta;
    }
  }
  const malpha = diagnostics.rejectedCandidates.some(r => r.code === 'I_MALPHA');
  const numerical = diagnostics.rejectedAngles.length || diagnostics.rejectedCandidates.length;
  const code = malpha ? 'I_MALPHA' : numerical ? 'I_NO_CONVERGENCE' : 'I_NO_THETA';
  return { valid: false, code, message: `${code}: no accepted Spencer root in 0..60 then 0..-45 degrees; ` +
    `${diagnostics.rejectedAngles.length} invalid angles, ${diagnostics.rejectedCandidates.length} rejected candidates.`, diagnostics };
}
