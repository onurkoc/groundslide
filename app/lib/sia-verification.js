// "Verification SIA 267" of the result document (SPEC_ETAPPE4 13b), as data: the partial factors as calculated, the rule as text and as set formulas
// (MathML, built from the small tree of nodes below by ui/print-doc.js), the numbers of the chosen method and the verification per method as in
// the overview. Only mode sia; without it the document is as before. No DOM access.

import { overviewTable } from './result-view.js';
import { METHODS } from './result-state.js';
import { formatFactor, formatCoordinate } from './numbers.js';
import { supportOnlyMethods, CODE_SPENCER_ONLY } from './supports-result.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Default partial factors (SPEC.md 2.2) for a value the model does not hold; a test compares them with the core. */
export const SIA_DEFAULT_FACTORS = Object.freeze({ gamma: 1.0, phi: 1.2, c: 1.5, cu: 1.5, G: 1.0, Q: 1.3, R: 1.1 });

/** The soil and load factors in the order of the table: [key in the model, symbol]. */
export const SIA_FACTORS = [['gamma', 'γ_γ'], ['phi', 'γ_φ'], ['c', 'γ_c'], ['cu', 'γ_cu'], ['G', 'γ_G'], ['Q', 'γ_Q'], ['R', 'γ_R']];

// ---------- the nodes of a formula (MathML elements, built by the page) ----------

/** A formula node: { tag, text } for a token (mi, mn, mo, mtext) or { tag, children } (mrow, msub, mfrac). */
const tok = (tag) => (text) => ({ tag, text });
export const mi = tok('mi');
export const mn = tok('mn');
export const mo = tok('mo');
export const mtext = tok('mtext');
export const mrow = (...children) => ({ tag: 'mrow', children });
export const msub = (base, sub) => ({ tag: 'msub', children: [base, sub] });
export const mfrac = (num, den) => ({ tag: 'mfrac', children: [num, den] });

const sym = (base, sub) => msub(mi(base), mi(sub));
const gamma = (sub) => sym('γ', sub);
const eq = mo('=');

/** tan φ'_k / γ and the other design values of the soil (SPEC.md 2.2, SPEC_ETAPPE3 5). */
const tanPhi = (sub) => mrow(mi('tan'), msub(mi('φ′'), mi(sub)));

/** The rule without supports: X_d = X_k / γ_m, tan φ'_d = tan φ'_k / γ_φ; F_d ≥ γ_R, η = γ_R / F_d (SPEC.md 2.4, SIA 267 Gl. (19), (20)). */
function ruleWithoutSupports() {
  return {
    design: [
      mrow(sym('X', 'd'), eq, mfrac(sym('X', 'k'), gamma('m'))),
      mrow(tanPhi('d'), eq, mfrac(tanPhi('k'), gamma('φ'))),
    ],
    check: [
      mrow(sym('F', 'd'), mo('≥'), gamma('R')),
      mrow(mi('η'), eq, mfrac(gamma('R'), sym('F', 'd'))),
    ],
  };
}

/**
 * The rule with supports (SPEC_ETAPPE3 5): the soil values are divided by gamma_R as well, the check is F_d >= 1.0, eta = 1 / F_d; the contribution
 * of the supports stands outside of gamma_R (Delta R_d, SIA 267 Gl. (19)).
 */
function ruleWithSupports() {
  const r = gamma('R');
  const times = (a, b) => mrow(a, mo('·'), b);
  return {
    design: [
      mrow(msub(mi('c′'), mi('d')), eq, mfrac(msub(mi('c′'), mi('k')), times(gamma('c'), r))),
      mrow(tanPhi('d'), eq, mfrac(tanPhi('k'), times(gamma('φ'), r))),
      mrow(msub(mi('c'), mi('u,d')), eq, mfrac(msub(mi('c'), mi('u,k')), times(gamma('cu'), r))),
    ],
    check: [
      mrow(sym('F', 'd'), mo('≥'), mn('1.0')),
      mrow(mi('η'), eq, mfrac(mn('1'), sym('F', 'd'))),
    ],
  };
}

// ---------- the verification of the document ----------

/** Value of a partial factor: the model's, else the default of SPEC.md 2.2; γ_R from the result of the verification when it holds it. */
function factorValue(model, result, key) {
  if (key === 'R' && isObject(result) && isObject(result.check) && isNum(result.check.gammaR)) return result.check.gammaR;
  const given = isObject(model) && isObject(model.partialFactors) ? model.partialFactors[key] : undefined;
  return isNum(given) ? given : SIA_DEFAULT_FACTORS[key];
}

