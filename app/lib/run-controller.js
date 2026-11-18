// Page side of a run (SPEC_ETAPPE2 7.1): start, progress, result, error, cancel; and of a slice table
// request (8.3): surface(model, circle) -> promise.
// The worker is created through `createWorker` (the page: new Worker(url, { type: 'module' });
// tests: a fake). No DOM access.

import { APP_RUN_FAILED } from './run-messages.js';

/**
 * options:
 *   createWorker()          returns an object with postMessage, terminate, onmessage, onerror, onmessageerror
 *   onProgress({ phase, done, total })
 *   onResult(result, { timeMs, workerTimeMs })   timeMs measured on the page, start to result
 *   onError({ code, message, path })
 *   onCancel()
 *   now()                   clock in ms
 */
export function createRunController({ createWorker, onProgress, onResult, onError, onCancel, now = () => performance.now() }) {
  let worker = null;
  let running = null; // { id, t0 }
  const surfaces = new Map(); // id -> { resolve, reject } of the open slice table requests
  let nextId = 0;

  function spawn() {
    const w = createWorker();
    w.onmessage = (event) => handle(w, event.data);
    w.onerror = (event) => crashed(w, event && event.message ? event.message : 'Worker error');
    w.onmessageerror = () => crashed(w, 'Worker message could not be read');
    worker = w;
  }

  function replaceWorker() {
    rejectSurfaces({ cancelled: true, code: APP_RUN_FAILED, message: 'Worker replaced' });
    try {
      if (worker) worker.terminate();
    } finally {
      worker = null;
    }
    try {
      spawn();
    } catch {
      worker = null; // created again at the next start
    }
  }

  /** Reject all open slice table requests (worker replaced or crashed). */
  function rejectSurfaces(reason) {
    for (const p of surfaces.values()) p.reject(reason);
    surfaces.clear();
  }

  function handle(w, message) {
    if (w !== worker || !message) return;
    const request = surfaces.get(message.id);
    if (request) {
      if (message.type === 'surfaceResult') {
        surfaces.delete(message.id);
        request.resolve(message.result);
      } else if (message.type === 'error') {
        surfaces.delete(message.id);
        request.reject({ code: message.code, message: message.message, path: message.path });
      }
      return;
    }
    if (!running || message.id !== running.id) return; // answer of an old run
    if (message.type === 'progress') {
      onProgress({ phase: message.phase, done: message.done, total: message.total });
    } else if (message.type === 'result') {
      const timeMs = now() - running.t0;
      running = null;
      onResult(message.result, { timeMs, workerTimeMs: message.timeMs });
    } else if (message.type === 'error') {
      running = null;
      onError({ code: message.code, message: message.message, path: message.path });
    }
  }

  function crashed(w, text) {
    if (w !== worker) return;
    const wasRunning = running !== null;
    const hadSurfaces = surfaces.size > 0;
    running = null;
    rejectSurfaces({ code: APP_RUN_FAILED, message: text, path: undefined }); // before the worker is replaced
    if (wasRunning || hadSurfaces) replaceWorker();
    if (wasRunning) onError({ code: APP_RUN_FAILED, message: text, path: undefined });
  }

  try {
    spawn();
  } catch {
    worker = null;
  }

  return {
    get running() {
      return running !== null;
    },
    /** Start a run. Returns false if a run is already going. A failure to start is reported through onError. */
    start(model) {
      if (running) return false;
      try {
        if (!worker) spawn();
        const id = ++nextId;
        running = { id, t0: now() };
        worker.postMessage({ type: 'run', id, model });
      } catch (e) {
        running = null;
        onError({ code: APP_RUN_FAILED, message: e && e.message ? e.message : String(e), path: undefined });
        return false;
      }
      return true;
    },
    /**
     * Slice table of one circle ({ xc, zc, R }): promise of the result of analyzeSurface (valid or not).
     * Rejects with { code, message, path } on an error, with { cancelled: true } when the worker was replaced
     * (cancel of a run), and at once with { busy: true } while a run is going: no slice calculation then.
     */
    surface(model, circle) {
      if (running) return Promise.reject({ busy: true, code: APP_RUN_FAILED, message: 'A run is going', path: undefined });
      return new Promise((resolve, reject) => {
        try {
          if (!worker) spawn();
          const id = ++nextId;
          surfaces.set(id, { resolve, reject });
          worker.postMessage({ type: 'surface', id, model, circle });
        } catch (e) {
          reject({ code: APP_RUN_FAILED, message: e && e.message ? e.message : String(e), path: undefined });
        }
      });
    },
    /** Cancel: the worker is terminated at once and a new one is created. No partial result. */
    cancel() {
      if (!running) return false;
      running = null;
      replaceWorker();
      onCancel();
      return true;
    },
  };
}
