// Result document (SPEC_ETAPPE2 8.5): fills the hidden print area of the page. It is shown only when printing (style.css,
// @media print); the browser prints it or saves it as PDF, the app writes no file. The area is emptied after printing.

import { h } from './widgets.js';

/**
 * container: the print area (#print-doc)
 *   head      lib/result-document.js documentHead()
 *   svgText   the graphic of the export (ui/sketch-export.js), as SVG text
 *   table     lib/result-document.js documentTable()
 *   supports  lib/result-document.js documentSupports(): the table of the supports after the slice table, or null (left out)
 *   verification  lib/sia-verification.js documentVerification(): the section "Verification SIA 267" after the graphic (mode sia), or null
 *   texts     { slices, supports, sketch, licence }: headings of the tables, alternative text of the graphic, the line with the name,
 *             the kind of method and the licence (SPEC_ETAPPE4 13a)
 */
export function fillPrintDocument(container, { head, svgText, table, supports = null, verification = null, texts }) {
  const meta = h('dl', { class: 'pd-meta' });
  const add = (label, value, cls) => meta.append(h('dt', { text: label }), h('dd', { text: value, class: cls || null }));
  add(texts.dateTime, head.dateTime);
  add(texts.method, head.methodName || '–');
  for (const entry of head.entries) add(entry.label, entry.value, 'num');

  const header = h('header', { class: 'pd-head' }, [
    h('h1', { text: head.title }),
    meta,
    head.note ? h('p', { class: 'pd-note', text: head.note }) : null,
  ]);

  let figure = null;
  if (svgText) {
    figure = h('figure', { class: 'pd-figure', role: 'img', 'aria-label': texts.sketch });
    figure.innerHTML = svgText.replace(/^<[?]xml[^>]*[?]>\s*/, ''); // the SVG of our own export; nothing a user typed is added to it as markup
  }
  // the verification (mode sia) stands right after the graphic, before the slice table (SPEC_ETAPPE4 13b)
  const parts = [header, figure, verification ? verificationSection(verification) : null, tableSection(table, texts), supports ? supportsSection(supports, texts) : null];
  const foot = h('p', { class: 'pd-foot' }, [h('span', { text: texts.licence })]);

  // a table with a footer group: the footer is repeated at the bottom of every printed page
  container.replaceChildren(h('table', { class: 'pd-frame', role: 'presentation' }, [
    h('tbody', {}, [h('tr', {}, [h('td', {}, parts)])]),
    h('tfoot', {}, [h('tr', {}, [h('td', {}, [foot])])]),
  ]));
}

/** Empty the print area again (after printing). */
export function clearPrintDocument(container) {
  container.replaceChildren();
}

/** Table "Supports" (SPEC_ETAPPE3 10): same look as the slice table; the head is repeated on every page by the print style. */
function supportsSection(table, texts) {
  const parts = [h('h2', { text: texts.supports })];
  if (table.which) parts.push(h('p', { class: 'pd-which', text: `${table.which} – ${table.circle}` }));
  if (table.kind === 'table') {
    parts.push(h('table', { class: 'pd-table pd-supports' }, [
      h('thead', {}, [h('tr', {}, table.head.map((text, i) => h('th', { scope: 'col', class: table.numeric[i] ? 'num' : 'txt', text })))]),
      h('tbody', {}, table.rows.map((row) => h('tr', {}, row.map((text, i) => h('td', { class: table.numeric[i] ? 'num' : 'txt', text }))))),
    ]));
  } else if (table.kind === 'invalid') {
    parts.push(h('p', { class: 'pd-note' }, [h('span', { class: 'code', text: table.code }), document.createTextNode(` ${table.text}`)]));
  } else {
    parts.push(h('p', { class: 'pd-note', text: table.text }));
  }
  return h('section', { class: 'pd-section' }, parts);
}

