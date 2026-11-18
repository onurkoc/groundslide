// Start, state and wiring of the parts (SPEC_ETAPPE2 chapter 2).
// The model lives only in memory; the browser stores language and light/dark
// choice, never a model (chapter 4, chapter 9).

import { validateAll } from './lib/validate.js';
import { translate, loadLanguage, saveLanguage } from './lib/i18n.js';
import { loadTheme, saveTheme } from './lib/theme.js';
import { readModel, writeModel, createNewModel, fileNameFor, sketchFileNameFor } from './lib/model-io.js';
import { PNG_SCALE, prefixIds } from './lib/svg-export.js';
import { applyTranslations } from './ui/translate.js';
import { renderMessages } from './ui/messages.js';
import { initSplitter } from './ui/splitter.js';
import { icon } from './ui/widgets.js';
import { createInputs } from './ui/inputs.js';
import { createSketch } from './ui/sketch.js';
import { createTabs } from './ui/tabs.js';
import { createMenu } from './ui/menu.js';
import { createHistory, snapshotModel, modelFromSnapshot } from './lib/history.js';
import { fillPrintDocument, clearPrintDocument } from './ui/print-doc.js';
import { documentHead, documentTable, documentSupports, withSupportFactors } from './lib/result-document.js';
import { documentVerification } from './lib/sia-verification.js';
import { svgToPngBlob } from './ui/export-image.js';
import { renderOverview } from './ui/result-overview.js';
import { methodChoices, adoptableSurface } from './lib/result-view.js';
import { adoptSurface } from './lib/edit.js';
import { buildResultOverlay } from './lib/result-sketch.js';
import { renderSlices } from './ui/result-slices.js';
import { renderSupports } from './ui/result-supports.js';
import { resultHasSupportLists } from './lib/supports-result.js';
import { resolveSurface } from './lib/slices-table.js';
import { markBelowGround } from './lib/draw-snap.js';
import { createRunController } from './lib/run-controller.js';
import { initialResultState, reduceResult } from './lib/result-state.js';

/** The licence of GroundSlide (SPEC_ETAPPE4 13a): link in the header and line of the result document. */
const LICENCE_URL = 'https://github.com/onurkoc/groundslide/blob/main/LICENSE';

const VALIDATION_DELAY_MS = 300; // SPEC_ETAPPE2 5.2: one check per pause, not per keystroke

const $ = (id) => document.getElementById(id);

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const state = {
  lang: loadLanguage(storage, navigator.language),
  theme: loadTheme(storage),
  model: null,
  dirty: false,
  validation: { valid: true, errors: [] },
  status: [], // message descriptors of the last file or run action (info or error)
  running: false, // an analysis is running in the worker
  run: null, // last progress message { phase, done, total } of the running analysis
  // Result display (SPEC_ETAPPE2 7.1, 8): output of analyze() of the last finished run, chosen method, contour switch,
  // target and calculated slice table. Every change of the model (edit, New, Open) discards all of it (decision 10);
  // language, light/dark, zoom and saving do not. Changed only through dispatchResult(); rules in lib/result-state.js.
  rs: initialResultState(),
  /** output of analyze() of the last finished run, null before the first run and after any change of the model */
  get result() {
    return this.rs.result;
  },
};

/** Read-only view of the state. */
export const getState = () => state;

let inputs;
let sketch;
let controller;
let mainTabs; // right side: Sketch | Result (not saved anywhere)
let resultTabs; // inside Result: Overview, Slices, Messages
const history = createHistory(); // undo and redo of the model (SPEC_ETAPPE2 6.1); emptied by New and Open, not stored
let graphicMenu; // menu of "Export graphic": PNG or SVG
let validationTimer = null;

// ---------- rendering ----------

function validationMessages() {
  if (!state.model) return [];
  if (state.validation.valid) return [{ kind: 'ok', key: 'ui.msg.valid' }];
  return [
    { kind: 'error', key: 'ui.msg.invalid', params: { count: state.validation.errors.length } },
    ...state.validation.errors.map((e) => ({ kind: 'error', code: e.code, path: e.path, detail: e.message })),
  ];
}

