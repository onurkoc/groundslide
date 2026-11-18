// Helpers of the graphic export (SPEC_ETAPPE2 8.4): colours and numbers of the computed styles as fixed values for a
// standalone SVG, flow layout of the legend, and a check of the finished SVG text. No DOM access.

/** Font of the exported graphic (no web font: the viewer uses what it has). */
export const EXPORT_FONT = 'Segoe UI, Roboto, Helvetica, Arial, sans-serif';

/** PNG edge length in pixels = this factor times the size on the screen (SPEC_ETAPPE2 8.4). */
export const PNG_SCALE = 2;

const hex2 = (n) => Math.round(Math.min(Math.max(n, 0), 255)).toString(16).padStart(2, '0');

/**
 * Colour as the browser reports it for a computed style -> { color: '#rrggbb', opacity } for an SVG attribute pair
 * (fill + fill-opacity). Understands rgb(), rgba() (comma or space syntax, alpha after "," or "/", percent) and
 * color(srgb r g b / a). "none" and "transparent" give { color: 'none', opacity: 1 }. null: not understood.
 */
export function parseCssColor(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'none' || text === 'transparent') return { color: 'none', opacity: 1 };
  const m = text.match(/^(rgba?|color)\((.*)\)$/);
  if (!m) return null;
  let body = m[2].trim();
  let srgb = false;
  if (m[1] === 'color') {
    if (!/^srgb\s/.test(body)) return null;
    srgb = true;
    body = body.slice(4).trim();
  }
  const [main, alphaText] = body.split('/').map((p) => p.trim());
  const parts = main.split(/[\s,]+/).filter(Boolean);
  let alpha = alphaText;
  if (alpha === undefined && parts.length === 4) alpha = parts.pop();
  if (parts.length !== 3) return null;
  const channel = (p) => {
    const pct = p.endsWith('%');
    const v = Number(pct ? p.slice(0, -1) : p);
    if (!Number.isFinite(v)) return NaN;
    if (srgb) return (pct ? v / 100 : v) * 255;
    return pct ? (v / 100) * 255 : v;
  };
  const rgb = parts.map(channel);
  let opacity = 1;
  if (alpha !== undefined) {
    const pct = alpha.endsWith('%');
    opacity = Number(pct ? alpha.slice(0, -1) : alpha) / (pct ? 100 : 1);
  }
  if (rgb.some((v) => !Number.isFinite(v)) || !Number.isFinite(opacity)) return null;
  return { color: `#${rgb.map(hex2).join('')}`, opacity: Math.min(Math.max(opacity, 0), 1) };
}

/** "1.75px" -> "1.75"; a number stays; anything else null. */
export function pxNumber(value) {
  const m = String(value ?? '').trim().match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)(?:px)?$/i);
  return m ? String(Number(m[1])) : null;
}

/** Computed stroke-dasharray "8px, 3px" -> "8 3"; "none" or empty -> null. */
export function dashArray(value) {
  const text = String(value ?? '').trim();
  if (text === '' || text === 'none') return null;
  const parts = text.split(/[\s,]+/).map(pxNumber);
  return parts.every((p) => p !== null) ? parts.join(' ') : null;
}

/**
 * Place items of the given widths in rows from left to right: a new row starts when the next item would end behind
 * `maxWidth`. An item wider than the row stands alone. Returns { positions: [{ x, row }], rows } (rows >= 0).
 */
export function flowLayout(widths, maxWidth, gap) {
  const positions = [];
  let x = 0;
  let row = 0;
  widths.forEach((w, i) => {
    if (i > 0 && x > 0 && x + w > maxWidth) {
      row += 1;
      x = 0;
    }
    positions.push({ x, row });
    x += w + gap;
  });
  return { positions, rows: widths.length ? row + 1 : 0 };
}

/**
 * Problems that keep an SVG text from being complete by itself (SPEC_ETAPPE2 8.4). [] = none found.
 * Checks: root element with xmlns, width, height and viewBox; no CSS variables, no class attributes, no style sheet,
 * no colour syntax that old viewers do not know, no reference to anything outside the file.
 */
export function standaloneProblems(svgText) {
  const text = String(svgText ?? '');
  const problems = [];
  const root = text.match(/<svg\b[^>]*>/);
  if (!root) return ['no <svg> element'];
  const tag = root[0];
  if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(tag)) problems.push('xmlns missing');
  for (const attr of ['width', 'height', 'viewBox']) if (!new RegExp(`\\s${attr}="[^"]+"`).test(tag)) problems.push(`${attr} missing`);
  const checks = [
    [/var\(--/, 'CSS variable var(--'],
    [/\bclass\s*=/, 'class attribute'],
    [/light-dark\(/, 'light-dark()'],
    [/color-mix\(/, 'color-mix()'],
    [/\bcolor\(\s*srgb/i, 'color(srgb …)'],
    [/<style\b/i, '<style> element'],
    [/<link\b|@import/i, 'link or @import'],
    [/<image\b|<foreignObject\b|<script\b/i, 'image, foreignObject or script'],
    [/(?:href|src)\s*=\s*"(?!#)/i, 'reference to something outside the file'],
    [/url\(\s*["']?(?!#)/i, 'url() that does not point inside the file'],
  ];
  for (const [re, what] of checks) if (re.test(text)) problems.push(what);
  return problems;
}

/**
 * Put a prefix before every id of an SVG text and before the references to it (id="x" -> id="pd-x", url(#x) ->
 * url(#pd-x)). An SVG that is placed in a page next to another one with the same ids (the sketch on the screen has
 * "sk-clip") would otherwise point at the wrong element.
 */
export function prefixIds(svgText, prefix) {
  const text = String(svgText ?? '');
  const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  let out = text;
  for (const id of new Set(ids)) {
    out = out.replaceAll(`id="${id}"`, `id="${prefix}${id}"`).replaceAll(`url(#${id})`, `url(#${prefix}${id})`).replaceAll(`href="#${id}"`, `href="#${prefix}${id}"`);
  }
  return out;
}
