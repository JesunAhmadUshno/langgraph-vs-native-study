# Report: LangGraph versus native

Status: EVALUATED IN PART, 2026-11-07. The registered suite ran once
(192 main runs, 96 fault runs, results/raw_main.json and
results/raw_fault.json). H1 to H3 are scored against the locked rules;
H4 is Not yet measured. The ML and AI research profile is not yet met
(no ablations; one suite pass), so the public verdict is Functional.

This report replaces AUDIT.md, ROADMAP.md and docs/research-review.md
(moved here on 2026-11-08 under the portfolio standard v2). The locked
plan is SPEC.md plus HYPOTHESES.md (tag proposal-v1, commit c484e54);
the method is METHODS.md; every number is generated into RESULTS.md and
results/summary.json by `python -m study.analyze` from the raw files.

## Background

Agent frameworks promise durable, resumable agents. The promise is
rarely tested against a plain hand-written loop under matched controls,
so teams pay the framework's cost without knowing what it buys. The
expensive failure is specific: an agent that crashes mid-task and then
repeats a side effect (a second charge, a second booking) is worse than
a slow agent. This study measures what the orchestration layer alone
contributes to success, consistency, cost and exactly-once recovery.

## Hypotheses scored against the locked rules

| Hypothesis | Registered pass line (HYPOTHESES.md) | Measured (RESULTS.md) | Verdict | Registered prediction |
|---|---|---|---|---|
| H1 success equivalence | 90% CI of mean paired pass^1 difference inside plus or minus 0.05 | mean 0.000, 90% CI [0.000, 0.000]; pooled 94 of 96 per arm, exact 95% [0.927, 0.997] | Supported (degenerate by design, see below) | Supported: matched |
| H2 cost | invocation ratio at most 1.05 and median wall ratio at most 1.10 | invocations 1.000; wall 0.299, bootstrap 95% [0.274, 0.342] | Supported | Supported, wall at risk: matched, with the wall ordering opposite to the risk named |
| H3 recovery | tie form: rates differ by at most 2 points | 48 of 48 each, exact 95% [0.926, 1.000]; gap 0.000; 0 duplicate runs | Supported (tie: the orchestrator adds nothing measurable on recovery) | Tie form: matched |
| H4 debugging surface | fixed record-count procedure, else Not yet measured | procedure not run as written (DECISIONS.md D8) | Not yet measured | none registered |

### Misses and what the verdicts cannot say

- H1 cannot fail unless an arm loses state: every paired difference is
  exactly 0, so the test speaks only to orchestration-caused success
  loss, never to reasoning quality.
- H3 is a tie at a perfect record; 48 of 48 bounds each rate above
  about 0.93, no tighter.
- The recovery cost differs even though the pass rate ties: LangGraph
  re-ran one already-finished step in all 24 F1 runs and in 22 of 24 F2
  runs (2 steps in the other 2); the native loop re-ran 0 steps in F1
  and 1 step in every F2 run. The cause of the two 2-step runs is not
  established.
- H4 is empty: the registered procedure would have measured storage
  format, not diagnosis effort (D8).
- No ablation was run (the field profile asks for one part removed at a
  time, for example the idempotency check or the native intent log).
- One suite pass on one machine; wall-time variance across passes is
  unknown.

### Summary verdict as first written (moved from README.md)

Verdict: on success and on exactly-once recovery the arms are tied.
The success tie is degenerate by design: both arms replay the same
deterministic policy against the same seeded failure draws, so every
paired difference is exactly 0 and the test can only rule out
orchestration-caused success loss, not speak to reasoning quality.
The recovery tie is 48 of 48 in both arms, which bounds each rate
above about 0.93 (exact 95 percent interval), no tighter. The differences are in what recovery costs: LangGraph
re-ran one already-completed step in every step-boundary fault run
(its durable checkpoint lags the last finished step), while the native
event log re-ran none. LangGraph needed less arm-specific code
(81 versus 96 code lines) and, in these implementations, less wall
time; its durable state store was about 2.25 times larger. Exactly-once
came from the idempotency discipline both arms applied, not from the
orchestrator. Full numbers: RESULTS.md, generated from the raw result
files in results/.

