// Checks of the app scaffold against SPEC_ETAPPE2 chapters 1.3 and 2:
// colours only in :root, contrast WCAG 2.1 AA, no external resources,
// page ids and imports consistent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_STORAGE_KEY } from '../../app/lib/theme.js';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// line endings: a checkout on Windows may convert LF to CRLF
const read = (...p) => readFileSync(path.join(root, 'app', ...p), 'utf8').replaceAll('\r\n', '\n');

const css = read('style.css');
const html = read('index.html');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// first rule: ":root { ... }" (ends at the first line that is just "}")
const rootStart = css.indexOf(':root {');
const rootEnd = css.indexOf('\n}\n', rootStart);
const rootBlock = stripComments(css.slice(rootStart, rootEnd + 3));
const rest = stripComments(css.slice(0, rootStart) + css.slice(rootEnd + 3));

test('style.css: no fixed colour value outside the :root block', () => {
  assert.ok(rootStart >= 0 && rootEnd > rootStart);
  const literal = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;
  assert.doesNotMatch(rest, literal);
  const named = /(?:^|[\s:(,])(?:white|black|red|green|blue|yellow|orange|gray|grey|silver|navy|teal|purple)(?=[\s;,)])/i;
  assert.doesNotMatch(rest, named);
});

test('style.css: only own means, no framework, no web font, no image files', () => {
  assert.doesNotMatch(css, /@import|@font-face|url\(/);
  assert.match(css, /prefers-color-scheme|light-dark\(/);
  assert.match(css, /color-scheme:\s*light dark/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /system-ui/);
  assert.match(css, /max-width:\s*899\.98px|max-width:\s*900px/);
});

// --- contrast (WCAG 2.1) ---

function variables() {
  const light = {};
  const dark = {};
  for (const m of rootBlock.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const v = m[2].trim();
    const ld = v.match(/^light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)$/);
    if (ld) {
      light[m[1]] = ld[1];
      dark[m[1]] = ld[2];
    } else if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      light[m[1]] = v;
      dark[m[1]] = v;
    }
  }
  return { light, dark };
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background]: text pairs that occur in style.css
const PAIRS = [
  ['color-text', 'color-bg'],
  ['color-text', 'color-surface'],
  ['color-text', 'color-surface-2'],
  ['color-text-muted', 'color-bg'],
  ['color-text-muted', 'color-surface'],
  ['color-text-muted', 'color-surface-2'],
  ['color-accent-text', 'color-accent'],
  ['color-accent', 'color-surface'],
  ['color-accent', 'color-bg'],
  ['color-danger-text', 'color-danger'],
  ['color-error', 'color-surface'],
  ['color-error', 'color-surface-2'],
  ['color-error', 'color-error-bg'],
  ['color-warn', 'color-warn-bg'],
  ['color-warn', 'color-surface'],
  ['color-ok', 'color-ok-bg'],
  ['color-info', 'color-info-bg'],
  ['color-text', 'color-error-bg'],
  ['color-text', 'color-warn-bg'],
  ['color-text', 'color-ok-bg'],
  ['color-text', 'color-info-bg'],
  ['color-text-muted', 'color-error-bg'],
  ['color-text-muted', 'color-warn-bg'],
  ['color-text-muted', 'color-info-bg'],
];