/**
 * The section "Verification SIA 267", or null (mode characteristic, no model). Returns
 *   { title, factors: { title, head, values }, rule: { title, withSupports, text: [designText, checkText], design, check, source },
 *     reference: null | text (SPEC_ETAPPE4 13e: the head shows a single surface, the verification is the one of the search),
 *     numbers: null | { title, math, verdict },
 *     methods: { title, kind: 'table', head, rows } | { title, kind: 'none', text } }
 * `rows` of the table: { cells: [...] } or { name, note } (a method that supports exclude: code and text as in the overview).
 */
export function documentVerification({ model, result, method, target = null, t }) {
  if (!isObject(model) || !isObject(model.analysis) || model.analysis.mode !== 'sia') return null;
  const table = overviewTable(result);
  const withSupports = table.withSupports;
  const fd = withSupports;
  const factors = {
    title: t('ui.doc.sia.factors'),
    head: SIA_FACTORS.map(([, symbol]) => symbol),
    values: SIA_FACTORS.map(([key]) => formatFactor(factorValue(model, result, key))),
  };
  const rule = withSupports ? ruleWithSupports() : ruleWithoutSupports();
  const section = {
    title: t('ui.doc.sia.title'),
    factors,
    rule: {
      title: t('ui.doc.sia.rule'),
      withSupports,
      text: [t(withSupports ? 'ui.doc.sia.designSupports' : 'ui.doc.sia.design'), t(withSupports ? 'ui.doc.sia.checkSupports' : 'ui.doc.sia.check')],
      design: rule.design,
      check: rule.check,
      source: t('ui.doc.sia.source'),
    },
    reference: null,
    numbers: null,
    methods: { title: t('ui.doc.sia.methods'), kind: 'none', text: t('ui.doc.sia.noCheck') },
  };

  // the same inequality with the numbers of the chosen method (SPEC_ETAPPE4 13b): F_d = 0.803 < gamma_R = 1.100 -> not satisfied
  const row = method ? table.rows.find((r) => r.method === method) : undefined;
  if (row && row.valid) {
    const name = t(`ui.method.${method}`);
    if (row.check) {
      const required = fd ? row.check.required : row.check.gammaR;
      const ok = row.check.ok === true;
      const left = mrow(sym('F', 'd'), eq, mn(formatFactor(row.F)), mo(ok ? '≥' : '<'), fd ? mn(formatFactor(required)) : mrow(gamma('R'), eq, mn(formatFactor(required))));
      const eta = mrow(mi('η'), eq, mn(formatFactor(row.check.utilisation)));
      section.numbers = { title: t('ui.doc.sia.numbers', { method: name }), math: mrow(left, mo(','), eta), verdict: t(ok ? 'ui.verdict.ok' : 'ui.verdict.fail') };
    } else {
      section.numbers = { title: t('ui.doc.sia.numbers', { method: name }), math: null, verdict: t('ui.doc.sia.noVerdict') };
    }
  }

  // SPEC_ETAPPE4 13e: the head shows a single surface; the verification stays with the governing surface of the search and says so
  if (target && target.kind === 'single' && row && row.valid) {
    const id = String(target.id);
    section.reference = row.polyline
      ? t('ui.doc.sia.referencePolyline', { id, n: row.polyline.n })
      : t('ui.doc.sia.referenceCircle', { id, xc: formatCoordinate(row.xc), zc: formatCoordinate(row.zc), R: formatCoordinate(row.R) });
  }

  // the table per method as in the overview: F_d, required, utilisation, verdict; Janbu F0 has no verdict; the methods that supports exclude with code and text
  if (table.hasCheck && (table.rows.length || supportOnlyMethods(result).length)) {
    const head = [t('ui.col.method'), t(fd ? 'ui.col.Fd' : 'ui.col.F'), t('ui.col.required'), t(fd ? 'ui.col.utilisationFd' : 'ui.col.utilisation'), t('ui.doc.sia.verdict')];
    const rows = [...table.rows, ...supportOnlyMethods(result).map((m) => ({ method: m, refused: true }))]
      .sort((a, b) => METHODS.indexOf(a.method) - METHODS.indexOf(b.method))
      .map((r) => {
        const name = t(`ui.method.${r.method}`);
        if (r.refused) return { name, note: `${CODE_SPENCER_ONLY} ${t(CODE_SPENCER_ONLY)}` };
        if (!r.valid) return { name, note: t('ui.result.noValid') };
        if (!r.check) return { cells: [name, formatFactor(r.F), '–', '–', '–'] };
        return { cells: [name, formatFactor(r.F), formatFactor(fd ? r.check.required : r.check.gammaR), formatFactor(r.check.utilisation), t(r.check.ok ? 'ui.verdict.ok' : 'ui.verdict.fail')] };
      });
    section.methods = { title: t('ui.doc.sia.methods'), kind: 'table', head, rows };
  }
  return section;
}