## Headline numbers and where they come from

| Number | Value | Evidence | Regenerate |
|---|---|---|---|
| Recovery passes, each arm | 48 of 48, exact 95% [0.926, 1.000] | results/raw_fault.json | `python -m study.analyze` (RESULTS.md, Axis 4) |
| LangGraph F1 runs that re-ran a finished step | 24 of 24 (native 0 of 24) | results/raw_fault.json | same, recomputed-steps table |
| Median wall ratio, LangGraph to native | 0.299, bootstrap 95% [0.274, 0.342] | results/raw_main.json | same, Axis 3 |
| Pooled pass^1, each arm | 94 of 96, exact 95% [0.927, 0.997] | results/raw_main.json | same, Axis 1 |
| Arm-specific code lines | 81 LangGraph, 96 native | study/arm_langgraph.py, study/arm_native.py | same, code surface table |

CI regenerates RESULTS.md, results/summary.json and
results/readme_table.md from the raw files and fails on any difference.
The raw files themselves are pinned by results/SHA256SUMS. The Jev claim
check named in the claim audit below is an external record
(results/jev-claim-check.json); it is not reproducible from this repo
and no headline number depends on it.

## Review notes

What follows is the earlier self-review against a research rubric,
moved from docs/research-review.md. It names each gap, what was fixed,
and the exact compute or data that would close what remains. It is not
the independent second-reader review of the standard (Lifecycle stage
Review), which has not happened.

| Dimension | Status |
|---|---|
| Research question | Narrow, answerable, scoped to the orchestration layer |
| Hypotheses and pre-registration | Thresholds and verdict rules committed before code; git order shows it |
| Method and design | Strong paired control; the success axis is degenerate by construction |
| Baselines | Native arm is competent and measured, but same author, no outside review |
| Statistics and uncertainty | Intervals now reported on every headline rate and ratio; one suite pass only |
| Reproducibility | Pinned, seeded, hashed, checksummed; platform-bound wall numbers |
| Threats to validity | Stated in METHODS.md and the site; external validity is low |
| Related work | Single evidence pack; systematic search not run |
| Limitations and honesty | Limits stated next to each claim; H4 reported as Not yet measured |

### 1. Research question

SPEC.md asks one question: with policy, tasks, tools and budgets fixed,
what does the orchestration layer alone change on success, consistency,
cost and exactly-once recovery. It is answerable with the design used
and its scope limit (scripted policy) is declared up front.

### 2. Hypotheses and pre-registration

HYPOTHESES.md fixes H1 to H4, their measures, thresholds and verdict
words before any experiment code. The git history shows the order: the
commit that adds HYPOTHESES.md precedes the harness commit, which
precedes the results commit. The dashboard reads that order from git at
build time. Stop rules (whole-suite reruns only) were respected: no
suite rerun happened in this change (DECISIONS.md D9).

Fixed in this change: the registered thresholds now live in one table in
study/analyze.py and are written into results/summary.json, so the
verdict rule each number was judged against travels with the number.
The dashboard and its build check re-derive all three measured verdicts
from those fields.

### 3. Method and design

Strengths: paired by seed, shared executor, fault hooks in the harness
rather than the arms (D7), exactly-once scored from the ledger as a
multiset.

Gap: the H1 equivalence test is degenerate. Both arms replay the same
deterministic policy against the same sha256 failure draws, so every
per-task paired difference is exactly 0, the standard deviation is 0
and the 90 percent interval is [0, 0]. The TOST cannot fail unless an
arm loses state.

Fixed: RESULTS.md now states this (generated by analyze.py from the
`degenerate` flag), the README verdict no longer says "tied, with
evidence" and says what the test can and cannot detect, and the site
shows a caveat beside H1. The in-browser simulator makes the mechanism
visible: it reproduces both arms' per-task pass^1 from the draw alone.

Remaining: a non-degenerate success comparison needs a stochastic
policy. Exact need: the Deep pass item 1 below, a small local model in
the 0.2 to 0.7 pass^1 band under the same harness, 12 tasks by 8 seeds by
2 arms (192 runs), on a machine that can host the model. No paid API is
required, but it is a GPU or long CPU job and outside this change.

