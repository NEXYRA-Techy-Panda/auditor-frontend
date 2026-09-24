# ACTIVE_TASK — auditor-frontend

## prompt_id

P007

## agent

A — OpenCode

## Layer ID

A1-UI

## Objective

First useful auditor screen (this repo ONLY; simulation-frontend unchanged):
CSV/JSON upload with import status + validation feedback; dataset listing +
selection; persisted energy summary; tariff editing. Keep compact connection
panel. Typed API adapter (`app/lib/auditor-api.ts`), committed node:test
checks, no fake data, no analysis/forecasts/charts/reports/comparison.
Contract 1.0.1 authoritative, read-only.

## Task status

completed

## Review status

pending

## Repository and owner

- Repository: `auditor-frontend` (`https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`)
- Agent: A — OpenCode, exclusive writer this assignment.
- Owner (foundation + long-term): Mohan.

## Current branch

`main` (P001 `bf17d59` pushed; tree clean at P007 start)

## Last checkpoint timestamp, including timezone

2026-09-24 20:25:00 +05:30 (IST) — P007 A1-UI completed.

## Applicable contract version

1.0.1 (authoritative, read-only; P001 accepted for implementation;
browser/CORS + live backend still outstanding).

## Completed steps

1. Startup: AGENTS.md absent; context/health-panel/API 1.0.1 read; git
   clean/in-sync at expected baseline bf17d59; P007 recorded.
2. Implemented `app/lib/auditor-api.ts` + upload/datasets/summary/screen
   components, wired into page; committed `app/lib/__tests__/
   auditor-api.test.mjs` (18/18) + `test` script.
3. Verified: 18/18 tests; 75/75 contract; typecheck/lint(0 errors)/build
   green; served + HTTP-200 markup; server stopped. Real backend down
   (5 open questions for Codex); no browser capability.

## Files changed

- Created: `app/lib/auditor-api.ts`, `app/lib/__tests__/auditor-api.test.mjs`,
  `app/components/upload-panel.tsx`, `app/components/datasets-panel.tsx`,
  `app/components/summary-panel.tsx`, `app/components/auditor-screen.tsx`,
  `docs/P007_A1_UI_EVIDENCE.md`. Updated: `app/page.tsx`, `package.json`,
  `README.md`, `docs/HANDOFF.md`, `docs/PROGRESS_LOG.md`, `docs/ACTIVE_TASK.md`.

## Verification performed and actual results

- `main` at `bf17d59`, fetch clean, tree clean.

## Incomplete edits and uncommitted changes

- UI implemented and verified; sibling repos untouched. Committing and
  pushing now.

## Blockers or unknowns

- None. auditor-backend upload endpoints are Codex's (P006) — build against
  the contract; record open response questions; do not wait.

## Exact next action

Commit, push `main`, verify remote hash; then return P007 evidence.
Stop after P007.

## Related-repository dependencies

Paired backend `../auditor-backend` (4001, Codex P006); read-only
health/list calls only if already running; no test uploads to a live DB.

## Commit reference

P001: `bf17d599b3753a9e943e4c1364fc37b87ad0635f` (pushed, verified).
P007: none yet.
