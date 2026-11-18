// Content of the legend of the sketch (SPEC_ETAPPE2 6, 8.2, 8.4) as data: materials, line samples of the methods,
// colour scale of the contour. The sketch on the screen shows it as HTML, the graphic export as SVG elements; both read
// this one list, so the two always say the same. No DOM access.

import { contourCssClass, contourLegend, legendRange } from './contour.js';

/**
 * sketch  buildSketch() of the model (sketch.legend: materials)
 * overlay buildResultOverlay() or null
 * t(key, params)  text of the interface language
 * Returns
 *   materials [{ cls: 'mat-0', text }]
 *   methods   [{ method, text, selected }]        line samples, only with circles
 *   contour   { title, items: [{ cls, text }] } | null   colour scale, only with contour bands
 *   note      text | null                          contour not possible (grid with one row or column)
 */
export function legendModel({ sketch, overlay, t }) {
  const materials = (sketch && Array.isArray(sketch.legend) ? sketch.legend : []).map((item) => ({
    cls: `mat-${item.colorIndex}`,
    text: item.name ? `${item.id} – ${item.name}` : item.id,
  }));
  const methods = overlay ? overlay.circles.map((c) => ({ method: c.method, text: t(`ui.method.${c.method}`), selected: !!c.selected })) : [];
  let contour = null;
  let note = null;
  if (overlay && overlay.contour && overlay.contour.polygons.length) {
    const title = t('ui.contour.title', { method: t(`ui.method.${overlay.method}`) });
    contour = {
      title,
      items: contourLegend().map((item) => ({
        cls: contourCssClass(item.cls),
        text: item.cls === null ? t('ui.result.noValid') : legendRange(item),
      })),
    };
  } else if (overlay && overlay.contour && overlay.contour.reason === 'single-row') {
    note = t('ui.contour.single');
  }
  return { materials, methods, contour, note };
}
