// Public entry points of the calculation core (SPEC chapter 8).
// Pure functions, no DOM or browser access.

import { DEFAULT_PARTIAL_FACTORS, assertValidModel, circleToCore, normalizeModel, pointToInput } from './model.js';
import { applyPartialFactors } from './factors.js';
import { toInputFrame } from './slices.js';
import { evaluateSurface, hasSupports, runSearch, solverOptions } from './search.js';
import { crackOutput } from './crack.js';
import { CODE_SURFACE_POINTS, isPolylineSurface, polylinePointsProblem, polylineToCore } from './polyline.js';
import { supportsOutput } from './supports.js';
import { withEffectiveLayerTops } from './layers.js';
import { spencerSliceStresses } from './spencer.js';

export { validateModel, ModelError } from './model.js';
export { effectiveBoundary, extendBoundary } from './layers.js';
export { heightAt } from './geometry.js';

/** Validate, apply partial factors, normalise, effective layer boundaries (SPEC 4 v1.8). Throws ModelError for invalid input. */
function prepare(model) {
  assertValidModel(model);
  const factored = applyPartialFactors(model);
  const info = normalizeModel(factored);
  return { m: withEffectiveLayerTops(info.model), info };
}

/** Methods to calculate, as listed in analysis.methods. */
const solverMethods = (model) => model.analysis.methods;

function modelWarnings(model) {
  const w = [];
  if (model.layers.length > 1) w.push('W_CIRCLE_LAYERED');
  return w;
}

/** Compact result of one method for a single surface. */
function methodResult(r, kind) {
  if (!r) return null;
  if (!r.valid) return { valid: false, code: r.code, message: r.message, ...(r.diagnostics ? { diagnostics: r.diagnostics } : {}) };
  if (kind === 'bishop') return { valid: true, F: r.F, iterations: r.iterations, negativeN: r.negativeN };
  if (kind === 'janbu') return { valid: true, F: r.F0, iterations: r.iterations };
  if (kind === 'spencer') return { valid: true, F: r.F, theta: r.theta, Fm: r.Fm, Ff: r.Ff, equilibrium: r.equilibrium, diagnostics: r.diagnostics, iterations: r.iterations };
  return { valid: true, F: r.F, F0: r.F0, f0: r.f0, b1: r.b1, d: r.d, L: r.L, iterations: r.iterations };
}

/**
 * Result of one given slip surface: a circle { xc, zc, R } (without `type` or with `type: "circle"`) or a polyline
 * { type: "polyline", points } in the input frame (SPEC_ETAPPE4 3.1). Points that break SPEC_ETAPPE4 3.2 give
 * { valid: false, code: "E_SURFACE_POINTS" }, no exception.
 */
function surfaceResult(model, m, info, surface) {
  const methods = solverMethods(model);
  const polyline = isPolylineSurface(surface);
  let base;
  let evaluation;
  if (polyline) {
    base = { mode: model.analysis.mode, type: 'polyline', points: Array.isArray(surface.points) ? surface.points.map((p) => (Array.isArray(p) ? [...p] : p)) : surface.points };
    const problem = polylinePointsProblem(surface.points);
    if (problem) return { ...base, valid: false, code: CODE_SURFACE_POINTS, message: problem };
    evaluation = evaluateSurface(m, { type: 'polyline', points: polylineToCore(surface.points, info) }, methods);
  } else {
    base = { mode: model.analysis.mode, type: 'circle', circle: { xc: surface.xc, zc: surface.zc, R: surface.R } };
    evaluation = evaluateSurface(m, circleToCore(surface, info), methods);
  }
  const g = evaluation.geometry;
  if (!g.valid) {
    return { ...base, valid: false, code: g.code, message: g.message };
  }
  const results = {};
  if (evaluation.bishop) results.bishop = methodResult(evaluation.bishop, 'bishop');
  if (evaluation.janbu) {
    results.janbu = methodResult(evaluation.janbu, 'janbu');
    results.janbuCorrected = methodResult(evaluation.janbu, 'janbuCorrected');
  }
  if (evaluation.spencer) results.spencer = methodResult(evaluation.spencer, 'spencer');
  // slice table: add N' and m_alpha of Bishop (last iteration), then map to the input frame
  const bi = evaluation.bishop && evaluation.bishop.valid ? evaluation.bishop : null;
  const sup = evaluation.supports || null;
  // final Spencer F of this circle (null: Spencer gives none); the effective sums of the support forces need it (SPEC_ETAPPE3 4.2, 6)
  const spencerF = evaluation.spencer && evaluation.spencer.valid ? evaluation.spencer.F : null;
  // stresses at the base from the Spencer solution (SPEC_ETAPPE4 8); null when Spencer was not calculated or is invalid
  const stresses = spencerF === null ? null : spencerSliceStresses(sup ? evaluation.supportSlices : g.slices, spencerF, evaluation.spencer.theta, solverOptions(m));
  const slices = g.slices.map((s, i) => ({
    ...s,
    Nprime: bi ? bi.N[i] : null,
    mAlpha: bi ? bi.mAlpha[i] : null,
    tauMob: stresses ? stresses[i].tauMob : null,
    tauF: stresses ? stresses[i].tauF : null,
    sigmaN: stresses ? stresses[i].sigmaN : null,
    sigmaNEff: stresses ? stresses[i].sigmaNEff : null,
    // with supports: effective sums of the support forces on the slice at the final F of Spencer (SPEC_ETAPPE3 4.2, 6): active full,
    // passive divided by F (as `applied`); null when Spencer gives no F for the circle
    ...(sup ? {
      sumPt: spencerF === null ? null : evaluation.supportSlices[i].PtA + evaluation.supportSlices[i].PtP / spencerF,
      sumPn: spencerF === null ? null : evaluation.supportSlices[i].PnA + evaluation.supportSlices[i].PnP / spencerF,
    } : {}),
  }));
  const inp = toInputFrame({ ...g, slices, mirrored: info.mirrored, direction: info.direction });
  const out = {
    ...base,
    valid: true,
    entry: inp.entry,
    exit: inp.exit,
    results,
    slices: inp.slices,
    crack: crackOutput(inp.crack),
  };
  if (sup) {
    out.supports = supportsOutput(sup, g.slices.length, spencerF, info);
  }
  return out;
}

