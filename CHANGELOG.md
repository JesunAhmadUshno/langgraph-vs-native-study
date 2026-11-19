# Changelog

All notable changes to this project. Format: Keep a Changelog 1.1.
Versions follow Semantic Versioning; no release is tagged yet.

## [Unreleased]

### Changed
- 2026-11-08: Adopted the portfolio standard v2. README opens with the
  question, headline, field, job family and verdict (Functional). The
  lock is tagged proposal-v1 on c484e54, and a test fails if SPEC.md or
  HYPOTHESES.md changes by one byte. AUDIT.md, ROADMAP.md and
  docs/research-review.md moved into REPORT.md; the internal score and the
  rubric letter scores left the public repo (scores are internal). The
  dashboard reads the Deep pass list from REPORT.md. CI checks that
  RESULTS.md and results/ regenerate unchanged and sets read-only
  permissions. CodeQL, Dependabot, CITATION.cff and SECURITY.md added;
  main protected (DECISIONS.md D10).
- 2026-11-07: Pinned vite to 6.4.5 to match the reference dashboard
  build.

### Added
- 2026-11-07: Research review against a research rubric (now the
  review notes in REPORT.md).
- 2026-11-07: SHA-256 checksums for the raw evidence files, with a test.
- 2026-11-07: Live dashboard in site/ and a Pages workflow.
- 2026-11-07: Registered thresholds read from one table and recorded
  in results/summary.json.
- 2026-11-07: Tests for scoring, failure-draw reproduction, the fixture
  hash and the intervals.
- 2026-11-07: Exact intervals, a wall-ratio bootstrap and the full
  recompute distribution in the analysis (DECISIONS.md D9).
- 2026-11-06: Measured results, verdicts, README and audit.
- 2026-11-06: Shared harness, both arms, fault injection, tests and CI.
- 2026-11-06: Pre-registration of SPEC.md and HYPOTHESES.md (c484e54),
  before any experiment code.
