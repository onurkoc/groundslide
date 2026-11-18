// Messages between the page and the worker (SPEC_ETAPPE2 7.1, 7.2) and the part of the
// worker that has no browser dependency. No DOM access.
//
// Page -> worker:   { type: 'run', id, model }
//                   { type: 'surface', id, model, circle }      slice table of one circle (SPEC_ETAPPE2 8.3)
// Worker -> page:   { type: 'progress', id, phase, done, total }
//                   { type: 'result', id, result, timeMs }
//                   { type: 'surfaceResult', id, result }       result of analyzeSurface (valid or not)
//                   { type: 'error', id, code, message, path }  for a run and for a surface request
//
// `id` numbers a request (runs and surface requests share one counter); the page ignores answers of other
// requests. `circle` = the surface in the coordinates of the model: a circle { xc, zc, R } or a polyline
// { type: "polyline", points } (SPEC_ETAPPE4 3.1; the field keeps its name). An invalid surface is not an error: the
// answer is a surfaceResult with `valid: false`, `code` and `message` of the core.

import { ModelError } from '../../core/index.js';

/** Code of an unexpected error during a run (text in i18n.js). */
export const APP_RUN_FAILED = 'APP_RUN_FAILED';

export const runRequest = (id, model) => ({ type: 'run', id, model });

export function isRunRequest(message) {
  return message !== null && typeof message === 'object' && message.type === 'run' && 'id' in message && 'model' in message;
}

export const surfaceRequest = (id, model, circle) => ({ type: 'surface', id, model, circle });

export function isSurfaceRequest(message) {
  return message !== null && typeof message === 'object' && message.type === 'surface' && 'id' in message && 'model' in message && 'circle' in message;
}

/**
 * Error -> message to the page. A ModelError keeps its code and text (and the path of the
 * first error); any other error becomes APP_RUN_FAILED with the text of the exception.
 */
export function errorMessage(id, error) {
  if (error instanceof ModelError || (error && error.name === 'ModelError' && typeof error.code === 'string')) {
    const first = Array.isArray(error.errors) && error.errors[0] ? error.errors[0] : {};
    return { type: 'error', id, code: error.code, message: error.message, path: first.path };
  }
  const message = error && typeof error.message === 'string' && error.message !== '' ? error.message : String(error);
  return { type: 'error', id, code: APP_RUN_FAILED, message, path: undefined };
}

/**
 * Run one request. `analyze` is analyze() of core/index.js, `post` sends a message to the
 * page, `throttle` is a progress throttle (progress.js). Never throws.
 */
export function executeRun(request, { analyze, post, throttle, now = () => performance.now() }) {
  const { id, model } = request;
  const t0 = now();
  try {
    const result = analyze(model, {
      onProgress: ({ phase, done, total }) => {
        if (throttle({ phase, done, total })) post({ type: 'progress', id, phase, done, total });
      },
    });
    post({ type: 'result', id, result, timeMs: now() - t0 });
  } catch (error) {
    post(errorMessage(id, error));
  }
}

/**
 * Calculate one surface (slice table). `analyzeSurface` is analyzeSurface() of core/index.js, `post` sends a
 * message to the page. Never throws: a ModelError or any other error becomes an error message (as with a run).
 */
export function executeSurface(request, { analyzeSurface, post }) {
  const { id, model, circle } = request;
  try {
    post({ type: 'surfaceResult', id, result: analyzeSurface(model, circle) });
  } catch (error) {
    post(errorMessage(id, error));
  }
}