### 4. Baselines

The native arm is one competent implementation: write-ahead intent log,
reconcile on restart, state committed after every step. Code surface is
measured, not capped (D6).

Remaining: same author wrote both arms (METHODS.md threats). Exact need:
one outside reviewer reads study/arm_native.py and signs off or names a
stronger baseline (Deep pass item 6 below). This is human review time, not
compute.

### 5. Statistics and uncertainty

Gaps found: recovery rates of 48/48 had no interval; the wall ratio
(0.299) had no uncertainty; the recompute metric was reported only as
medians (1.0 versus 0.5), which hid its structure.

Fixed, all from the committed raw files, verdicts unchanged:

- Exact Clopper-Pearson 95 percent intervals for pooled pass^1 (94 of
  96, [0.927, 0.997] in each arm) and for every recovery rate (48 of 48,
  [0.926, 1.000]; 24 of 24 per class, [0.858, 1.000]). A perfect record
  rules out only rates below about 93 percent.
- A paired bootstrap 95 percent interval for the median wall ratio,
  [0.274, 0.342] (10000 resamples of 96 task-and-seed pairs, seed
  20261107), and an exact paired sign test (LangGraph faster in 96 of 96
  pairs).
- The full recomputed-steps distribution per arm and class: LangGraph F1
  1 step in 24 runs; LangGraph F2 1 step in 22 runs and 2 steps in 2
  runs (T11 and T12, F2 inside step 3, seed 2001); native F1 0 steps in
  24 runs; native F2 1 step in 24 runs. The off-mode runs are named in
  RESULTS.md.
- Unit tests for the interval and sign-test helpers against closed-form
  values (tests/test_reproduction.py).

Remaining:

- Wall-time variance across suite passes is unknown: the bootstrap
  covers run-to-run spread within one pass, not machine or session
  effects. Exact need: three or more full reruns of study.run_suite on
  the original x86_64 Linux machine, each logged in DECISIONS.md under
  the stop rules (about a few minutes of CPU each, no GPU).
- The cause of the two LangGraph F2 runs that recomputed 2 steps is not
  established. Candidate mechanism, untested: LangGraph's default
  durability mode in the pinned version is asynchronous (the checkpoint
  write can lag the next step), so a kill can land before the previous
  step's checkpoint is durable. This would also explain why every F1
  kill cost LangGraph one re-run. Exact need: a registered variant run
  of the LangGraph arm with `durability="sync"` on the same 48 fault
  cells, logged as a new decision, on the original machine.

### 6. Reproducibility

Strengths: pinned requirements-lock.txt, registered seeds, a fixture
hash in env.json, a deterministic suite, CI on Python 3.11 and 3.12.

Fixed:

- results/fixtures.json, exported by study/export_fixtures.py, with a
  test that its sha256 (serialized as json.dumps with sorted keys)
  equals env.json's fixtures_sha256. The dashboard re-hashes it in the
  browser with Web Crypto and the build check re-hashes it in Node.
- results/SHA256SUMS for raw_main.json, raw_fault.json, env.json and
  fixtures.json, checked by a test.
- A test that the sha256 failure draw alone predicts exactly the 4
  recorded main-suite failures (T03 seed 1004 at step 1, T10 seed 1005
  at step 3) with the registered retry budget.
- Scoring is now unit-tested on duplicate, missing and extra ledgers,
  incomplete runs and recompute counting from a synthetic trace
  (tests/test_scoring.py), without langgraph.
- The full test suite (22 tests, including the arm smoke tests) passes
  locally in a gitignored .venv with the pinned requirements.

Remaining: env.json records x86_64 Linux; a rerun on another
architecture would change env.json and the wall numbers. Exact need:
reruns on the recorded platform, or a second platform reported as a
separate, labelled result set. No kill-and-resume round-trip test runs
in CI; adding one needs a subprocess fault cell per arm (seconds of
CPU) and is the next test to write.

### 7. Threats to validity

METHODS.md names same-author bias, small fixtures, one fault family and
version pinning. The wall-time ordering is labelled implementation-
sensitive wherever it appears, including next to every wall number on
the dashboard.

