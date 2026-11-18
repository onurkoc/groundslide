// Shared fixtures for the supports tests (order 20). Not a test file.
//
// Test geometry (calculation frame, slope falls to the right):
//   ground: (-30,0) (-8,0) (18,-14) (40,-14)   -> crown flat z=0, slope z = -7(x+8)/13
//   circle: xc=0, zc=5, R=13  (3-4-5 style numbers: (+-12,0) and (+-5,-7) lie on it)
//   entry (-12, 0) on the flat crown, exit (5, -7) on the slope, lowest point (0, -8)
//   ground vertex x=-8 is a mandatory slice boundary.

import { normalizeModel, circleToCore } from '../../core/model.js';
import { buildSlicesNormalized } from '../../core/slices.js';

export const TEST_CIRCLE = Object.freeze({ xc: 0, zc: 5, R: 13 });

/** Valid model in the calculation frame (direction "right") with the given supports. */
export function supportModel(supports = [], mode = 'characteristic') {
  return {
    meta: { name: 'supports test', units: 'SI' },
    ground: [[-30, 0], [-8, 0], [18, -14], [40, -14]],
    bottom: -20,
    layers: [{ material: 'M1', top: null }],
    materials: { M1: { name: 'Soil', gamma: 19, gammaSat: 20, model: 'drained', c: 5, phi: 30 } },
    water: null,
    loads: [],
    seismic: { kh: 0 },
    analysis: { mode, methods: ['spencer'], direction: 'right', slices: 20, tolerance: 1e-4, maxIterations: 100 },
    supports,
  };
}

/** Normalise a (valid) model and build the slices of a circle given in INPUT coordinates. */
export function surfaceOf(model, circle = TEST_CIRCLE) {
  const info = normalizeModel(model);
  const g = buildSlicesNormalized(info.model, circleToCore(circle, info));
  return { info, m: info.model, g };
}

export const nailFormA = (extra = {}) => ({
  id: 'N1', type: 'nail', x: -10, z: 0, angle: 0, length: 10, spacing: 1.5,
  bond: { tau: 80, diameter: 0.1 }, tensile: 150, hasHead: true, ...extra,
});
export const anchorOf = (extra = {}) => ({
  id: 'A1', type: 'anchor', x: -1.5, z: -3.5, angle: 45, freeLength: 6, bondLength: 4,
  spacing: 2.5, P0: 400, Rk: 600, ...extra,
});
export const pileOf = (extra = {}) => ({
  id: 'P1', type: 'pile', x: -8, z: 0, length: 12, spacing: 2, shear: 200, ...extra,
});
export const shotcreteOf = (extra = {}) => ({
  id: 'S1', type: 'shotcrete', x1: 0, x2: 10, thickness: 0.15, tau: 1500, ...extra,
});
