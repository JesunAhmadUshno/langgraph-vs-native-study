# DECISIONS

## D1. Scripted policy instead of a model

Pack 01 designs the comparison around a real model on tau-bench. Zero
spend rules out hosted models, and a small local model would mix model
quality and a user simulator into an orchestration question. This study
uses a deterministic scripted policy in both arms. Consequence: the
research object is the orchestration layer only, and every claim in
this repository is limited to that layer. The real-model run is the
Deep pass (ROADMAP.md).

## D2. Pack H4 (prompt injection) is out of scope here

A scripted policy does not read tool output as instructions, so attack
success is undefined, not zero. Rather than report a meaningless tie,
the hypothesis is deferred to the Deep pass with a real model and an
AgentDojo-style suite. This study's H4 is the pack's fifth axis,
debugging surface.

## D3. Hypotheses H1 to H4, adapted

- H1 unchanged: pass^1 equivalence within plus or minus 5 points, TOST.
- H2 adapted: pack bounds were token overhead at most 5 percent and
  latency at most 10 percent. With no tokens spent, policy invocations
  stand in for model calls under the 5 percent bound; wall-clock keeps
  the 10 percent bound.
- H3 unchanged in substance: resume rate after a kill, duplicates are
  failures, a tie means the orchestrator adds nothing on this axis.
- H4 is the debugging axis (pack axis 5), with its registered
  fixed procedure and its Not yet measured rule.

## D4. Fixtures built for this study instead of tau-bench

tau-bench needs a model and an LLM user simulator; both are excluded
by D1. The 12 fixtures here are small, deterministic and fully
inspectable, and their intended effects are known exactly, which the
exactly-once scoring requires. The cost is external validity: scores
here are not comparable to any published leaderboard, and the README
says so.

## D5. Exactly-once discipline lives in both arms, idiomatically

The shared executor never touches the ledger directly for appends. It
asks the arm to reconcile and to commit. LangGraph arm: the node checks
the ledger before applying (the framework's documented idempotency
pattern for node side effects). Native arm: a write-ahead intent log
plus the same ledger check on restart. Letting the framework arm run
without its documented discipline would have tested a strawman, not
LangGraph; pack weakness 2 cuts both ways.

## D6. Native arm code budget: measured, not capped

Pack calculation C5 suggests a fixed budget for the native baseline
(for example 150 lines). This study does not cap the native arm;
instead the code surface of both arms is counted by script and
published, so a reader can judge whether the comparison was fair. The
native arm is one competent implementation under this rule, not "the"
native approach.

## D7. Fault injection lives in the harness, not in either arm

The F1 hook sits at the executor's step boundary and the F2 hook inside
the shared append_record, both driven by environment variables that
only the fault runner sets. Neither arm can see or special-case a
fault. Resume attempts run with no kill variables set.

## D8. Debugging axis reported as Not yet measured

The registered procedure counts trace records read by a scripted
diagnostician. The arms persist traces in incommensurable units
(checkpoint rows versus event records), so the count would measure
storage format, not diagnosis effort. Under the rule registered in
HYPOTHESES.md, the axis is reported as Not yet measured with this
reason, and ROADMAP.md carries a timed human procedure for the Deep
pass. No proxy number is presented as diagnosis time.
