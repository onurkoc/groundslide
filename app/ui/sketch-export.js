// Graphic export (SPEC_ETAPPE2 8.4): the sketch and its legend as one standalone SVG, always in the light colour scheme.
//
// The sketch is drawn by the same code as on the screen (`paint`), into an SVG that lives for a moment in a hidden box
// with color-scheme: light. The colours and strokes come from style.css as computed values; they are copied into the
// elements as fixed attributes and the class names are dropped, so the file needs neither style.css nor CSS variables.
// The page itself is not touched (the box is outside the window and removed again).

import { EXPORT_FONT, parseCssColor, pxNumber, dashArray, flowLayout, standaloneProblems } from '../lib/svg-export.js';

const NS = 'http://www.w3.org/2000/svg';
const GAP_X = 18; // between legend items
const ROW_H = 20;
const SWATCH = 14;
const LINE_W = 28;
const TEXT_GAP = 6;
const LEGEND_TOP = 12; // between drawing and legend
const LEGEND_BOTTOM = 8;
const LEGEND_PAD = 8; // left and right of the legend

function node(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

/** Text element; with fontPx the size is set as an inline style (it wins over the class rule); inlineStyles() then copies it. */
const textNode = (cls, content, attrs = {}, fontPx = null) => node('text', { class: cls, ...(fontPx ? { style: `font-size:${fontPx}px` } : {}), ...attrs }, [document.createTextNode(content)]);

/** Legend as SVG elements in `group` below the drawing, returns its height. `group` must be attached (text is measured). */
function buildLegend(group, legend, width, fontPx = null) {
  let y = 0;
  const rowOf = (items) => {
    // items: [{ sample: element, sampleWidth, text, bold }]; text measured in the attached box
    const labels = items.map((it) => textNode(it.bold ? 'ex-text ex-bold' : 'ex-text', it.text, { y: 0 }, fontPx));
    group.append(...labels);
    const widths = labels.map((label, i) => items[i].sampleWidth + TEXT_GAP + label.getComputedTextLength());
    const { positions, rows } = flowLayout(widths, width, GAP_X);
    items.forEach((it, i) => {
      const { x, row } = positions[i];
      const top = y + row * ROW_H;
      it.sample.setAttribute('transform', `translate(${x} ${top + (ROW_H - it.sampleHeight) / 2})`);
      labels[i].setAttribute('x', String(x + it.sampleWidth + TEXT_GAP));
      labels[i].setAttribute('y', String(top + ROW_H / 2 + 4));
      group.append(it.sample);
    });
    y += rows * ROW_H;
  };
  const swatch = (cls) => ({ el: node('rect', { class: `ex-swatch ${cls}`, x: 0.5, y: 0.5, width: SWATCH - 1, height: SWATCH - 1 }), w: SWATCH, h: SWATCH });
  const lineSample = (method) => ({ el: node('line', { class: `rs-line m-${method}`, x1: 1, y1: 5, x2: LINE_W - 1, y2: 5 }), w: LINE_W, h: 10 });
  const item = (sample, text, bold = false) => ({ sample: sample.el, sampleWidth: sample.w, sampleHeight: sample.h, text, bold });

  if (legend.materials.length) rowOf(legend.materials.map((m) => item(swatch(m.cls), m.text)));
  if (legend.methods.length) rowOf(legend.methods.map((m) => item(lineSample(m.method), m.text, m.selected)));
  if (legend.contour) {
    group.append(textNode('ex-text ex-bold', legend.contour.title, { x: 0, y: y + ROW_H / 2 + 4 }, fontPx));
    y += ROW_H;
    rowOf(legend.contour.items.map((c) => item(swatch(c.cls), c.text)));
  }
  if (legend.note) {
    group.append(textNode('ex-text', legend.note, { x: 0, y: y + ROW_H / 2 + 4 }, fontPx));
    y += ROW_H;
  }
  return y;
}

const SHAPE_RENDERING = { crispedges: 'crispEdges', optimizespeed: 'optimizeSpeed', geometricprecision: 'geometricPrecision' };
const SHAPES = new Set(['line', 'polyline', 'polygon', 'path', 'rect', 'circle', 'ellipse', 'text']);

/** Set a colour as attribute and, when it is not opaque, the opacity attribute. Returns false when it is not understood. */
function setPaint(el, name, value, factor = 1) {
  const c = parseCssColor(value);
  if (!c) return false;
  el.setAttribute(name, c.color);
  const opacity = c.opacity * factor;
  if (c.color !== 'none' && opacity < 1) el.setAttribute(`${name}-opacity`, String(Number(opacity.toFixed(4))));
  return true;
}

/**
 * Copy the computed look of every element into attributes and drop the class names. The class names are dropped only
 * at the end: rules such as ".sk-centres circle" need the class of the parent while the children are read.
 */
function inlineStyles(root) {
  for (const el of [...root.querySelectorAll('*')]) {
    const tag = el.localName;
    if (el.closest('clipPath') || tag === 'clipPath' || tag === 'defs') continue;
    const cs = getComputedStyle(el);
    if (cs.opacity !== '1') el.setAttribute('opacity', String(Number(Number(cs.opacity).toFixed(4))));
    if (SHAPES.has(tag)) {
      const fillOk = tag === 'line' || setPaint(el, 'fill', cs.fill, Number(cs.fillOpacity)); // a line has no inside
      const strokeOk = setPaint(el, 'stroke', cs.stroke, Number(cs.strokeOpacity));
      if (!fillOk || !strokeOk) throw new Error(`export: colour not understood (${cs.fill} / ${cs.stroke})`);
      if (el.getAttribute('stroke') !== 'none') {
        el.setAttribute('stroke-width', pxNumber(cs.strokeWidth) ?? '1');
        const dash = dashArray(cs.strokeDasharray);
        if (dash) el.setAttribute('stroke-dasharray', dash);
        if (cs.strokeLinecap !== 'butt') el.setAttribute('stroke-linecap', cs.strokeLinecap);
        if (cs.strokeLinejoin !== 'miter') el.setAttribute('stroke-linejoin', cs.strokeLinejoin);
      }
      if (cs.shapeRendering !== 'auto') el.setAttribute('shape-rendering', SHAPE_RENDERING[cs.shapeRendering] || 'auto'); // the attribute is case sensitive
    }
    if (tag === 'text') {
      el.setAttribute('font-size', pxNumber(cs.fontSize) ?? '12');
      if (Number(cs.fontWeight) >= 600) el.setAttribute('font-weight', 'bold');
      // text with an outline (halo, paint-order: stroke): a copy below carries the outline, the text itself only the fill;
      // viewers that ignore paint-order would otherwise cover the letters with the outline
      if (el.getAttribute('stroke') !== 'none' && Number(pxNumber(cs.strokeWidth)) > 0) {
        const halo = el.cloneNode(true);
        halo.setAttribute('fill', el.getAttribute('stroke'));
        if (el.hasAttribute('stroke-opacity')) halo.setAttribute('fill-opacity', el.getAttribute('stroke-opacity'));
        halo.setAttribute('stroke-linejoin', 'round');
        el.parentNode.insertBefore(halo, el);
        el.setAttribute('stroke', 'none');
        el.removeAttribute('stroke-width');
        el.removeAttribute('stroke-opacity');
        el.removeAttribute('stroke-linejoin');
      }
    }
  }
  for (const el of root.querySelectorAll('[class]')) el.removeAttribute('class');
}

/**
 * Standalone SVG of the sketch.
 *   paint(target)   draws the sketch into `target` (an SVG element of `size` pixels), as on the screen
 *   size            { width, height } of the drawing area in pixels
 *   legend          lib/legend.js legendModel()
 *   fontPx          text size of the whole graphic in pixels (the document: 8 pt); without it the sizes of style.css
 * Returns { text, width, height }: the SVG text and its size in pixels (drawing area plus legend).
 */
export function buildExportSvg({ paint, size, legend, fontPx = null }) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;color-scheme:light;font-family:${EXPORT_FONT}`;
  const root = node('svg');
  host.append(root);
  document.body.append(host);
  try {
    const { width, height } = size;
    const clipId = 'ex-area';
    const drawing = node('g', { 'clip-path': `url(#${clipId})` });
    root.append(
      node('defs', {}, [node('clipPath', { id: clipId }, [node('rect', { x: 0, y: 0, width, height })])]),
      node('rect', { class: 'ex-ground', x: 0, y: 0, width: '100%', height: '100%' }),
      drawing,
      node('rect', { class: 'ex-frame', x: 0.5, y: 0.5, width: width - 1, height: height - 1 }),
    );
    paint(drawing);
    if (fontPx) for (const label of drawing.querySelectorAll('text')) label.style.fontSize = `${fontPx}px`; // labels and axes of the drawing
    const group = node('g', { transform: `translate(${LEGEND_PAD} ${height + LEGEND_TOP})` });
    root.append(group);
    const legendHeight = buildLegend(group, legend, width - 2 * LEGEND_PAD, fontPx);
    const total = Math.ceil(height + (legendHeight > 0 ? LEGEND_TOP + legendHeight + LEGEND_BOTTOM : 0));
    root.setAttribute('width', String(Math.round(width)));
    root.setAttribute('height', String(total));
    root.setAttribute('viewBox', `0 0 ${Math.round(width)} ${total}`);
    root.setAttribute('font-family', EXPORT_FONT);
    // the white ground covers the whole picture, drawing area and legend
    root.querySelector('.ex-ground').setAttribute('height', String(total));
    root.querySelector('.ex-ground').setAttribute('width', String(Math.round(width)));
    inlineStyles(root);
    for (const el of root.querySelectorAll('[style]')) el.removeAttribute('style'); // the size is an attribute now
    const body = new XMLSerializer().serializeToString(root);
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
    const problems = standaloneProblems(text);
    if (problems.length) throw new Error(`export: SVG not standalone: ${problems.join(', ')}`);
    return { text, width: Math.round(width), height: total };
  } finally {
    host.remove();
  }
}
