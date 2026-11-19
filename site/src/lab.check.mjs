// Known-answer check, run by "npm run build" before vite: every browser computation
// must reproduce the committed result files and study code, or the build fails.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  fixturesHash, pyDumps, drawValue, drawTable, simulate, clopperPearson, passk, median,
  pairWall, bootstrapRatio, verdictH1, verdictH2, verdictH3, recomputeCounts, pyConst,
} from './lab.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const summary = json('results/summary.json');
const env = json('results/env.json');
const fixtures = json('results/fixtures.json');
const rawMain = json('results/raw_main.json');
const rawFault = json('results/raw_fault.json');
const tasksPy = read('study/tasks.py');
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// 1. Fixture provenance: Python-compatible serialization hashes to env.json's fixtures_sha256.
assert.equal(await fixturesHash(fixtures), env.fixtures_sha256, 'fixtures hash');
assert.equal(createHash('sha256').update(pyDumps(fixtures)).digest('hex'), env.fixtures_sha256, 'fixtures hash via node:crypto');

// 2. failure_draw: Web Crypto path agrees with node:crypto on the same material.
const viaNode = (m) => Number(createHash('sha256').update(m).digest().readBigUInt64BE(0)) / 2 ** 64;
assert.equal(await drawValue('T03', 1004, 1, 0), viaNode('T03|1004|1|0'));

// 3. Retry simulator at the registered settings reproduces every per-task pass^1 and the pass^k curve.
const RETRY = pyConst(tasksPy, 'RETRY_BUDGET');
const seeds = env.trial_seeds;
const table = await drawTable(fixtures, seeds, RETRY + 1);
const sim = simulate({ fixtures, table, retryBudget: RETRY, seeds });
for (const row of sim.rows) for (const arm of ['langgraph', 'native'])
  assert.equal(row.pass1, summary.per_task[row.task][arm].pass1, `pass1 ${row.task} ${arm}`);
for (const arm of ['langgraph', 'native']) {
  close(sim.overall, summary.axis1.overall_pass1[arm], 1e-12, `overall pass1 ${arm}`);
  sim.curve.forEach((v, j) => close(v, summary.axis2[arm][String(j + 1)], 1e-12, `pass^${j + 1} ${arm}`));
}
const recordedFailures = rawMain.filter((r) => r.arm === 'native' && !r.success).map((r) => `${r.task}|${r.seed}|${r.failure}`).sort();
assert.deepEqual(sim.failures.map((f) => `${f.task}|${f.seed}|tool retries exhausted at step ${f.step}`).sort(), recordedFailures);

// 4. pass^k estimator and exact intervals match analyze.py.
assert.equal(passk(7, 8, 1), 0.875);
close(passk(4, 8, 2), 6 / 28, 1e-15, 'passk 4/8 k2');
for (const arm of ['langgraph', 'native']) {
  const f = summary.axis4.per_arm[arm];
  clopperPearson(f.passes, f.runs).forEach((v, i) => close(v, f.rate_ci95_exact[i], 1e-6, `recovery CI ${arm}`));
  for (const c of ['F1', 'F2']) clopperPearson(f.by_class[c].passes, f.by_class[c].runs).forEach((v, i) => close(v, f.by_class[c].rate_ci95_exact[i], 1e-6, `CI ${arm} ${c}`));
  const p = summary.axis1.pass1_pooled[arm];
  clopperPearson(p.successes, p.trials).forEach((v, i) => close(v, summary.axis1.pass1_ci95_exact[arm][i], 1e-6, `pass1 CI ${arm}`));
}

// 5. Cost explorer: medians and ratio from raw_main; bootstrap close to analyze.py's (different RNG).
for (const arm of ['langgraph', 'native']) {
  const rows = rawMain.filter((r) => r.arm === arm);
  close(median(rows.map((r) => r.wall_seconds)), summary.axis3.per_arm[arm].wall_median, 1e-12, `wall median ${arm}`);
  assert.equal(median(rows.map((r) => r.state_bytes)), summary.axis3.per_arm[arm].state_bytes_median);
  assert.equal(median(rows.map((r) => r.invocations)), summary.axis3.per_arm[arm].invocations_median);
}
const pairs = pairWall(rawMain);
assert.equal(pairs.length, summary.axis3.wall_ratio_bootstrap.pairs);
assert.equal(pairs.filter((p) => p.lg < p.nt).length, summary.axis3.wall_sign_test.langgraph_faster);
const bs = bootstrapRatio(pairs, summary.axis3.wall_ratio_bootstrap.reps, summary.axis3.wall_ratio_bootstrap.seed);
bs.ci.forEach((v, i) => close(v, summary.axis3.wall_ratio_bootstrap.ci95[i], 0.015, `bootstrap CI bound ${i}`));

// 6. Verdicts recomputed from the measured numbers and registered thresholds.
const th = summary.thresholds;
assert.equal(verdictH1(summary.axis1.ci90, th.h1_margin), summary.verdicts.H1);
assert.equal(verdictH2(summary.axis3.invocation_ratio, summary.axis3.wall_ratio, th.h2_invocation_bound, th.h2_wall_bound), summary.verdicts.H2);
assert.equal(verdictH3(summary.axis4.rate_gap, th.h3_rate_gap), summary.verdicts.H3);

// 7. Recompute distribution from raw_fault matches summary.
const rc = recomputeCounts(rawFault);
for (const arm of ['langgraph', 'native']) for (const c of ['F1', 'F2'])
  assert.deepEqual(Object.fromEntries(Object.entries(rc[arm][c]).map(([k, v]) => [String(k), v])), summary.axis4.per_arm[arm].by_class[c].recomputed_counts);

console.log('lab ok', { fixtures: env.fixtures_sha256.slice(0, 12), overall: sim.overall, bootstrapCi: bs.ci.map((v) => +v.toFixed(4)), pythonCi: summary.axis3.wall_ratio_bootstrap.ci95.map((v) => +v.toFixed(4)) });
