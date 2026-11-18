// Reading and writing the model file (SPEC_ETAPPE2 chapter 4). No DOM access.
//
// The file is the JSON model of SPEC chapter 4 plus the top-level field
// "formatVersion". Fields the app does not know (e.g. "expected", "surfaces")
// are kept unchanged.

import { translate } from './i18n.js';

/** Highest file format version this app knows. */
export const FORMAT_VERSION = 1;

/** App error codes of this module (texts in i18n.js). */
export const APP_JSON_INVALID = 'APP_JSON_INVALID';
export const APP_FORMAT_VERSION = 'APP_FORMAT_VERSION';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function failure(lang, code, params) {
  return { ok: false, error: { code, params, message: translate(lang, code, params) } };
}

/**
 * Text -> model.
 * Returns { ok: true, model, formatVersion } or { ok: false, error: { code, message } }.
 * - invalid JSON or not a JSON object: APP_JSON_INVALID
 * - formatVersion missing: 1; greater than FORMAT_VERSION (or not a positive
 *   integer): APP_FORMAT_VERSION, the file is not loaded
 * The returned model does not contain formatVersion; writeModel adds it.
 */
export function readModel(text, lang = 'en') {
  let data;
  try {
    data = JSON.parse(typeof text === 'string' ? text.replace(/^﻿/, '') : text);
  } catch {
    return failure(lang, APP_JSON_INVALID);
  }
  if (!isObject(data)) return failure(lang, APP_JSON_INVALID);

  const { formatVersion = 1, ...model } = data;
  if (!Number.isInteger(formatVersion) || formatVersion < 1 || formatVersion > FORMAT_VERSION) {
    return failure(lang, APP_FORMAT_VERSION, { version: JSON.stringify(formatVersion), known: FORMAT_VERSION });
  }
  return { ok: true, model, formatVersion };
}

/** Model -> JSON text, 2 spaces indent, formatVersion first, all other fields unchanged. */
export function writeModel(model) {
  if (!isObject(model)) throw new TypeError('writeModel: model must be an object');
  const { formatVersion: _ignored, ...rest } = model;
  return JSON.stringify({ formatVersion: FORMAT_VERSION, ...rest }, null, 2);
}

/** Template for "New": geometry and parameters of benchmark B1 (homogeneous, dry), no expected values, no single circles. */
export function createNewModel(lang = 'en') {
  return {
    meta: { name: translate(lang, 'model.newName'), description: '', units: 'SI' },
    ground: [[0, 30], [50, 30], [80, 50], [130, 50]],
    bottom: 0,
    layers: [{ material: 'M1', top: null }],
    materials: {
      M1: { name: 'Soil 1', gamma: 19, gammaSat: 20, model: 'drained', c: 5, phi: 30 },
    },
    water: null,
    loads: [],
    seismic: { kh: 0 },
    analysis: {
      mode: 'characteristic',
      methods: ['bishop', 'janbu'],
      direction: 'left',
      slices: 50,
      tolerance: 0.0001,
      maxIterations: 100,
    },
    partialFactors: { phi: 1.2, c: 1.5, cu: 1.5, gamma: 1.0, G: 1.0, Q: 1.3, R: 1.1 },
    search: {
      grid: { xMin: 20, xMax: 80, zMin: 40, zMax: 120, nx: 31, nz: 41 },
      radii: 40,
    },
  };
}

/** Name of the model as a file name without extension; characters not allowed in file names are replaced. */
export function baseNameFor(model) {
  const name = isObject(model) && isObject(model.meta) && typeof model.meta.name === 'string' ? model.meta.name : '';
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  return clean || 'model';
}

/** Download file name "<meta.name>.json" of the saved model. */
export function fileNameFor(model) {
  return `${baseNameFor(model)}.json`;
}

/** File name of the exported graphic (SPEC_ETAPPE2 8.4): the name of the saved model with "_sketch.png" or "_sketch.svg" instead of ".json". */
export function sketchFileNameFor(model, format) {
  return `${baseNameFor(model)}_sketch.${format === 'svg' ? 'svg' : 'png'}`;
}

