# ACTIVE_TASK — auditor-frontend

## prompt_id

P017

## agent

A — OpenCode

## Layer ID

F5-UI

## Objective

Align the frontend with completed P006 (pinned backend commit 67998d5,
exported read-only to a task-owned temp dir): capture real import/list/
summary/tariff responses, resolve the five open questions, correct the
adapter/UI, keep P012 safeguards + P014 report, add reproducible opt-in
integration checks. No analytics screens, no simulator work. Contract 1.0.1
unchanged.

## Task status

completed

## Review status

pending

## Repository and owner

- Repository: `auditor-frontend` (`https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`)
- Agent: A — OpenCode, exclusive writer this assignment (auditor-frontend).
- Owner (foundation + long-term): Mohan.

## Current branch

`main` (P014 `78e1626` pushed; tree clean at P017 start)

## Last checkpoint timestamp, including timezone

2026-09-24 21:35:00 +05:30 (IST) — P017 F5-UI completed.

## Applicable contract version

1.0.1 (unchanged; P014 accepted; browser/print + prior live integration
still pending — recorded).

## Completed steps

1. Startup: AGENTS.md absent; context/evidence/checklist/implementation
   read; git clean/in-sync at expected baseline 78e1626; P017 recorded.
2. Verified P006 commit 67998d5 exists; exported it to
   `...\Temp\opencode\p017-backend` (two-step archive; PowerShell pipe
   breaks tar — recorded for future agents).
3. Answered all five API questions from source+evidence; aligned adapter/UI
   (envelopes, details extraction, coverage/gaps, stale-print block).
4. Ran isolated backend (scratch DBs, port 4566): A–F 17/17; committed
   check:live 9/9 twice; 36/36 unit tests; 75/75 contract; typecheck/lint(0
   errors)/build green. CORS headers HTTP-checked only. Test backends
   stopped; ports free.

## Files changed

- Created: `scripts/check-live-integration.mjs`,
  `docs/P017_AUDITOR_REAL_INTEGRATION_EVIDENCE.md`. Aligned adapter, summary/
  report views, 13 new/updated tests. Updated: `package.json` (check:live),
  `README.md` (add check:live line), continuity files, checklist.
- Nothing invented; sibling repos, databases, processes untouched beyond
  task-owned temp services (stopped). Committing and pushing now.

## Verification performed and actual results

- Frontend `main` at `78e1626`, fetch clean, tree clean. Backend repo
  untouched (no checkout/reset/stash; worktree metadata untouched).

## Incomplete edits and uncommitted changes

- Work complete and verified. Committing and pushing now.

## Blockers or unknowns

- None. Codex (P015) and Claude Code (P016) own their repos — no
  interference.

## Exact next action

Commit, push `main`, verify remote hash; then return P017 evidence.
Stop after P017.

## Related-repository dependencies

auditor-backend pinned at 67998d5 (temp copy only). Scratch DB + unused
loopback port + CORS for the test origin; no Python service. Never the
normal data/auditor.sqlite; never a foreign process.

## Commit reference

P014: `78e1626264cbb32f1dfb0054112fab71c9b101d4` (pushed, verified).
P017: none yet.