function renderHeader() {
  const name = state.model && state.model.meta && typeof state.model.meta.name === 'string' ? state.model.meta.name : '';
  const shown = name.trim() === '' ? translate(state.lang, 'ui.model.unnamed') : name;
  $('model-name').textContent = shown;
  $('dirty-mark').hidden = !state.dirty;
  $('dirty-text').hidden = !state.dirty;
  $('btn-save').disabled = !state.model;
  document.title = `${state.dirty ? '* ' : ''}${shown} – GroundSlide`;
}

function renderMessageList() {
  const items = [...state.status, ...validationMessages()];
  renderMessages($('messages'), items, state.lang, (path) => {
    if (!state.running) inputs.focusPath(path); // the input is locked during a run
  });
  // number of errors and warnings on the tab, so that they are seen from the other tabs too
  const problems = items.filter((i) => i.kind === 'error' || i.kind === 'warn').length;
  const hasError = items.some((i) => i.kind === 'error');
  const badge = $('messages-badge');
  badge.hidden = problems === 0;
  badge.textContent = String(problems);
  badge.classList.toggle('is-error', hasError);
  // the same number on the tab Result, so that it is seen from the Sketch tab (SPEC_ETAPPE2 1.3)
  const outer = $('result-badge');
  outer.hidden = problems === 0;
  outer.replaceChildren(document.createTextNode(String(problems)), hiddenText(translate(state.lang, 'ui.tab.messages')));
  outer.classList.toggle('is-error', hasError);
}

/** Text for screen readers only, after a visible number. */
function hiddenText(text) {
  const span = document.createElement('span');
  span.className = 'visually-hidden';
  span.textContent = ` ${text}`;
  return span;
}

// ---------- result ----------

/** Change the result display by an action of lib/result-state.js and show it. */
function dispatchResult(action) {
  const next = reduceResult(state.rs, action);
  if (next === state.rs) return;
  state.rs = next;
  renderResult();
  // a new result, another method or another surface: the slice table of the open tab is calculated
  if (['run-done', 'select-method', 'select-target'].includes(action.type)) ensureSlices();
}

function renderResult() {
  renderDocButton();
  // mark on the tab Result as long as a result exists (SPEC_ETAPPE2 1.3)
  $('result-mark').hidden = state.result === null;
  $('result-mark-text').hidden = state.result === null;
  renderRunTime();
  renderOverview($('panel-overview'), {
    result: state.result,
    method: state.rs.method,
    lang: state.lang,
    onSelectMethod: (method) => dispatchResult({ type: 'select-method', method }),
    onAdopt: adoptGoverning,
  });
  renderSlicesPanel();
  renderSupportsPanel();
  renderSketchResult();
}

function renderSlicesPanel() {
  renderSlices($('panel-slices'), {
    result: state.result,
    method: state.rs.method,
    target: state.rs.target,
    slices: state.rs.slices,
    running: state.running,
    lang: state.lang,
    onSelectTarget: (target) => dispatchResult({ type: 'select-target', target }),
  });
}

/**
 * "Take over as single surface" (SPEC_ETAPPE4 13): the governing surface of the method (a circle or the polyline of search A) is appended to
 * the model as a new single surface with the next free id. One step of the history; like every change of the model it discards the result.
 */
function adoptGoverning(method) {
  if (state.running || !state.result) return;
  const surface = adoptableSurface(state.result, method);
  if (surface) changeModel((m) => adoptSurface(m, surface));
}

/**
 * Tab "Supports" (SPEC_ETAPPE3 10): only while the result holds lists of supports; the table of the circle that the tab Slices shows.
 * A result without supports hides the tab (and leaves it when it was the open one).
 */
function renderSupportsPanel() {
  const has = resultHasSupportLists(state.result);
  $('tab-supports').hidden = !has;
  if (!has && resultTabs && resultTabs.current === 'supports') resultTabs.select('overview');
  renderSupports($('panel-supports'), {
    result: state.result,
    method: state.rs.method,
    target: state.rs.target,
    lang: state.lang,
    onSelectTarget: (target) => dispatchResult({ type: 'select-target', target }),
  });
}

