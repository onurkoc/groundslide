// Order 27 (SPEC_ETAPPE4 13a): marking of the method (LEM), link to the licence, no fixed note.
// No DOM: the page parts are checked in the source (as the other app tests).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES, translate } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').replaceAll('\r\n', '\n');

test('header: "GroundSlide · LEM 2D" next to the logo and a small link to the licence at the right (new tab, noopener)', () => {
  const html = read('app', 'index.html');
  assert.match(html, /<span>GroundSlide · LEM 2D<\/span>/);
  const link = html.match(/<a class="licence-link"[^>]*>/)[0];
  assert.match(link, /href="https:\/\/github\.com\/onurkoc\/groundslide\/blob\/main\/LICENSE"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener"/);
  assert.match(link, /data-i18n="ui\.licence\.link"/);
  // inside the header, after the two switches (right)
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.indexOf('licence-link') > header.indexOf('id="theme-switch"'));
  assert.equal(translate('de', 'ui.licence.link'), 'MIT-Lizenz');
  assert.equal(translate('en', 'ui.licence.link'), 'MIT licence');
});

test('the result document has one line "GroundSlide · LEM 2D · MIT-Lizenz <address>"; the fixed note is gone everywhere', () => {
  const url = 'https://github.com/onurkoc/groundslide/blob/main/LICENSE';
  assert.equal(translate('de', 'ui.doc.licence', { url }), `GroundSlide · LEM 2D · MIT-Lizenz ${url}`);
  assert.equal(translate('en', 'ui.doc.licence', { url }), `GroundSlide · LEM 2D · MIT licence ${url}`);
  const main = read('app', 'main.js');
  assert.match(main, /const LICENCE_URL = 'https:\/\/github\.com\/onurkoc\/groundslide\/blob\/main\/LICENSE'/);
  assert.match(main, /licence: t\('ui\.doc\.licence', \{ url: LICENCE_URL \}\)/);
  for (const file of ['app/main.js', 'app/ui/result-overview.js', 'app/ui/print-doc.js', 'app/lib/result-document.js']) {
    assert.doesNotMatch(read(...file.split('/')), /disclaimer|Vorbemessung/, file);
  }
  for (const lang of ['de', 'en']) {
    assert.equal(Object.hasOwn(MESSAGES[lang], 'ui.result.disclaimer'), false);
    for (const text of Object.values(MESSAGES[lang])) assert.doesNotMatch(text, /Vorbemessung|Preliminary design/);
  }
  const doc = read('app', 'ui', 'print-doc.js');
  assert.match(doc, /h\('p', \{ class: 'pd-foot' \}, \[h\('span', \{ text: texts\.licence \}\)\]\)/);
});

test('no interface text and no file of the app names another program', () => {
  for (const lang of ['de', 'en']) for (const [key, text] of Object.entries(MESSAGES[lang])) assert.doesNotMatch(text, /Slide2|Rocscience/i, `${lang}:${key}`);
  for (const file of ['app/index.html', 'app/main.js', 'app/ui/result-overview.js', 'app/ui/result-slices.js', 'app/ui/sketch.js']) {
    assert.doesNotMatch(read(...file.split('/')), /Slide2|Rocscience/i, file);
  }
});

