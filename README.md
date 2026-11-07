# LangGraph versus Native: a pre-registered paired study

Live dashboard: https://jesunahmadushno.github.io/langgraph-vs-native-study/

## Problem

Agent frameworks promise durable, resumable agents. The promise is
rarely tested against a plain hand-written loop under matched controls,
so teams pay the framework's cost without knowing what it buys. The
expensive failure is specific: an agent that crashes mid-task and then
repeats a side effect (a second charge, a second booking) is worse than
a slow agent. This study measures what the orchestration layer alone
contributes to success, consistency, cost and exactly-once recovery.

## Purpose and verdict

Two arms run the same 12 tasks with the same scripted decision policy,
the same tools, the same step executor, the same budgets, paired by
seed. One arm sequences the work with LangGraph 1.2.20 and its SQLite
checkpointer. The other uses a hand-written loop with its own SQLite
event log. Hypotheses were committed before any experiment code
(HYPOTHESES.md).

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

## Key measured results

| Measure | Native loop | LangGraph |
|---|---|---|
| Overall pass^1 (12 tasks, 8 trials each) | 0.979 | 0.979 |
| pass^4, averaged over tasks | 0.917 | 0.917 |
| Median wall seconds per run | 0.980 | 0.293 |
| Recovery pass rate (48 fault runs) | 1.000 | 1.000 |
| Arm-specific code lines | 96 | 81 |

Hypothesis verdicts (charter gate 9): H1 success equivalence,
Supported. H2 cost, Supported. H3 recovery, Supported in its tie form:
the orchestrator adds nothing measurable on recovery in this design.
H4 debugging surface, Not yet measured (reason in RESULTS.md).

## Architecture

- study/tasks.py: the 12 fixtures and their intended side effects.
- study/policy.py: the scripted policy, identical in both arms.
- study/tools.py: lookup, append_record (a local ledger file),
  was_applied. The ledger tool does not deduplicate; exactly-once is
  the orchestrator's problem.
- study/executor.py: the shared per-step executor and retry budget.
- study/arm_langgraph.py: the graph arm (one node per step, SQLite
  checkpointer, idempotent node pattern).
- study/arm_native.py: the loop arm (state committed per step,
  write-ahead intent log for effects).
- study/run_suite.py: main suite in process, fault suite as killed
  and resumed subprocess pairs.
- study/analyze.py: every number in RESULTS.md, computed from the raw
  files.

## Reproduction

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q          # unit and smoke tests
.venv/bin/python -m study.run_suite    # 192 main runs, 96 fault runs
.venv/bin/python -m study.analyze      # regenerates RESULTS.md
```

Versions are pinned in requirements-lock.txt and printed into
results/env.json by the suite.

The live dashboard in site/ reads the committed result files at build
time; `cd site && npm ci && npm run build` first runs a known-answer
check that reproduces every in-browser computation against them.

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
  in ROADMAP.md before any cost claim is quoted further.
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