let slicesRequest = null; // { key, promise } of the slice table that is being calculated

/**
 * Calculate the slice table of the chosen surface in the worker (SPEC_ETAPPE2 8.3) when a result exists and no run is
 * going; once per surface (the request is remembered by its key). It is calculated whichever tab is shown, so that the
 * result document (8.5) has it, also for Ctrl+P. Returns a promise that is settled when the table of the surface chosen
 * now is in the state, or at once when there is nothing to calculate.
 */
function ensureSlices() {
  if (state.running || !state.result) return Promise.resolve();
  const target = resolveSurface(state.result, state.rs.method, state.rs.target);
  if (!target.surface) return Promise.resolve();
  const { key, surface: wanted } = target; // a circle or a polyline (SPEC_ETAPPE4 13)
  if (state.rs.slices && state.rs.slices.key === key) return slicesRequest && slicesRequest.key === key ? slicesRequest.promise : Promise.resolve(); // calculated, or being calculated
  const model = state.model;
  const stillWanted = () => {
    const now = state.result ? resolveSurface(state.result, state.rs.method, state.rs.target) : null;
    return now !== null && now.key === key;
  };
  dispatchResult({ type: 'slices', key, data: { status: 'loading' } });
  const promise = controller.surface(model, wanted).then(
    (surface) => {
      if (stillWanted()) dispatchResult({ type: 'slices', key, data: surface.valid === true ? { status: 'ok', result: surface } : { status: 'invalid', result: surface } });
    },
    (error) => {
      if (error && error.cancelled) {
        // the worker was replaced (a run was cancelled): ask again when no run is going
        if (stillWanted()) {
          dispatchResult({ type: 'slices-reset' });
          return ensureSlices();
        }
        return undefined;
      }
      if (stillWanted()) dispatchResult({ type: 'slices', key, data: { status: 'error', code: error.code, message: error.message } });
      return undefined;
    },
  );
  slicesRequest = { key, promise };
  return promise;
}

/** Circles, contour and labels of the result in the sketch; nothing without a result. */
function renderSketchResult() {
  const grid = state.model && state.model.search ? state.model.search.grid : null;
  const overlay = buildResultOverlay(state.result, { method: state.rs.method, contour: state.rs.contour, grid, tensionCrack: state.model ? state.model.tensionCrack : null });
  // the governing method is chosen here and in the overview: both read state.rs.method and change it through the same action
  const methods = methodChoices(state.result);
  const methodChoice = methods.length ? { methods, method: state.rs.method, onChange: (method) => dispatchResult({ type: 'select-method', method }) } : null;
  sketch.setOverlay(overlay, { contourOn: state.rs.contour, onContourChange: (on) => dispatchResult({ type: 'set-contour', on }), methodChoice });
}

// ---------- run: button, lock, progress ----------

/** "Run" / "Cancel" button and the hint beside it. */
function renderRunButton() {
  const btn = $('btn-run');
  const label = btn.querySelector('[data-i18n]');
  const hint = $('run-hint');
  btn.querySelector('.icon')?.remove();
  btn.prepend(icon(state.running ? 'stop' : 'play'));
  btn.className = state.running ? 'btn btn-danger' : 'btn btn-primary';
  label.setAttribute('data-i18n', state.running ? 'ui.run.cancel' : 'ui.run');
  btn.setAttribute('data-i18n-title', state.running ? 'ui.run.cancelTitle' : 'ui.run.title');
  btn.disabled = !state.running && !(state.model && state.validation.valid);
  hint.hidden = state.running || btn.disabled === false;
  applyTranslations(btn.parentElement, state.lang);
}

/** "Result document": usable with a result (not during a run), else locked (SPEC_ETAPPE2 8.5). */
function renderDocButton() {
  $('btn-doc').disabled = state.result === null || state.running;
}

