// Place of a tooltip (SPEC_ETAPPE2 6 "Bedienhinweis"): below its anchor, moved left or up so that it lies completely inside
// the visible window. Pure function, no DOM access; the caller measures and sets the position (position: fixed).

export const TIP_GAP = 6; // px between anchor and tooltip
export const TIP_MARGIN = 8; // px between tooltip and the edge of the window
export const TIP_MAX_WIDTH = 416; // px (26 rem)

/** Widest the tooltip may be so that it fits the window: the preferred width, or the window width minus both margins. */
export const tooltipMaxWidth = (viewportWidth, preferred = TIP_MAX_WIDTH, margin = TIP_MARGIN) => Math.max(Math.min(preferred, viewportWidth - 2 * margin), 0);

/**
 * anchor    { left, top, right, bottom } of the "?" button in window coordinates
 * tip       { width, height } as measured (already limited by tooltipMaxWidth)
 * viewport  { width, height } of the visible window
 * Returns { left, top, placement }: placement is 'below' (preferred) or 'above' (when there is not enough room below and more
 * room above). Horizontally the tooltip starts at the left edge of the anchor and is moved to the left when it would pass the
 * right edge of the window; it never passes the left edge. If it is higher than the room on either side it is moved so that
 * its top is inside the window (as far as the height allows).
 */
export function placeTooltip({ anchor, tip, viewport, gap = TIP_GAP, margin = TIP_MARGIN }) {
  const maxLeft = viewport.width - margin - tip.width;
  const left = Math.max(Math.min(anchor.left, maxLeft), margin);
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - tip.height;
  const fitsBelow = below + tip.height <= viewport.height - margin;
  const fitsAbove = above >= margin;
  let placement = 'below';
  let top = below;
  if (!fitsBelow && (fitsAbove || anchor.top - margin > viewport.height - margin - anchor.bottom)) {
    placement = 'above';
    top = above;
  }
  top = Math.max(Math.min(top, viewport.height - margin - tip.height), margin);
  return { left, top, placement };
}