function tableSection(table, texts) {
  const parts = [h('h2', { text: texts.slices })];
  if (table.which) parts.push(h('p', { class: 'pd-which', text: `${table.which} – ${table.circle}` }));
  if (table.kind === 'table') {
    parts.push(h('table', { class: 'pd-table' }, [
      h('thead', {}, [h('tr', {}, table.head.map((text, i) => h('th', { scope: 'col', class: i === 0 ? 'idx' : 'num', text })))]),
      h('tbody', {}, table.rows.map((row) => h('tr', {}, row.map((text, i) => h('td', { class: i === 0 ? 'idx' : 'num', text }))))),
    ]));
  } else if (table.kind === 'invalid') {
    parts.push(h('p', { class: 'pd-note' }, [h('span', { class: 'code', text: table.code }), document.createTextNode(` ${table.text}`)]));
  } else {
    parts.push(h('p', { class: 'pd-note', text: table.text }));
  }
  return h('section', { class: 'pd-section' }, parts);
}

const MATHML = 'http://www.w3.org/1998/Math/MathML';

/** A formula node of lib/sia-verification.js as a MathML element (no package, no image). */
function mathNode(node) {
  const el = document.createElementNS(MATHML, node.tag);
  if (node.text !== undefined) el.textContent = node.text;
  for (const child of node.children || []) el.append(mathNode(child));
  return el;
}

/** A <math> element for a formula (display: its own line, or inline inside a paragraph). */
function math(node, display) {
  const el = document.createElementNS(MATHML, 'math');
  if (display) el.setAttribute('display', 'block');
  el.append(mathNode(node));
  return el;
}

/** Section "Verification SIA 267" (SPEC_ETAPPE4 13b): partial factors, rule (text and formulas), the numbers of the chosen method, the table per method. */
function verificationSection(v) {
  const parts = [h('h2', { text: v.title })];
  // SPEC_ETAPPE4 13e: the head shows a single surface; say which surface this verification belongs to
  if (v.reference) parts.push(h('p', { class: 'pd-note pd-reference', text: v.reference }));
  // (a) the partial factors of soil and loads as calculated
  parts.push(h('h3', { text: v.factors.title }));
  parts.push(h('table', { class: 'pd-table pd-factors' }, [
    h('thead', {}, [h('tr', {}, v.factors.head.map((text) => h('th', { scope: 'col', class: 'num', text })))]),
    h('tbody', {}, [h('tr', {}, v.factors.values.map((text) => h('td', { class: 'num', text })))]),
  ]));
  // (b) the rule as text and as set formulas, then the same inequality with the numbers of the chosen method
  parts.push(h('h3', { text: v.rule.title }));
  parts.push(h('p', { class: 'pd-rule', text: v.rule.text[0] }));
  parts.push(h('div', { class: 'pd-math' }, v.rule.design.map((f) => math(f, true))));
  parts.push(h('p', { class: 'pd-rule', text: v.rule.text[1] }));
  parts.push(h('div', { class: 'pd-math' }, v.rule.check.map((f) => math(f, true))));
  parts.push(h('p', { class: 'pd-source', text: v.rule.source }));
  if (v.numbers) {
    parts.push(h('p', { class: 'pd-rule', text: v.numbers.title }));
    parts.push(h('p', { class: 'pd-numbers' }, [v.numbers.math ? math(v.numbers.math, false) : null, h('span', { class: 'pd-verdict', text: ` → ${v.numbers.verdict}` })]));
  }
  // (c) the verification per method as in the overview
  parts.push(h('h3', { text: v.methods.title }));
  if (v.methods.kind === 'table') {
    const cols = v.methods.head.length;
    parts.push(h('table', { class: 'pd-table pd-methods' }, [
      h('thead', {}, [h('tr', {}, v.methods.head.map((text, i) => h('th', { scope: 'col', class: i === 0 || i === cols - 1 ? 'txt' : 'num', text })))]),
      h('tbody', {}, v.methods.rows.map((row) => (row.cells
        ? h('tr', {}, row.cells.map((text, i) => h('td', { class: i === 0 || i === cols - 1 ? 'txt' : 'num', text })))
        : h('tr', {}, [h('td', { class: 'txt', text: row.name }), h('td', { class: 'txt', colspan: String(cols - 1), text: row.note })])))),
    ]));
  } else {
    parts.push(h('p', { class: 'pd-note', text: v.methods.text }));
  }
  return h('section', { class: 'pd-section pd-verification' }, parts);
}
