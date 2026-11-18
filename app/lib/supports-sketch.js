// What the sketch shows of the supports (SPEC_ETAPPE3 9), derived from the model. No DOM access, never throws.
//
// Only complete and usable elements are drawn (SPEC_ETAPPE3 8, 9): all fields of the type are numbers that obey the rules of
// the core for the field (> 0, >= 0), the inclination is in the range, the form of the nail's bond is complete and "head" is
// chosen, x1 < x2 for the shotcrete, and for nail and anchor the direction of the slope is known. Rules that concern the
// place or the context (id, partial factors, outside the model, head above the ground, methods) do not stop the drawing: the
// element stays visible so that it can be moved (SPEC_ETAPPE3 9).

import { validPoints, heightAt } from './sketch-model.js';
import { SUPPORT_FIELDS, bondForm } from './supports-edit.js';

const DEG = Math.PI / 180;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Direction of the slope in the input frame: 'right' (falls to the right) or 'left'; as the core decides it (SPEC.md 3):
 * analysis.direction when it is 'right' or 'left', else from the ends of the ground line. null when it cannot be decided
 * (equal height of the ends, no ground line): nail and anchor are then not drawn.
 */
export function slopeDirection(model) {
  const analysis = isObject(model) && isObject(model.analysis) ? model.analysis : {};
  if (analysis.direction === 'right' || analysis.direction === 'left') return analysis.direction;
  const ground = validPoints(isObject(model) ? model.ground : null);
  if (ground.length < 2) return null;
  const zFirst = ground[0][1];
  const zLast = ground[ground.length - 1][1];
  if (zFirst > zLast) return 'right';
  if (zFirst < zLast) return 'left';
  return null;
}

/**
 * Unit vector of a nail or an anchor from its head "into the slope" (SPEC_ETAPPE3 2.1): towards the crown and down. For a slope
 * that falls to the right the crown is at -x, for one that falls to the left at +x (the mirrored case, SPEC_ETAPPE3 2.2).
 */
export function inwardVector(angleDeg, direction) {
  const dx = Math.cos(angleDeg * DEG);
  return [direction === 'right' ? -dx : dx, -Math.sin(angleDeg * DEG)];
}

/** Does the element fulfil the rules of drawing (see above)? `direction` of the slope for nail and anchor. */
export function isDrawable(s, direction) {
  if (!isObject(s) || !SUPPORT_FIELDS[s.type]) return false;
  for (const f of SUPPORT_FIELDS[s.type]) {
    if (f.kind !== 'number') continue;
    const v = s[f.key];
    if (!isNum(v) || (f.rule === 'pos' && !(v > 0)) || (f.rule === 'nonneg' && v < 0)) return false;
  }
  if (s.type === 'shotcrete') return s.x1 < s.x2;
  if (s.type === 'pile') return true;
  if (!(s.angle > -90 && s.angle < 90) || direction === null) return false;
  if (s.type === 'anchor') return true;
  // nail: head chosen, exactly one complete form of the bond
  if (typeof s.hasHead !== 'boolean' || !isObject(s.bond)) return false;
  const b = s.bond;
  if (bondForm(b) === 'q') return b.tau === undefined && b.diameter === undefined && isNum(b.q) && b.q >= 0;
  return b.q === undefined && isNum(b.tau) && b.tau >= 0 && isNum(b.diameter) && b.diameter > 0;
}

/** The ground line between x1 and x2 as a polyline: the two ends on the line and the vertices between them. null when an end is off the ground. */
export function groundBetween(ground, x1, x2) {
  const z1 = heightAt(ground, x1);
  const z2 = heightAt(ground, x2);
  if (z1 === null || z2 === null) return null;
  return [[x1, z1], ...ground.filter(([x]) => x > x1 && x < x2), [x2, z2]];
}

/**
 * The drawable elements as shapes in world coordinates, in the order of the list:
 *   { type, index, id, head: [x, z], segments: [{ a, b, part }] }   nail, anchor, pile (head = the handle)
 *   { type: 'shotcrete', index, id, ends: [[x1, z1], [x2, z2]], segments }  segments along the ground line
 * `part`: 'nail', 'pile', 'free' / 'bond' (anchor: free length thin, bond length thick), 'shell'.
 */
export function supportShapes(model) {
  const list = isObject(model) && Array.isArray(model.supports) ? model.supports : [];
  if (!list.length) return [];
  const direction = slopeDirection(model);
  const ground = validPoints(model.ground);
  const shapes = [];
  list.forEach((s, index) => {
    if (!isDrawable(s, direction)) return;
    const id = typeof s.id === 'string' ? s.id : '';
    if (s.type === 'shotcrete') {
      if (ground.length < 2) return;
      const line = groundBetween(ground, s.x1, s.x2);
      if (!line) return;
      const segments = [];
      for (let i = 0; i + 1 < line.length; i++) segments.push({ a: line[i], b: line[i + 1], part: 'shell' });
      shapes.push({ type: 'shotcrete', index, id, ends: [line[0], line[line.length - 1]], segments });
      return;
    }
    const head = [s.x, s.z];
    if (s.type === 'pile') {
      shapes.push({ type: 'pile', index, id, head, segments: [{ a: head, b: [s.x, s.z - s.length], part: 'pile' }] });
      return;
    }
    const [ux, uz] = inwardVector(s.angle, direction);
    const at = (length) => [s.x + ux * length, s.z + uz * length];
    if (s.type === 'nail') {
      shapes.push({ type: 'nail', index, id, head, segments: [{ a: head, b: at(s.length), part: 'nail' }] });
      return;
    }
    const free = at(s.freeLength);
    shapes.push({ type: 'anchor', index, id, head, segments: [{ a: head, b: free, part: 'free' }, { a: free, b: at(s.freeLength + s.bondLength), part: 'bond' }] });
  });
  return shapes;
}
