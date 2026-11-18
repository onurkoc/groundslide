import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
export function verificationFingerprint() {
  const files = ['docs/SPEC.md', 'docs/verification/slide2023-cases.json',
    ...fs.readdirSync(new URL('core/', root)).filter(f => f.endsWith('.js')).sort().map(f => 'core/' + f),
    ...fs.readdirSync(new URL('tests/benchmarks/', root)).filter(f => f.endsWith('.json')).sort().map(f => 'tests/benchmarks/' + f)];
  const sha256 = Object.fromEntries(files.map(f => [f, hash(fs.readFileSync(new URL(f, root)))]));
  return { algorithm: 'SHA-256', files: sha256, combined: hash(JSON.stringify(sha256)) };
}

export function selectCases(cases, ids) {
  const unknown = ids.filter(id => !cases.some(c => c.id === id));
  if (unknown.length) throw new Error(`Unknown case IDs: ${unknown.join(', ')}`);
  const selected = ids.length ? cases.filter(c => ids.includes(c.id)) : cases;
  if (!selected.length) throw new Error('No cases selected');
  return selected;
}

export function runStatus({ partial, done, rows, expectedCount }) {
  if (done && !rows.length) throw new Error('No cases executed');
  const complete = done && !partial && rows.length === expectedCount;
  if (done && !partial && !complete) throw new Error('Incomplete full verification run');
  const state = { partial, complete, executedCases: rows.length, expectedCases: expectedCount };
  if (complete) {
    const comparisons = rows.flatMap(r => [...(r.search?.comparisons || []), ...r.surfaces.flatMap(s => s.comparisons || [])]);
    state.totals = { compared: comparisons.length, withinTolerance: comparisons.filter(c => c.withinTolerance).length,
      flagged: comparisons.filter(c => !c.withinTolerance).length };
  }
  return state;
}

/**
 * Canonical JSON (keys sorted) of a benchmark model WITHOUT `expected` and `surfaces`.
 * Used to prove that geometry, materials, grid and analysis settings of a protected
 * benchmark are unchanged while Slide2 targets and reference circles may be added.
 */
export function canonicalBenchmarkModel(model) {
  const { expected, surfaces, ...protectedPart } = model;
  const sort = v => Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
  return JSON.stringify(sort(protectedPart));
}
