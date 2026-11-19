// Model validation and normalisation (SPEC chapters 3 and 4).
// Pure functions, no DOM or browser access.

import { heightAt } from './geometry.js';
import { effectiveBoundary } from './layers.js';

const TOL = 1e-9;

/** Default partial factors (SPEC 2.2). All can be overridden by the input. */
export const DEFAULT_PARTIAL_FACTORS = Object.freeze({
  phi: 1.2,
  c: 1.5,
  cu: 1.5,
  gamma: 1.0,
  G: 1.0,
  Q: 1.3,
  R: 1.1,
});

/**
 * Default partial factors of the supports per type (SPEC_ETAPPE3 5). One place
 * only. Used in mode "sia" when the element does not give its own value.
 * nail: gammaM; anchor: gammaM and gammaA; pile: gammaM; shotcrete: gammaC.
 */
export const DEFAULT_SUPPORT_FACTORS = Object.freeze({
  nail: Object.freeze({ gammaM: 1.35 }),
  anchor: Object.freeze({ gammaM: 1.35, gammaA: 1.0 }),
  pile: Object.freeze({ gammaM: 1.4 }),
  shotcrete: Object.freeze({ gammaC: 1.5 }),
});

/** Tolerance (m) of a support head above the ground line (SPEC_ETAPPE3 2.2). */
export const SUPPORT_HEAD_TOL = 0.01;

/** Default unit weight of water in kN/m3 (SPEC 3). */
export const DEFAULT_GAMMA_W = 9.81;

