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

## D9. Candidate commensurable debugging measure RTL-S (2026-11-17)

Gap-closure decision 5 (Jesun's ruling, 2026-11-17): no outside
reviewer for H4; a commensurable measure is built in code first, for
his review. This entry registers the measure BEFORE any computation.
It does not change the H4 verdict: H4 stays Not yet measured (D8)
unless Jesun adopts this measure and a scoring rule after review.
Any number this measure produces is a candidate-measure value, not
diagnosis time and not an H4 verdict.

### The measure: RTL-S, records to localize, step-projected

A scripted diagnostician reads only the arm's own persisted store for
one fault-suite run, in persisted order, and tries to name the step
the kill interrupted. Ground truth comes from results/raw_fault.json
(fault class, kill point) and is used only to score the answer after
the scan, never as a scan input. The failing step of a run is
kill_point minus 1 (kill points are 1-based; F1 kills before that
step starts, F2 kills inside it).

Projection to step-evidence items. Each store is first projected to
an ordered list of items, one item per persisted record that
evidences exactly one executor step:

- LangGraph (checkpoints.sqlite): one item per row of the
  checkpoints table whose metadata source is "loop", in rowid
  (persisted) order; the item's step is the metadata step, and its
  payload is the checkpoint's observations. The writes table is
  excluded: it holds several sub-step rows per checkpoint (53 rows
  against 10 checkpoints in one inspected run), a storage detail
  that would reintroduce the format dependence D8 rejected. The
  input checkpoint (metadata step -1) evidences no executor step and
  is excluded.
- Native (native_state.sqlite): one item per row of the effects
  table, in rowid (persisted) order; the item's step is the fixture
  step whose append or branch action carries that effect key (each
  key belongs to exactly one step, from study.tasks). Plus one
  terminal item for the run_state row, whose payload is the state
  body's observations; run_state is a single overwritten snapshot,
  so it contributes exactly one item, read last.

Anomaly marker, defined in step terms only, identical for both arms.
An item carries a marker for step s when its payload marks s
recovered (the observation for s carries "recovered": true, which
the shared executor writes when the arm's reconcile found the step's
effect already in the ledger), or when the item evidences the
completion of a step an earlier item already evidenced as complete
(a repeat: re-execution evidence). The diagnostician stops at the
first marked item and outputs the step the marker names.

RTL-S for a run is the number of items read up to and including the
stopping item. If no item is marked, RTL-S is the total item count
and the run is scored localized = false, a reported outcome, not an
error. A run is localized when the output step equals the failing
step. Aggregation, if computed: per arm, median RTL-S and localized
share over the 48 fault runs, split by fault class and pooled.

Unit and commensurability. The unit is the step-evidence item. Both
arms persist evidence for the same shared executor's steps, so the
step is the one indexing the two stores share by construction. The
projection counts one item per step-evidence record and excludes
sub-step rows and bytes, so the count reflects how much step
evidence a diagnostician must read, not the storage format. The
stopping rule and the marker are stated in step terms only and are
applied by the same code (study/debugging_measure.py) to both arms.

Limit recorded in advance. An F1 kill (between steps) leaves no
recovered observation and no repeated completion in either arm's
final store, so F1 runs are expected to score localized = false in
both arms. If the measure separates the arms at all, it will be on
F2 runs. This is a property of the measure, recorded before any
computation, not a post hoc excuse.

Computation gate. The measure is computable only from the arms'
persisted stores. Those stores live under workdir/fault/**, which
.gitignore excludes from this repository, so they are not part of
the committed record. The only committed fault record,
results/raw_fault.json, holds per-run aggregates (kill point,
recomputed steps, invocations, outcome) and no store contents.
Under the gap-closure discipline (committed records only, no
fabricated inputs), this lap delivers the definition, the
implementation, and its tests, and no RTL-S values: computation
waits until the stores are part of the record or Jesun directs
otherwise. The blocking artifact is named exactly: the per-run
persisted stores workdir/fault/<arm>/<task>/<cell>/
checkpoints.sqlite (LangGraph) and native_state.sqlite (native),
absent from the committed record.

Note on data-engineering-scale-lab. The same design does not
transfer there. That study's parallel open item is the U-12 second
reviewer (its REVIEW.md stands open), not a debugging axis: it has
no paired persisted step traces and no Not yet measured trace
procedure (its H4 is incremental correctness, already Supported).
A code measure cannot substitute for the human review that item
waits for, so nothing in this entry applies to it.

## D10. RTL-S candidate values computed from the local store copies (2026-11-17)

Under Jesun's resolve-everything order of 2026-11-17, the D9
computation gate is lifted for the local copies only: the RTL-S
values below were computed from the persisted stores held in this
clone under workdir/fault/** (48 checkpoints.sqlite and 48
native_state.sqlite, one per fault run in results/raw_fault.json),
which are the local copies the D9 projection was designed against.
The stores were opened read-only (the measure module connects with
mode=ro); the SHA-256 of every one of the 96 store files was taken
before and after the computation and the two manifests are
byte-identical (manifest: results/rtl_s_store_hashes.txt, manifest
SHA-256 45a17135f793df8baec28187e0c4ce40262c1b42f62f28b8254abac11
eb586b0). All 96 runs scored; no store was missing or unreadable.
The module's own CLI reproduces the aggregate below exactly.
Per-run values: results/rtl_s_candidate_values.json.

These are CANDIDATE values for Jesun's review, exactly as D9
requires. They are not diagnosis time and not an H4 verdict. H4
stays Not yet measured (D8) unless Jesun adopts this measure and
a scoring rule after review. No frozen file was edited; RESULTS.md
and HYPOTHESES.md are untouched.

Aggregate (median RTL-S in step-evidence items; localized share
is the share of runs whose output step equals the failing step):

- LangGraph, F1 (24 runs): median RTL-S 6.0, localized 20 of 24
  (0.833).
- LangGraph, F2 (24 runs): median RTL-S 5.5, localized 23 of 24
  (0.958).
- LangGraph, pooled (48 runs): median RTL-S 6.0, localized 43 of
  48 (0.896).
- Native, F1 (24 runs): median RTL-S 7.0, localized 0 of 24
  (0.000).
- Native, F2 (24 runs): median RTL-S 7.0, localized 24 of 24
  (1.000).
- Native, pooled (48 runs): median RTL-S 7.0, localized 24 of 48
  (0.500).

One recorded expectation did not hold. D9 recorded in advance
that F1 runs were expected to score localized = false in both
arms, because an F1 kill leaves no recovered observation and no
repeated completion in either arm's final store. That held for
the native arm (0 of 24) and did not hold for the LangGraph arm
(20 of 24 localized, the diagnostician stopping at a marked item
naming the failing step; the 4 unlocalized LangGraph F1 runs,
both repeats of T11 and T12, carried no marker at all). The
values stand as computed; no mechanism is claimed here, and any
interpretation is part of the review this entry waits for.