test('style.css: text contrast at least 4.5:1 in light and dark', () => {
  const { light, dark } = variables();
  const failures = [];
  for (const [mode, vars] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg] of PAIRS) {
      assert.ok(vars[fg] && vars[bg], `variable missing: ${fg} / ${bg}`);
      const ratio = contrast(vars[fg], vars[bg]);
      if (ratio < 4.5) failures.push(`${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('style.css: selected accent text on accent-soft also reaches 4.5:1 (mixed colour)', () => {
  const { light, dark } = variables();
  const mix = (a, b, share) => {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return '#' + pa.map((v, i) => Math.round(v * share + pb[i] * (1 - share)).toString(16).padStart(2, '0')).join('');
  };
  for (const [mode, v] of [['light', light], ['dark', dark]]) {
    const soft = mix(v['color-accent'], v['color-surface'], 0.14); // --color-accent-soft
    assert.ok(contrast(v['color-accent'], soft) >= 4.5, `${mode}: ${contrast(v['color-accent'], soft).toFixed(2)}`);
  }
});

// --- page ---

test('index.html: all input areas of SPEC_ETAPPE2 5.1 as <details>', () => {
  const sections = [...html.matchAll(/<details class="panel" data-section="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ['project', 'ground', 'bottom', 'materials', 'layers', 'water', 'loads', 'supports', 'tensionCrack', 'seismic', 'analysis', 'partialFactors', 'search', 'surfaces']);
});

test('index.html: early theme script uses the same storage key as theme.js; Run is disabled', () => {
  assert.ok(html.includes(`'${THEME_STORAGE_KEY}'`));
  assert.match(html, /<button[^>]*id="btn-run"[^>]*\bdisabled\b/);
});

/** All files below app/ (relative, with /) of the given extensions. */
function appFiles(exts, dir = '') {
  const out = [];
  for (const name of readdirSync(path.join(root, 'app', dir))) {
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(path.join(root, 'app', rel)).isDirectory()) out.push(...appFiles(exts, rel));
    else if (exts.includes(path.extname(name))) out.push(rel);
  }
  return out;
}

test('app/: no external resources (no CDN, no packages)', () => {
  const files = appFiles(['.html', '.css', '.js']);
  assert.ok(files.length >= 15, `files: ${files.length}`);
  for (const f of files) {
    // the SVG namespace in JS is an identifier, not a resource
    // the one other address is the link to the licence (SPEC_ETAPPE4 13a): a link the user can follow, not a resource that is loaded
    const src = stripComments(read(f)).replace('http://www.w3.org/2000/svg', '').replace('http://www.w3.org/1998/Math/MathML', '').replaceAll('https://github.com/onurkoc/groundslide/blob/main/LICENSE', '');
    assert.doesNotMatch(src, /https?:\/\//, f);
    assert.doesNotMatch(src, /\bimport\s+[^;]*from\s+'[^./]/, f);
  }
});

test('app/lib/: no DOM access (testable with node); core/ only through core/index.js', () => {
  const libFiles = appFiles(['.js'], 'lib');
  assert.ok(libFiles.length >= 10);
  for (const f of libFiles) {
    const src = stripComments(read(f)).replace(/\/\/.*$/gm, ''); // also line comments (no URLs in app/lib)
    assert.doesNotMatch(src, /\b(document|window|localStorage|navigator)\b/, f);
    for (const m of src.matchAll(/from '([^']*core[^']*)'/g)) assert.match(m[1], /core\/index\.js$/, f);
  }
});

test('index.html: every input area has a summary with info and error count; sketch container', () => {
  // 14 areas: the 12 of SPEC_ETAPPE2 5.1, Supports (SPEC_ETAPPE3 8) and the tension crack (SPEC_ETAPPE4 11)
  assert.equal([...html.matchAll(/class="summary-info"/g)].length, 14);
  assert.equal([...html.matchAll(/class="summary-errors" hidden/g)].length, 14);
  assert.equal([...html.matchAll(/<div class="panel-body"><\/div>/g)].length, 14);
  assert.match(html, /id="sketch"/);
});

test('index.html: two tabs on the right (Sketch, Result), four inside Result (Supports hidden at the start), no fold button (SPEC_ETAPPE2 1.3, version 1.8)', () => {
  const tabsOf = (part) => [...part.matchAll(/<button[^>]*role="tab"[^>]*data-tab="(\w+)"[^>]*aria-controls="([\w-]+)"[^>]*aria-selected="(true|false)"/g)].map((m) => [m[1], m[2], m[3]]);
  const at = (needle) => html.indexOf(needle);
  const main = html.slice(at('id="main-tabs"'), at('id="main-panels"'));
  const inner = html.slice(at('id="result-tabs"'), at('id="result-panels"'));
  assert.deepEqual(tabsOf(main), [['sketch', 'panel-sketch', 'true'], ['result', 'panel-result', 'false']]);
  assert.deepEqual(tabsOf(inner), [['overview', 'panel-overview', 'true'], ['slices', 'panel-slices', 'false'], ['supports', 'panel-supports', 'false'], ['messages', 'panel-messages', 'false']]); // Supports (SPEC_ETAPPE3 10) is hidden until the result holds supports
  assert.match(html, /id="tab-supports"[^>]*\bhidden\b/);
  // the two levels have their own names for the eye and for screen readers
  assert.match(html, /id="main-tabs" data-i18n-aria-label="ui\.main\.tabs"/);
  assert.match(html, /id="result-tabs" data-i18n-aria-label="ui\.tabs\.label"/);
  for (const lang of ['de', 'en']) assert.notEqual(MESSAGES[lang]['ui.main.tabs'], MESSAGES[lang]['ui.tabs.label']);
  // the panels: sketch holds the sketch, result holds the inner tabs; Result is hidden at the start
  const sketchPanel = html.slice(at('id="panel-sketch"'), at('id="panel-result"'));
  const resultPanel = html.slice(at('id="panel-result"'), at('</section>'));
  assert.match(sketchPanel, /id="sketch"/);
  assert.doesNotMatch(sketchPanel, /hidden>|hidden /);
  assert.match(html, /<div role="tabpanel"[^>]*id="panel-result"[^>]*aria-labelledby="tab-result" hidden>/);
  assert.match(resultPanel, /id="result-tabs"/);
  assert.doesNotMatch(html, /btn-export/, 'the JSON export of the result is gone (version 1.9)');
  // progress and run time are outside both panels (beside the tab list), so that they are visible in both
  const head = html.slice(at('class="output-head"'), at('id="main-panels"'));
  assert.match(head, /id="run-progress"/);
  assert.match(head, /id="run-time"/);
  assert.doesNotMatch(html.slice(at('id="main-panels"')), /id="run-progress"|id="run-time"/);
  // no fold button, no folded state
  assert.doesNotMatch(html, /btn-result-toggle|result-body/); // aria-expanded is allowed: the menu button of the graphic export has it
  assert.doesNotMatch(read('main.js'), /resultCollapsed|setResultCollapsed|is-result-collapsed/);
  assert.doesNotMatch(css, /is-result-collapsed|result-body/);
  for (const lang of ['de', 'en']) assert.ok(!('ui.result.collapse' in MESSAGES[lang]) && !('ui.result.expand' in MESSAGES[lang]), lang);
});

test('main.js: every element id it uses exists in index.html, every import exists', () => {
  const main = read('main.js');
  const ids = new Set([...main.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  assert.ok(ids.size >= 8);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const file of appFiles(['.js']).filter((f) => !f.startsWith('lib/'))) {
    const dir = path.dirname(path.join(root, 'app', file));
    for (const m of read(file).matchAll(/from '(\.[^']+)'/g)) {
      assert.ok(existsSync(path.resolve(dir, m[1])), `${file}: import ${m[1]}`);
    }
  }
});
