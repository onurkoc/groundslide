// Page structure and styles of the result display (SPEC_ETAPPE2 1.3, 8): tabs, ids, texts used by the
// interface parts exist in both languages, contrast of the colour pairs added for the result.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');
const html = read('app', 'index.html');
const css = read('app', 'style.css');

test('index.html: tabs Overview, Slices, Supports, Messages (inside the tab Result), each with its panel; the message list is in the Messages tab', () => {
  const list = html.slice(html.indexOf('id="result-tabs"'), html.indexOf('id="result-panels"'));
  const tabs = [...list.matchAll(/<button[^>]*role="tab"[^>]*data-tab="(\w+)"[^>]*aria-controls="([\w-]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs, [['overview', 'panel-overview'], ['slices', 'panel-slices'], ['supports', 'panel-supports'], ['messages', 'panel-messages']]); // Supports: SPEC_ETAPPE3 10
  for (const [name, panel] of tabs) {
    assert.match(html, new RegExp(`<div role="tabpanel"[^>]*id="${panel}"[^>]*data-panel="${name}"[^>]*aria-labelledby="tab-${name}"`), panel);
    assert.match(html, new RegExp(`id="tab-${name}"`));
  }
  const messagesPanel = html.slice(html.indexOf('id="panel-messages"'));
  assert.ok(messagesPanel.indexOf('id="messages"') > 0 && messagesPanel.indexOf('id="messages"') < messagesPanel.indexOf('</section>'));
  assert.equal([...html.matchAll(/id="messages"/g)].length, 1, 'the message list exists once');
  assert.equal(list.match(/aria-selected="true"/g).length, 1, 'one selected tab in this list');
  assert.equal(html.match(/aria-selected="true"/g).length, 2, 'one per list: Sketch and Overview');
});

/** Literal interface keys 'ui.xxx' in the sources of the interface parts. */
function usedKeys(files) {
  const keys = new Set();
  for (const f of files) for (const m of read(...f.split('/')).matchAll(/['"`](ui\.[a-zA-Z0-9_.]+)['"`]/g)) keys.add(m[1]);
  return keys;
}
const uiFiles = ['app/main.js', ...readdirSync(path.join(root, 'app', 'ui')).map((n) => `app/ui/${n}`)];

test('every literal interface key used in main.js and app/ui exists in German and English', () => {
  const keys = usedKeys(uiFiles);
  assert.ok(keys.size > 40, `keys found: ${keys.size}`);
  const missing = [];
  for (const k of keys) for (const lang of ['de', 'en']) if (!Object.hasOwn(MESSAGES[lang], k)) missing.push(`${lang}:${k}`);
  assert.deepEqual(missing, []);
});

test('keys built from the method name exist for all four methods in both languages', () => {
  for (const lang of ['de', 'en']) {
    for (const m of ['bishop', 'janbu', 'janbuCorrected', 'spencer']) assert.ok(MESSAGES[lang][`ui.method.${m}`], `${lang}:${m}`);
  }
});

// order 27 (SPEC_ETAPPE4 13a): the fixed note of SPEC_ETAPPE2 8.1 is gone, and no text of the app names another program
test('the fixed note is gone in both languages; no interface text names Slide2', () => {
  for (const lang of ['de', 'en']) {
    assert.equal(Object.hasOwn(MESSAGES[lang], 'ui.result.disclaimer'), false, lang);
    for (const [key, text] of Object.entries(MESSAGES[lang])) assert.doesNotMatch(text, /Slide2/i, `${lang}:${key}`);
  }
});

// --- contrast of the colour pairs of the result (WCAG 2.1, 4.5:1) ---

const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}\n', css.indexOf(':root {')));
function variables() {
  const light = {};
  const dark = {};
  for (const m of rootBlock.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const v = m[2].trim();
    const ld = v.match(/^light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)$/);
    if (ld) { light[m[1]] = ld[1]; dark[m[1]] = ld[2]; }
    else if (/^#[0-9a-fA-F]{6}$/.test(v)) { light[m[1]] = v; dark[m[1]] = v; }
  }
  return { light, dark };
}
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const mix = (a, b, share) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v * share + pb[i] * (1 - share)).toString(16).padStart(2, '0')).join('');
};

test('text on the highlighted table row (accent-soft) and the badges reaches 4.5:1 in light and dark', () => {
  const { light, dark } = variables();
  const failures = [];
  for (const [mode, v] of [['light', light], ['dark', dark]]) {
    const soft = mix(v['color-accent'], v['color-surface'], 0.14); // --color-accent-soft
    const pairs = [
      ['text on selected row', v['color-text'], soft],
      ['warn badge', v['color-warn'], v['color-warn-bg']],
      ['error badge', v['color-error'], v['color-error-bg']],
      ['verdict ok', v['color-ok'], v['color-ok-bg']],
      ['verdict not ok', v['color-error'], v['color-error-bg']],
      ['info note', v['color-info'], v['color-info-bg']],
    ];
    for (const [name, fg, bg] of pairs) if (contrast(fg, bg) < 4.5) failures.push(`${mode}: ${name} ${contrast(fg, bg).toFixed(2)}`);
  }
  assert.deepEqual(failures, []);
});
