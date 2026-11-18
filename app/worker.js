// Web worker (module): runs analyze() of the core and reports progress (SPEC_ETAPPE2 7).
// Message forms: see app/lib/run-messages.js.

import { analyze, analyzeSurface } from '../core/index.js';
import { createProgressThrottle } from './lib/progress.js';
import { executeRun, executeSurface, isRunRequest, isSurfaceRequest } from './lib/run-messages.js';

self.onmessage = (event) => {
  if (isSurfaceRequest(event.data)) {
    executeSurface(event.data, { analyzeSurface, post: (message) => self.postMessage(message) });
    return;
  }
  if (!isRunRequest(event.data)) return;
  executeRun(event.data, {
    analyze,
    post: (message) => self.postMessage(message),
    throttle: createProgressThrottle(),
  });
};
