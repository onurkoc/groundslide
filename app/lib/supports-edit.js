// Editing functions of the supports input (SPEC_ETAPPE3 8, SPEC_ETAPPE2 5.1). They change the model in place and have no
// DOM access. They add no values on their own: a new row has a free id and everything else empty (numbers null, "head" not
// chosen); the core reports what is missing. `supports` is written only while there is at least one element.

import { setNumber } from './edit.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const SUPPORT_TYPES = ['nail', 'anchor', 'pile', 'shotcrete'];

/** First letter of the free ids per type (SPEC_ETAPPE3 8): N1, N2 ... A1 ... P1 ... S1 ... */
export const ID_PREFIX = { nail: 'N', anchor: 'A', pile: 'P', shotcrete: 'S' };

/** Defaults of the core for empty partial factors (SPEC_ETAPPE3 5), shown as placeholder; a test compares them with the core. */
export const FACTOR_DEFAULTS = {
  nail: { gammaM: 1.35 },
  anchor: { gammaM: 1.35, gammaA: 1.0 },
  pile: { gammaM: 1.4 },
  shotcrete: { gammaC: 1.5 },
};

/** Placeholder of an empty partial factor: the default of the core as text, with one decimal when it is whole ("1.0", "1.35"). */
export function factorPlaceholder(type, key) {
  const value = FACTOR_DEFAULTS[type][key];
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/**
 * Fields of the elements in the order of the tables (SPEC_ETAPPE3 2.1). kind: 'number' (rule: 'any' | 'pos' = > 0 |
 * 'nonneg' = >= 0 as in the core), 'hasHead', 'bond' (nail: the choice of the form), 'factor' (partial factor, only mode sia).
 * `unit` as in the table head; `label` is an interface text (null: the key itself is the label).
 */
export const SUPPORT_FIELDS = {
  nail: [
    { key: 'x', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'z', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'angle', kind: 'number', rule: 'any', unit: '°', label: 'ui.sup.angle' },
    { key: 'length', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.length' },
    { key: 'spacing', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.spacing' },
    { key: 'bond', kind: 'bond', label: 'ui.sup.bond' },
    { key: 'bond.tau', kind: 'bondTau', unit: 'kPa', label: 'τ' },
    { key: 'bond.diameter', kind: 'bondDiameter', unit: 'm', label: 'D' },
    { key: 'bond.q', kind: 'bondQ', unit: 'kN/m', label: 'q' },
    { key: 'tensile', kind: 'number', rule: 'nonneg', unit: 'kN', label: 'ui.sup.tensile' },
    { key: 'hasHead', kind: 'hasHead', label: 'ui.sup.hasHead' },
    { key: 'gammaM', kind: 'factor', label: 'γ_M' },
  ],
  anchor: [
    { key: 'x', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'z', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'angle', kind: 'number', rule: 'any', unit: '°', label: 'ui.sup.angle' },
    { key: 'freeLength', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.freeLength' },
    { key: 'bondLength', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.bondLength' },
    { key: 'spacing', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.spacing' },
    { key: 'P0', kind: 'number', rule: 'nonneg', unit: 'kN', label: 'P0' },
    { key: 'Rk', kind: 'number', rule: 'nonneg', unit: 'kN', label: 'Rk' },
    { key: 'gammaA', kind: 'factor', label: 'γ_A' },
    { key: 'gammaM', kind: 'factor', label: 'γ_M' },
  ],
  pile: [
    { key: 'x', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'z', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'length', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.length' },
    { key: 'spacing', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.spacing' },
    { key: 'shear', kind: 'number', rule: 'nonneg', unit: 'kN', label: 'ui.sup.shear' },
    { key: 'gammaM', kind: 'factor', label: 'γ_M' },
  ],
  shotcrete: [
    { key: 'x1', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'x2', kind: 'number', rule: 'any', unit: 'm' },
    { key: 'thickness', kind: 'number', rule: 'pos', unit: 'm', label: 'ui.sup.thickness' },
    { key: 'tau', kind: 'number', rule: 'nonneg', unit: 'kPa', label: 'τ' },
    { key: 'gammaC', kind: 'factor', label: 'γ_C' },
  ],
};

// ---------- reading the list ----------

/** The elements of one type with their index in the whole list `supports`: [{ support, index }]. */
export function supportsOfType(model, type) {
  const list = isObject(model) && Array.isArray(model.supports) ? model.supports : [];
  const rows = [];
  list.forEach((support, index) => {
    if (isObject(support) && support.type === type) rows.push({ support, index });
  });
  return rows;
}

/** Entries that no table shows (not an object, or a type that is none of the four): [{ index, id, type }]. */
export function otherSupports(model) {
  const list = isObject(model) && Array.isArray(model.supports) ? model.supports : [];
  const out = [];
  list.forEach((support, index) => {
    if (!isObject(support)) out.push({ index, id: '', type: '', object: false });
    else if (!SUPPORT_TYPES.includes(support.type)) out.push({ index, id: typeof support.id === 'string' ? support.id : '', type: support.type === undefined || support.type === null ? '' : String(support.type), object: true });
  });
  return out;
}

/** Number of entries in `supports` (0 when it is missing or not a list). */
export const supportCount = (model) => (isObject(model) && Array.isArray(model.supports) ? model.supports.length : 0);

/** First free id of the type: N1, N2 ... (free among all supports, so that the ids stay unique in the list). */
export function nextSupportId(model, type) {
  const used = new Set((isObject(model) && Array.isArray(model.supports) ? model.supports : []).map((s) => (isObject(s) ? s.id : undefined)));
  let n = 1;
  while (used.has(`${ID_PREFIX[type]}${n}`)) n += 1;
  return `${ID_PREFIX[type]}${n}`;
}

// ---------- rows ----------

/** A new, empty element of the type (SPEC_ETAPPE3 8): free id given, numbers null, "head" not chosen; nail with the form "tau and D". */
export function emptySupport(type, id) {
  switch (type) {
    case 'nail': return { id, type, x: null, z: null, angle: null, length: null, spacing: null, bond: { tau: null, diameter: null }, tensile: null, hasHead: null };
    case 'anchor': return { id, type, x: null, z: null, angle: null, freeLength: null, bondLength: null, spacing: null, P0: null, Rk: null };
    case 'pile': return { id, type, x: null, z: null, length: null, spacing: null, shear: null };
    default: return { id, type, x1: null, x2: null, thickness: null, tau: null };
  }
}

/**
 * Insert a new element of `type` after row `afterRow` of that type's table (-1: at the end of the list). The list keeps its
 * order otherwise. Returns { index, id } of the new element in the whole list.
 */
export function insertSupportAfter(model, type, afterRow) {
  if (!Array.isArray(model.supports)) model.supports = [];
  const rows = supportsOfType(model, type);
  const at = afterRow >= 0 && afterRow < rows.length ? rows[afterRow].index + 1 : model.supports.length;
  const id = nextSupportId(model, type);
  model.supports.splice(at, 0, emptySupport(type, id));
  return { index: at, id };
}

/** Delete the element at `index` of the list; the field `supports` is removed with the last one. The bond values kept for its id go too. */
export function deleteSupport(model, index, stash = {}) {
  if (!Array.isArray(model.supports) || index < 0 || index >= model.supports.length) return;
  const [gone] = model.supports.splice(index, 1);
  if (isObject(gone) && stash.supportBond instanceof Map) stash.supportBond.delete(String(gone.id));
  if (model.supports.length === 0) delete model.supports;
}

/** Change the id of an element; the bond values kept for the old id follow (same session). */
export function renameSupport(model, index, id, stash = {}) {
  const s = Array.isArray(model.supports) ? model.supports[index] : null;
  if (!isObject(s)) return;
  const old = String(s.id);
  if (stash.supportBond instanceof Map && stash.supportBond.has(old) && old !== id) {
    const entry = stash.supportBond.get(old);
    stash.supportBond.delete(old);
    stash.supportBond.set(String(id), entry);
  }
  s.id = id;
}

// ---------- values ----------

/** Number field of an element (`key` like 'x' or 'bond.tau'); empty or unreadable input stores null (SPEC_ETAPPE2 5.1, 5.3). */
export function setSupportNumber(model, index, key, parsed) {
  setNumber(model, ['supports', index, ...key.split('.')], parsed);
}

/**
 * Partial factor of an element: empty input removes the field (the default of the core applies, SPEC_ETAPPE3 8, as gammaW in
 * SPEC_ETAPPE2 5.1); unreadable input stores null (the core reports E_SUPPORT_FACTORS).
 */
export function setSupportFactor(model, index, key, parsed) {
  const s = Array.isArray(model.supports) ? model.supports[index] : null;
  if (!isObject(s)) return;
  if (parsed.ok && parsed.value === null) delete s[key];
  else s[key] = parsed.ok ? parsed.value : null;
}

/** "Head present" from the choice: '' -> null (not chosen), 'true' / 'false' -> boolean. */
export function setSupportHasHead(model, index, value) {
  const s = Array.isArray(model.supports) ? model.supports[index] : null;
  if (isObject(s)) s.hasHead = value === 'true' ? true : value === 'false' ? false : null;
}

// ---------- bond of the nail: two forms, the values of the other one stay in the session ----------

/** The form shown for a bond: 'q' when only q is given, otherwise 'tauD' (also for none or both forms; the core reports those). */
export function bondForm(bond) {
  if (!isObject(bond)) return 'tauD';
  const q = bond.q !== undefined;
  const tauD = bond.tau !== undefined || bond.diameter !== undefined;
  return q && !tauD ? 'q' : 'tauD';
}

function bondStash(stash, id) {
  if (!(stash.supportBond instanceof Map)) stash.supportBond = new Map();
  const key = String(id);
  if (!stash.supportBond.has(key)) stash.supportBond.set(key, { tau: null, diameter: null, q: null });
  return stash.supportBond.get(key);
}

const BOND_KEYS = ['tau', 'diameter', 'q'];

/**
 * Switch the form of the bond of a nail. The values of the form that is left are kept in `stash` (for this session) and come
 * back when it is chosen again; only the chosen form goes into the model (`bond.tau` + `bond.diameter`, or `bond.q`).
 */
export function setBondForm(model, index, form, stash) {
  const s = Array.isArray(model.supports) ? model.supports[index] : null;
  if (!isObject(s)) return;
  const entry = bondStash(stash, s.id);
  if (isObject(s.bond)) for (const k of BOND_KEYS) if (s.bond[k] !== undefined) entry[k] = s.bond[k];
  s.bond = form === 'q' ? { q: entry.q } : { tau: entry.tau, diameter: entry.diameter };
}

// ---------- the field at the element in the sketch (SPEC_ETAPPE3 9) ----------

/**
 * Values of an element for its input field: { id, numbers: { key: value|null }, hasHead: boolean|null, bondForm, bond: { tau,
 * diameter, q }, factors: { key: value|null } } (nulls for empty). The bond values of the form that is not chosen come from
 * the session (`stash`).
 */
export function supportFormValues(support, stash = {}) {
  const num = (v) => (isNum(v) ? v : null);
  const form = {
    id: typeof support.id === 'string' ? support.id : '',
    numbers: {},
    hasHead: typeof support.hasHead === 'boolean' ? support.hasHead : null,
    bondForm: support.type === 'nail' ? bondForm(support.bond) : null,
    bond: { tau: null, diameter: null, q: null },
    factors: {},
  };
  for (const f of SUPPORT_FIELDS[support.type] || []) {
    if (f.kind === 'number') form.numbers[f.key] = num(support[f.key]);
    if (f.kind === 'factor') form.factors[f.key] = num(support[f.key]);
  }
  if (support.type === 'nail') {
    const kept = stash.supportBond instanceof Map ? stash.supportBond.get(String(support.id)) : null;
    for (const k of BOND_KEYS) form.bond[k] = isObject(support.bond) && isNum(support.bond[k]) ? support.bond[k] : kept && isNum(kept[k]) ? kept[k] : null;
  }
  return form;
}

/**
 * Take the values of the input field over (one change of the model). `form` as made by supportFormValues, numbers already read
 * (null = empty). Factors in `form.factors` are written (empty removes the field); without `factors` (mode characteristic: the
 * field does not show them) the factors stay as they are. Returns true when the element exists.
 */
export function applySupportForm(model, index, form, stash = {}) {
  const s = Array.isArray(model.supports) ? model.supports[index] : null;
  if (!isObject(s) || !SUPPORT_FIELDS[s.type]) return false;
  renameSupport(model, index, form.id, stash);
  for (const [key, value] of Object.entries(form.numbers || {})) s[key] = value;
  if (s.type === 'nail') {
    s.hasHead = form.hasHead === true || form.hasHead === false ? form.hasHead : null;
    const entry = bondStash(stash, s.id);
    for (const k of BOND_KEYS) entry[k] = form.bond[k];
    s.bond = form.bondForm === 'q' ? { q: form.bond.q } : { tau: form.bond.tau, diameter: form.bond.diameter };
  }
  if (form.factors) {
    for (const [key, value] of Object.entries(form.factors)) {
      if (value === null) delete s[key];
      else s[key] = value;
    }
  }
  return true;
}
