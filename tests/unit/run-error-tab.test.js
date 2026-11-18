// A run that ends with an error shows Result > Messages (SPEC_ETAPPE2 1.3, version 1.10). Success and Cancel do not
// switch the tab. The handlers live in main.js (no DOM in node), so the wiring is checked in the source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const main = readFileSync(path.join(root, 'app', 'main.js'), 'utf8').replaceAll('\r\n', '\n');

/** Body of `function name(...) { ... }` up to the next top-level function or comment line. */
function body(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = main.indexOf('\n}\n', start);
  return main.slice(start, end);
}

test('error of a run: switches to the tab Result and the sub-tab Messages', () => {
  const b = body('onRunError');
  assert.match(b, /resultTabs\.select\('messages'\)/);
  assert.match(b, /mainTabs\.select\('result'\)/);
  assert.match(b, /state\.status = \[\{ kind: 'error'/, 'the error is a message of the list');
  assert.ok(b.indexOf("select('messages')") < b.indexOf('renderMessageList'), 'the tabs are chosen before the list is drawn');
});

test('success and cancel of a run do not switch the main tab', () => {
  for (const name of ['onRunResult', 'onRunCancel', 'onRunProgress']) assert.doesNotMatch(body(name), /mainTabs\.select/, name);
  assert.doesNotMatch(body('startRun'), /mainTabs\.select/);
  // the only places that choose a main tab: start, New and Open (setModel) and the error of a run
  const calls = [...main.matchAll(/mainTabs\.select\('(\w+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(calls.sort(), ['result', 'sketch']);
});
