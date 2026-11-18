// Load arrow of the sketch (SPEC_ETAPPE2 6): shaft and head as numbers. No DOM access.
// The tip is at the ground line (yBase), the head is HEAD_LENGTH px long and 2 * HEAD_HALF_WIDTH px wide.
// All arithmetic is done with numbers; rounding to text is left to the caller (a text from toFixed must never be added to).

export const HEAD_LENGTH = 7; // px
export const HEAD_HALF_WIDTH = 3.5; // px

/**
 * Arrow at x (pixels) from yTop (tail) to yBase (tip, on the ground line).
 * Returns { shaft: [[x, yTop], [x, yBase]], head: [tip, left, right] } with every point as [x, y] numbers.
 */
export function arrowGeometry(x, yBase, yTop) {
  return {
    shaft: [[x, yTop], [x, yBase]],
    head: [[x, yBase], [x - HEAD_HALF_WIDTH, yBase - HEAD_LENGTH], [x + HEAD_HALF_WIDTH, yBase - HEAD_LENGTH]],
  };
}

/** Text of the points of a polygon for the attribute "points": two decimals, x and y separated by a comma. */
export const pointsText = (points) => points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
