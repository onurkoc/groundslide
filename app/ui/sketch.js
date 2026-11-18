// Sketch of the model as SVG (SPEC_ETAPPE2 6): ground, layers with legend, bottom,
// water line, loads, grid of centres, single circles. Zoom with the mouse wheel,
// pan by dragging, fit button, coordinates of the mouse. Follows the input at once.
// Colours only from CSS variables (style.css).

import { translate } from '../lib/i18n.js';
import { formatCoordinate } from '../lib/numbers.js';
import { buildSketch, heightAt } from '../lib/sketch-model.js';
import { contourCssClass, groupByClass } from '../lib/contour.js';
import { legendModel } from '../lib/legend.js';
import { buildExportSvg } from './sketch-export.js';
import { layoutLabels } from '../lib/label-layout.js';
import { viewTicks } from '../lib/axes.js';
import { GRID_CHOICES, gridLines, snapStepFor, isGridChoice, snapValue } from '../lib/grid-step.js';
import { buildHandles, pickHandle, isSupportHandle, dragValues, editFields, canDeleteHandle, setHandleValues, deleteHandlePoint, lineTargets, hitSegment, hitSupport, insertOnSegment, DRAG_MIN_PX } from '../lib/handles.js';
import { openNodeEditor } from './node-editor.js';
import { openSupportEditor } from './support-editor.js';
import { supportShapes } from '../lib/supports-sketch.js';
import { applySupportForm } from '../lib/supports-edit.js';
import { centresVisible, singleMarks, forceLabel, polylineMarks, polylineBody, polylineCut, polylineLabelSpot, circleBody, circleSection, arcPathData } from '../lib/result-sketch.js';
import { slopeDirection } from '../lib/supports-sketch.js';
import { DRAW_KINDS, newDrawing, acceptPoint, previewParts, isComplete, canFinish, applyDrawing, drawPoint } from '../lib/drawing.js';
import { catchMetres } from '../lib/draw-snap.js';
import { arrowGeometry, pointsText } from '../lib/arrow.js';
import { placeTooltip, tooltipMaxWidth } from '../lib/tooltip-position.js';
import { pageGraphic, mmToPx, MAX_HEIGHT_MM, FONT_PX } from '../lib/page-graphic.js';
import { fitView, worldToScreen, screenToWorld, zoomAt, panBy, resizeView } from '../lib/view.js';
import { h, icon, iconButton, checkbox } from './widgets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARROW_LENGTH = 26; // px
const ARROW_SPACING = 26; // px
const MAX_CIRCLE_PX = 1e5; // larger circles are not drawn (they leave the picture anyway)