Remaining: external validity. Exact needs: Deep pass items 1
(real model), 4 (WAL-mode and batched-commit native variants, CPU only,
same fixtures and thresholds) and 5 (wider fault models: kill during a
lookup, kill between intent and effect, corrupted checkpoint, slow-tool
timeout).

### 8. Related work

RESEARCH.md carries one evidence pack's table with its own verification
statuses; several rows are partly verified or verified only via
mirrors, and the absence claim (no prior controlled study) is
unverified.

Remaining: exact need is Deep pass item 7 below, a systematic search with
logged query strings and hit counts across scholarly indexes and the
framework issue trackers. Reading time, no compute.

### 9. Limitations and honesty

The scripted policy, small fixtures, single fault family, deferred H4
and deferred prompt-injection axis are stated in README.md, METHODS.md,
RESULTS.md and on the dashboard. H4 is reported as Not yet measured
with its reason rather than a proxy number. The dashboard labels the
crash replay, cost explorer and run browser as recorded, and states
that the simulator models the success path only and that both arms are
identical in it.

### Engineering notes for the dashboard

- Every number on the page is read from results/, study/tasks.py or
  REPORT.md at build time, or computed in the browser from those files.
  site/src/lab.check.mjs runs inside `npm run build` and fails the build
  unless the browser code reproduces the fixture hash, every per-task
  pass^1, the pass^k curve, the recorded failures, the exact intervals,
  the medians, the paired counts, the bootstrap interval (within 0.015,
  different generator) and all three verdicts.
- Dependencies are exact-pinned (react 18.3.1, react-dom 18.3.1,
  vite 5.4.11 when this note was written, since moved to 6.4.5 in f1fb34f, @vitejs/plugin-react 4.3.4). `npm audit --omit=dev`
  reports no vulnerabilities in what ships. The full `npm audit` flags
  vite 5.4.11 and its esbuild; every advisory concerns the local
  development server or Windows path handling, neither of which the
  Pages build uses (it runs `vite build` only and serves static files).
  Moving off these advisories needs a vite major version change, which
  is a deliberate dependency decision outside this change.
- No external scripts; the only external resource is the Google Fonts
  stylesheet.

## Audits

### Claim audit

Headline claim (the one in the README verdict) passed the Jev
claim_check gate before use: model jev-1.13.0, question "supported",
noul 0.5, route REVIEW (standing bands: clear at 0.85 or above, block
at 0.10 or below, review between). On the REVIEW route the claim was
verified by hand: pass counts, fault counts, kill counts and
recomputed-step distributions were recounted independently from
results/raw_main.json and results/raw_fault.json and match RESULTS.md
exactly. Record: results/jev-claim-check.json (no key, no full state
text stored).

Every other number in the README and RESULTS.md is computed by
study.analyze from the raw result files. RESULTS.md is generated,
never hand-typed. The README results table is the generated
results/readme_table.md, pasted verbatim.

Overclaim guard, applied: no claim that LangGraph improves accuracy
or makes agents smarter; no production-ready or secure claim; no
transfer claim to other models, benchmarks or versions; the native
arm is described as one competent implementation, not "the" native
approach; the wall-time ordering is labelled implementation-sensitive
wherever it appears.

### Security audit

- Dependencies pinned in requirements-lock.txt. Installed for this
  run: langgraph 1.2.20, langgraph-checkpoint-sqlite 3.1.3
  (langgraph-checkpoint 4.3.1), langchain-core 1.7.6. Both are above
  the fix versions for the two advisories in RESEARCH.md
  (CVE-2025-64439, fixed 2.1.3; CVE-2025-68664, fixed 1.2.4). The
  advisory rows themselves rest on mirrors, as RESEARCH.md records.
- The study runs fully offline against local files. No API keys, no
  network calls, no external data. Fixtures are synthetic and contain
  no personal data.
- The fault harness kills only its own child processes, in its own
  work directory.

### Cost audit

Zero spend. No cloud resource, no paid API, no new credential. Compute
was this virtual machine only.

### Licence audit

Original code in this repository: Apache-2.0 (LICENSE). Dependencies
keep their own licences (LangGraph and LangChain are MIT-licensed;
check requirements-lock.txt for the full set). Fixtures are original
synthetic data. No third-party dataset is redistributed.

