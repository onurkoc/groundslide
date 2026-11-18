// Editing functions of the input (SPEC_ETAPPE2 5.1). They change the model in
// place and have no DOM access. They add no values on their own: new rows and
// switched-on parts start empty (null), the core reports what is missing.

export const APP_MATERIAL_ID_INVALID = 'APP_MATERIAL_ID_INVALID';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** List at model[key]; created (empty) when missing or not a list. */
function listAt(model, key) {
  if (!Array.isArray(model[key])) model[key] = [];
  return model[key];
}

/** Object or list at parent[key]; an empty object is created when it is missing or not an object. */
function objectAt(parent, key) {
  if (parent[key] === null || typeof parent[key] !== 'object') parent[key] = {};
  return parent[key];
}

// ---------- numbers ----------

/**
 * Store a read number (result of parseNumber) at the key path, e.g. ['analysis', 'slices'].
 * Empty or unreadable input stores null (SPEC_ETAPPE2 5.1, 5.3). Objects on the path are created.
 */
export function setNumber(model, keys, parsed) {
  let target = model;
  for (const key of keys.slice(0, -1)) target = objectAt(target, key);
  target[keys[keys.length - 1]] = parsed.ok ? parsed.value : null;
}

/** Optional number (k_v): empty input removes the field, unreadable input stores null (the core reports it). */
export function setOptionalNumber(model, keys, parsed) {
  let target = model;
  for (const key of keys.slice(0, -1)) target = objectAt(target, key);
  const last = keys[keys.length - 1];
  if (parsed.ok && parsed.value === null) delete target[last];
  else target[last] = parsed.ok ? parsed.value : null;
}

/** gammaW: empty input removes the field (default of the core); unreadable input stores null. */
export function setGammaW(model, parsed) {
  if (parsed.ok && parsed.value === null) delete model.gammaW;
  else model.gammaW = parsed.ok ? parsed.value : null;
}

/** Text value (name, description, id); objects on the path are created. */
export function setText(model, keys, text) {
  let target = model;
  for (const key of keys.slice(0, -1)) target = objectAt(target, key);
  target[keys[keys.length - 1]] = text;
}

// ---------- point tables: ground, layer boundary, water ----------

/** Set coordinate `axis` (0 = x, 1 = z) of point `index` in a list of [x, z]. */
export function setPointValue(points, index, axis, parsed) {
  if (!Array.isArray(points[index])) points[index] = [null, null];
  points[index][axis] = parsed.ok ? parsed.value : null;
}

/** Insert an empty point after `index` (index -1: at the start). */
export function insertPointAfter(points, index) {
  points.splice(index + 1, 0, [null, null]);
}

/** Delete the row at `index` of a list. */
export function deleteAt(list, index) {
  if (index >= 0 && index < list.length) list.splice(index, 1);
}

export const insertGroundPointAfter = (model, index) => insertPointAfter(listAt(model, 'ground'), index);

// ---------- loads and single circles: lists of objects ----------

/** Insert an empty load after `index`. */
export function insertLoadAfter(model, index) {
  listAt(model, 'loads').splice(index + 1, 0, { x1: null, x2: null, q: null, type: null });
}

/** Insert an empty single circle after `index`. */
export function insertSurfaceAfter(model, index) {
  listAt(model, 'surfaces').splice(index + 1, 0, { id: '', xc: null, zc: null, R: null });
}

// ---------- single surfaces: circle or polyline (SPEC_ETAPPE4 11) ----------

/** Kind of a single surface: "polyline" or "circle" (without `type`, as before). */
export const surfaceKindOf = (surface) => (isObject(surface) && surface.type === 'polyline' ? 'polyline' : 'circle');

/** Key under which the values of the other kind are kept in the session: the id, or the position for a row without id. */
export const surfaceStashKey = (surface, index) => (isObject(surface) && typeof surface.id === 'string' && surface.id !== '' ? surface.id : `#${index}`);

/**
 * Switch a single surface between circle and polyline. The values of the kind that is left stay in `stash.surfaces` (by id) and
 * come back when the kind is switched back; a kind that was never filled in starts empty (the app adds no values of its own).
 * A circle has no `type` in the model (as before), a polyline `type: "polyline"` and `points`.
 */
