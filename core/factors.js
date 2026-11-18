// Partial factors (SPEC 2.4). The calculation core itself knows no partial
// factors; they act only here, before the calculation.

import { DEFAULT_PARTIAL_FACTORS } from './model.js';

const DEG = Math.PI / 180;

/**
 * Return a copy of the model with partial factors applied.
 *
 * - mode "characteristic": all values unchanged.
 * - mode "sia": c_d = c / gamma_c, tan(phi_d) = tan(phi) / gamma_phi,
 *   cu_d = cu / gamma_cu; loads of type "G" times gamma_G, type "Q" times
 *   gamma_Q. Missing factors fall back to the defaults of SPEC 2.2.
 * - mode "sia" with supports (SPEC_ETAPPE3 5): the soil values are in addition
 *   divided by gamma_R (c_d/gamma_R, tan(phi_d)/gamma_R, cu_d/gamma_R); the
 *   verification is then F_d >= 1.0. Without supports nothing changes (F_d >= gamma_R).
 *   The reductions of the supports themselves are done in supports.js.
 *
 * The input model is not modified.
 */
export function applyPartialFactors(model) {
  const copy = structuredClone(model);
  if (model.analysis.mode !== 'sia') return copy;

  const pf = { ...DEFAULT_PARTIAL_FACTORS, ...(model.partialFactors || {}) };

  for (const m of Object.values(copy.materials)) {
    if (m.model === 'drained') {
      m.c = m.c / pf.c;
      m.phi = Math.atan(Math.tan(m.phi * DEG) / pf.phi) / DEG;
    } else if (m.model === 'undrained') {
      m.cu = m.cu / pf.cu;
    }
  }

  if (Array.isArray(copy.supports) && copy.supports.length > 0) {
    for (const m of Object.values(copy.materials)) {
      if (m.model === 'drained') {
        m.c = m.c / pf.R;
        m.phi = Math.atan(Math.tan(m.phi * DEG) / pf.R) / DEG;
      } else if (m.model === 'undrained') {
        m.cu = m.cu / pf.R;
      }
    }
  }

  if (Array.isArray(copy.loads)) {
    for (const ld of copy.loads) {
      ld.q = ld.q * (ld.type === 'Q' ? pf.Q : pf.G);
    }
  }
  return copy;
}
