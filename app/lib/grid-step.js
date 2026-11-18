// Grid width of the sketch (SPEC_ETAPPE2 6, "Gitterweite"): the choice "Auto" or a fixed width, the step used for snapping,
// the grid lines that are drawn, and the snapping of a value. No DOM access.
//
// "Auto": the width is the division of the axes (axes.js tickStep) and follows the zoom. Fixed: 0.1 ... 10 m. For a fixed
// width the lines are drawn at that width; if they would lie closer than MIN_LINE_PX only every 2nd, 5th, 10th, ... line is
// drawn. The width used for snapping stays the chosen one.

import { tickStep, ticksInRange } from './axes.js';

/** The choices of the tool bar: "auto" and the fixed widths in metres. */
export const GRID_CHOICES = ['auto', 0.1, 0.2, 0.5, 1, 2, 5, 10];

/** Fixed lines closer than this many pixels are thinned out. */
export const MIN_LINE_PX = 8;

/** Is `choice` one of GRID_CHOICES? */
export const isGridChoice = (choice) => GRID_CHOICES.includes(choice);

/**
 * Width in metres for snapping and for the lines: the fixed width, or for "auto" the step of the axes at this scale
 * (pixels per metre). An unknown choice counts as "auto".
 */
export function gridStep(choice, scale) {
  return typeof choice === 'number' && GRID_CHOICES.includes(choice) ? choice : tickStep(scale);
}

/**
 * Step for snapping while dragging or inserting (SPEC_ETAPPE2 6 "Fang", 6.1, version 1.12): the switch "Snap" decides, not
 * the switch "Grid" (which only shows the lines). On: the grid width (gridStep, for "auto" the division of the axes at
 * the current zoom, the same as with visible lines). Off: null, the node moves freely.
 */
export const snapStepFor = (snapOn, choice, scale) => (snapOn ? gridStep(choice, scale) : null);

/**
 * Nearest multiple of `step` to `value`, without the noise of floating point arithmetic: 0.1 * 3 is 0.30000000000000004
 * in a computer, the result here is 0.3 (the multiple is rounded to 12 significant digits, as the marks of the axes
 * are). A negative multiple that rounds to zero is 0, not -0. Not a finite number or a step <= 0: the value unchanged.
 */
export function snapValue(value, step) {
  if (!Number.isFinite(value) || !(step > 0) || !Number.isFinite(step)) return value;
  const multiple = Number((Math.round(value / step) * step).toPrecision(12));
  return multiple === 0 ? 0 : multiple;
}

/** The thinning factors 1, 2, 5, 10, 20, 50, ... */
function strides() {
  const out = [];
  for (let e = 0; e <= 12; e++) for (const base of [1, 2, 5]) out.push(base * 10 ** e);
  return out;
}

/**
 * Draw every `stride`-th line of a fixed grid: the smallest of 1, 2, 5, 10, 20, 50, ... for which the lines are at least
 * `minPx` pixels apart (width * stride * scale >= minPx). 1 for a "auto" width never happens (see gridLines).
 */
export function lineStride(step, scale, minPx = MIN_LINE_PX) {
  if (!(step > 0) || !(scale > 0)) return 1;
  for (const k of strides()) if (step * k * scale >= minPx) return k;
  return 1;
}

/**
 * Grid lines for the view { scale, x0, z0 } in an area { width, height } pixels: positions in pixels of the vertical lines
 * (x) and the horizontal lines (z), the step used (snapping) and the thinning factor.
 * "auto": lines at the step of the axes (stride 1). Fixed: lines at the chosen width, thinned out when closer than MIN_LINE_PX.
 * The lines are at exact multiples of the drawn width (ticksInRange).
 */
export function gridLines(view, size, choice) {
  const step = gridStep(choice, view.scale);
  const stride = typeof choice === 'number' && GRID_CHOICES.includes(choice) ? lineStride(step, view.scale) : 1;
  const drawn = Number((step * stride).toPrecision(12));
  const xMax = view.x0 + size.width / view.scale;
  const zMin = view.z0 - size.height / view.scale;
  const x = ticksInRange(view.x0, xMax, drawn).map((t) => (t.value - view.x0) * view.scale);
  const z = ticksInRange(zMin, view.z0, drawn).map((t) => (view.z0 - t.value) * view.scale);
  return { step, stride, x, z };
}
