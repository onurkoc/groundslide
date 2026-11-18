// State of the result display (SPEC_ETAPPE2 7.1, 8.1): the result of the last run, the chosen
// governing method, the contour switch, the target of the slice table and the calculated slice
// table. Pure functions, no DOM access.
//
// Rules:
//   - Every change of the model (input, New, Open) discards the result and the slice table
//     (action "model-changed"); the display shows "not yet calculated" again.
//   - Language, light/dark, zoom, pan and saving do not change the model and discard nothing;
//     they return the very same state object.
//   - After every run the method is the default (Bishop) and the contour is on (8.1, 8.2).
//     The choice is not saved anywhere (decision 4).

/** Methods in the order of the display (SPEC_ETAPPE2 8.1). Keys of result.critical and of a grid row. */
export const METHODS = ['bishop', 'janbu', 'janbuCorrected', 'spencer'];

/** Actions that must not touch the result (they exist so that the rule is testable). */
export const NEUTRAL_ACTIONS = ['language', 'theme', 'zoom', 'pan', 'save'];

export const TARGET_CRITICAL = Object.freeze({ kind: 'critical' });

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** State without result. */
export function initialResultState() {
  return { result: null, timeMs: null, method: null, contour: true, target: TARGET_CRITICAL, slices: null };
}

/** The methods that were calculated by a search (keys of result.critical), in display order. */
export function calculatedMethods(result) {
  if (!isObject(result) || !isObject(result.critical)) return [];
  return METHODS.filter((m) => Object.hasOwn(result.critical, m));
}

/**
 * Method that is chosen after a run: Bishop. If Bishop was not calculated (analysis.methods
 * without it), the first calculated method; null without a search.
 */
export function defaultMethod(result) {
  const list = calculatedMethods(result);
  if (list.includes('bishop')) return 'bishop';
  return list.length ? list[0] : null;
}

/**
 * Target of the slice table after a run: the governing circle of the chosen method; without search (no
 * governing circles) the first single circle, if there is one.
 */
export function defaultTarget(result) {
  if (defaultMethod(result) !== null) return TARGET_CRITICAL;
  const first = isObject(result) && Array.isArray(result.surfaces) ? result.surfaces.find((x) => isObject(x) && typeof x.id === 'string' && x.id !== '') : null;
  return first ? { kind: 'single', id: first.id } : TARGET_CRITICAL;
}

/**
 * New state after an action. Never changes `state`.
 *   { type: 'run-done', result, timeMs }  the result of a finished run and the time of the run
 *   { type: 'model-changed' }             input, New, Open: discards result and slice table
 *   { type: 'select-method', method }     only a calculated method
 *   { type: 'set-contour', on }
 *   { type: 'select-target', target }     { kind: 'critical' } | { kind: 'single', id }
 *   { type: 'slices', key, data }         calculated slice table (see slices-table.js, `key` = its request)
 *   { type: 'slices-reset' }              forget the slice table (the request was lost), the result stays
 *   a neutral action (NEUTRAL_ACTIONS) or an unknown one: the same state object
 */
export function reduceResult(state, action) {
  switch (action && action.type) {
    case 'run-done':
      return { result: action.result, timeMs: Number.isFinite(action.timeMs) ? action.timeMs : null, method: defaultMethod(action.result), contour: true, target: defaultTarget(action.result), slices: null };
    case 'model-changed':
      return state.result === null && state.slices === null ? state : initialResultState();
    case 'select-method':
      return calculatedMethods(state.result).includes(action.method) && action.method !== state.method ? { ...state, method: action.method } : state;
    case 'set-contour':
      return state.contour === !!action.on ? state : { ...state, contour: !!action.on };
    case 'select-target': {
      const t = action.target;
      const ok = isObject(t) && (t.kind === 'critical' || (t.kind === 'single' && typeof t.id === 'string'));
      if (!state.result || !ok) return state;
      return { ...state, target: t.kind === 'critical' ? TARGET_CRITICAL : { kind: 'single', id: t.id } };
    }
    case 'slices':
      return state.result ? { ...state, slices: { key: action.key, ...action.data } } : state;
    case 'slices-reset':
      return state.slices === null ? state : { ...state, slices: null };
    default:
      return state; // neutral actions and unknown ones
  }
}
