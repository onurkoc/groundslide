// The input areas (SPEC_ETAPPE2 5): builds the bodies of the <details>, writes
// edits to the model through `onEdit`, shows errors at the areas and fields, and
// jumps from an error message to its field.

import { translate } from '../lib/i18n.js';
import { SECTIONS, countBySection, sectionForPath, partialFactorsVisible, supportFactorsVisible } from '../lib/paths.js';
import { supportCount } from '../lib/supports-edit.js';
import { formatNumber } from '../lib/numbers.js';
import { buildProject, buildGround, buildBottom, buildMaterials, buildLayers, buildWater, buildLoads, buildSeismic, buildTensionCrack } from './sections-model.js';
import { buildSupports } from './sections-supports.js';
import { buildAnalysis, buildPartialFactors, buildSearch, buildSurfaces } from './sections-analysis.js';

const BUILDERS = {
  project: buildProject,
  ground: buildGround,
  bottom: buildBottom,
  materials: buildMaterials,
  layers: buildLayers,
  water: buildWater,
  loads: buildLoads,
  supports: buildSupports,
  seismic: buildSeismic,
  tensionCrack: buildTensionCrack,
  analysis: buildAnalysis,
  partialFactors: buildPartialFactors,
  search: buildSearch,
  surfaces: buildSurfaces,
};

const FOCUSABLE = 'input:not([readonly]), select, textarea, button';

/**
 * root       the page (contains <details data-section="...">)
 * getModel   current model
 * getLang    current language
 * onEdit     (mutate) apply an edit to the model (dirty, sketch, header)
 * onValidate (immediate) ask for a check of the model (after 300 ms, or at once)
 */