function s(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

const ok = (...values) => values.every(Number.isFinite);
const pts = (view, points) => points.map(([x, z]) => worldToScreen(view, x, z).map((v) => v.toFixed(2)).join(',')).join(' ');

/**
 * container: element that receives toolbar, drawing area and legend.
 * edit (SPEC_ETAPPE2 6.1): the page's part of editing with the mouse, or undefined (no handles):
 *   canEdit()          false during a run or without a model: no handles, no editing
 *   begin()            a move starts (false: not allowed); the state before it is remembered
 *   change(mutate)     apply a change to the model of the page (result discarded, input and check follow)
 *   end()              the move is over: one step of the history
 *   commit(mutate)     begin, change and end in one: one step (input field, insert, delete)
 *   stash()            what the input areas remember in the session (bond values of a nail, SPEC_ETAPPE3 8), for the field of a support
 */
export function createSketch({ container, getLang, edit }) {
  const t = (key, params) => translate(getLang(), key, params);

  let sketch = buildSketch(null);
  let view = { scale: 1, x0: 0, z0: 0 };
  let size = { width: 0, height: 0 }; // 0 x 0 while the tab Sketch is hidden
  let lastSize = null; // last size of the area that was not 0: the view refers to it
  let hasView = false;
  let pendingFit = false;
  let drag = null; // { kind: 'pan' | 'handle', handle, startX, startY, lastX, lastY, active }
  let modelRef = null; // the model of the page (live object): the handles are built from it
  let handleList = []; // handles of the last drawing, in the order of the table of 6.1
  let hoverId = null; // id of the handle under the mouse
  let readout = null; // { id, text }: coordinate at the node while it is dragged
  let radiusAngles = {}; // while R is dragged the handle follows the pointer: { [index of the circle]: angle }
  let editor = null; // open input field at a node
  let overlay = null; // result of the run (lib/result-sketch.js) or null
  let onContour = null;
  let methodChoice = null; // { methods, method, onChange } of the governing method in the tool bar, or null (no result / no search)
  let historyState = null; // { canUndo, canRedo, onUndo, onRedo } for the two buttons in the bar, or null
  let showGrid = true; // switch "Grid" (SPEC_ETAPPE2 6); not saved anywhere
  let snapOn = true; // switch "Snap" (SPEC_ETAPPE2 6, version 1.12): nodes snap to the grid width; independent of "Grid"; not saved anywhere
  let showForces = false; // switch "Forces" (SPEC_ETAPPE3 9): the force per metre at the points of the supports; default off; also in the export; not saved anywhere
  let supportList = []; // drawn support elements (lib/supports-sketch.js), built from the model at each update
  let gridChoice = 'auto'; // grid width: 'auto' or a fixed width in m (SPEC_ETAPPE2 6); not saved anywhere
  let drawing = null; // drawing mode (SPEC_ETAPPE4 12, 12a): { kind, points, direction, mouse, hint, lastPx } or null; not saved anywhere
  let drawKind = 'surface'; // what the drawing mode draws; stays for the session, not saved anywhere
  let ignoreDblUntil = 0; // after a drawing that ended by its last click, the double click that follows does not open a field
  let justPanned = false; // the click that ends a pan must not set a point in the drawing mode
  let hintTimer = null;

  // coordinates of the pointer (SPEC_ETAPPE4 13b): small, top right INSIDE the drawing area, lightly backed; it does not take space of its own, so the
  // area never changes its size; it is empty (and not shown) until the pointer has moved over the area and keeps the last value when it leaves
  const coords = h('span', { class: 'sketch-coords num', 'aria-live': 'off' });
  const empty = h('div', { class: 'sketch-empty hint' });
  const svg = s('svg', { role: 'img', class: 'sketch-svg' });
  const canvas = h('div', { class: 'sketch-canvas', tabindex: '0' }, [svg, empty]);
  const legend = h('ul', { class: 'sketch-legend' });
  const resultLegend = h('div', { class: 'sketch-result-legend' });
  const bar = h('div', { class: 'sketch-bar' });
  const fitBtn = h('button', { type: 'button', class: 'btn btn-small', onClick: () => fit() });
  const methodSelect = h('select', { class: 'sketch-method-select' });
  methodSelect.addEventListener('change', () => methodChoice && methodChoice.onChange(methodSelect.value));
  const gridSelect = h('select', { class: 'sketch-grid-select', id: 'sketch-grid-width' });
  gridSelect.addEventListener('change', () => {
    const value = gridSelect.value === 'auto' ? 'auto' : Number(gridSelect.value);
    if (isGridChoice(value)) gridChoice = value;
    render();
  });
  const fullBtn = h('button', { type: 'button', class: 'btn btn-small', onClick: () => toggleFullscreen() });
  const drawBtn = h('button', { type: 'button', class: 'btn btn-small', 'data-draw': '', onClick: () => (drawing ? cancelDrawing() : startDrawing()) });
  const drawSelect = h('select', { class: 'sketch-draw-select', id: 'sketch-draw-kind', 'data-draw-kind': '' });
  drawSelect.addEventListener('change', () => { if (DRAW_KINDS.includes(drawSelect.value)) drawKind = drawSelect.value; });
  const drawNote = h('div', { class: 'sketch-draw-note hint', hidden: true, role: 'status' });
  canvas.append(drawNote, coords);
  container.replaceChildren(bar, canvas, legend, resultLegend);

  /** Full screen on the sketch area (tool bar, drawing, legends); Esc or the button ends it. Nothing is saved. */
  const canFullscreen = typeof document.fullscreenEnabled === 'boolean' && document.fullscreenEnabled && typeof container.requestFullscreen === 'function';
  const isFullscreen = () => document.fullscreenElement === container;
  function toggleFullscreen() {
    if (isFullscreen()) document.exitFullscreen().catch(() => {});
    else if (canFullscreen) container.requestFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => {
    renderBar();
    // the drawing area changes its size: the ResizeObserver redraws, the view (zoom, shift) stays
  });

  /** Grid width: "Auto" or a fixed width; the width is used for the lines and for snapping (lib/grid-step.js). */
  function gridControl() {
    gridSelect.replaceChildren(...GRID_CHOICES.map((c) => h('option', { value: String(c), text: c === 'auto' ? t('ui.sketch.gridAuto') : `${c} m` })));
    gridSelect.value = String(gridChoice);
    return [h('label', { class: 'sketch-method', for: 'sketch-grid-width' }, [h('span', { text: t('ui.sketch.gridWidth') }), gridSelect])];
  }

  /** Undo and redo (SPEC_ETAPPE2 6.1): two buttons, locked when there is nothing to undo or redo. */
  function historyButtons() {
    const state = historyState || { canUndo: false, canRedo: false };
    const button = (name, label, enabled, onClick) => {
      const b = iconButton({ name, label, onClick });
      b.disabled = !enabled || !historyState;
      return b;
    };
    return [
      button('undo', t('ui.edit.undo'), state.canUndo, () => historyState && historyState.onUndo()),
      button('redo', t('ui.edit.redo'), state.canRedo, () => historyState && historyState.onRedo()),
    ];
  }

  /** Choice of the governing method, shown in the bar with a result of a search; same methods and order as the overview. */
  function methodControl() {
    if (!methodChoice || !methodChoice.methods.length) return [];
    const id = 'sketch-method';
    methodSelect.id = id;
    methodSelect.replaceChildren(...methodChoice.methods.map((m) => h('option', { value: m, text: t(`ui.method.${m}`) })));
    methodSelect.value = methodChoice.method;
    return [h('label', { class: 'sketch-method', for: id }, [h('span', { text: t('ui.sketch.method') }), methodSelect])];
  }

  /**
   * Operating hint (SPEC_ETAPPE2 6, versions 1.12): not a line in the bar but a tooltip on a small "?" button. Mouse over it
   * or keyboard focus (Tab) shows the text; Esc hides it. The accessible name of the button is the text itself.
   * The tooltip is out of the layout while hidden (display: none, style.css) and shown with position: fixed at a place that
   * lies completely inside the window (lib/tooltip-position.js): no parent can cut it off, it adds nothing to a scroll area.
   */
  function createHelpTip() {
    const button = h('button', { type: 'button', class: 'sketch-help-button' }, [h('span', { text: '?', 'aria-hidden': 'true' })]);
    const tip = h('span', { class: 'sketch-help-tip', 'aria-hidden': 'true' });
    const wrap = h('span', { class: 'sketch-help' }, [button, tip]);
    const state = { hover: false, focus: false, dismissed: false };
    const place = () => {
      const view = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      tip.style.maxWidth = `${tooltipMaxWidth(view.width)}px`;
      const a = button.getBoundingClientRect();
      const box = tip.getBoundingClientRect();
      const { left, top } = placeTooltip({ anchor: a, tip: { width: box.width, height: box.height }, viewport: view });
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    const update = () => {
      const open = (state.hover || state.focus) && !state.dismissed;
      wrap.classList.toggle('is-open', open);
      if (open) place();
    };
    button.addEventListener('mouseenter', () => { state.hover = true; update(); });
    wrap.addEventListener('mouseleave', () => { state.hover = false; if (!state.focus) state.dismissed = false; update(); });
    button.addEventListener('focus', () => { state.focus = true; update(); });
    button.addEventListener('blur', () => { state.focus = false; if (!state.hover) state.dismissed = false; update(); });
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      state.dismissed = true; // the tooltip can be dismissed without moving the focus
      e.stopPropagation();
      update();
    });
    window.addEventListener('resize', () => { if (wrap.classList.contains('is-open')) place(); });
    /** The text in the language of the interface (also the accessible name); the element itself stays, so focus and state stay. */
    const setText = (text) => {
      tip.textContent = text;
      button.setAttribute('aria-label', text);
      if (wrap.classList.contains('is-open')) place();
    };
    return { element: wrap, setText };
  }
  const helpTip = createHelpTip(); // built once: the bar is rebuilt often, the listeners are added once

  function renderBar() {
    const methodHadFocus = document.activeElement === methodSelect; // the bar is built again: keep the focus on the choice
    const gridHadFocus = document.activeElement === gridSelect;
    helpTip.setText(t('ui.sketch.hint'));
    const fitLabel = t('ui.sketch.fit');
    fitBtn.replaceChildren(icon('fit'), h('span', { text: fitLabel }));
    fullBtn.replaceChildren(icon('fullscreen'), h('span', { text: t(isFullscreen() ? 'ui.sketch.fullscreenExit' : 'ui.sketch.fullscreen') }));
    fullBtn.disabled = !canFullscreen;
    fullBtn.title = canFullscreen ? '' : t('ui.sketch.fullscreenNone');
    fullBtn.setAttribute('aria-pressed', String(isFullscreen()));
    drawBtn.replaceChildren(h('span', { text: t(drawing ? 'ui.sketch.drawStop' : 'ui.sketch.draw') }));
    drawBtn.setAttribute('aria-pressed', String(drawing !== null));
    drawBtn.disabled = !drawing && !(edit && edit.canEdit() && sketch.bounds);
    drawBtn.title = t('ui.sketch.drawTitle');
    drawSelect.replaceChildren(...DRAW_KINDS.map((k) => h('option', { value: k, text: t(`ui.draw.kind.${k}`) })));
    drawSelect.value = drawing ? drawing.kind : drawKind;
    drawSelect.disabled = drawing !== null; // the kind is chosen before the drawing begins
    drawSelect.setAttribute('aria-label', t('ui.draw.kind'));
    bar.replaceChildren(
      fitBtn,
      fullBtn,
      iconButton({ name: 'zoomIn', label: t('ui.sketch.zoomIn'), onClick: () => zoomCentre(1.4) }),
      iconButton({ name: 'zoomOut', label: t('ui.sketch.zoomOut'), onClick: () => zoomCentre(1 / 1.4) }),
      ...historyButtons(),
      drawBtn,
      drawSelect,
      helpTip.element,
      checkbox({ label: t('ui.sketch.grid'), checked: showGrid, onChange: (on) => { showGrid = on; render(); } }),
      checkbox({ label: t('ui.sketch.snap'), checked: snapOn, onChange: (on) => { snapOn = on; } }), // no redraw: nothing on the screen changes
      checkbox({ label: t('ui.sketch.forces'), checked: showForces, onChange: (on) => { showForces = on; render(); } }),
      ...gridControl(),
      ...methodControl(),
      ...(overlay && overlay.contourAvailable ? [checkbox({ label: t('ui.contour.toggle'), checked: overlay.contourOn, onChange: (on) => onContour && onContour(on) })] : []),
    );
    if (methodHadFocus && methodChoice) methodSelect.focus();
    if (gridHadFocus) gridSelect.focus();
  }

  /** Legend of the result: line sample per method, classes of the contour (content: lib/legend.js, as in the export). */
  function renderResultLegend() {
    resultLegend.replaceChildren();
    if (!overlay) return;
    const { methods, contour, note } = legendModel({ sketch, overlay, t });
    const parts = [];
    if (methods.length) {
      parts.push(h('ul', { class: 'sketch-legend', 'aria-label': t('ui.sketch.methods') }, methods.map((m) => h('li', { class: 'legend-item' }, [
        s('svg', { class: 'line-sample', width: 28, height: 10, viewBox: '0 0 28 10', 'aria-hidden': 'true' }, [s('line', { class: `rs-line m-${m.method}`, x1: 1, y1: 5, x2: 27, y2: 5 })]),
        h('span', { text: m.text, class: m.selected ? 'is-selected' : null }),
      ]))));
    }
    if (contour) {
      parts.push(h('ul', { class: 'sketch-legend contour-legend', 'aria-label': contour.title }, [
        h('li', { class: 'legend-title', text: contour.title }),
        ...contour.items.map((item) => h('li', { class: 'legend-item' }, [
          h('span', { class: `swatch ${item.cls}`, 'aria-hidden': 'true' }),
          h('span', { class: 'num', text: item.text }),
        ])),
      ]));
    } else if (note) {
      parts.push(h('p', { class: 'hint', text: note }));
    }
    resultLegend.replaceChildren(...parts);
  }

  function renderLegend() {
    legend.replaceChildren(...legendModel({ sketch, overlay: null, t }).materials.map((item) => h('li', { class: 'legend-item' }, [
      h('span', { class: `swatch ${item.cls}`, 'aria-hidden': 'true' }),
      h('span', { text: item.text }),
    ])));
    legend.setAttribute('aria-label', t('ui.sketch.legend'));
  }

  function arrow(x, yBase, yTop) {
    const { shaft, head } = arrowGeometry(x, yBase, yTop); // numbers; rounded only for the attribute
    return s('g', { class: 'sk-arrow' }, [
      s('line', { x1: shaft[0][0].toFixed(2), y1: shaft[0][1].toFixed(2), x2: shaft[1][0].toFixed(2), y2: shaft[1][1].toFixed(2) }),
      s('polygon', { points: pointsText(head) }),
    ]);
  }

  function drawLoads(g, view) {
    for (const load of sketch.loads) {
      const xs = sketch.ground.map((p) => p[0]);
      if (!xs.length) return;
      const xa = Math.max(load.x1, Math.min(...xs));
      const xb = Math.min(load.x2, Math.max(...xs));
      if (!(xb >= xa)) continue;
      const [sxa] = worldToScreen(view, xa, 0);
      const [sxb] = worldToScreen(view, xb, 0);
      const n = Math.max(2, Math.floor((sxb - sxa) / ARROW_SPACING) + 1);
      let yTopMin = Infinity;
      const arrows = [];
      for (let i = 0; i < n; i++) {
        const x = xa + ((xb - xa) * i) / (n - 1);
        const z = heightAt(sketch.ground, x);
        if (z === null) continue;
        const [sx, sy] = worldToScreen(view, x, z);
        if (!ok(sx, sy)) continue;
        arrows.push(arrow(sx, sy, sy - ARROW_LENGTH));
        yTopMin = Math.min(yTopMin, sy - ARROW_LENGTH);
      }
      if (!arrows.length) continue;
      const xm = (sxa + sxb) / 2;
      g.append(s('g', { class: 'sk-load' }, [
        ...arrows,
        s('line', { class: 'sk-load-bar', x1: sxa.toFixed(2), y1: yTopMin.toFixed(2), x2: sxb.toFixed(2), y2: yTopMin.toFixed(2) }),
        s('text', { class: 'sk-label', x: xm.toFixed(2), y: (yTopMin - 5).toFixed(2), 'text-anchor': 'middle' }, [
          document.createTextNode(`q = ${load.q} kPa${load.type ? ` (${load.type})` : ''}`),
        ]),
      ]));
    }
  }

  /**
   * Supports (SPEC_ETAPPE3 9): nail and anchor as a line from the head into the slope (anchor: free length thin, bond length
   * thick), pile as a vertical line, shotcrete as a band on the ground line. Colours from CSS variables (style.css).
   */
  function drawSupports(target, view) {
    const parts = [];
    for (const shape of supportList) {
      if (shape.type === 'shotcrete') {
        const line = [shape.segments[0].a, ...shape.segments.map((seg) => seg.b)];
        parts.push(s('polyline', { class: 'sk-support sk-support-shell', points: pts(view, line) }));
        continue;
      }
      for (const { a, b, part } of shape.segments) {
        const [x1, y1] = worldToScreen(view, a[0], a[1]);
        const [x2, y2] = worldToScreen(view, b[0], b[1]);
        if (ok(x1, y1, x2, y2)) parts.push(s('line', { class: `sk-support sk-support-${part}`, x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2) }));
      }
    }
    if (parts.length) target.append(s('g', { class: 'sk-supports' }, parts));
  }

  /**
   * After a run: a point where each support cuts the Spencer circle of the result; with the switch "Forces" the force per metre
   * at the point (labels are collected and placed with the others).
   */
  function drawSupportPoints(target, view, labels) {
    if (!overlay || !overlay.supportPoints) return;
    for (const p of overlay.supportPoints) {
      const [sx, sy] = worldToScreen(view, p.x, p.z);
      if (!ok(sx, sy)) continue;
      target.append(s('circle', { class: 'sk-support-hit', cx: sx.toFixed(2), cy: sy.toFixed(2), r: 4.5 }));
      if (showForces && p.perMetre !== null) labels.push({ x: sx + 7, y: sy - 7, text: forceLabel(p.perMetre), cls: 'sk-label sk-support-label' });
    }
  }

  /** Fine grid lines at the marks of the axes (only with the switch "Grid"); behind the drawing, over the soil. */
  function drawGridLines(svg, view, size) {
    if (!showGrid) return;
    const { x, z } = gridLines(view, size, gridChoice); // the width of the lines: the choice of the tool bar (lib/grid-step.js)
    const lines = [
      ...x.map((px) => s('line', { x1: px.toFixed(2), y1: 0, x2: px.toFixed(2), y2: size.height })),
      ...z.map((px) => s('line', { x1: 0, y1: px.toFixed(2), x2: size.width, y2: px.toFixed(2) })),
    ];
    svg.append(s('g', { class: 'sk-gridlines' }, lines));
  }

  /** Axes: x at the bottom edge, z at the left edge, marks and labels in m; the labels stay at the edge while panning. */
  function drawAxes(svg, view, size) {
    const { x, z } = viewTicks(view, size);
    const parts = [
      s('line', { class: 'sk-axis-line', x1: 0, y1: size.height - 0.5, x2: size.width, y2: size.height - 0.5 }),
      s('line', { class: 'sk-axis-line', x1: 0.5, y1: 0, x2: 0.5, y2: size.height }),
    ];
    for (const m of x) {
      parts.push(s('line', { class: 'sk-axis-line', x1: m.px.toFixed(2), y1: size.height - 6, x2: m.px.toFixed(2), y2: size.height }));
      if (m.px >= 20) parts.push(s('text', { class: 'sk-axis-label', x: m.px.toFixed(2), y: size.height - 9, 'text-anchor': 'middle' }, [document.createTextNode(m.label)]));
    }
    for (const m of z) {
      parts.push(s('line', { class: 'sk-axis-line', x1: 0, y1: m.px.toFixed(2), x2: 6, y2: m.px.toFixed(2) }));
      if (m.px >= 24 && m.px <= size.height - 18) parts.push(s('text', { class: 'sk-axis-label', x: 9, y: (m.px + 4).toFixed(2) }, [document.createTextNode(m.label)]));
    }
    parts.push(s('text', { class: 'sk-axis-title', x: size.width - 6, y: size.height - 22, 'text-anchor': 'end' }, [document.createTextNode('x [m]')]));
    parts.push(s('text', { class: 'sk-axis-title', x: 9, y: 14 }, [document.createTextNode('z [m]')]));
    svg.append(s('g', { class: 'sk-axes' }, parts));
  }

  /**
   * Colour bands of the contour (SPEC_ETAPPE2 8.2): one path per class with all its polygons, filled and stroked in the
   * colour of the class. The stroke (0.6 px, same colour) covers the hair lines that anti-aliasing would leave between
   * neighbouring polygons of the same class; it reaches 0.3 px over the border to the next class, which is not visible.
   */
  function drawContour(svg, view) {
    if (!overlay || !overlay.contour || !overlay.contour.polygons.length) return;
    const paths = groupByClass(overlay.contour.polygons).map(({ cls, polygons }) => {
      let d = '';
      for (const points of polygons) {
        let first = true;
        for (const [x, z] of points) {
          const [sx, sy] = worldToScreen(view, x, z);
          d += `${first ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
          first = false;
        }
        d += 'Z';
      }
      return s('path', { class: `sk-band ${contourCssClass(cls)}`, d });
    });
    svg.append(s('g', { class: 'sk-contour' }, paths));
  }

  /**
   * Path of the arc of a circle between entry and exit (the slip body, SPEC_ETAPPE4 12a). It is made for the view that paint() was given
   * (not the view of the screen): the result document draws the same picture with another view (SPEC_ETAPPE4 13b).
   */
  const arcPath = (view, c, entry, exit) => arcPathData(view, c, entry, exit, MAX_CIRCLE_PX);

  /** Slip body of the chosen method: its circle (or the area between the polyline and the ground), cut to the soil (clip path of the model body), lightly coloured. */
  function drawSlipBody(svg, view) {
    const sel = overlay && overlay.circles.find((c) => c.selected);
    if (!sel || !sketch.clip) return;
    if (sel.kind === 'polyline') {
      const body = polylineBody(sel, sketch.ground);
      if (body.length >= 3) svg.append(s('polygon', { class: 'rs-body', points: pts(view, body), 'clip-path': 'url(#sk-clip)' }));
      return;
    }
    // a circle: the area between the arc from entry to exit and the ground
    const body = circleBody(sel, sel.entry, sel.exit, sketch.ground);
    if (body.length >= 3) svg.append(s('polygon', { class: 'rs-body', points: pts(view, body), 'clip-path': 'url(#sk-clip)' }));
  }

  /** Governing circles of the methods (thin), the chosen one strong, centre with F. The arc is cut to the soil. */
  function drawResultCircles(svg, view, labels) {
    if (!overlay) return;
    // radius lines of the chosen circle: centre - entry point, centre - exit point (dashed)
    const radii = overlay.radii.map((l) => {
      const [x1, y1] = worldToScreen(view, l.x1, l.z1);
      const [x2, y2] = worldToScreen(view, l.x2, l.z2);
      return ok(x1, y1, x2, y2) ? s('line', { class: `rs-radius m-${overlay.method}`, x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2) }) : null;
    }).filter(Boolean);
    if (radii.length) svg.append(s('g', { class: 'rs-radii' }, radii));
    // the circle of the chosen method before the optimisation of search A: thin and dashed (SPEC_ETAPPE4 12)
    if (overlay.searchCircle) {
      const d = arcPath(view, overlay.searchCircle, overlay.searchCircle.entry, overlay.searchCircle.exit);
      if (d) svg.append(s('path', { class: `rs-search m-${overlay.method}`, d, ...(sketch.clip ? { 'clip-path': 'url(#sk-clip)' } : {}) }));
    }
    for (const c of overlay.circles) {
      if (c.kind === 'polyline') {
        // the polyline of search A from the entry to the exit; the label F in the middle between them above the ground
        const cut = polylineCut(c);
        if (cut.length < 2) continue;
        const line = pts(view, cut);
        svg.append(s('g', { class: 'rs-group' }, [
          s('polyline', { class: 'rs-halo', points: line }),
          s('polyline', { class: `rs-circle m-${c.method}${c.selected ? ' is-selected' : ''}`, points: line }),
        ]));
        const spot = polylineLabelSpot(c.entry, c.exit, sketch.ground);
        if (c.label && spot) {
          const [lx, ly] = worldToScreen(view, spot[0], spot[1]);
          if (ok(lx, ly)) labels.push({ x: lx - 24, y: ly - 10, text: c.label, cls: 'sk-label rs-label' });
        }
        continue;
      }
      const [cx, cy] = worldToScreen(view, c.xc, c.zc);
      const r = c.R * view.scale;
      if (!ok(cx, cy, r)) continue;
      const parts = [];
      const d = arcPath(view, c, c.entry, c.exit); // only between entry and exit
      if (d) {
        const clip = sketch.clip ? { 'clip-path': 'url(#sk-clip)' } : {};
        parts.push(s('path', { class: 'rs-halo', d, ...clip }));
        parts.push(s('path', { class: `rs-circle m-${c.method}${c.selected ? ' is-selected' : ''}`, d, ...clip }));
      }
      parts.push(s('path', { class: `rs-cross m-${c.method}`, d: `M${cx - 4},${cy}h8M${cx},${cy - 4}v8` }));
      if (c.label) labels.push({ x: cx + 7, y: cy + 16, text: c.label, cls: 'sk-label rs-label' });
      svg.append(s('g', { class: 'rs-group' }, parts));
    }
  }

  /**
   * Tension crack of the surfaces of a result (SPEC_ETAPPE4 12): a vertical line from the ground at the crack down to the crack base; the
   * lowest part, filled with water (h_w = waterFill * depth), in blue.
   */
  function drawCracks(svg, view) {
    if (!overlay || !overlay.cracks) return;
    const parts = [];
    for (const c of overlay.cracks) {
      const top = heightAt(sketch.ground, c.x);
      if (top === null) continue;
      const base = top - c.depth;
      const [x, y0] = worldToScreen(view, c.x, top);
      const [, y1] = worldToScreen(view, c.x, base);
      if (!ok(x, y0, y1)) continue;
      parts.push(s('line', { class: 'sk-crack', x1: x.toFixed(2), y1: y0.toFixed(2), x2: x.toFixed(2), y2: y1.toFixed(2) }));
      if (c.water > 0) {
        const [, yw] = worldToScreen(view, c.x, base + Math.min(c.water, c.depth));
        parts.push(s('line', { class: 'sk-crack-water', x1: x.toFixed(2), y1: yw.toFixed(2), x2: x.toFixed(2), y2: y1.toFixed(2) }));
      }
    }
    if (parts.length) svg.append(s('g', { class: 'sk-cracks' }, parts));
  }

  /** Texts of the circles, moved so that they do not overlap (the label of the chosen circle first). */
  function drawLabels(svg, list) {
    const spots = layoutLabels(list);
    list.forEach((l, i) => svg.append(s('text', { class: l.cls, x: spots[i].x.toFixed(2), y: spots[i].y.toFixed(2) }, [document.createTextNode(l.text)])));
  }

  function render() {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`);
    svg.setAttribute('aria-label', t('ui.sketch.label'));
    empty.textContent = sketch.bounds ? '' : t('ui.sketch.empty');
    handleList = [];
    if (!sketch.bounds || size.width <= 0) return;
    paint(svg, view, size);
    // handles only on the screen: the export and the result document are drawn by paint() alone
    if (drawing) drawPreview(svg);
    else if (edit && edit.canEdit() && modelRef) {
      handleList = buildHandles(modelRef, { clip: sketch.clip, radiusAngles });
      drawHandles(svg, handleList);
    }
  }

  /**
   * What is being drawn (any kind): the parts that are fixed (solid), the part that follows the pointer (dashed), a point at every click and a
   * short hint at the pointer. The parts come from lib/drawing.js.
   */
  function drawPreview(target) {
    const parts = [];
    for (const part of previewParts(drawing, drawing.mouse, modelRef)) parts.push(s('polyline', { class: `sk-draw-${part.cls}`, points: pts(view, part.points) }));
    for (const [x, z] of drawing.points) {
      const [sx, sy] = worldToScreen(view, x, z);
      if (ok(sx, sy)) parts.push(s('circle', { class: 'sk-draw-point', cx: sx.toFixed(2), cy: sy.toFixed(2), r: 4 }));
    }
    if (drawing.hint && drawing.mouse) {
      const [mx, my] = worldToScreen(view, drawing.mouse[0], drawing.mouse[1]);
      if (ok(mx, my)) parts.push(s('text', { class: 'sk-label sk-draw-hint', x: (mx + 12).toFixed(2), y: (my - 12).toFixed(2) }, [document.createTextNode(drawing.hint)]));
    }
    target.append(s('g', { class: 'sk-draw' }, parts));
  }

  /** The handles (SPEC_ETAPPE2 6.1) and the coordinate at the node that is dragged. Colours from CSS variables. */
  function drawHandles(target, list) {
    const parts = [];
    // the handles of the supports are drawn last, so they lie on top (SPEC_ETAPPE3 9)
    for (const handle of [...list.filter((hd) => !isSupportHandle(hd)), ...list.filter(isSupportHandle)]) {
      const [x, y] = worldToScreen(view, handle.x, handle.z);
      if (!ok(x, y) || x < -20 || y < -20 || x > size.width + 20 || y > size.height + 20) continue;
      const active = hoverId === handle.id || (drag && drag.active && drag.handle && drag.handle.id === handle.id);
      const r = active ? 6.5 : 4.5;
      const cls = `sk-handle sk-handle-${handle.type}${active ? ' is-active' : ''}`;
      if (handle.type === 'load' || handle.type === 'grid' || handle.type === 'supportEnd') parts.push(s('rect', { class: cls, x: (x - r).toFixed(2), y: (y - r).toFixed(2), width: 2 * r, height: 2 * r }));
      else if (handle.type === 'radius') parts.push(s('path', { class: cls, d: `M${x.toFixed(2)},${(y - r - 1).toFixed(2)}l${r + 1},${r + 1}l${-(r + 1)},${r + 1}l${-(r + 1)},${-(r + 1)}z` }));
      else parts.push(s('circle', { class: cls, cx: x.toFixed(2), cy: y.toFixed(2), r }));
    }
    target.append(s('g', { class: 'sk-handles' }, parts));
    if (readout) {
      const handle = list.find((hd) => hd.id === readout.id);
      if (handle) {
        const [x, y] = worldToScreen(view, handle.x, handle.z);
        target.append(s('text', { class: 'sk-label sk-readout', x: (x + 10).toFixed(2), y: (y - 10).toFixed(2) }, [document.createTextNode(readout.text)]));
      }
    }
  }

  /**
   * Draw the sketch into `svg` for the view and size given: the screen uses its own, the graphic export a copy
   * (the same drawing, so the export shows what the screen shows).
   */
  function paint(svg, view, size) {
    const labels = []; // label of the chosen circle, collected while drawing, placed at the end

    const defs = s('defs');
    if (sketch.clip) defs.append(s('clipPath', { id: 'sk-clip' }, [s('polygon', { points: pts(view, sketch.clip) })]));
    svg.append(defs);

    if (sketch.layers.length) {
      svg.append(s('g', { 'clip-path': 'url(#sk-clip)' }, sketch.layers.map((l) => s('polygon', { class: `sk-mat mat-${l.colorIndex}`, points: pts(view, l.points) }))));
    }
    if (sketch.clip) svg.append(s('polygon', { class: 'sk-outline', points: pts(view, sketch.clip) }));
    drawGridLines(svg, view, size);
    drawContour(svg, view);
    drawSlipBody(svg, view);

    // bottom
    if (sketch.bottom !== null && sketch.ground.length) {
      const xs = sketch.ground.map((p) => p[0]);
      const [x1, y] = worldToScreen(view, Math.min(...xs), sketch.bottom);
      const [x2] = worldToScreen(view, Math.max(...xs), sketch.bottom);
      if (ok(x1, x2, y)) svg.append(s('line', { class: 'sk-bottom', x1, y1: y, x2, y2: y }));
    }
    if (sketch.ground.length >= 2) svg.append(s('polyline', { class: 'sk-ground', points: pts(view, sketch.ground) }));
    if (sketch.water.length >= 2) svg.append(s('polyline', { class: 'sk-water', points: pts(view, sketch.water) }));
    // line of the tension crack zone: parallel to the ground at the depth of the crack (SPEC_ETAPPE4 12; the display only)
    if (sketch.crackZone && sketch.crackZone.points.length >= 2) svg.append(s('polyline', { class: 'sk-crackzone', points: pts(view, sketch.crackZone.points) }));

    const loadsLayer = s('g');
    drawLoads(loadsLayer, view);
    svg.append(loadsLayer);
    drawSupports(svg, view);

    if (sketch.grid) {
      const g = sketch.grid;
      const [x1, y1] = worldToScreen(view, g.xMin, g.zMax);
      const [x2, y2] = worldToScreen(view, g.xMax, g.zMin);
      if (ok(x1, y1, x2, y2)) {
        svg.append(s('rect', { class: 'sk-grid', x: x1, y: y1, width: Math.max(x2 - x1, 0), height: Math.max(y2 - y1, 0) }));
        if (g.centers && centresVisible(overlay)) {
          svg.append(s('g', { class: 'sk-centres' }, g.centers.map(([x, z]) => {
            const [sx, sy] = worldToScreen(view, x, z);
            return s('circle', { cx: sx.toFixed(2), cy: sy.toFixed(2), r: 1.6 });
          })));
        }
      }
    }

    const singleLabels = [];
    for (const c of singleMarks(sketch.surfaces, overlay)) {
      const [cx, cy] = worldToScreen(view, c.xc, c.zc);
      const r = c.R * view.scale;
      if (!ok(cx, cy, r)) continue;
      const parts = [s('path', { class: 'sk-cross', d: `M${cx - 4},${cy}h8M${cx},${cy - 4}v8` })];
      // the arc only where the circle is a slip body: between its entry and exit (after a run those of the result, else worked out here);
      // centre and text stay in any case (SPEC_ETAPPE2 6, SPEC_ETAPPE4 12a)
      const known = overlay && overlay.singleArcs ? overlay.singleArcs[c.id] : null;
      const span = known || circleSection(c, sketch.ground, slopeDirection(modelRef));
      const d = span ? arcPath(view, c, span.entry, span.exit) : null;
      if (d) parts.unshift(s('path', { class: 'sk-circle', d, ...(sketch.clip ? { 'clip-path': 'url(#sk-clip)' } : {}) }));
      if (c.label) singleLabels.push({ x: cx + 6, y: cy - 6, text: c.label, cls: 'sk-label' });
      svg.append(s('g', {}, parts));
    }
    // single polylines: the line with its id (and F or the code after a run), only a complete and valid polyline
    for (const p of polylineMarks(sketch.polylines, overlay, sketch.ground)) {
      svg.append(s('polyline', { class: 'sk-poly', points: pts(view, p.points) }));
      if (p.label && p.spot) {
        const [lx, ly] = worldToScreen(view, p.spot[0], p.spot[1]);
        if (ok(lx, ly)) singleLabels.push({ x: lx - 6, y: ly - 8, text: p.label, cls: 'sk-label' });
      }
    }
    drawResultCircles(svg, view, labels);
    drawCracks(svg, view);
    drawSupportPoints(svg, view, labels);
    drawLabels(svg, [...labels, ...singleLabels]);
    drawAxes(svg, view, size);
  }

  /**
   * The drawing area has a new size. Scale and centre of the view stay (resizeView); axes and grid are drawn again.
   * A hidden area (size 0) changes nothing but the drawing: the view is kept and refers to the last real size.
   */
  function setSize(width, height) {
    const usable = width > 0 && height > 0;
    size = { width, height };
    if (usable && pendingFit) {
      lastSize = { width, height };
      fit();
      return;
    }
    if (usable) {
      if (hasView && lastSize) view = resizeView(view, lastSize, size);
      lastSize = { width, height };
    }
    render();
  }

  /** Fit the whole model into the area (also remembered if the area has no size yet). */
  function fit() {
    if (!sketch.bounds || size.width <= 0 || size.height <= 0) {
      pendingFit = true;
      render();
      return;
    }
    pendingFit = false;
    view = fitView(sketch.bounds, size);
    lastSize = { ...size };
    hasView = true;
    render();
  }

  function zoomCentre(factor) {
    view = zoomAt(view, size.width / 2, size.height / 2, factor);
    render();
  }

  const pointer = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function showCoords(e) {
    const [sx, sy] = pointer(e);
    const [x, z] = screenToWorld(view, sx, sy);
    coords.textContent = sketch.bounds ? t('ui.sketch.coords', { x: formatCoordinate(x), z: formatCoordinate(z) }) : '';
  }

  canvas.addEventListener('wheel', (e) => {
    if (!sketch.bounds) return;
    e.preventDefault();
    const [sx, sy] = pointer(e);
    const factor = Math.min(Math.max(Math.exp(-e.deltaY * 0.0015), 0.5), 2);
    view = zoomAt(view, sx, sy, factor);
    render();
    showCoords(e);
  }, { passive: false });

  const toScreen = (x, z) => worldToScreen(view, x, z);
  const snapStep = () => snapStepFor(snapOn, gridChoice, view.scale); // the snap switch decides (not "Grid"): on = snapping to the grid width

  function releasePointer(e) {
    if (e && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  // ---------- drawing mode (SPEC_ETAPPE4 12, 12a) ----------
  // The button "Draw" and the choice of the kind: slip surface, layer boundary, water line, ground, nail, anchor, pile, shotcrete. Every click
  // sets a point (snapped like a move); a click that breaks a rule of the kind sets no point (hint). Lines end by double click or Enter, nail,
  // anchor, pile and shotcrete with their last click. Esc cancels. What is written into the model is decided by lib/drawing.js; it is ONE
  // edit.commit (one step of the history). Nothing of it is part of the export or the document.

  /** The catch area of the handles in metres at the scale of the view (SPEC_ETAPPE4 13c): tolerance of the end points and of the model edge. */
  const catchTolerance = () => catchMetres(view.scale);

  /**
   * The world point of a mouse event, snapped to the grid width when snapping is on. A layer boundary or water line point near the model edge
   * lies on the edge (SPEC_ETAPPE4 13c; judged on the position of the pointer, before the grid), so the preview shows it there too.
   */
  function worldAt(e) {
    const [sx, sy] = pointer(e);
    const [x, z] = screenToWorld(view, sx, sy);
    const step = snapStep();
    const p = step ? [snapValue(x, step), snapValue(z, step)] : [x, z];
    if (!drawing) return p;
    const edge = drawPoint(drawing.kind, [x, p[1]], modelRef, catchTolerance());
    return edge[0] === x ? p : [edge[0], p[1]];
  }

  /** The line under the sketch that says what to do: lines (and the slip surface) and the kinds with fixed clicks have their own. */
  function showDrawNote() {
    drawNote.hidden = drawing === null;
    const fixed = { nail: 'Nail', anchor: 'Anchor', pile: 'Pile', shotcrete: 'Shotcrete' };
    drawNote.textContent = drawing ? t(fixed[drawing.kind] ? `ui.sketch.drawHelp${fixed[drawing.kind]}` : 'ui.sketch.drawHelp') : '';
  }

  function startDrawing() {
    if (!edit || !edit.canEdit() || !sketch.bounds) return;
    closeEditor();
    drawing = { ...newDrawing(drawKind), mouse: null, hint: null, lastPx: null };
    canvas.classList.add('is-drawing');
    showDrawNote();
    renderBar();
    canvas.focus(); // Enter and Esc go to the sketch
    render();
  }

  function stopDrawing() {
    clearTimeout(hintTimer);
    drawing = null;
    canvas.classList.remove('is-drawing');
    showDrawNote();
    renderBar();
    render();
  }

  function cancelDrawing() {
    if (drawing) stopDrawing();
  }

  /** A short hint at the pointer (about 1.6 s). */
  function flashHint(text) {
    drawing.hint = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (!drawing) return;
      drawing.hint = null;
      render();
    }, 1600);
  }

  function addDrawPoint(e) {
    const p = worldAt(e);
    const accepted = acceptPoint(drawing, p, modelRef); // p is already on the model edge when the click was near it (worldAt, SPEC_ETAPPE4 13c)
    drawing.mouse = p;
    if (!accepted.ok) {
      flashHint(t(`ui.draw.reject.${accepted.reason}`));
      render();
      return;
    }
    if (accepted.direction !== undefined) drawing.direction = accepted.direction;
    drawing.points.push(accepted.point);
    drawing.lastPx = pointer(e);
    if (isComplete(drawing)) finishDrawing(); // nail, anchor, pile and shotcrete end with their last click
    else render();
  }

  /** Double click, Enter or the last click: write the drawing into the model (one step), then open what the kind asks for. */
  function finishDrawing() {
    const can = canFinish(drawing, modelRef);
    if (!can.ok) {
      flashHint(t(`ui.draw.reject.${can.reason}`));
      render();
      return;
    }
    const finished = { kind: drawing.kind, points: drawing.points.map((p) => [...p]), direction: drawing.direction, tolerance: catchTolerance() }; // tolerance: the catch area at the scale of the view when finishing (SPEC_ETAPPE4 13c)
    const anchor = drawing.lastPx ? { x: drawing.lastPx[0], y: drawing.lastPx[1] } : { x: size.width / 2, y: size.height / 2 };
    const allowed = edit && edit.canEdit();
    stopDrawing();
    if (!allowed) return;
    let next = {};
    edit.commit((model) => { next = applyDrawing(finished, model); });
    ignoreDblUntil = Date.now() + 500;
    if (next.focus && edit.focusPath) edit.focusPath(next.focus); // a new layer: the area Layers opens at its material
    if (next.support !== undefined) openSupportField(next.support, anchor); // like a double click on the element (SPEC_ETAPPE3 9)
  }

  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    canvas.classList.toggle('is-over-handle', id !== null);
    render();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !sketch.bounds) return;
    const [sx, sy] = pointer(e);
    const handle = drawing ? null : pickHandle(handleList, sx, sy, toScreen); // pressing beside a handle moves the view as before; no handles in the drawing mode
    justPanned = false;
    canvas.setPointerCapture(e.pointerId);
    drag = { kind: handle ? 'handle' : 'pan', handle, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, active: false };
  });

  /** Move the node under the pointer: the value goes into the model (snapped to the grid width when the grid is on). */
  function moveNode(e) {
    const [sx, sy] = pointer(e);
    const [x, z] = screenToWorld(view, sx, sy);
    const handle = drag.handle;
    const values = dragValues(handle, { x, z }, snapStep());
    if (handle.type === 'radius') radiusAngles = { [handle.index]: Math.atan2(z - handle.cz, x - handle.cx) };
    if (handle.type === 'radius') readout = { id: handle.id, text: t('ui.edit.readoutR', { R: formatCoordinate(values.R) }) };
    else if (handle.type === 'load' || handle.type === 'supportEnd') readout = { id: handle.id, text: t('ui.edit.readoutX', { x: formatCoordinate(values.x) }) }; // only x moves
    else readout = { id: handle.id, text: t('ui.sketch.coords', { x: formatCoordinate(values.x), z: formatCoordinate(values.z) }) };
    edit.change((model) => setHandleValues(model, handle, values));
  }

  canvas.addEventListener('pointermove', (e) => {
    showCoords(e);
    if (!drag && drawing) {
      drawing.mouse = worldAt(e);
      render();
      return;
    }
    if (!drag) {
      const [sx, sy] = pointer(e);
      setHover(pickHandle(handleList, sx, sy, toScreen)?.id ?? null);
      return;
    }
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_MIN_PX) return; // under 3 px: not a drag
      if (drag.kind === 'handle') {
        if (!edit || !edit.begin()) { // locked
          releasePointer(e);
          drag = null;
          return;
        }
        canvas.classList.add('is-moving-node');
      } else {
        canvas.classList.add('is-dragging');
        justPanned = true; // the click after a pan sets no point in the drawing mode
      }
      drag.active = true;
    }
    if (drag.kind === 'pan') {
      view = panBy(view, e.clientX - drag.lastX, e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      render();
    } else {
      moveNode(e);
    }
  });

  const endDrag = (e) => {
    releasePointer(e);
    const finished = drag;
    drag = null;
    canvas.classList.remove('is-dragging', 'is-moving-node');
    if (finished && finished.kind === 'handle' && finished.active) {
      readout = null;
      radiusAngles = {};
      edit.end(); // one step of the history from pressing to releasing
      render();
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    if (!drag) {
      setHover(null); // the last value of the coordinates stays (SPEC_ETAPPE4 13b)
      if (drawing) {
        drawing.mouse = null;
        render();
      }
    }
  });
  canvas.addEventListener('click', (e) => {
    if (!drawing || e.button !== 0) return;
    if (justPanned) {
      justPanned = false;
      return;
    }
    if (e.detail > 1) return; // the second click of a double click (it ends the drawing)
    addDrawPoint(e);
  });

  function closeEditor() {
    if (editor) editor.close();
  }

  /** Double click on a handle: small input field at the node. */
  function openEditor(handle) {
    closeEditor();
    const [sx, sy] = toScreen(handle.x, handle.z);
    editor = openNodeEditor({
      host: canvas,
      anchor: { x: sx, y: sy },
      fields: editFields(handle),
      canDelete: canDeleteHandle(handle),
      lang: getLang(),
      onApply: (values) => edit.commit((model) => setHandleValues(model, handle, values)),
      onDelete: () => edit.commit((model) => deleteHandlePoint(model, handle)),
      onClose: () => {
        editor = null;
        canvas.focus(); // back to the sketch
      },
    });
  }

  /** Double click on a support element: the field with all its properties (SPEC_ETAPPE3 9). One step of the history on Enter. */
  function openSupportField(index, anchor) {
    const support = Array.isArray(modelRef.supports) ? modelRef.supports[index] : null;
    if (!support) return;
    closeEditor();
    const stash = edit.stash ? edit.stash() : {};
    editor = openSupportEditor({
      host: canvas,
      anchor,
      support,
      stash,
      sia: modelRef.analysis && modelRef.analysis.mode === 'sia',
      lang: getLang(),
      onApply: (form) => edit.commit((model) => applySupportForm(model, index, form, stash)),
      onClose: () => {
        editor = null;
        canvas.focus(); // back to the sketch
      },
    });
  }

  // double click: on a handle the input field, on a support element its field (also on the band of shotcrete, which lies on the ground line:
  // SPEC_ETAPPE3 9), on a line (ground, layer boundary, water line) a new point, elsewhere nothing
  canvas.addEventListener('dblclick', (e) => {
    if (drawing) {
      e.preventDefault();
      finishDrawing();
      return;
    }
    if (Date.now() < ignoreDblUntil) return; // the double click that ended a drawing by its last click opens nothing
    if (!edit || !edit.canEdit() || !sketch.bounds || !modelRef) return;
    e.preventDefault(); // the double click neither zooms nor moves
    const [sx, sy] = pointer(e);
    const handle = pickHandle(handleList, sx, sy, toScreen);
    if (handle) {
      openEditor(handle);
      return;
    }
    const support = hitSupport(supportList, sx, sy, toScreen); // before the lines: a band of shotcrete lies on the ground line
    if (support) {
      openSupportField(support.shape.index, { x: sx, y: sy });
      return;
    }
    if (!hitSegment(lineTargets(modelRef), sx, sy, toScreen)) return;
    const [x] = screenToWorld(view, sx, sy);
    const step = snapStep();
    edit.commit((model) => {
      const hit = hitSegment(lineTargets(model), sx, sy, toScreen);
      if (hit) insertOnSegment(hit, x, step);
    });
  });

  // keyboard: arrows pan, + and - zoom, 0 fits
  canvas.addEventListener('keydown', (e) => {
    if (drawing && e.key === 'Enter') {
      e.preventDefault();
      finishDrawing();
      return;
    }
    if (drawing && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelDrawing();
      return;
    }
    const step = 40;
    const actions = {
      ArrowLeft: () => { view = panBy(view, step, 0); },
      ArrowRight: () => { view = panBy(view, -step, 0); },
      ArrowUp: () => { view = panBy(view, 0, step); },
      ArrowDown: () => { view = panBy(view, 0, -step); },
      '+': () => { view = zoomAt(view, size.width / 2, size.height / 2, 1.4); },
      '=': () => { view = zoomAt(view, size.width / 2, size.height / 2, 1.4); },
      '-': () => { view = zoomAt(view, size.width / 2, size.height / 2, 1 / 1.4); },
      0: () => fit(),
    };
    if (!actions[e.key] || !sketch.bounds) return;
    e.preventDefault();
    actions[e.key]();
    render();
  });

  new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    setSize(r.width, r.height);
  }).observe(canvas);

  renderBar();
  renderLegend();
  render();

  return {
    /** The model changed: redraw at once, the view stays (except the first time). */
    update(model) {
      modelRef = model;
      sketch = buildSketch(model);
      supportList = supportShapes(model);
      renderLegend();
      if (!hasView && sketch.bounds) fit();
      else render();
    },
    fit,
    /** Draw again (handles appear or disappear when editing is allowed or locked). */
    redraw() {
      if (editor && !(edit && edit.canEdit())) editor.close();
      if (drawing && !(edit && edit.canEdit())) stopDrawing(); // a run starts: the drawing is dropped
      renderBar();
      render();
    },
    /** Undo and redo for the two buttons of the bar: { canUndo, canRedo, onUndo, onRedo } or null. */
    setHistory(next) {
      historyState = next;
      renderBar();
    },
    /**
     * The sketch as a standalone SVG for the graphic export (SPEC_ETAPPE2 8.4): { text, width, height }. Same view and
     * size as on the screen (while the tab Sketch is hidden: the last size it had), light colours, legend below.
     * Nothing on the screen changes.
     */
    exportSvg() {
      const area = size.width > 0 && size.height > 0 ? size : lastSize || { width: 800, height: 500 };
      const exportView = hasView || !sketch.bounds ? view : fitView(sketch.bounds, area);
      return buildExportSvg({
        paint: (target) => { if (sketch.bounds) paint(target, exportView, area); },
        size: area,
        legend: legendModel({ sketch, overlay, t }),
        t,
      });
    },
    /**
     * The graphic of the result document (SPEC_ETAPPE2 8.5, version 1.12): { text, width, height } like exportSvg(), but
     * drawn again for the page: width 180 mm (lib/page-graphic.js), text 8 pt, the same section as the drawing area on
     * the screen, cut at the top and bottom if it would be higher than half a page (the legend counts to that height).
     * The axes are divided for the new size. Nothing on the screen changes; the graphic export (exportSvg) is not touched.
     */
    pageSvg() {
      const area = size.width > 0 && size.height > 0 ? size : lastSize || { width: 800, height: 500 };
      const exportView = hasView || !sketch.bounds ? view : fitView(sketch.bounds, area);
      const legend = legendModel({ sketch, overlay, t });
      const limit = mmToPx(MAX_HEIGHT_MM);
      const make = (page, draw = true) => buildExportSvg({
        paint: (target) => { if (draw && sketch.bounds) paint(target, page.view, { width: page.width, height: page.height }); },
        size: { width: page.width, height: page.height },
        legend,
        fontPx: FONT_PX,
      });
      const first = pageGraphic({ view: exportView, size: area });
      if (!first) return this.exportSvg(); // no usable size: the drawing as it is
      const legendPx = make({ ...first, height: 1 }, false).height - 1; // height of the legend block (it does not depend on the drawing; measured without drawing)
      const page = pageGraphic({ view: exportView, size: area, maxHeightPx: Math.max(limit - legendPx, 1) });
      return make(page);
    },
    /**
     * Result of a run (lib/result-sketch.js) or null: circles, contour, labels, legend. The view stays.
     * contourAvailable / contourOn: state of the switch in the bar; onChange(on): the user switched it.
     * methodChoice { methods, method, onChange(method) }: governing method in the bar (SPEC_ETAPPE2 6, version 1.8);
     * null (no result, no search): the choice is not shown.
     */
    setOverlay(next, { contourOn = true, onContourChange = null, methodChoice: choice = null } = {}) {
      overlay = next ? { ...next, contourOn } : null;
      onContour = onContourChange;
      methodChoice = next && choice ? choice : null;
      renderBar();
      renderResultLegend();
      render();
    },
    /** The language changed: texts again, the view stays. */
    relocalize() {
      showDrawNote();
      renderBar();
      renderLegend();
      renderResultLegend();
      render();
    },
    getView: () => ({ ...view }),
  };
}
