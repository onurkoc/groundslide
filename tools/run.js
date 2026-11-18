#!/usr/bin/env node
// Command line run for comparison calculations.
//
//   node tools/run.js <case.json>                     search (if "search" is set) and
//                                                     F of the listed surfaces, as tables
//   node tools/run.js <case.json> --surface <id>      one surface from "surfaces":
//                                                     F per method and the slice table
//   --json                                            print only JSON
//
// Slice values are given in the coordinate frame of the input file
// (x ascending, alpha positive where the base falls towards +x).

import { readFileSync } from 'node:fs';
import { analyze, analyzeSurface, ModelError } from '../core/index.js';

const RAD2DEG = 180 / Math.PI;

function usage() {
  console.error('Usage: node tools/run.js <case.json> [--surface <id>] [--json]');
  process.exit(2);
}

const args = process.argv.slice(2);
let file = null;
let surfaceId = null;
let jsonOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--surface') {
    surfaceId = args[++i];
    if (!surfaceId) usage();
  } else if (args[i] === '--json') {
    jsonOnly = true;
  } else if (!file) {
    file = args[i];
  } else {
    usage();
  }
}
if (!file) usage();

let model;
try {
  model = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Cannot read ${file}: ${e.message}`);
  process.exit(2);
}

const f4 = (v) => (typeof v === 'number' ? v.toFixed(4) : '-');
const pt = (p) => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`;

function printTable(head, rows) {
  const widths = head.map((h, j) => Math.max(h.length, ...rows.map((row) => String(row[j]).length)));
  const fmt = (row) => row.map((v, j) => String(v).padStart(widths[j])).join('  ');
  console.log(fmt(head));
  for (const row of rows) console.log(fmt(row));
}

function methodSummary(results) {
  return Object.entries(results)
    .map(([k, v]) => (v.valid ? `${k} ${f4(v.F)}${k === 'spencer' ? ` (theta ${v.theta.toFixed(2)} deg)` : ''}` : `${k} ${v.code}`))
    .join('   ');
}

function printSliceTable(r) {
  const head = ['#', 'xLeft', 'xRight', 'b', 'xm', 'zb', 'alpha[deg]', 'l', 'W', 'zG', 'Q', 'u', 'mat', 'c', 'phi[deg]', "N'", 'm_alpha'];
  const rows = r.slices.map((s, i) => [
    i + 1,
    s.xLeft.toFixed(3),
    s.xRight.toFixed(3),
    s.b.toFixed(3),
    s.xm.toFixed(3),
    s.zb.toFixed(3),
    (s.alpha * RAD2DEG).toFixed(2),
    s.l.toFixed(3),
    s.W.toFixed(2),
    s.zG.toFixed(3),
    s.Q.toFixed(2),
    s.u.toFixed(2),
    s.material,
    s.c.toFixed(2),
    (s.phi * RAD2DEG).toFixed(2),
    s.Nprime === null ? '-' : s.Nprime.toFixed(2),
    s.mAlpha === null ? '-' : s.mAlpha.toFixed(4),
  ]);
  printTable(head, rows);
}

try {
  if (surfaceId !== null) {
    const surf = (model.surfaces || []).find((s) => s.id === surfaceId);
    if (!surf) {
      console.error(`Surface "${surfaceId}" not found in "surfaces" of ${file}.`);
      process.exit(1);
    }
    const r = { surface: { id: surf.id }, ...analyzeSurface(model, { xc: surf.xc, zc: surf.zc, R: surf.R }) };
    if (jsonOnly) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`=== ${model.meta?.name ?? file} | surface ${surf.id} | xc=${surf.xc} zc=${surf.zc} R=${surf.R} | mode ${r.mode}`);
      if (!r.valid) {
        console.log(`Surface invalid: ${r.code} - ${r.message}`);
      } else {
        console.log(`entry ${pt(r.entry)}  exit ${pt(r.exit)}  ${r.slices.length} slices`);
        console.log(`F: ${methodSummary(r.results)}`);
        if (r.results.spencer?.valid) {
          const sp = r.results.spencer;
          console.log(`Spencer: theta=${sp.theta.toFixed(3)} deg  F_m=${f4(sp.Fm)}  F_f=${f4(sp.Ff)}`);
        }
        if (r.results.janbuCorrected?.valid) {
          const j = r.results.janbuCorrected;
          console.log(`Janbu correction: F0=${f4(j.F0)} f0=${f4(j.f0)} b1=${j.b1} d=${f4(j.d)} L=${f4(j.L)}`);
        }
        printSliceTable(r);
      }
      if (r.warnings.length) console.log(`warnings: ${r.warnings.join(', ')}`);
      console.log('\n--- JSON ---');
      console.log(JSON.stringify(r, null, 2));
    }
  } else {
    const r = analyze(model);
    if (jsonOnly) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`=== ${model.meta?.name ?? file} | mode ${r.mode}`);
      if (r.critical) {
        console.log('\nCritical surfaces (search):');
        const rows = Object.entries(r.critical).map(([k, c]) =>
          c
            ? [k, f4(c.F), c.theta === undefined ? '-' : c.theta.toFixed(3), c.xc.toFixed(3), c.zc.toFixed(3), c.R.toFixed(3), pt(c.entry), pt(c.exit), c.iterations]
            : [k, '-', '-', '-', '-', '-', '-', '-', '-'],
        );
        printTable(['method', 'F', 'theta[deg]', 'xc', 'zc', 'R', 'entry', 'exit', 'iter'], rows);
        console.log('\nCounters (circles x methods):');
        const crow = Object.entries(r.countsByMethod).map(([k, c]) => [
          k,
          c.total,
          c.valid,
          Object.entries(c.invalid)
            .sort()
            .map(([code, n]) => `${code}=${n}`)
            .join(' '),
        ]);
        printTable(['method', 'total', 'valid', 'invalid by code'], crow);
        console.log(`\nsearch time: ${r.searchTimeMs.toFixed(0)} ms`);
        if (r.check) {
          console.log(`
check (sia), gammaR=${r.check.gammaR}:`);
          for (const [k, c] of Object.entries(r.check)) {
            if (k !== 'gammaR') console.log(`  ${k}: F_d=${f4(c.F)} utilisation=${f4(c.utilisation)} ${c.ok ? 'OK' : 'NOT OK'}`);
          }
        }
      } else {
        console.log('(no search: "search" is null)');
      }
      if (r.surfaces.length) {
        console.log('\nSurfaces:');
        for (const s of r.surfaces) {
          console.log(`  ${s.id}: ${s.valid ? methodSummary(s.results) : `invalid ${s.code}`}`);
        }
      }
      console.log(`\nwarnings: ${r.warnings.length ? r.warnings.join(', ') : '-'}`);
    }
  }
} catch (e) {
  if (e instanceof ModelError) {
    console.error('Model is invalid:');
    for (const x of e.errors) console.error(`  ${x.code}: ${x.message}`);
    process.exit(1);
  }
  throw e;
}
