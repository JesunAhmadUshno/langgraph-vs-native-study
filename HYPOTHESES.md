# HYPOTHESES: pre-registered before any experiment code

Committed before the harness, the arms and the analysis code were written.
Adapted from pack 01 (Claude verdict pack, LangChain and LangGraph),
hypotheses H1 to H4. The adaptations forced by the scripted-policy design
are recorded in DECISIONS.md. Verdict words follow charter gate 9:
Supported, Partially supported, Refuted, Inconclusive, Not yet measured.

## H1, success equivalence (from pack 01 H1)

The two arms are equivalent on pass^1 within plus or minus 5 points.

- Measure: per-task pass^1 over 8 seeded trials, 12 tasks, paired by seed.
- Test: TOST on the paired per-task differences, margin 0.05, alpha 0.05.
- Supported: the 90 percent confidence interval for the mean paired
  difference lies inside plus or minus 0.05.
- Refuted: the interval excludes zero (one arm is better) or lies fully
  outside the margin on one side.
- Inconclusive: the interval straddles a margin boundary.

## H2, cost (from pack 01 H2, tokens adapted)

LangGraph costs no more than 5 percent extra policy invocations and no
more than 10 percent extra median wall-clock time per run than the native
arm. Pack 01 set the token overhead bound at 5 percent and the latency
bound at 10 percent. A scripted policy spends no tokens, so policy
invocations stand in for model calls; the 5 percent bound applies to them.

- Measure: policy invocations per run and wall-clock seconds per run, same
  suite as H1; medians per arm; ratio LangGraph to native.
- Supported: both ratios at or under their bounds (1.05 and 1.10).
- Partially supported: one ratio inside, one outside.
- Refuted: both ratios outside their bounds.

## H3, recovery (from pack 01 H3)

After a process kill, LangGraph's exactly-once resume rate is higher than
the native arm's, OR the native arm reaches the same rate with its own
event log. A tie means the orchestrator adds nothing on this axis.

- Measure: fault suite, 48 runs per arm, classes F1 (kill between steps)
  and F2 (kill mid-step, after the effect and before the record). A run
  passes only if the task completes and every intended side effect appears
  in the ledger exactly once. Duplicates are failures.
- Supported (LangGraph advantage): LangGraph's overall pass rate exceeds
  the native rate by more than 2 points.
- Supported (tie form): the rates differ by at most 2 points. The verdict
  text must then say the orchestrator adds nothing measurable on recovery
  in this design.
- Refuted: the native rate exceeds LangGraph's by more than 2 points.

## H4, debugging surface (pack 01 axis 5 in this study's design)

A reviewer can diagnose a seeded fault faster from LangGraph's checkpoint
history than from the native arm's event log.

- Fixed procedure, if run: 6 seeded faults (3 per arm, same fault kinds);
  a scripted diagnostician may only read the arm's persisted trace files;
  the measure is the number of trace records read until the record that
  names the failing step is found, plus wall time of the search.
- Report rule: if this procedure is not run exactly as written, the axis
  is reported as Not yet measured with the reason, and no proxy number is
  presented as diagnosis time.

## Stop rules

- The suite runs once as registered: 12 tasks, 8 trials, seeds 1000 to
  1007 per task; fault suite as registered in SPEC.md.
- No task, seed or threshold changes after the first suite run. Any fix to
  a harness bug after a run is logged in DECISIONS.md and the whole suite
  is rerun; partial reruns are not reported.
- Failures and duplicates are published, not filtered.

## Predictions (registered, not results)

- H1: Supported. The policy decides; the orchestrator only routes.
- H2: Supported on invocations (identical by construction unless resume
  re-invokes), at risk on wall-clock from checkpoint writes.
- H3: Tie form. Both arms share the step executor and the reconciliation
  read, so exactly-once should hold in both; the difference, if any, will
  show in recomputed steps and code surface instead.
