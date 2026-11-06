# ROADMAP: what remains, in evidence order

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