export function createInputs({ root, getModel, getLang, onEdit, onValidate }) {
  const invalid = new Map(); // path -> { text, code }: unreadable fields of this session
  const stash = {}; // last water line / search of this session, restored when switched on again
  let lastErrors = [];
  let marked = [];

  const t = (key, params) => translate(getLang(), key, params);

  const panels = Object.fromEntries(SECTIONS.map((id) => {
    const details = root.querySelector(`details[data-section="${id}"]`);
    return [id, { details, body: details.querySelector('.panel-body'), info: details.querySelector('.summary-info'), badge: details.querySelector('.summary-errors') }];
  }));

  // ---------- marks ----------

  function setMark(el, texts) {
    const target = el.closest('.field') || el;
    const on = texts.length > 0;
    target.classList.toggle('is-invalid', on);
    if (el.matches('input, select, textarea')) {
      if (on) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    const line = Array.from(target.children).find((c) => c.classList.contains('field-error'));
    if (line) {
      line.hidden = !on;
      line.textContent = texts.join(' ');
    } else if (on) {
      el.title = texts.join('\n');
    } else if (el.title && el.dataset.hadTitle !== '1') {
      el.removeAttribute('title');
    }
    if (on) marked.push(el);
  }

  /** Immediate mark of a field after typing (the check of the model follows after the pause). */
  function markInput(input, code) {
    setMark(input, code ? [translate(getLang(), code)] : []);
  }

  function applyErrors(errors) {
    lastErrors = errors;
    for (const el of marked) setMark(el, []);
    marked = [];
    const byPath = new Map();
    for (const e of errors) {
      if (!byPath.has(e.path)) byPath.set(e.path, []);
      byPath.get(e.path).push(translate(getLang(), e.code));
    }
    for (const el of root.querySelectorAll('.panel-body [data-path]')) {
      const texts = byPath.get(el.dataset.path);
      if (texts) setMark(el, [...new Set(texts)]);
    }
    refreshVisibility();
    const counts = countBySection(errors);
    for (const id of SECTIONS) {
      const n = counts[id];
      const badge = panels[id].badge;
      badge.hidden = n === 0;
      badge.textContent = n === 0 ? '' : t(n === 1 ? 'ui.sum.error1' : 'ui.sum.errors', { n });
    }
  }

  // ---------- summaries and visibility ----------

  function summary(id, m) {
    const count = (list, one, many) => (Array.isArray(list) ? t(list.length === 1 ? one : many, { n: list.length }) : '');
    switch (id) {
      case 'ground': return count(m.ground, 'ui.sum.point1', 'ui.sum.points');
      case 'bottom': return typeof m.bottom === 'number' ? `${formatNumber(m.bottom)} m` : '';
      case 'materials': return m.materials && typeof m.materials === 'object' ? count(Object.keys(m.materials), 'ui.sum.material1', 'ui.sum.materials') : '';
      case 'layers': return count(m.layers, 'ui.sum.layer1', 'ui.sum.layers');
      case 'water': return m.water === null || m.water === undefined ? t('ui.sum.off') : count(m.water, 'ui.sum.point1', 'ui.sum.points');
      case 'loads': return count(m.loads, 'ui.sum.load1', 'ui.sum.loads');
      case 'supports': {
        const n = supportCount(m);
        return n === 0 ? '' : t(n === 1 ? 'ui.sum.support1' : 'ui.sum.supports', { n });
      }
      case 'seismic': {
        const kh = typeof m.seismic?.kh === 'number' ? `k_h = ${formatNumber(m.seismic.kh)}` : '';
        return typeof m.seismic?.kv === 'number' && m.seismic.kv !== 0 ? `${kh}${kh ? ', ' : ''}k_v = ${formatNumber(m.seismic.kv)}` : kh;
      }
      case 'tensionCrack': return m.tensionCrack === null || m.tensionCrack === undefined ? t('ui.sum.off') : typeof m.tensionCrack.depth === 'number' ? `${formatNumber(m.tensionCrack.depth)} m` : '';
      case 'analysis': return m.analysis?.mode === 'sia' ? t('ui.an.sia') : m.analysis?.mode === 'characteristic' ? t('ui.an.characteristic') : '';
      case 'partialFactors': return typeof m.partialFactors?.R === 'number' ? `γ_R = ${formatNumber(m.partialFactors.R)}` : '';
      case 'search': {
        if (m.search === null || m.search === undefined) return t('ui.sum.off');
        const g = m.search && m.search.grid;
        return g && typeof g.nx === 'number' && typeof g.nz === 'number' ? `${formatNumber(g.nx)} × ${formatNumber(g.nz)}` : '';
      }
      case 'surfaces': return count(m.surfaces, 'ui.sum.surface1', 'ui.sum.surfaces');
      default: return '';
    }
  }

  function refreshSummaries() {
    const m = getModel();
    for (const id of SECTIONS) panels[id].info.textContent = summary(id, m);
  }

  /** Partial factors: mode "sia", or an error in the area (then with the note "used only in mode sia"). */
  function refreshVisibility() {
    const mode = getModel().analysis?.mode;
    const errorCount = countBySection(lastErrors).partialFactors;
    panels.partialFactors.details.hidden = !partialFactorsVisible(mode, errorCount);
    const note = panels.partialFactors.body.querySelector('[data-pf-note]');
    if (note) note.hidden = mode === 'sia';
    // columns of the partial factors of the supports: mode sia, or an error at one of them (SPEC_ETAPPE3 8)
    const root = panels.supports.body.querySelector('[data-supports-root]');
    if (root) root.classList.toggle('show-factors', supportFactorsVisible(mode, lastErrors));
  }

  // ---------- building ----------

  const ctx = {
    model: getModel,
    t,
    invalid,
    stash,
    errors: () => lastErrors,
    markInput,
    edit,
    renderSections,
    revalidate: () => onValidate(true),
  };

  function findByPath(path) {
    for (const el of root.querySelectorAll('.panel-body [data-path]')) if (el.dataset.path === path) return el;
    return null;
  }

  function focusFirst(candidates) {
    for (const path of candidates) {
      const el = findByPath(path);
      if (el && !el.hidden) {
        (el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE) || el).focus();
        return true;
      }
    }
    return false;
  }

  function renderSections(ids = SECTIONS, focus = []) {
    const active = document.activeElement;
    const activePath = active && active.dataset ? active.dataset.path : null;
    for (const id of ids) {
      const nodes = BUILDERS[id](ctx).flat();
      panels[id].body.replaceChildren(...nodes);
    }
    refreshSummaries();
    refreshVisibility();
    applyErrors(lastErrors);
    const wanted = [...focus, ...(activePath ? [activePath] : [])];
    if (wanted.length) focusFirst(wanted);
  }

  /** Edit from a field. opts: structural (rebuild `scope`), clearInvalid (path prefixes), focus (paths or function returning them). */
  function edit(mutate, opts = {}) {
    if (opts.clearInvalid) {
      for (const key of [...invalid.keys()]) if (opts.clearInvalid.some((p) => key.startsWith(p))) invalid.delete(key);
    }
    onEdit(mutate);
    if (opts.structural) {
      const focus = typeof opts.focus === 'function' ? opts.focus() : opts.focus || [];
      renderSections(opts.scope || SECTIONS, focus);
      onValidate(true);
    } else {
      refreshSummaries();
      refreshVisibility();
      onValidate(false);
    }
  }

  // ---------- from the message list to the field ----------

  /** Open the area of an error path and put the focus on the field (or row, or table) it points to. */
  function focusPath(path) {
    const id = sectionForPath(path);
    if (!id || panels[id].details.hidden) return false;
    const { details, body } = panels[id];
    details.open = true;
    let el = findByPath(path);
    const openAround = (node) => { for (let d = node && node.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; };
    // a path below a table row or group that has no element of its own: use the row or table
    let p = path;
    while (!el && /[.[]/.test(p)) {
      p = p.replace(/(\[\d+\]|\.[^.[\]]+)$/, '');
      el = findByPath(p);
    }
    const target = el ? (el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE) || el) : body.querySelector(FOCUSABLE) || details.querySelector('summary');
    openAround(target); // a table of points inside the area (polyline of a single surface) is opened too
    target.scrollIntoView({ block: 'nearest' });
    target.focus();
    return true;
  }

  /** Forget the unreadable texts of the fields (the model was replaced by an earlier or later state; the remembered values of the session stay). */
  function clearInvalid() {
    invalid.clear();
    lastErrors = [];
  }

  function reset() {
    invalid.clear();
    for (const key of Object.keys(stash)) delete stash[key];
    lastErrors = [];
    marked = [];
    renderSections(SECTIONS, []);
  }

  return {
    render: () => renderSections(SECTIONS, []),
    reset,
    clearInvalid,
    /** What the inputs remember within the session (water line, search, nail bond values); emptied by New and Open. */
    stash,
    applyErrors,
    focusPath,
    refresh: () => { refreshSummaries(); refreshVisibility(); },
    inputErrors: () => [...invalid].map(([path, { code }]) => ({ code, message: '', path })),
  };
}