/** Time of the last run, beside the tabs (SPEC_ETAPPE2 7.1): visible in Sketch and Result, not during a run. */
function renderRunTime() {
  const el = $('run-time');
  const show = !state.running && state.result !== null && state.rs.timeMs !== null;
  el.hidden = !show;
  el.textContent = show ? translate(state.lang, 'ui.msg.runDone', { seconds: (state.rs.timeMs / 1000).toFixed(1) }) : '';
}

/** Progress bar of the grid phase, then the undetermined bar "Refining …". */
function renderRunProgress() {
  const box = $('run-progress');
  box.hidden = !state.running;
  if (!state.running) return;
  const bar = $('run-bar');
  const text = $('run-progress-text');
  const p = state.run;
  if (p && p.phase === 'grid') {
    bar.max = p.total;
    bar.value = p.done;
    text.textContent = translate(state.lang, 'ui.run.grid', { done: p.done, total: p.total });
  } else {
    bar.removeAttribute('value'); // undetermined
    text.textContent = translate(state.lang, p && p.phase === 'refine' ? 'ui.run.refine' : p && p.phase === 'optimize' ? 'ui.run.optimize' : 'ui.run.starting');
  }
}

/** Lock or release the input, New and Open. Save, language and light/dark stay usable. */
function setRunning(running) {
  state.running = running;
  if (!running) state.run = null;
  $('inputs').inert = running;
  $('inputs').classList.toggle('is-locked', running);
  $('btn-new').disabled = running;
  $('btn-open').disabled = running;
  $('btn-graphic').disabled = running; // the graphic export is locked during a run (SPEC_ETAPPE2 8.4)
  renderHistory();
  renderDocButton();
  sketch.redraw(); // the handles are locked during a run
  if (running) graphicMenu.close();
  renderRunButton();
  renderRunProgress();
  renderRunTime();
  renderSlicesPanel();
}

function startRun() {
  if (state.running || !state.model) return;
  runValidation(); // the model as it is now, not as it was 300 ms ago
  if (!state.validation.valid) return;
  state.status = [];
  state.run = null;
  setRunning(true);
  renderMessageList();
  controller.start(state.model); // a failure to start comes back through onError
}

function onRunProgress(progress) {
  state.run = progress;
  renderRunProgress();
}

function onRunResult(result, { timeMs }) {
  dispatchResult({ type: 'run-done', result: markBelowGround(result, state.model), timeMs }); // the text of I_OUT_OF_MODEL for a polyline below the ground (SPEC_ETAPPE4 13c)
  setRunning(false);
  state.status = []; // the time of the run is shown with the result
  if (resultTabs.current === 'messages') resultTabs.select('overview');
  renderMessageList();
  ensureSlices();
}

function onRunError({ code, message }) {
  setRunning(false);
  state.status = [{ kind: 'error', code, params: { message } }];
  // an error must be seen (SPEC_ETAPPE2 1.3, version 1.10): Result > Messages, whichever tab was open. Success and Cancel do not switch.
  resultTabs.select('messages');
  mainTabs.select('result');
  renderMessageList();
  ensureSlices();
}

function onRunCancel() {
  setRunning(false);
  state.status = [{ kind: 'info', key: 'ui.msg.runCancelled' }];
  renderMessageList();
  ensureSlices();
}

function renderToggles() {
  for (const b of document.querySelectorAll('#lang-switch [data-lang]')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  }
  for (const b of document.querySelectorAll('#theme-switch [data-theme-choice]')) {
    b.setAttribute('aria-pressed', String(b.dataset.themeChoice === state.theme));
  }
}

function renderAll() {
  document.documentElement.lang = state.lang;
  applyTranslations(document, state.lang);
  renderToggles();
  inputs.render();
  sketch.relocalize();
  renderHeader();
  renderRunButton();
  renderRunProgress();
  renderResult();
  renderMessageList();
}

// ---------- model ----------

/** Check the model now: core, single circles, unreadable fields. */
function runValidation() {
  clearTimeout(validationTimer);
  validationTimer = null;
  state.validation = validateAll(state.model, inputs.inputErrors());
  inputs.applyErrors(state.validation.errors);
  renderRunButton();
  renderMessageList();
}