### Data audit

Raw evidence committed: results/raw_main.json (192 runs),
results/raw_fault.json (96 runs), results/env.json (versions and the
fixtures hash), results/summary.json. Per-run ledgers, traces and
state stores are regenerated by study.run_suite into workdir/ and are
not committed (workdir/ is gitignored); the raw JSON records are the
committed evidence layer, and the suite reruns deterministically from
the registered seeds.

### Maintenance audit

Known weak points: LangGraph checkpoint internals are version
sensitive (the one-step resume lag measured here is a property of the
pinned versions); the native arm's wall time is dominated by its
synchronous commit choice. Both are named in the Deep pass list below with the
rerun that would settle them.

## Limitations

- The policy is scripted, not a model (a declared scope limit, see
  SPEC.md). Success equivalence is therefore partly true by
  construction: routing cannot add reasoning. The study measures the
  orchestration layer: durability, recovery, re-execution, cost and
  code surface. Nothing here speaks to model quality or deployed
  agents with real models.
- The wall-time ordering is implementation-sensitive: the native arm
  commits state synchronously after every step, which dominates its
  wall time on this machine. A WAL-mode native variant is registered
  in the Deep pass list below before any cost claim is quoted further.
- Tasks are small (3 to 8 steps) and the fault model is one family
  (process kill) in two classes. Scores are not comparable to
  published agent benchmarks.
- The debugging axis (H4) is Not yet measured; the prompt-injection
  axis from the research pack is deferred to a real-model pass.

## Societal impact

Agents that act for people move money and change records. Evidence
about which design choices actually prevent a repeated side effect
after a crash, and what those choices cost, is safety evidence for any
team shipping agents, not a framework advertisement.

## Citations

- Yao, Shinn, Razavi, Narasimhan, "tau-bench: A Benchmark for
  Tool-Agent-User Interaction in Real-World Domains", ICLR 2025
  (pass^k estimator and goal-state scoring).
- Kapoor, Stroebl, Siegel, Nadgir, Narayanan, "AI Agents That
  Matter", TMLR 2025 (cost-controlled agent evaluation).
- Schluntz and Zhang, "Building effective agents", Anthropic
  Engineering, Dec 2024 (simple composable patterns; framework
  debugging caveats).
- LangChain changelog, "LangGraph 1.0 is now generally available",
  Oct 2025 (vendor source for durability claims).
- Full evidence table with verification statuses: RESEARCH.md.

## Deep pass, in order

1. Real model under the same harness. Replace the scripted policy
   with a small local model in the 0.2 to 0.7 pass^1 band (pack
   upgrade U4), keep every fixture, seed and threshold, and rerun.
   This is the run that can speak about agents as deployed, and it
   unlocks the deferred pack H4.
2. Prompt-injection axis (pack H4, AgentDojo-style). Same two arms,
   tool filter on and off, utility and attack success reported per
   suite. Deferred from this pass by DECISIONS.md D2.
3. Debugging axis with a timed human procedure. A reviewer who did
   not write the arms diagnoses seeded faults from each arm's
   persisted trace, timed, with the fault set and the stopping rule
   registered before the session. This replaces the incommensurable
   record-count procedure (DECISIONS.md D8).
4. Native arm durability variants. The wall-clock result in this pass
   is sensitive to the native arm's synchronous-commit design. Rerun
   the native arm with WAL mode and batched state commits, same
   fixtures and thresholds, and report whether the cost ordering
   survives a competent second implementation.
5. Wider fault models: kill during a lookup, kill between the intent
   record and the effect in the native arm, corrupted checkpoint file,
   and a slow-tool timeout class. The current suite covers process
   kills at step boundaries and mid-append only.
6. Outside review of the native arm (pack U10): one reviewer who did
   not write it signs off that the loop is a fair, competent baseline,
   or names what a stronger baseline would change.
7. Systematic literature search (pack U1) with logged strings and hit
   counts, so the absence claim in RESEARCH.md can be upgraded or
   withdrawn.

## Held by gates outside this repo

- Hosted model runs and any paid API: Jesun's spend tap only.
- Live AWS or deployment claims: out of scope for this study.
