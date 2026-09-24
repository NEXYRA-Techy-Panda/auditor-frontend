# ACTIVE_TASK — auditor-frontend

## prompt_id

P014

## agent

A — OpenCode

## Layer ID

A3

## Objective

Printable "Energy dataset summary" for the selected dataset from one
coherent fetched snapshot (identity, energy, tariff, cost, gaps, synthetic
disclosure, fetch vs generation times), with print eligibility gating and
print CSS (browser print only). Fix shouldAutoSelectImport wall-clock
ordering with a monotonic revision if needed (+ regression test). Committed
tests, no new deps, no invented findings/forecasts/savings. Contract 1.0.1
authoritative, read-only. This repo ONLY.

## Task status

completed

## Review status

pending

## Repository and owner

- Repository: `auditor-frontend` (`https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`)
- Agent: A — OpenCode, exclusive writer this assignment.
- Owner (foundation + long-term): Mohan.

## Current branch

`main` (P012 `7d3661e` pushed; tree clean at P014 start)

## Last checkpoint timestamp, including timezone

2026-09-24 21:01:12 +05:30 (IST) — P014 A3 completed.
(System clock reads slightly behind P012's 21:10 entries — NTP correction;
using real current time.)

## Applicable contract version

1.0.1 (authoritative, read-only; P012 accepted; real integration + browser
verification still pending — recorded).

## Completed steps

1. Startup: AGENTS.md absent; PROJECT_CONTEXT/WORKSPACE_MAP/HANDOFF/
   ACTIVE_TASK/PROGRESS_LOG/AGENT_START_PROMPT/P012 evidence/checklist/P007
   evidence/implementation read; git clean/in-sync at expected baseline
   7d3661e; P014 recorded.
2. Implemented fixed-snapshot report + eligibility gating + print CSS +
   ReportView; replaced wall-clock guard with monotonic revision.
3. Verified: 29/29 tests; 75/75 contract; typecheck/lint(0 errors)/build
   green; HTTP-200 shells; print CSS in built bundle; server stopped.
   Real backend down; print preview/keyboard/browser unverified.

## Files changed

- Created: `app/components/report-view.tsx`, `docs/P014_DATASET_SUMMARY_EVIDENCE.md`.
  Updated lib guards/snapshot helpers, screen/upload/summary wiring, print CSS,
  6 new tests, `docs/HANDOFF.md`, checklist §6 note, `docs/PROGRESS_LOG.md`,
  `docs/ACTIVE_TASK.md`.

## Verification performed and actual results

- `main` at `7d3661e`, fetch clean, tree clean.

## Incomplete edits and uncommitted changes

- Work complete and verified; sibling repos, backends, contracts untouched.
  Committing and pushing now.

## Blockers or unknowns

- None. No waiting on Codex; no uncommitted reads.

## Exact next action

Commit, push `main`, verify remote hash; then return P014 evidence.
Stop after P014.

## Related-repository dependencies

auditor-backend `../auditor-backend` (Codex): no writes/starts/stops; no
test uploads to any live DB.

## Commit reference

P012: `7d3661e646297c5ea11e73a9208ab874d6c2897b` (pushed, verified).
P014: none yet.
