// Graphic of the result document (SPEC_ETAPPE2 8.5, point 2, version 1.12): the drawing is made again for the page,
// not shrunk from the size of the screen. Size and cut of the section as a pure function. No DOM access.
//
// Unit of the drawing: one CSS pixel (1/96 inch), so 180 mm are 680 units and 8 pt are 10.67 units. The SVG is given
// the width of 180 mm in the print style sheet (max-width 100%); then one unit is one pixel and the text is 8 pt.
// The paper size is not fixed by the app: 180 mm is the width between the margins of A4 portrait (the default of the
// print dialog); on a wider page the graphic stays 180 mm wide, on a narrower one the print style sheet shrinks it.

export const PX_PER_MM = 96 / 25.4;
export const PAGE_WIDTH_MM = 180; // A4 portrait: 210 mm minus 2 x 15 mm
export const PAGE_HEIGHT_MM = 267; // A4 portrait: 297 mm minus 2 x 15 mm
export const MAX_HEIGHT_MM = PAGE_HEIGHT_MM / 2; // the graphic is at most half a page high
export const FONT_PT = 8;

export const mmToPx = (mm) => mm * PX_PER_MM;
export const ptToPx = (pt) => (pt * 96) / 72;

/** Width of the drawing in units (pixels at 96 dpi), a whole number. */
export const PAGE_WIDTH_PX = Math.round(mmToPx(PAGE_WIDTH_MM));
/** Text size of the graphic in units (8 pt). */
export const FONT_PX = ptToPx(FONT_PT);

/**
 * Size and view of the drawing for the page.
 *   view       { scale, x0, z0 } of the screen (pixels per metre, world x of the left edge, world z of the top edge)
 *   size       { width, height } of the drawing area on the screen in pixels
 *   widthPx    width of the drawing on the page (default: 180 mm)
 *   maxHeightPx  the drawing is not higher than this (default: half a page); room for the legend is taken off by the caller
 * Same section as on the screen: the visible width in metres stays, so the scale grows by widthPx / size.width and the
 * height follows from the aspect ratio of the screen. If that is higher than maxHeightPx the section is cut at the top
 * and at the bottom by the same amount (the middle stays); the scale is not changed.
 * Returns { width, height, view, cropped } or null if view or size are not usable.
 */
export function pageGraphic({ view, size, widthPx = PAGE_WIDTH_PX, maxHeightPx = mmToPx(MAX_HEIGHT_MM) }) {
  const good = (v) => Number.isFinite(v) && v > 0;
  if (!view || !size || !good(view.scale) || !good(size.width) || !good(size.height) || !good(widthPx) || !good(maxHeightPx)) return null;
  if (!Number.isFinite(view.x0) || !Number.isFinite(view.z0)) return null;
  const factor = widthPx / size.width;
  const scale = view.scale * factor;
  const fullHeight = size.height * factor;
  const cropped = fullHeight > maxHeightPx;
  const height = cropped ? maxHeightPx : fullHeight;
  const cut = fullHeight - height; // pixels removed in total, half at the top, half at the bottom
  return {
    width: widthPx,
    height,
    view: { scale, x0: view.x0, z0: view.z0 - cut / 2 / scale },
    cropped,
  };
}