/**
 * Calculate one given slip surface (input coordinates): a circle { xc, zc, R } or a polyline { type: "polyline", points }
 * (SPEC_ETAPPE4 3), and return F per method and
 * the slice table (x_m, b, alpha, W, Q, u, c, phi, N' of Bishop, m_alpha).
 * Slices are in the input frame, x ascending. Throws ModelError for an
 * invalid model; an invalid surface returns { valid: false, code, message }.
 */
export function analyzeSurface(model, surface) {
  const { m, info } = prepare(model);
  return { ...surfaceResult(model, m, info, surface), warnings: modelWarnings(model) };
}

/**
 * Full analysis (SPEC 8): validate, apply partial factors, search (if
 * `search` is not null), result in the input frame. The surfaces listed in
 * `surfaces` are calculated too. Throws ModelError for an invalid model.
 *
 * `options` is optional (SPEC 8.1). `options.onProgress({ phase, done, total })` is called only if it is
 * a function: phase "grid" after each centre of the search grid (done = finished centres, total = nx * nz),
 * phase "refine" once before the refinement (done = 0, total = 0), with search.optimize phase "optimize" once before the
 * first optimisation (done = 0, total = 0, SPEC_ETAPPE4 5). Nothing without a search. The result
 * is the same with and without it; exceptions of the callback are passed on.
 */
export function analyze(model, options) {
  const { m, info } = prepare(model);
  const warnings = modelWarnings(model);
  const warningDetails = warnings.map((code) => ({ code }));
  const result = { mode: model.analysis.mode, warnings, warningDetails };

  if (model.search) {
    const onProgress = options && typeof options.onProgress === 'function' ? options.onProgress : undefined;
    const s = runSearch(m, info, solverMethods(model), model.search, onProgress);
    result.critical = s.critical;
    result.grid = s.grid;
    result.counts = s.counts;
    result.countsByMethod = s.countsByMethod;
    result.refinementEvaluations = s.refinementEvaluations;
    if (s.optimizeEvaluations !== undefined) result.optimizeEvaluations = s.optimizeEvaluations;
    result.searchTimeMs = s.timeMs;
    for (const w of s.warnings) {
      warningDetails.push(w);
      if (!warnings.includes(w.code)) warnings.push(w.code);
    }
    if (model.analysis.mode === 'sia') {
      // one verdict per method; Janbu uncorrected (F0) gets none, no overall verdict (SPEC 8)
      const gammaR = { ...DEFAULT_PARTIAL_FACTORS, ...(model.partialFactors || {}) }.R;
      result.check = { gammaR };
      if (hasSupports(m)) {
        // SPEC_ETAPPE3 5: with supports gamma_R acts on the soil values, F_d >= 1.0, utilisation = 1 / F_d.
        // open question (order 21): the two formats are told apart by check.withSupports (true) and
        // check.required (1.0); without supports neither field exists. Only Spencer has a verdict.
        result.check.withSupports = true;
        result.check.required = 1;
        const c = s.critical.spencer;
        if (c) result.check.spencer = { F: c.F, utilisation: 1 / c.F, ok: c.F >= 1 };
      } else {
        for (const method of ['bishop', 'janbuCorrected', 'spencer']) {
          const c = s.critical[method];
          if (c) result.check[method] = { F: c.F, utilisation: gammaR / c.F, ok: c.F >= gammaR };
        }
      }
    }
  }

  result.surfaces = (model.surfaces || []).map((surf) => ({
    id: surf.id,
    ...surfaceResult(model, m, info, isPolylineSurface(surf) ? surf : { xc: surf.xc, zc: surf.zc, R: surf.R }),
  }));
  return result;
}
