// Reading and showing numbers in input fields (SPEC_ETAPPE2 5.1, 5.3). No DOM access.

// optional sign, digits with at most one decimal separator (point or comma), optional exponent
const NUMBER_RE = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Text of an input field -> number.
 *   empty                -> { ok: true, value: null }
 *   "1.5", "1,5", "-2", "1e3", "1,5e-2" -> { ok: true, value }
 *   "1,2,3", "1.2.3", "1,5.0", "abc"    -> { ok: false }
 * The value is never rounded.
 */
export function parseNumber(text) {
  const s = String(text ?? '').trim();
  if (s === '') return { ok: true, value: null };
  if (!NUMBER_RE.test(s)) return { ok: false };
  const value = Number(s.replace(',', '.'));
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

/** Value of the model -> text of an input field: unrounded, with point; null / undefined / non-numbers -> "". */
export function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** Coordinates in the display: 2 decimals, point (SPEC_ETAPPE2 5.3). */
export function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

// --- display of results (SPEC_ETAPPE2 5.3, 8.1): rounding only here, never in the result itself ---

const fixed = (value, digits) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '');

/** Safety factor and utilisation: 3 decimals. */
export const formatFactor = (value) => fixed(value, 3);

/** Angle in degrees (theta): 2 decimals. */
export const formatAngle = (value) => fixed(value, 2);

/** Force in kN or kN/m: 1 decimal (SPEC_ETAPPE2 5.3). */
export const formatForce = (value) => fixed(value, 1);

/** Point "(x; z)" with 2 decimals. */
export const formatPoint = (point) => (Array.isArray(point) ? `(${formatCoordinate(point[0])}; ${formatCoordinate(point[1])})` : '');
