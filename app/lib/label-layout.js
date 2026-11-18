// Placement of text labels in the sketch so that they do not lie on top of each other (SPEC_ETAPPE2 8.2: centre
// with F, single circles with id and F). Pure function, no DOM access.

/**
 * Labels in order of priority (the first is placed first and stays where it wants to be):
 *   [{ x, y, text }]   wanted position in pixels (x = left end of the text, y = baseline)
 * Each label is moved up or down in steps of `step` pixels (0, +1, -1, +2, -2, ...) until its box does not touch
 * a box that is already placed; if none of the `tries` positions is free it stays at the wanted one.
 * Returns [{ x, y }] in the same order. The width of a text is estimated with `charWidth` pixels per character.
 */
export function layoutLabels(labels, { charWidth = 6.8, height = 14, step = 14, tries = 7 } = {}) {
  const placed = [];
  const boxOf = (x, y, text) => ({ x0: x - 2, x1: x + Math.max(String(text).length, 1) * charWidth + 2, y0: y - height + 3, y1: y + 3 });
  const touches = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  return labels.map(({ x, y, text }) => {
    let chosen = { x, y };
    let found = false;
    for (let k = 0; k < tries && !found; k++) {
      const shift = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step; // 0, +step, -step, +2 step, ...
      const box = boxOf(x, y + shift, text);
      if (!placed.some((p) => touches(box, p))) {
        chosen = { x, y: y + shift };
        found = true;
      }
    }
    placed.push(boxOf(chosen.x, chosen.y, text));
    return chosen;
  });
}
