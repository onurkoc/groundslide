// Axes and grid of the sketch (SPEC_ETAPPE2 6, version 1.7): step of the division and the marks in the visible
// range. No DOM access.
//
// The step is 1, 2 or 5 times a power of ten (metres). It is the smallest such step whose distance on the screen is at
// least MIN_PX; the next steps in the series 1, 2, 5, 10 are at most 2.5 times larger, so the distance is between MIN_PX
// and 2.5 * MIN_PX (60 to 150 px; "about every 60 to 120 px"). x and z use the same step (one scale for both).

export const MIN_PX = 60;
export const MAX_PX = 150;

/** Step in metres for a scale in pixels per metre. */
export function tickStep(scale, minPx = MIN_PX) {
  if (!(scale > 0) || !Number.isFinite(scale)) return 1;
  const exponent = Math.floor(Math.log10(minPx / scale)) - 1;
  for (let e = exponent; e <= exponent + 3; e++) {
    for (const base of [1, 2, 5]) {
      const step = Number(`${base}e${e}`); // exact decimal value, no rounding noise from 10 ** e
      if (step * scale >= minPx) return step;
    }
  }
  return Number(`1e${exponent + 4}`);
}

/** Decimals needed to write multiples of `step` (step 0.5 -> 1, 0.02 -> 2, 5 -> 0, 1000 -> 0). */
export function decimalsFor(step) {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/**
 * Marks in [min, max] (both included) at multiples of `step`: [{ value, label }]. The values are exact multiples
 * (12 significant digits), the labels have just the decimals needed, "-0" does not occur.
 */
export function ticksInRange(min, max, step) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(step > 0) || min > max) return [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const decimals = decimalsFor(step);
  const out = [];
  for (let k = first; k <= last; k++) {
    const value = Number((k * step).toPrecision(12));
    const label = value.toFixed(decimals).replace(/^-(0(\.0+)?)$/, '$1');
    out.push({ value, label });
  }
  return out;
}

/**
 * Marks for a view { scale, x0, z0 } in an area { width, height } (pixels): the step and the marks of both axes
 * with their position in pixels ({ value, label, px }). x grows to the right, z upwards (screen y downwards).
 */
export function viewTicks(view, size) {
  const step = tickStep(view.scale);
  const xMax = view.x0 + size.width / view.scale;
  const zMin = view.z0 - size.height / view.scale;
  const x = ticksInRange(view.x0, xMax, step).map((t) => ({ ...t, px: (t.value - view.x0) * view.scale }));
  const z = ticksInRange(zMin, view.z0, step).map((t) => ({ ...t, px: (view.z0 - t.value) * view.scale }));
  return { step, x, z };
}