/** One check after a pause of 300 ms, or at once. */
function scheduleValidation(immediate) {
  clearTimeout(validationTimer);
  if (immediate) runValidation();
  else validationTimer = setTimeout(runValidation, VALIDATION_DELAY_MS);
}

/** Replace the model (new, opened). `dirty` is false for a fresh or loaded model. The sketch is fitted. */
export function setModel(model, { dirty = false, status = [] } = {}) {
  state.model = model;
  state.dirty = dirty;
  state.status = status;
  dispatchResult({ type: 'model-changed' }); // New and Open discard the result
  mainTabs.select('sketch'); // start, New and Open show the sketch (SPEC_ETAPPE2 1.3)
  inputs.reset();
  history.clear(); // New and Open empty the list of steps
  sketch.update(state.model);
  sketch.fit();
  renderHeader();
  renderHistory();
  runValidation();
}

/**
 * Apply an edit to the model: marks it as changed, the sketch follows at once. The check follows separately. The edit is
 * one step of the history; the keystrokes in one text field are one step (group = the path of the field).
 */
function applyEdit(mutate) {
  const before = snapshotModel(state.model);
  mutate(state.model);
  const active = document.activeElement;
  const typing = active && active.dataset && active.dataset.path && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text')) ? active.dataset.path : null;
  if (snapshotModel(state.model) !== before) history.record(before, typing);
  modelEdited();
  renderHistory();
}

/** After any edit of the model (input, mouse): the result is discarded (7.1), the model counts as changed, sketch and header follow. */
function modelEdited() {
  dispatchResult({ type: 'model-changed' }); // any edit discards the result and the slice table
  state.dirty = true;
  sketch.update(state.model);
  renderHeader();
}

// ---------- editing with the mouse in the sketch (SPEC_ETAPPE2 6.1) ----------

let moveBefore = null; // state of the model when a move or an edit of the sketch began
let inputsTimer = null;

/** The input areas follow a move, at most once per frame (they are built again each time). */
function scheduleInputs() {
  if (inputsTimer !== null) return;
  inputsTimer = requestAnimationFrame(() => {
    inputsTimer = null;
    inputs.render();
  });
}

/** What the sketch needs to change the model (lib/handles.js decides what; this part keeps result, history and check in order). */
const sketchEdit = {
  canEdit: () => !state.running && state.model !== null,
  focusPath: (path) => { if (!state.running) inputs.focusPath(path); }, // the area and field to open after a drawing (a new layer: its material)
  stash: () => inputs.stash, // bond values of a nail that the input areas keep (SPEC_ETAPPE3 8); the field of a support in the sketch uses them too
  begin() {
    if (state.running || !state.model) return false;
    moveBefore = snapshotModel(state.model);
    return true;
  },
  change(mutate) {
    mutate(state.model);
    modelEdited(); // the first change discards the result (7.1)
    scheduleInputs();
    scheduleValidation(false); // the error of an invalid position shows after the pause, and at the end at once
  },
  end() {
    if (moveBefore !== null && snapshotModel(state.model) !== moveBefore) history.record(moveBefore); // one step: pressing to releasing
    moveBefore = null;
    history.breakGroup();
    renderHistory();
    inputs.render();
    runValidation();
  },
  commit(mutate) {
    if (!this.begin()) return;
    this.change(mutate);
    this.end();
  },
};

/** The buttons of the sketch follow the history; they are locked during a run, like the input. */
function renderHistory() {
  sketch.setHistory({
    canUndo: history.canUndo && !state.running,
    canRedo: history.canRedo && !state.running,
    onUndo: () => stepHistory('undo'),
    onRedo: () => stepHistory('redo'),
  });
}

/**
 * Go one step back or forward (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, the two buttons). The model is replaced by the earlier or later
 * state: the result is discarded and not brought back (7.1), the model counts as changed since it was saved. Fields the
 * app does not know and the values the input areas remember stay, because the whole model is the state.
 */
