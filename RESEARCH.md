# RESEARCH: literature and evidence base

Base document: Claude verdict pack 01, LangChain and LangGraph (filed
2026-11-05, goal record). This file carries the pack's evidence table
with the verification status the pack itself assigned. Nothing here has
been upgraded: rows the pack marked partly verified or unverified are
still marked that way, and no row is used as a load-bearing claim in
this repository until it is checked against the primary source.

## Search record

- Programme research pass, 2026-11-05: official LangChain and LangGraph
  documentation and changelog, Anthropic engineering writing, the
  tau-bench paper (arXiv:2406.12045), the AgentDojo paper
  (arXiv:2406.13352), "AI Agents That Matter" (arXiv:2407.01502), and
  security advisories for langgraph-checkpoint and langchain-core
  through mirrors.
- Absence claim from that pass (pack row E14): no peer-reviewed
  controlled study comparing LangGraph against a native loop on these
  axes was found. Status: unverified absence. A systematic search with
  logged strings and hit counts (pack upgrade U1) remains open and is
  listed in ROADMAP.md. This study makes no novelty claim beyond
  "pre-registered and controlled", which the record supports.

## Evidence table (from pack 01, statuses as assigned there)

| # | Claim | Source | Status in pack |
|---|---|---|---|
| E1 | The most successful agent implementations used simple, composable patterns rather than complex frameworks. | Schluntz and Zhang, "Building effective agents", Anthropic Engineering, Dec 2024 | Verified (practitioner report) |
| E2 | Frameworks can hide prompts and responses, make debugging harder, and invite unneeded complexity. | Same as E1 | Verified |
| E3 | LangGraph 1.0 is generally available, with durable state that resumes after a restart and SQL persistence options. | LangChain changelog, Oct 2025 | Verified (vendor source) |
| E4 | Interrupts and durable resume need a checkpointer and a thread id; production use should store checkpoints in a database. | LangGraph overview docs, via a third-party summary | Partly verified |
| E5 | Side effects inside a node can repeat on resume unless wrapped for durability. | Reading of the LangGraph durable-execution docs | Unverified there; tested directly by this study's fault suite |
| E6 | tau-bench introduces pass^k; even strong function-calling agents succeed on under half the airline tasks at pass^1. | Yao et al., tau-bench, ICLR 2025 | Verified |
| E7 | tau-bench scores by comparing final database state with an annotated goal state. | Same as E6 | Verified |
| E8 | On gpt-40, function calling beat Act and ReAct variants on tau-bench. | Same as E6, via a secondary review | Partly verified |
| E9 | AgentDojo: 97 tasks and 629 security test cases, NeurIPS 2024. | Debenedetti et al., AgentDojo, NeurIPS 2024 | Verified |
| E11 | Agent evaluation must be cost-controlled; accuracy-only focus made published agents impractically expensive. | Kapoor et al., "AI Agents That Matter", TMLR 2025 | Verified |
| E12 | CVE-2025-64439: remote code execution in langgraph-checkpoint 2.1.2 and below; fixed in 2.1.3. | GitHub Security Advisory, via mirrors | Verified via mirrors |
| E13 | CVE-2025-68664: serialization flaw in langchain-core; fixed in 1.2.4. | GitHub Security Advisory, via mirrors | Verified via mirrors |

This study pins langgraph-checkpoint 4.3.1 and langchain-core 1.7.6
(requirements-lock.txt), above both fix versions. Exact installed
versions are printed into results/env.json by the suite.

## Horizons

- Past: hand-written loops and early framework wrappers; evaluation by
  single-run success only.
- Present: pass^k consistency reporting (E6), cost-controlled agent
  evaluation (E11), durable execution as a framework selling point (E3),
  and open questions about what durability actually guarantees (E5).
- Future: this study's Deep pass (ROADMAP.md): a real model under the
  same harness, prompt-injection axes, timed human diagnosis for the
  debugging axis.
