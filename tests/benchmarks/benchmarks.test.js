// Comparison with the expected values of all benchmark files in this folder (SPEC 10.2).
// Single surface: |dF| <= 0.005, search: |dF| <= 0.02.
// Expected value null (pending): the test runs, prints the calculated value, cannot fail
// and is counted as "todo".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyze } from '../../core/index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const TOL_SURFACE = 0.005;
const TOL_SEARCH = 0.02;
const METHODS = ['bishop', 'janbu', 'janbuCorrected', 'spencer'];

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();

for (const file of files) {
  const model = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const expected = model.expected || {};
  // calculate every method (also those not listed in the file) so that pending values are printed
  const calcModel = structuredClone(model);
  calcModel.analysis.methods = ['bishop', 'janbu', 'spencer'];
  const result = analyze(calcModel);

  const register = (label, expectedValue, method, calc, tol) => {
    const name = `${file} ${label} ${method}`;
    if (expectedValue === null || expectedValue === undefined) {
      test(name, { todo: 'expected value pending (null)' }, (t) => {
        t.diagnostic(`calculated ${calc === null ? 'n/a' : calc.toFixed(4)}`);
      });
    } else {
      test(name, () => {
        assert.notEqual(calc, null, `${method} gave no valid result`);
        const d = calc - expectedValue;
        assert.ok(
          Math.abs(d) <= tol,
          `calculated ${calc.toFixed(4)}, expected ${expectedValue}, dF = ${d.toFixed(4)}, tolerance ${tol}`,
        );
      });
    }
  };

  // ---- single surfaces ----
  for (const surf of model.surfaces || []) {
    const exp = (expected.surfaces && expected.surfaces[surf.id]) || {};
    const res = result.surfaces.find((s) => s.id === surf.id);
    for (const method of METHODS) {
      const calc = res && res.valid && res.results[method] && res.results[method].valid ? res.results[method].F : null;
      register(`surface ${surf.id}`, exp[method], method, calc, TOL_SURFACE);
    }
  }

  // ---- search ----
  if (model.search) {
    const exp = expected.search || {};
    for (const method of METHODS) {
      const c = result.critical && result.critical[method];
      register('search', exp[method], method, c ? c.F : null, TOL_SEARCH);
    }
  }
}
