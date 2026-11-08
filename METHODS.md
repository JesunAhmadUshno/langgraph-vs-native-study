# METHODS

## Design summary

Paired, pre-registered, two-arm comparison. The arms share the task
fixtures, the scripted policy, the tool implementations and the per-step
executor. They differ only in sequencing, persistence and resume
machinery. Trials are paired by seed: for a given task and seed, both
arms face the identical sequence of tool failure draws.

## Data

- 12 task fixtures (study/tasks.py), hashed into results/env.json
  (fixtures sha256). Families: sequential, branch, long, mixed.
- Each fixture lists its intended side effects as idempotency keys.
  Scoring compares the run ledger against that list as a multiset.
- Flakiness: a step may carry a per-attempt failure probability. The
  draw is sha256 of (task id, trial seed, step index, attempt), read as
  a uniform value. A flaky failure raises before any effect is applied.
  Ambiguous failures (effect applied, result unknown) are covered only
  by the fault suite's F2 kills, not by the flaky mechanism.
- Trial seeds: 1000 to 1007, 8 trials per task per arm, 96 runs per arm.
- Fault suite seeds: 2000 and 2001.

## Arms

- LangGraph arm (study/arm_langgraph.py): a StateGraph with one node
  per executor step, SQLite checkpointer, one thread per run. The node
  applies the idempotency discipline the framework documentation
  prescribes: before applying an effect, it asks the ledger whether the
  effect already landed (was_applied) and treats a hit as recovered.
- Native arm (study/arm_native.py): a hand-written loop with a SQLite
  event log. State is committed after every step. Effects use a
  write-ahead pattern: intent row committed, effect applied, row marked
  done. On restart, an intent without done is reconciled against the
  ledger before anything is re-applied.
- Shared step budget 24 policy invocations per run; shared retry budget
  2 retries per tool call (3 attempts). No arm-specific tuning.

## Metrics and formulas

- pass^1: successes divided by trials. A success is a completed run
  whose ledger holds each intended effect exactly once and nothing else.
- pass^k: per task, the unbiased estimator C(c, k) / C(n, k) with c
  successes in n = 8 trials (tau-bench, pack row E6), averaged over
  tasks. Reported for k = 1 to 8.
- H1 test: two one-sided tests on the paired per-task pass^1
  differences, margin plus or minus 0.05, alpha 0.05. The reported
  interval is the 90 percent confidence interval for the mean paired
  difference, using the Student t quantile at 11 degrees of freedom.
- Cost: policy invocations and wall seconds per run, median and p95 per
  arm. Wall seconds are measured inside the run, around the execution
  loop or graph invocation, excluding interpreter start and imports.
  Durable state bytes: the size of the arm's own state store per run
  (checkpoints.sqlite versus native_state.sqlite); the shared ledger
  and trace are excluded.
- Code surface: physical and code lines (excluding blanks and comment
  lines) counted by study.analyze over the study package, grouped as
  shared core, per-arm, and harness.
- Recovery: a fault run passes when the resumed run completes and the
  ledger is exactly-once. Recomputed steps: traced step starts beyond
  the first start of the same step, summed over the run's attempts.
  A step whose executor began again after a resume counts once per
  extra start.

## Fault injection

- F1, kill between steps: STUDY_KILL_MODE=before_step. The executor
  kills the process with SIGKILL at the start of the step after the
  registered point, before that step does anything. The prior step is
  already durable in both arms.
- F2, kill mid-step: STUDY_KILL_MODE=mid_step. append_record kills the
  process after the ledger write is flushed and synced, before the call
  returns. The effect exists; no completion record does.
- Kill points: F1 after steps 2 and 5; F2 inside steps 3 and 6
  (1-based). Cells: 6 tasks by 2 classes by 2 points by 2 repeats =
  48 runs per arm. Each run is a fresh subprocess pair (killed attempt,
  resume attempt), and the scorer checks that the first attempt died
  by SIGKILL.

## Known measurement limits

- Policy invocation counts after a kill come from persisted arm state,
  not from a global counter. A resumed LangGraph run re-executes steps
  whose invocations were counted in a checkpoint that the kill
  discarded, so the final count can understate total policy calls. The
  trace file, not the state counter, is the ground truth for recompute
  counting, and the fault analysis uses it that way.
- Wall seconds on a shared virtual machine carry noise from other
  tenants. Medians over 96 runs per arm are the reported statistic;
  single-run times are not interpreted.
- The scripted policy makes success equivalence partly true by
  construction: routing cannot add reasoning. The H1 test still detects
  orchestration-caused success loss (lost state, budget overruns,
  corruption), which is the failure class it exists to catch.

## Threats to validity

- Same author wrote both arms (pack weakness 2). Mitigations: shared
  executor, pre-registered thresholds, arm code measured and published,
  no post-run tuning under the stop rules. Outside review of the
  native arm (pack U10) has not happened; listed in REPORT.md.
- Fixture tasks are small (3 to 8 steps). Long-horizon behaviour is
  out of sample.
- One fault model family (process kill) in two classes. Network
  partitions, partial writes and slow tools are not covered.
- Results hold for the pinned versions in requirements-lock.txt only.
