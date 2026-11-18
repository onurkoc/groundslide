// Scale and coordinate conversion of the sketch (SPEC_ETAPPE2 6, U6). No DOM access.
//
// A view is { scale, x0, z0 }: scale in pixels per metre (the same in x and z,
// never distorted), (x0, z0) the world point at the top left pixel (0, 0).
// Screen y grows downwards, z grows upwards:
//   sx = (x - x0) * scale        sy = (z0 - z) * scale

export const MIN_SCALE = 1e-6;
export const MAX_SCALE = 1e6;

const clampScale = (s) => Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);

/** World -> screen. */
export function worldToScreen(view, x, z) {
  return [(x - view.x0) * view.scale, (view.z0 - z) * view.scale];
}

/** Screen -> world. */
export function screenToWorld(view, sx, sy) {
  return [view.x0 + sx / view.scale, view.z0 - sy / view.scale];
}

/** Bounding box { xMin, xMax, zMin, zMax } of [x, z] points; points that are not finite are ignored. null when none. */
export function boundsOf(points) {
  let b = null;
  for (const p of points) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (!b) b = { xMin: p[0], xMax: p[0], zMin: p[1], zMax: p[1] };
    else {
      b.xMin = Math.min(b.xMin, p[0]);
      b.xMax = Math.max(b.xMax, p[0]);
      b.zMin = Math.min(b.zMin, p[1]);
      b.zMax = Math.max(b.zMax, p[1]);
    }
  }
  return b;
}

/**
 * View that shows `bounds` completely in an area of `size` { width, height } pixels,
 * with `margin` pixels around, centred. One scale for x and z. A box without
 * width or height (a point, a line) is fitted by its other extent.
 */
export function fitView(bounds, size, margin = 24) {
  const w = Math.max(size.width - 2 * margin, 1);
  const h = Math.max(size.height - 2 * margin, 1);
  const dx = bounds.xMax - bounds.xMin;
  const dz = bounds.zMax - bounds.zMin;
  const candidates = [];
  if (dx > 0) candidates.push(w / dx);
  if (dz > 0) candidates.push(h / dz);
  const scale = clampScale(candidates.length ? Math.min(...candidates) : 1);
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cz = (bounds.zMin + bounds.zMax) / 2;
  return { scale, x0: cx - size.width / 2 / scale, z0: cz + size.height / 2 / scale };
}

/** Zoom by `factor` around the screen point (sx, sy): the world point under it stays under it. */
export function zoomAt(view, sx, sy, factor) {
  const [x, z] = screenToWorld(view, sx, sy);
  const scale = clampScale(view.scale * factor);
  return { scale, x0: x - sx / scale, z0: z + sy / scale };
}

/** Shift the view by (dsx, dsy) pixels, as when dragging the drawing with the mouse. */
export function panBy(view, dsx, dsy) {
  return { scale: view.scale, x0: view.x0 - dsx / view.scale, z0: view.z0 + dsy / view.scale };
}

/**
 * View after the drawing area changed its size (window, splitter, full screen; SPEC_ETAPPE2 6, version 1.8): the scale
 * and the world point in the middle of the area stay, so the drawing does not jump. Only the area around it grows or
 * shrinks. An area without size (hidden tab: width or height 0) says nothing about the view: the same view comes back,
 * for the old size as well as for the new one.
 */
export function resizeView(view, oldSize, newSize) {
  const usable = (s) => s && s.width > 0 && s.height > 0;
  if (!usable(oldSize) || !usable(newSize)) return view;
  if (oldSize.width === newSize.width && oldSize.height === newSize.height) return view;
  const [xm, zm] = screenToWorld(view, oldSize.width / 2, oldSize.height / 2);
  return { scale: view.scale, x0: xm - newSize.width / 2 / view.scale, z0: zm + newSize.height / 2 / view.scale };
}