function stepHistory(direction) {
  if (state.running || !state.model) return false;
  const current = snapshotModel(state.model);
  const target = direction === 'undo' ? history.undo(current) : history.redo(current);
  if (target === null) return false;
  state.model = modelFromSnapshot(target);
  dispatchResult({ type: 'model-changed' });
  state.dirty = true;
  inputs.clearInvalid();
  inputs.render();
  sketch.update(state.model);
  renderHeader();
  renderHistory();
  runValidation();
  return true;
}

/** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for the model, but not while the caret is in a field: there Ctrl+Z belongs to the text of the field. */
function onHistoryKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const target = e.target;
  if (target && target.closest && target.closest('input, textarea, select, [contenteditable]')) return;
  const key = e.key.toLowerCase();
  const direction = key === 'z' && !e.shiftKey ? 'undo' : key === 'y' || (key === 'z' && e.shiftKey) ? 'redo' : null;
  if (direction === null) return;
  e.preventDefault();
  stepHistory(direction);
}

/** Change the model in place from outside the input parts: marks it as changed, check after 300 ms. */
export function changeModel(mutate) {
  applyEdit(mutate);
  inputs.render();
  scheduleValidation(false);
}

function confirmDiscard() {
  return !state.dirty || window.confirm(translate(state.lang, 'ui.confirm.discard'));
}

// ---------- file: new, open, save ----------

function newModel() {
  if (!confirmDiscard()) return;
  setModel(createNewModel(state.lang), { status: [{ kind: 'info', key: 'ui.msg.created' }] });
}

function openDialog() {
  if (!confirmDiscard()) return;
  $('file-input').click();
}

async function openFile(file) {
  if (state.running) return;
  let text;
  try {
    text = await file.text();
  } catch {
    state.status = [{ kind: 'error', code: 'APP_FILE_READ' }];
    renderMessageList();
    return;
  }
  const result = readModel(text, state.lang);
  if (!result.ok) {
    // the current model stays as it is
    state.status = [{ kind: 'error', code: result.error.code, params: result.error.params }];
    renderMessageList();
    return;
  }
  const name = typeof result.model.meta?.name === 'string' && result.model.meta.name.trim() !== '' ? result.model.meta.name : file.name;
  setModel(result.model, { status: [{ kind: 'info', key: 'ui.msg.opened', params: { name } }] });
}