/** Error thrown when a model that failed validation is used. */
export class ModelError extends Error {
  constructor(errors) {
    super(errors.map((e) => `${e.code}: ${e.message}`).join('; '));
    this.name = 'ModelError';
    this.code = errors[0] ? errors[0].code : 'E_MODEL_INVALID';
    this.errors = errors;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPoint = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const isPolyline = (a) => Array.isArray(a) && a.length >= 2 && Array.from(a).every(isPoint);

/**
 * Check a model against all rules of SPEC chapter 4.
 * Returns { valid, errors }, errors = [{ code, message, path }].
 * The model is never modified.
 */
export function validateModel(model) {
  // Keep the public validation boundary non-throwing even for objects with
  // inaccessible properties (the usual input is a JSON model).
  try {
    return validateModelInput(model);
  } catch {
    return {
      valid: false,
      errors: [{ code: 'E_MODEL_INVALID', message: 'Model properties could not be inspected.', path: '' }],
    };
  }
}

function validateModelInput(model) {
  const errors = [];
  const err = (code, message, path) => errors.push({ code, message, path });

  if (!isObject(model)) {
    err('E_MODEL_INVALID', 'Model must be an object.', '');
    return { valid: false, errors };
  }

  // ---- ground ----
  let groundOk = false;
  let xMin = NaN;
  let xMax = NaN;
  const ground = model.ground;
  if (!isPolyline(ground)) {
    err('E_GROUND_INVALID', 'ground must be a list of at least two [x, z] points with numeric values.', 'ground');
  } else {
    let ordered = true;
    for (let i = 1; i < ground.length; i++) {
      if (ground[i][0] < ground[i - 1][0]) {
        ordered = false;
        err(
          'E_GROUND_ORDER',
          `ground x must not decrease (overhang): point ${i} has x=${ground[i][0]} after x=${ground[i - 1][0]}.`,
          `ground[${i}]`,
        );
        break;
      }
    }
    xMin = ground[0][0];
    xMax = ground[ground.length - 1][0];
    if (ordered && !(xMax > xMin)) {
      err('E_GROUND_INVALID', 'ground must have a positive width.', 'ground');
    } else {
      groundOk = ordered;
    }
  }

  // ---- bottom ----
  if (!isNum(model.bottom)) {
    err('E_BOTTOM_MISSING', 'bottom (height of the model base) is mandatory and must be a number.', 'bottom');
  } else if (groundOk) {
    const zMinGround = ground.reduce((z, p) => Math.min(z, p[1]), Infinity);
    if (!(model.bottom < zMinGround)) {
      err(
        'E_BOTTOM_ABOVE_GROUND',
        `bottom (${model.bottom}) must lie below the lowest ground point (${zMinGround}).`,
        'bottom',
      );
    }
  }

  // ---- materials ----
  const materials = model.materials;
  const materialsOk = isObject(materials);
  if (!materialsOk) {
    err('E_MATERIAL_INVALID', 'materials must be an object keyed by material id.', 'materials');
  }

  // ---- layers ----
  const layers = model.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    err('E_LAYERS_MISSING', 'layers must be a non-empty list (top to bottom).', 'layers');
  } else {
    const usedMaterials = new Set();
    Array.from(layers).forEach((layer, k) => {
      const path = `layers[${k}]`;
      if (!isObject(layer)) {
        err('E_LAYERS_MISSING', `${path} must be an object.`, path);
        return;
      }
      if (typeof layer.material !== 'string' || !materialsOk || !Object.hasOwn(materials, layer.material)) {
        err('E_MATERIAL_UNKNOWN', `${path}.material must name a defined material.`, `${path}.material`);
      } else {
        usedMaterials.add(layer.material);
      }
      if (k === 0) {
        if (layer.top !== null && layer.top !== undefined) {
          err('E_LAYER_TOP_FIRST', 'The topmost layer must have top: null (it starts at the ground line).', `${path}.top`);
        }
        return;
      }
      if (!isPolyline(layer.top)) {
        err('E_LAYER_TOP_MISSING', `${path}.top must be a list of at least two [x, z] points.`, `${path}.top`);
        return;
      }
      let strict = true;
      for (let i = 1; i < layer.top.length; i++) {
        if (!(layer.top[i][0] > layer.top[i - 1][0])) {
          strict = false;
          err('E_LAYER_ORDER', `${path}.top x must be strictly increasing (point ${i}).`, `${path}.top[${i}]`);
          break;
        }
      }
      if (!strict || !groundOk) return;
      // SPEC 4 (version 1.8): the effective boundary (extended to the model width, clipped at the ground)
      // may touch the effective boundary above but not cross it. The ground clips both, so for k = 1
      // there is nothing to check.
      if (k === 1) return;
      const above = layers[k - 1]?.top;
      if (!(isPolyline(above) && above.every((p, i) => i === 0 || p[0] > above[i - 1][0]))) return;
      const effHere = effectiveBoundary(layer.top, ground);
      const effAbove = effectiveBoundary(above, ground);
      const xs = new Set([...effHere.map((p) => p[0]), ...effAbove.map((p) => p[0])]);
      for (const x of xs) {
        // at a vertical piece (vertical ground step) compare like with like: upper end with upper end, lower with lower
        let zl = NaN;
        let za = NaN;
        for (const mode of ['max', 'min']) {
          const h = heightAt(effHere, x, mode);
          const a = heightAt(effAbove, x, mode);
          if (!(h > a + TOL)) continue;
          zl = h;
          za = a;
          break;
        }
        if (!Number.isNaN(zl)) {
          err(
            'E_LAYER_CROSS',
            `${path}.top crosses the boundary above it at x=${x} (z=${zl} > ${za}).`,
            `${path}.top`,
          );
          break;
        }
      }
    });
    if (materialsOk) {
      for (const id of usedMaterials) {
        const m = materials[id];
        const path = `materials.${id}`;
        if (!isObject(m)) {
          err('E_MATERIAL_INVALID', `${path} must be an object.`, path);
          continue;
        }
        if (!isNum(m.gamma) || !(m.gamma > 0) || !isNum(m.gammaSat) || !(m.gammaSat > 0)) {
          err('E_MATERIAL_INVALID', `${path}: gamma and gammaSat must be positive numbers.`, path);
        }
        if (m.model === 'drained') {
          if (!isNum(m.c) || m.c < 0 || !isNum(m.phi) || m.phi < 0 || !(m.phi < 90)) {
            err('E_MATERIAL_INVALID', `${path}: drained material needs c >= 0 and 0 <= phi < 90.`, path);
          }
        } else if (m.model === 'undrained') {
          if (!isNum(m.cu) || m.cu < 0) {
            err('E_MATERIAL_INVALID', `${path}: undrained material needs cu >= 0.`, path);
          }
        } else {
          err('E_MATERIAL_INVALID', `${path}.model must be "drained" or "undrained".`, `${path}.model`);
        }
      }
    }
  }

  // ---- water ----
  if (model.water !== null && model.water !== undefined) {
    const water = model.water;
    if (!isPolyline(water)) {
      err('E_WATER_INVALID', 'water must be null or a list of at least two [x, z] points.', 'water');
    } else {
      let strict = true;
      for (let i = 1; i < water.length; i++) {
        if (!(water[i][0] > water[i - 1][0])) {
          strict = false;
          err('E_WATER_ORDER', `water x must be strictly increasing (point ${i}).`, `water[${i}]`);
          break;
        }
      }
      if (strict && groundOk) {
        const first = water[0][0];
        const last = water[water.length - 1][0];
        if (first > xMin + TOL || last < xMax - TOL) {
          err(
            'E_WATER_WIDTH',
            `water must span the whole model width [${xMin}, ${xMax}], but spans [${first}, ${last}].`,
            'water',
          );
        } else {
          const xs = new Set();
          for (const p of water) if (p[0] >= xMin - TOL && p[0] <= xMax + TOL) xs.add(p[0]);
          for (const p of ground) xs.add(p[0]);
          for (const x of xs) {
            const zw = heightAt(water, x, 'max');
            const zg = heightAt(ground, x, 'min');
            if (Number.isNaN(zw) || Number.isNaN(zg)) continue;
            if (zw > zg + TOL) {
              err(
                'E_WATER_ABOVE_GROUND',
                `water lies above the ground at x=${x} (water z=${zw}, ground z=${zg}).`,
                'water',
              );
              break;
            }
          }
        }
      }
    }
  }

  // ---- loads ----
  if (model.loads !== undefined && model.loads !== null) {
    if (!Array.isArray(model.loads)) {
      err('E_LOAD_INVALID', 'loads must be a list.', 'loads');
    } else {
      Array.from(model.loads).forEach((ld, i) => {
        const path = `loads[${i}]`;
        if (!isObject(ld) || !isNum(ld.x1) || !isNum(ld.x2) || !isNum(ld.q)) {
          err('E_LOAD_INVALID', `${path} needs numeric x1, x2 and q.`, path);
          return;
        }
        if (!(ld.x1 < ld.x2) || ld.q < 0) {
          err('E_LOAD_INVALID', `${path} needs x1 < x2 and q >= 0.`, path);
          return;
        }
        if (ld.type !== 'G' && ld.type !== 'Q') {
          err('E_LOAD_TYPE', `${path}.type must be "G" or "Q".`, `${path}.type`);
        }
        if (groundOk && (ld.x1 < xMin - TOL || ld.x2 > xMax + TOL)) {
          err('E_LOAD_OUT_OF_MODEL', `${path} [${ld.x1}, ${ld.x2}] lies outside the model [${xMin}, ${xMax}].`, path);
        }
      });
    }
  }

  // ---- seismic ----
  if (model.seismic !== undefined && model.seismic !== null) {
    if (!isObject(model.seismic) || !isNum(model.seismic.kh) || model.seismic.kh < 0) {
      err('E_SEISMIC_INVALID', 'seismic.kh must be a number >= 0.', 'seismic.kh');
    } else if (model.seismic.kv !== undefined && model.seismic.kv !== null && !isNum(model.seismic.kv)) {
      // vertical earthquake coefficient k_v, positive downwards, missing = 0 (SPEC_ETAPPE4 7); no range beyond "a number"
      err('E_SEISMIC_INVALID', 'seismic.kv must be a number.', 'seismic.kv');
    }
  }

  // ---- tension crack (SPEC_ETAPPE4 6); missing or null = no crack ----
  if (model.tensionCrack !== undefined && model.tensionCrack !== null) {
    const tc = model.tensionCrack;
    if (!isObject(tc) || !isNum(tc.depth) || !(tc.depth > 0) || !isNum(tc.waterFill) || tc.waterFill < 0 || tc.waterFill > 1) {
      err('E_TENSION_CRACK', 'tensionCrack needs depth > 0 (m) and waterFill from 0 to 1.', 'tensionCrack');
    }
  }

  // ---- analysis ----
  const an = model.analysis;
  if (!isObject(an)) {
    err('E_ANALYSIS_INVALID', 'analysis must be an object.', 'analysis');
  } else {
    if (an.mode !== 'characteristic' && an.mode !== 'sia') {
      err('E_ANALYSIS_INVALID', 'analysis.mode must be "characteristic" or "sia".', 'analysis.mode');
    }
    if (
      !Array.isArray(an.methods) ||
      an.methods.length === 0 ||
      !Array.from(an.methods).every((m) => m === 'bishop' || m === 'janbu' || m === 'spencer')
    ) {
      err('E_ANALYSIS_INVALID', 'analysis.methods must be a non-empty list of "bishop", "janbu", "spencer".', 'analysis.methods');
    }
    if (!Number.isInteger(an.slices) || an.slices < 1) {
      err('E_ANALYSIS_INVALID', 'analysis.slices must be an integer >= 1.', 'analysis.slices');
    }
    if (!isNum(an.tolerance) || !(an.tolerance > 0)) {
      err('E_ANALYSIS_INVALID', 'analysis.tolerance must be a number > 0.', 'analysis.tolerance');
    }
    if (!Number.isInteger(an.maxIterations) || an.maxIterations < 1) {
      err('E_ANALYSIS_INVALID', 'analysis.maxIterations must be an integer >= 1.', 'analysis.maxIterations');
    }
    if (an.direction !== 'auto' && an.direction !== 'right' && an.direction !== 'left') {
      err('E_DIRECTION_INVALID', 'analysis.direction must be "auto", "right" or "left".', 'analysis.direction');
    } else if (an.direction === 'auto' && groundOk) {
      const zFirst = ground[0][1];
      const zLast = ground[ground.length - 1][1];
      if (zFirst === zLast) {
        err(
          'E_DIRECTION_AUTO',
          'direction "auto" cannot be decided: both ends of the ground line have the same height. Set "right" or "left".',
          'analysis.direction',
        );
      }
    }
  }

  // ---- partial factors ----
  if (model.partialFactors !== undefined && model.partialFactors !== null) {
    const pf = model.partialFactors;
    if (!isObject(pf)) {
      err('E_FACTORS_INVALID', 'partialFactors must be an object.', 'partialFactors');
    } else {
      for (const [key, value] of Object.entries(pf)) {
        if (!isNum(value) || !(value > 0)) {
          err('E_FACTORS_INVALID', `partialFactors.${key} must be a number > 0.`, `partialFactors.${key}`);
        }
      }
      // SPEC 4: the partial factor of the unit weight must be 1.0
      if (pf.gamma !== undefined && pf.gamma !== 1) {
        err(
          'E_FACTORS_INVALID',
          'partialFactors.gamma must be 1.0 (enter upper or lower unit weights directly as material values).',
          'partialFactors.gamma',
        );
      }
    }
  }

  // ---- search settings (SPEC 7.1, 7.2); null or missing = no search ----
  if (model.search !== undefined && model.search !== null) {
    const s = model.search;
    const g = s && s.grid;
    const okGrid =
      isObject(s) &&
      isObject(g) &&
      isNum(g.xMin) &&
      isNum(g.xMax) &&
      isNum(g.zMin) &&
      isNum(g.zMax) &&
      g.xMin <= g.xMax &&
      g.zMin <= g.zMax &&
      Number.isInteger(g.nx) &&
      g.nx >= 1 &&
      Number.isInteger(g.nz) &&
      g.nz >= 1;
    if (!okGrid) {
      err('E_SEARCH_INVALID', 'search.grid needs numeric xMin <= xMax, zMin <= zMax and integer nx, nz >= 1.', 'search.grid');
    }
    if (!Number.isInteger(s.radii) || s.radii < 1) {
      err('E_SEARCH_INVALID', 'search.radii must be an integer >= 1.', 'search.radii');
    }
    // optimisation of the circle to a polyline (SPEC_ETAPPE4 5): missing or null = off; { } = default 11 points
    if (isObject(s) && s.optimize !== undefined && s.optimize !== null) {
      const o = s.optimize;
      const okPoints = !isObject(o) ? false : o.points === undefined || (Number.isInteger(o.points) && o.points >= 3);
      if (!okPoints) {
        err('E_SEARCH_INVALID', 'search.optimize must be an object whose points is an integer >= 3 (default 11).', 'search.optimize');
      }
    }
  }

  // ---- supports (SPEC_ETAPPE3 2); missing or [] = no message ----
  validateSupports(model, { groundOk, ground, xMin, xMax }, err);

  // ---- unit weight of water ----
  if (model.gammaW !== undefined && model.gammaW !== null && (!isNum(model.gammaW) || !(model.gammaW > 0))) {
    err('E_GAMMAW_INVALID', 'gammaW must be a number > 0.', 'gammaW');
  }

  return { valid: errors.length === 0, errors };
}

const SUPPORT_TYPES = ['nail', 'anchor', 'pile', 'shotcrete'];

/** Relative tolerance against floating point noise in the SIA 267 eq. 60 comparison (SPEC_ETAPPE3 3.4 (10)). */
const GL60_REL_TOL = 1e-9;

/**
 * Check the optional `supports` list (SPEC_ETAPPE3 2.2). Nothing is repaired.
 * `ctx` = { groundOk, ground, xMin, xMax } of the ground check above.
 */
function validateSupports(model, ctx, err) {
  const list = model.supports;
  // SPEC_ETAPPE3 3.4 (6): null is treated like a missing field (as loads, water, search).
  if (list === undefined || list === null) return;
  if (!Array.isArray(list)) {
    err('E_SUPPORT_INVALID', 'supports must be a list.', 'supports');
    return;
  }
  if (list.length === 0) return;

  const an = model.analysis;
  const modeSia = isObject(an) && an.mode === 'sia';
  const ids = new Set();

  // Numeric field; kind "pos" = must be > 0 (length, spacing, thickness),
  // "nonneg" = must be >= 0 (force, stress), "any" = any finite number.
  const num = (obj, key, kind, path) => {
    const v = obj[key];
    if (!isNum(v)) {
      err('E_SUPPORT_INVALID', `${path}.${key} must be a number.`, `${path}.${key}`);
      return false;
    }
    if (kind === 'pos' && !(v > 0)) {
      err('E_SUPPORT_INVALID', `${path}.${key} must be > 0.`, `${path}.${key}`);
      return false;
    }
    if (kind === 'nonneg' && v < 0) {
      err('E_SUPPORT_INVALID', `${path}.${key} must be >= 0.`, `${path}.${key}`);
      return false;
    }
    return true;
  };

  const inModelX = (x) => x >= ctx.xMin - TOL && x <= ctx.xMax + TOL;

  Array.from(list).forEach((s, i) => {
    const path = `supports[${i}]`;
    if (!isObject(s)) {
      err('E_SUPPORT_INVALID', `${path} must be an object.`, path);
      return;
    }

    // id: non-empty text, unique (a text of blanks only counts as empty)
    if (typeof s.id !== 'string' || s.id.trim() === '') {
      err('E_SUPPORT_ID', `${path}.id must be a non-empty text.`, `${path}.id`);
    } else if (ids.has(s.id)) {
      err('E_SUPPORT_ID', `${path}.id "${s.id}" is used twice.`, `${path}.id`);
    } else {
      ids.add(s.id);
    }

    // partial factors (any type, SPEC_ETAPPE3 3.4 (11); a given value must be > 0)
    for (const key of ['gammaM', 'gammaA', 'gammaC']) {
      if (s[key] !== undefined && !(isNum(s[key]) && s[key] > 0)) {
        err('E_SUPPORT_FACTORS', `${path}.${key} must be a number > 0.`, `${path}.${key}`);
      }
    }

    if (!SUPPORT_TYPES.includes(s.type)) {
      err('E_SUPPORT_TYPE', `${path}.type must be "nail", "anchor", "pile" or "shotcrete".`, `${path}.type`);
      return;
    }

    if (s.type === 'shotcrete') {
      const ok1 = num(s, 'x1', 'any', path);
      const ok2 = num(s, 'x2', 'any', path);
      num(s, 'thickness', 'pos', path);
      num(s, 'tau', 'nonneg', path);
      if (ok1 && ok2) {
        // SPEC_ETAPPE3 3.4 (7): x1 >= x2 is E_SUPPORT_INVALID, as for loads.
        if (!(s.x1 < s.x2)) {
          err('E_SUPPORT_INVALID', `${path} needs x1 < x2.`, path);
        } else if (ctx.groundOk && !(inModelX(s.x1) && inModelX(s.x2))) {
          err(
            'E_SUPPORT_OUT_OF_MODEL',
            `${path} [${s.x1}, ${s.x2}] lies outside the model [${ctx.xMin}, ${ctx.xMax}].`,
            path,
          );
        }
      }
      return;
    }

    // nail, anchor, pile: head point and geometry
    const okX = num(s, 'x', 'any', path);
    const okZ = num(s, 'z', 'any', path);
    if (s.type === 'nail') {
      num(s, 'length', 'pos', path);
      num(s, 'spacing', 'pos', path);
      num(s, 'tensile', 'nonneg', path);
      // SPEC_ETAPPE3 3.4 (4): hasHead other than true/false -> E_SUPPORT_INVALID.
      if (typeof s.hasHead !== 'boolean') {
        err('E_SUPPORT_INVALID', `${path}.hasHead must be true or false.`, `${path}.hasHead`);
      }
      validateNailBond(s.bond, `${path}.bond`, num, err);
    } else if (s.type === 'anchor') {
      num(s, 'freeLength', 'pos', path);
      num(s, 'bondLength', 'pos', path);
      num(s, 'spacing', 'pos', path);
      const okP0 = num(s, 'P0', 'nonneg', path);
      const okRk = num(s, 'Rk', 'nonneg', path);
      // SIA 267 eq. 60 in mode "sia": gammaA * P0 <= Rk / gammaM (defaults when the value is missing)
      if (modeSia && okP0 && okRk) {
        const def = DEFAULT_SUPPORT_FACTORS.anchor;
        const gA = s.gammaA === undefined ? def.gammaA : s.gammaA;
        const gM = s.gammaM === undefined ? def.gammaM : s.gammaM;
        if (isNum(gA) && gA > 0 && isNum(gM) && gM > 0 && gA * s.P0 > (s.Rk / gM) * (1 + GL60_REL_TOL)) {
          err(
            'E_SUPPORT_FACTORS',
            `${path}: gammaA*P0 = ${gA * s.P0} exceeds Rk/gammaM = ${s.Rk / gM} (SIA 267 eq. 60).`,
            path,
          );
        }
      }
    } else {
      num(s, 'length', 'pos', path);
      num(s, 'spacing', 'pos', path);
      num(s, 'shear', 'nonneg', path);
    }

    if (s.type !== 'pile') {
      if (!isNum(s.angle)) {
        err('E_SUPPORT_INVALID', `${path}.angle must be a number.`, `${path}.angle`);
      } else if (!(s.angle > -90 && s.angle < 90)) {
        err('E_SUPPORT_ANGLE', `${path}.angle must satisfy -90 < angle < 90 (degrees).`, `${path}.angle`);
      }
    }

    if (okX && ctx.groundOk) {
      if (!inModelX(s.x)) {
        err('E_SUPPORT_OUT_OF_MODEL', `${path}.x=${s.x} lies outside the model [${ctx.xMin}, ${ctx.xMax}].`, `${path}.x`);
      } else if (okZ) {
        const zg = heightAt(ctx.ground, s.x, 'max');
        if (!Number.isNaN(zg) && s.z > zg + SUPPORT_HEAD_TOL) {
          err(
            'E_SUPPORT_OUT_OF_MODEL',
            `${path}: head z=${s.z} lies above the ground (z=${zg}) at x=${s.x}.`,
            `${path}.z`,
          );
        }
      }
    }
  });

  // supports act in Spencer only
  if (isObject(an) && Array.isArray(an.methods) && !Array.from(an.methods).includes('spencer')) {
    err('E_SUPPORT_METHODS', 'supports are present but "spencer" is not in analysis.methods.', 'analysis.methods');
  }
}

/**
 * Bond of a nail: exactly one form, either { tau, diameter } or { q }.
 * Neither or both forms -> E_SUPPORT_BOND. SPEC_ETAPPE3 3.4 (8): a form that
 * is started but incomplete (tau without diameter or the reverse) is a missing
 * field, E_SUPPORT_INVALID.
 */
function validateNailBond(bond, path, num, err) {
  if (!isObject(bond)) {
    err('E_SUPPORT_BOND', `${path} must give exactly one form of bond: { tau, diameter } or { q }.`, path);
    return;
  }
  const formA = bond.tau !== undefined || bond.diameter !== undefined;
  const formB = bond.q !== undefined;
  if (formA === formB) {
    err(
      'E_SUPPORT_BOND',
      formA ? `${path} gives both forms of bond (tau/diameter and q).` : `${path} gives neither tau/diameter nor q.`,
      path,
    );
    return;
  }
  if (formA) {
    num(bond, 'tau', 'nonneg', path);
    num(bond, 'diameter', 'pos', path);
  } else {
    num(bond, 'q', 'nonneg', path);
  }
}

/** Throw a ModelError when the model is invalid. */
export function assertValidModel(model) {
  const { valid, errors } = validateModel(model);
  if (!valid) throw new ModelError(errors);
}

// ---------------------------------------------------------------------------
// Normalisation (SPEC 3): the core always computes with a slope that falls
// to the right. A left-falling model is mirrored at x -> -x.
// ---------------------------------------------------------------------------

const mirrorPoints = (pts) => pts.map(([x, z]) => [0 - x, z]).reverse();

/** Resolve "auto" / "right" / "left" to "right" or "left" from the ground line. */
export function resolveDirection(model) {
  const dir = model.analysis.direction;
  if (dir === 'right' || dir === 'left') return dir;
  const zFirst = model.ground[0][1];
  const zLast = model.ground[model.ground.length - 1][1];
  if (zFirst > zLast) return 'right'; // higher end on the left
  if (zFirst < zLast) return 'left';
  throw new ModelError([
    { code: 'E_DIRECTION_AUTO', message: 'direction "auto" cannot be decided: ground ends have equal height.', path: 'analysis.direction' },
  ]);
}

/**
 * Return { model, mirrored, direction } with a deep copy of the model in the
 * calculation frame (slope falls to the right). The input is not modified.
 * The model must be valid (see validateModel).
 */
export function normalizeModel(model) {
  const direction = resolveDirection(model);
  const copy = structuredClone(model);
  if (direction === 'right') {
    copy.analysis.direction = 'right';
    return { model: copy, mirrored: false, direction };
  }
  copy.ground = mirrorPoints(copy.ground);
  copy.layers = copy.layers.map((l) => (l.top ? { ...l, top: mirrorPoints(l.top) } : l));
  if (copy.water) copy.water = mirrorPoints(copy.water);
  if (copy.loads) copy.loads = copy.loads.map((l) => ({ ...l, x1: 0 - l.x2, x2: 0 - l.x1 }));
  // Supports (SPEC_ETAPPE3 2.2): heads and x1/x2 are mirrored. The angle stays:
  // it is always measured "into the slope", which is -x in the calculation frame.
  if (Array.isArray(copy.supports)) {
    copy.supports = copy.supports.map((s) =>
      s.type === 'shotcrete' ? { ...s, x1: 0 - s.x2, x2: 0 - s.x1 } : { ...s, x: 0 - s.x },
    );
  }
  copy.analysis.direction = 'right';
  return { model: copy, mirrored: true, direction };
}

// ---- coordinate mapping between input frame and calculation frame ----
// `info` is the object returned by normalizeModel (needs .mirrored).

/** Circle given in input coordinates -> calculation frame. */
export function circleToCore(circle, info) {
  return info.mirrored ? { xc: 0 - circle.xc, zc: circle.zc, R: circle.R } : { ...circle };
}

/** x coordinate of the calculation frame -> input frame. */
export function xToInput(x, info) {
  return info.mirrored ? 0 - x : x;
}

/** Point [x, z] of the calculation frame -> input frame. */
export function pointToInput(p, info) {
  return info.mirrored ? [0 - p[0], p[1]] : [p[0], p[1]];
}

/** Base inclination alpha of the calculation frame -> input frame (sign flips when mirrored). */
export function angleToInput(alpha, info) {
  return info.mirrored ? 0 - alpha : alpha;
}