export function setSurfaceType(model, index, kind, stash) {
  const list = listAt(model, 'surfaces');
  const surface = list[index];
  if (!isObject(surface) || surfaceKindOf(surface) === kind) return;
  stash.surfaces = stash.surfaces || {};
  const key = surfaceStashKey(surface, index);
  const kept = stash.surfaces[key] || {};
  const id = typeof surface.id === 'string' ? surface.id : '';
  if (kind === 'polyline') {
    stash.surfaces[key] = { ...kept, circle: { xc: surface.xc, zc: surface.zc, R: surface.R } };
    list[index] = { id, type: 'polyline', points: kept.points !== undefined ? kept.points : [] };
  } else {
    stash.surfaces[key] = { ...kept, points: surface.points };
    const c = kept.circle || { xc: null, zc: null, R: null };
    list[index] = { id, xc: c.xc, zc: c.zc, R: c.R };
  }
}

/** The list of points of the polyline `index`; created when missing. */
export function surfacePoints(model, index) {
  const surface = listAt(model, 'surfaces')[index];
  if (!Array.isArray(surface.points)) surface.points = [];
  return surface.points;
}

/** First free id "P1", "P2", ... among the single surfaces. */
export function nextSurfaceId(model, prefix = 'P') {
  const used = new Set((Array.isArray(model.surfaces) ? model.surfaces : []).map((s) => (isObject(s) ? s.id : undefined)));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Append the governing surface of a result (adoptableSurface of result-view.js: a circle or a polyline without id) as a new single
 * surface with the next free id ("C1", "C2", ... for a circle, "P1", ... for a polyline). Returns the id.
 */
export function adoptSurface(model, surface) {
  const id = nextSurfaceId(model, surface.type === 'polyline' ? 'P' : 'C');
  appendSurface(model, { id, ...surface });
  return id;
}

/** Append a single surface (a copy of the given circle `{ id, xc, zc, R }` or polyline `{ id, type, points }`). */
export function appendSurface(model, surface) {
  listAt(model, 'surfaces').push(structuredClone(surface));
}

// ---------- materials ----------

export const materialIds = (model) => (isObject(model.materials) ? Object.keys(model.materials) : []);

/** First free id of the form M1, M2, ... */
export function nextMaterialId(model) {
  const used = new Set(materialIds(model));
  let n = 1;
  while (used.has(`M${n}`)) n += 1;
  return `M${n}`;
}

/** Rebuild the materials object with a changed entry list (keeps the order). */
function rebuildMaterials(model, entries) {
  model.materials = Object.fromEntries(entries);
}

/** Insert an empty drained material after `afterId` (null: at the end). Returns the new id. */
export function insertMaterialAfter(model, afterId) {
  const id = nextMaterialId(model);
  const entries = isObject(model.materials) ? Object.entries(model.materials) : [];
  const fresh = [id, { name: '', gamma: null, gammaSat: null, model: 'drained', c: null, phi: null }];
  const at = afterId === null ? entries.length : entries.findIndex(([k]) => k === afterId) + 1;
  entries.splice(at, 0, fresh);
  rebuildMaterials(model, entries);
  return id;
}

/** Delete a material. Layers that use it stay as they are; the core reports E_MATERIAL_UNKNOWN. */
export function deleteMaterial(model, id) {
  if (!isObject(model.materials)) return;
  delete model.materials[id];
}

/**
 * Change a material id and the references in layers[].material (explicit action, not a silent repair).
 * Refused (model unchanged) when the new id is empty or already used:
 * { ok: false, code: 'APP_MATERIAL_ID_INVALID' }.
 */
export function renameMaterial(model, oldId, newId) {
  if (!isObject(model.materials) || !Object.hasOwn(model.materials, oldId)) return { ok: false, code: APP_MATERIAL_ID_INVALID };
  if (newId === oldId) return { ok: true };
  if (typeof newId !== 'string' || newId.trim() === '' || Object.hasOwn(model.materials, newId)) {
    return { ok: false, code: APP_MATERIAL_ID_INVALID };
  }
  rebuildMaterials(model, Object.entries(model.materials).map(([k, v]) => [k === oldId ? newId : k, v]));
  if (Array.isArray(model.layers)) {
    for (const layer of model.layers) {
      if (isObject(layer) && layer.material === oldId) layer.material = newId;
    }
  }
  return { ok: true };
}

/** Switch the material model. Values of the other model stay in the object (only hidden). */
export function setMaterialModel(model, id, modelName) {
  if (isObject(model.materials) && isObject(model.materials[id])) model.materials[id].model = modelName;
}

// ---------- layers ----------

/** Insert an empty layer after layer `index` (-1: at the top, as top layer without boundary). */
export function insertLayerAfter(model, index) {
  const layers = listAt(model, 'layers');
  const at = index + 1;
  layers.splice(at, 0, { material: null, top: at === 0 ? null : [] });
  // an inserted top layer pushes the former top layer down: it needs a boundary of its own
  if (at === 0 && layers.length > 1 && isObject(layers[1]) && (layers[1].top === null || layers[1].top === undefined)) layers[1].top = [];
}

/** Delete layer `index`. A layer that becomes the top layer starts at the ground line (top: null). */
export function deleteLayer(model, index) {
  const layers = listAt(model, 'layers');
  deleteAt(layers, index);
  if (index === 0 && layers.length > 0 && isObject(layers[0])) layers[0].top = null;
}

export function setLayerMaterial(model, index, id) {
  const layers = listAt(model, 'layers');
  if (!isObject(layers[index])) layers[index] = {};
  layers[index].material = id === '' ? null : id;
}

/** The boundary list of layer `index` (>= 1); created when missing. */
export function layerBoundary(model, index) {
  const layer = listAt(model, 'layers')[index];
  if (!Array.isArray(layer.top)) layer.top = [];
  return layer.top;
}

// ---------- switches: water line and search (restored within the session) ----------

/** `stash` holds the last values of this session: { water, search }. */
export function setWaterEnabled(model, enabled, stash) {
  if (enabled) {
    model.water = stash.water !== undefined && stash.water !== null ? stash.water : [];
  } else {
    stash.water = model.water;
    model.water = null;
  }
}

/** Empty search settings: the core reports E_SEARCH_INVALID until they are filled in. */
export const emptySearch = () => ({
  grid: { xMin: null, xMax: null, zMin: null, zMax: null, nx: null, nz: null },
  radii: null,
});

export function setSearchEnabled(model, enabled, stash) {
  if (enabled) {
    model.search = stash.search !== undefined && stash.search !== null ? stash.search : emptySearch();
  } else {
    stash.search = model.search;
    model.search = null;
  }
}

/** Switch search A (optimisation of the circle to a polyline, SPEC_ETAPPE4 5) on or off; the number of points stays in the session. */
export function setOptimizeEnabled(model, enabled, stash) {
  if (!isObject(model.search)) return;
  if (enabled) {
    model.search.optimize = { points: stash.optimizePoints !== undefined ? stash.optimizePoints : DEFAULT_OPTIMIZE_POINTS };
  } else {
    if (isObject(model.search.optimize)) stash.optimizePoints = model.search.optimize.points;
    delete model.search.optimize;
  }
}

/** Default number of points of search A (SPEC_ETAPPE4 5). */
export const DEFAULT_OPTIMIZE_POINTS = 11;

// ---------- tension crack (SPEC_ETAPPE4 6, 11) ----------

/** Switch the tension crack on or off; depth and water fill stay in the session. Empty values: the core reports them. */
export function setCrackEnabled(model, enabled, stash) {
  if (enabled) {
    model.tensionCrack = stash.tensionCrack !== undefined && stash.tensionCrack !== null ? stash.tensionCrack : { depth: null, waterFill: null };
  } else {
    if (model.tensionCrack !== undefined) stash.tensionCrack = model.tensionCrack;
    delete model.tensionCrack;
  }
}

/** Water fill of the model (0 to 1) -> percent of the input field, without the rounding noise of the multiplication (0.07 -> 7). */
export const fillToPercent = (fill) => (typeof fill === 'number' && Number.isFinite(fill) ? Number((fill * 100).toPrecision(12)) : fill);

/** Percent of the input field (a read number, 0 to 100) -> waterFill = percent / 100. Empty or unreadable input stores null. */
export function setCrackWaterPercent(model, parsed) {
  const crack = objectAt(model, 'tensionCrack');
  crack.waterFill = parsed.ok && parsed.value !== null ? parsed.value / 100 : null;
}

// ---------- analysis ----------

const METHOD_ORDER = ['bishop', 'janbu', 'spencer'];

/** Switch a method on or off; the list keeps the order bishop, janbu, spencer. */
export function setMethod(model, name, checked) {
  const analysis = objectAt(model, 'analysis');
  const current = Array.isArray(analysis.methods) ? analysis.methods : [];
  const set = new Set(current);
  if (checked) set.add(name);
  else set.delete(name);
  const known = METHOD_ORDER.filter((m) => set.has(m));
  const unknown = current.filter((m) => !METHOD_ORDER.includes(m) && set.has(m));
  analysis.methods = [...known, ...unknown];
}