/** Offer a text (or a Blob) as a download. */
function download(fileName, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function saveFile() {
  if (!state.model) return;
  const fileName = fileNameFor(state.model);
  download(fileName, writeModel(state.model));
  state.dirty = false;
  state.status = [{ kind: 'info', key: 'ui.msg.saved', params: { file: fileName } }];
  renderHeader();
  renderMessageList();
}

/**
 * Export of the sketch as a graphic (SPEC_ETAPPE2 8.4): "png" or "svg". The drawing is made by the sketch itself
 * (sketch.exportSvg); nothing on the screen changes. A failure is shown as a message, the page stays usable.
 */
async function exportGraphic(format) {
  if (state.running || !state.model) return;
  try {
    const drawing = sketch.exportSvg();
    const fileName = sketchFileNameFor(state.model, format);
    if (format === 'svg') download(fileName, drawing.text, 'image/svg+xml');
    else download(fileName, await svgToPngBlob(drawing.text, drawing.width, drawing.height, PNG_SCALE), 'image/png');
    state.status = [{ kind: 'info', key: 'ui.msg.exported', params: { file: fileName } }];
  } catch (e) {
    state.status = [{ kind: 'error', code: 'APP_EXPORT_FAILED', params: { message: e && e.message ? e.message : String(e) } }];
  }
  renderMessageList();
}

/**
 * Result document (SPEC_ETAPPE2 8.5): waits for the slice table of the surface that the tab Slices shows, then opens the
 * print dialog of the browser. The print view is filled by buildPrintDocument() just before printing ("beforeprint"),
 * which Ctrl+P triggers as well, and emptied again afterwards; model, result, tab and sketch stay as they are.
 */
async function openDocument() {
  if (state.result === null || state.running) return;
  await ensureSlices();
  window.print();
}

function buildPrintDocument() {
  if (state.result === null) return; // without a result the page prints as it is
  const t = (key, params) => translate(state.lang, key, params);
  let svgText = null;
  try {
    svgText = prefixIds(sketch.pageSvg().text, 'pd-');
  } catch {
    svgText = null; // the document is still printed, without the graphic
  }
  const doc = {
    head: documentHead({ model: state.model, result: state.result, method: state.rs.method, target: state.rs.target, now: new Date(), t }),
    svgText,
    table: documentTable({ result: state.result, method: state.rs.method, target: state.rs.target, slices: state.rs.slices, t }),
    supports: documentSupports({ result: state.result, method: state.rs.method, target: state.rs.target, t }),
    verification: documentVerification({ model: state.model, result: state.result, method: state.rs.method, t }), // mode sia only (SPEC_ETAPPE4 13b)
    texts: { dateTime: t('ui.doc.dateTime'), method: t('ui.doc.method'), slices: t('ui.doc.slices'), supports: t('ui.doc.supports'), sketch: t('ui.doc.sketch'), licence: t('ui.doc.licence', { url: LICENCE_URL }) },
  };
  doc.supports = withSupportFactors(doc.supports, state.model); // mode sia: two more columns γ_M and γ_A (SPEC_ETAPPE4 13b)
  fillPrintDocument($('print-doc'), doc);
}

// ---------- language and light/dark ----------

function setLanguage(lang) {
  state.lang = lang;
  saveLanguage(storage, lang);
  renderAll();
}

function applyTheme() {
  if (state.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

function setTheme(theme) {
  state.theme = theme;
  saveTheme(storage, theme);
  applyTheme();
  renderToggles();
}

// ---------- start ----------

$('btn-new').addEventListener('click', newModel);
$('btn-open').addEventListener('click', openDialog);
$('btn-save').addEventListener('click', saveFile);
$('btn-doc').addEventListener('click', openDocument);
window.addEventListener('beforeprint', buildPrintDocument);
document.addEventListener('keydown', onHistoryKey);
document.addEventListener('focusout', () => history.breakGroup()); // leaving a field ends the group of its keystrokes
window.addEventListener('afterprint', () => clearPrintDocument($('print-doc')));
$('btn-run').addEventListener('click', () => (state.running ? controller.cancel() : startRun()));
$('file-input').addEventListener('change', (e) => {
  const [file] = e.target.files;
  e.target.value = ''; // the same file can be opened again
  if (file) openFile(file);
});
for (const b of document.querySelectorAll('#lang-switch [data-lang]')) {
  b.addEventListener('click', () => setLanguage(b.dataset.lang));
}
for (const b of document.querySelectorAll('#theme-switch [data-theme-choice]')) {
  b.addEventListener('click', () => setTheme(b.dataset.themeChoice));
}
window.addEventListener('beforeunload', (e) => {
  if (!state.dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

for (const el of document.querySelectorAll('[data-icon]')) el.prepend(icon(el.dataset.icon));

graphicMenu = createMenu({ button: $('btn-graphic'), menu: $('graphic-menu'), onSelect: exportGraphic });
initSplitter($('splitter'), $('layout'));
sketch = createSketch({ container: $('sketch'), getLang: () => state.lang, edit: sketchEdit });
mainTabs = createTabs({ list: $('main-tabs'), panels: $('main-panels'), onSelect: () => ensureSlices() });
resultTabs = createTabs({ list: $('result-tabs'), panels: $('result-panels'), onSelect: () => ensureSlices() });
controller = createRunController({
  createWorker: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
  onProgress: onRunProgress,
  onResult: onRunResult,
  onError: onRunError,
  onCancel: onRunCancel,
});
inputs = createInputs({
  root: document,
  getModel: () => state.model,
  getLang: () => state.lang,
  onEdit: applyEdit,
  onValidate: scheduleValidation,
});
applyTheme();
applyTranslations(document, state.lang);
renderToggles();
setModel(createNewModel(state.lang), { status: [] });
renderAll();
