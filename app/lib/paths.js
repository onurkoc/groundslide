// Mapping of error paths to the input areas of SPEC_ETAPPE2 5.1. No DOM access.

/** Input areas in the order of the page: SPEC_ETAPPE2 5.1, the supports (SPEC_ETAPPE3 8) and the tension crack (SPEC_ETAPPE4 11). */
export const SECTIONS = [
  'project', 'ground', 'bottom', 'materials', 'layers', 'water',
  'loads', 'supports', 'tensionCrack', 'seismic', 'analysis', 'partialFactors', 'search', 'surfaces',
];

// first part of a model path -> area
const FIRST_PART = {
  meta: 'project',
  ground: 'ground',
  bottom: 'bottom',
  materials: 'materials',
  layers: 'layers',
  water: 'water',
  gammaW: 'water',
  loads: 'loads',
  supports: 'supports',
  seismic: 'seismic',
  tensionCrack: 'tensionCrack',
  analysis: 'analysis',
  partialFactors: 'partialFactors',
  search: 'search',
  surfaces: 'surfaces',
};

/**
 * Area (SPEC_ETAPPE2 5.1) of an error path such as "ground[2]", "layers[1].top",
 * "materials.M1", "analysis.mode", "surfaces[0].R". The path "" (model is not an
 * object) belongs to "project". Unknown paths: null.
 */
export function sectionForPath(path) {
  if (path === '' || path === undefined || path === null) return 'project';
  const first = /^[A-Za-z_]+/.exec(String(path));
  if (!first) return null;
  return Object.hasOwn(FIRST_PART, first[0]) ? FIRST_PART[first[0]] : null;
}

/** Number of errors per area. Errors with an unknown path are not counted. */
export function countBySection(errors) {
  const counts = Object.fromEntries(SECTIONS.map((s) => [s, 0]));
  for (const e of errors) {
    const s = sectionForPath(e.path);
    if (s) counts[s] += 1;
  }
  return counts;
}

/**
 * Partial factors are shown in mode "sia"; in any other mode only if the area contains an
 * error (SPEC_ETAPPE2 5.1), then with the note that they are used only in mode "sia".
 */
export function partialFactorsVisible(mode, errorCount) {
  return mode === 'sia' || errorCount > 0;
}

/**
 * The columns of the partial factors of the supports (gammaM, gammaA, gammaC; SPEC_ETAPPE3 8) are shown in mode "sia", or when
 * the check reports an error at one of them (as for the area of the partial factors above): a column with an error must not
 * stay hidden.
 */
export function supportFactorsVisible(mode, errors) {
  return mode === 'sia' || (Array.isArray(errors) && errors.some((e) => /^supports\[\d+\]\.gamma/.test(String(e.path))));
}

/**
 * `partialFactors.gamma` is fixed 1.0 and not editable. Another value in the model
 * (e.g. from a file, or an emptied field) can be edited until it is 1.0 (SPEC_ETAPPE2 5.1).
 */
export function gammaEditable(partialFactors) {
  if (partialFactors === null || typeof partialFactors !== 'object' || !('gamma' in partialFactors)) return false;
  return partialFactors.gamma !== undefined && partialFactors.gamma !== 1;
}
