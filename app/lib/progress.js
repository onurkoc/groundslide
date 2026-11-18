// Throttling of progress messages (SPEC_ETAPPE2 7.2). No DOM access.

export const PROGRESS_INTERVAL_MS = 100;

/**
 * Decides which progress messages are forwarded: at most one per `intervalMs`,
 * except phase "refine" and the last "grid" message (done = total), which are always forwarded.
 * `now` is the clock in ms (an artificial clock in tests).
 * Returns a function: message -> true (forward) or false (drop).
 */
export function createProgressThrottle({ intervalMs = PROGRESS_INTERVAL_MS, now = () => performance.now() } = {}) {
  let last = -Infinity;
  return (message) => {
    const t = now();
    const always = message.phase === 'refine' || (message.phase === 'grid' && message.done === message.total);
    if (!always && t - last < intervalMs) return false;
    last = t;
    return true;
  };
}
