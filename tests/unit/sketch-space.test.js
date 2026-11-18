// Room for the sketch (SPEC_ETAPPE2 6, version 1.8): full screen, tabs instead of a foldable result area. Nothing of it is saved.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../app/lib/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8').split(String.fromCharCode(13)).join('');
const main = read('app', 'main.js');
const sketch = read('app', 'ui', 'sketch.js');

test('nothing of this is stored: no storage access in sketch.js, main.js stores only language and theme', () => {
  assert.doesNotMatch(sketch, /localStorage|sessionStorage|saveLanguage|saveTheme/);
  assert.equal([...main.matchAll(/localStorage/g)].length, 1, 'only the storage handle of language and theme');
  assert.equal([...main.matchAll(/saveLanguage\(|saveTheme\(/g)].length, 2);
  assert.doesNotMatch(read('app', 'ui', 'tabs.js'), /storage|save/i, 'the chosen tab is not stored (version 1.8)');
});

test('full screen: button in the tool bar, locked without the Fullscreen API, on the sketch area', () => {
  assert.match(sketch, /document\.fullscreenEnabled/);
  assert.match(sketch, /fullBtn\.disabled = !canFullscreen/);
  assert.match(sketch, /container\.requestFullscreen\(\)/);
  assert.match(sketch, /document\.exitFullscreen\(\)/);
  assert.match(sketch, /fullscreenchange/);
});

test('texts for grid and full screen exist in German and English', () => {
  for (const lang of ['de', 'en']) {
    for (const key of ['ui.sketch.grid', 'ui.sketch.fullscreen', 'ui.sketch.fullscreenExit', 'ui.sketch.fullscreenNone']) {
      assert.ok(MESSAGES[lang][key] && MESSAGES[lang][key].trim() !== '', `${lang}:${key}`);
    }
  }
});
