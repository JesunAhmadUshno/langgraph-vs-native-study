# SPEC: LangGraph versus Native Paired Study

## Problem

Agent frameworks promise durable, resumable, debuggable agents. The claim is
rarely tested against a plain hand-written loop under matched controls. Teams
adopt the framework on reputation, then pay its code and dependency cost
without knowing what it buys. This study measures what the orchestration
layer alone contributes, with everything else held fixed.

## Research question

With the decision policy, task set, tool surface, step budget and retry
budget held identical, does a LangGraph 1.x agent differ from an equally
budgeted native tool-calling loop on:

1. Single-attempt task success (pass^1).
2. Consistency across repeated trials (pass^k).
3. Cost: policy invocations, wall-clock time, and code surface.
4. Recovery after a process kill, scored on exactly-once side effects.
5. Debugging surface: time-to-diagnose on seeded faults.

## Design

Two arms, one shared core.

- Shared core (identical in both arms, by construction): the task fixtures,
  the scripted decision policy, the tool implementations, and the per-step
  executor that turns a policy decision into tool calls and records results.
- LangGraph arm: the shared executor runs inside a LangGraph StateGraph.
  Each policy step is one graph node invocation. State is checkpointed after
  every step with the SQLite checkpointer. Resume uses the same thread id.
- Native arm: the shared executor runs inside a hand-written loop. The loop
  keeps its own event log in SQLite and replays it on restart to find the
  first unfinished step. The native arm is written to a stated code budget:
  it must be a competent loop, not a strawman (charter risk, pack 01
  weakness 2).

The only code that differs between arms is the sequencing, persistence and
resume machinery. That is the layer under test.

## Model constraint (declared scope limit)

Zero spend rules out a hosted model, and a local model would mix model
quality into an orchestration question. Both arms therefore use a
deterministic scripted policy as the model stand-in. The policy reads the
task fixture and the observations returned by tools, and emits the next tool
call. Seeded tool flakiness (a tool call fails with a seed-dependent draw)
gives repeated trials real variation, so pass^1 and pass^k measure the
system, not a tape replay. The research object is the orchestration layer:
sequencing, durability, recovery and side-effect safety. Findings do not
transfer to model quality, prompt behaviour or hosted APIs. This limit is
stated again in METHODS.md and README.md.

## Task set

12 tasks, defined as data fixtures in code and hashed in the results. Task
families:

- Sequential appends: a short chain of side effects in a fixed order.
- Conditional branch: a lookup result selects which record is appended.
- Flaky tool: one tool fails transiently with a seeded draw; the shared
  retry budget decides whether the task still completes.
- Long chain: 6 to 8 side effects, used mainly by the fault suite.
- Mixed: lookup, branch and appends combined.

Each task states its intended side effects as a list of idempotency keys.
Success means the run finishes inside the step budget and the ledger holds
each intended effect exactly once and nothing else.

## Tool surface (identical in both arms)

- lookup(key): read-only. Returns a fixture value.
- append_record(collection, payload, idempotency_key): side-effecting.
  Appends one entry to a local JSONL ledger file on every call and returns
  the entry index. The tool does not deduplicate. Exactly-once is the
  orchestrator's problem, which is the point of the study.
- was_applied(idempotency_key): read-only. Reports whether the ledger
  already holds an entry with that key. This is the reconciliation read an
  arm may use on resume.

## Fault suite

Faults are injected by the runner at pre-registered points. The runner
process is killed with SIGKILL, then started again with the same run
directory and thread identity, and the final ledger is scored.

- F1, kill between steps: the kill lands after step k completes and before
  step k+1 starts.
- F2, kill mid-step: the kill lands after append_record has written to the
  ledger and before the step result is recorded. The effect exists; the
  orchestrator does not yet know. On resume the step looks unfinished.
  A run passes only if the task completes and every intended effect is in
  the ledger exactly once. A duplicated effect is a failure, not overhead.

Fault cells: 6 long or mixed tasks, 2 fault classes, 2 kill points per
class, 2 repeats per cell. 48 fault runs per arm, each with one resume.

## Axes and metrics

1. Success: pass^1 per task and overall, per arm. Primary test: two
   one-sided tests (TOST) on the paired per-task pass^1 difference, margin
   plus or minus 5 points, alpha 0.05.
2. Consistency: pass^k for k = 1 to 8, unbiased estimator C(c, k) / C(n, k)
   per task with n = 8 trials, then averaged over tasks.
3. Cost: policy invocations per run (median, p95), wall-clock seconds per
   run (median, p95), and code surface: lines of code counted by script,
   split into shared code and arm-specific code.
4. Recovery: per fault class, the share of runs that complete with every
   side effect applied exactly once; duplicate-effect runs counted and
   listed; recomputed steps (steps whose executor ran again after resume)
   counted per run.
5. Debugging surface: pre-registered as a hypothesis, reported as Not yet
   measured with the reason, unless the fixed procedure in HYPOTHESES.md
   can be run as written.

## Controls

- Same seed list for both arms, paired trial by trial.
- Same step budget (24 policy steps per run) and same retry budget (2
  retries per tool call) in both arms.
- Versions pinned in requirements-lock.txt and printed into the results
  environment record.
- One command reruns the whole study: python -m study.run_suite.

## Societal impact

Agents that act for people move money, send messages and change records.
An agent that repeats a side effect after a crash can charge twice or book
twice. Evidence about which orchestration choices prevent that, at what
cost, is safety evidence for every team shipping agents, not a framework
advertisement.

## Out of scope

- Real model quality, prompt design, hosted APIs (spend-gated).
- Prompt-injection resistance with a live model (pack 01 H4). A scripted
  policy does not parse tool output as instructions, so attack success is
  undefined in this design. It belongs to the Deep pass with a real model.
- Production deployment, multi-process checkpoint stores, human-in-the-loop
  interrupts.
