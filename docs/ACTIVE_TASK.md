# ACTIVE_TASK — auditor-frontend

## prompt_id

P011

## agent

A — OpenCode

## Layer ID

F6-frontend / auditor integration preparation

## Objective

Align auditor-frontend assumptions against the committed auditor-backend
interface (read-only inspection) or, if P006 is uncommitted, preserve the
working UI and record the integration checklist. Create
`docs/AUDITOR_INTEGRATION_CHECKLIST.md` (concrete future local verification:
services/config, scratch DB, reference JSON/CSV upload, 0.03 kWh, reimport
semantics, ₹10→₹0.30, zero-vs-unset tariff, no-partial-import, browser/CORS/
selection/refresh/upload/tariff checks, mock-vs-executed status). Save
`docs/P011_FRONTEND_HANDOFF_ALIGNMENT_EVIDENCE.md`. No speculative API
changes. Contract 1.0.1 authoritative, read-only.

## Task status

completed

## Review status

pending

## Repository and owner

- Repository: `auditor-frontend` (`https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`)
- Agent: A — OpenCode.
- Owner (foundation + long-term): Mohan.

## Current branch

`main` (P007 `9304022` pushed; tree clean at P011 start)

## Last checkpoint timestamp, including timezone

2026-09-24 20:55:00 +05:30 (IST) — P011 completed (alignment + checklist).

## Applicable contract version

1.0.1 (authoritative, read-only).

## Completed steps

1. Startup: AGENTS.md absent; context/handoff/active-task/progress/prompt/
   P007 evidence/API read; git clean/in-sync at expected baseline 9304022.
2. Inspected committed auditor-backend (read-only `git show`): latest commit
   aa53d0c (P003 SQLite foundation). No imports routes in committed src —
   P006 is uncommitted work in progress. Taking the document-and-checklist
   branch: no UI changes, no waiting, no polling.
3. Wrote `docs/AUDITOR_INTEGRATION_CHECKLIST.md` +
   `docs/P011_FRONTEND_HANDOFF_ALIGNMENT_EVIDENCE.md`; updated continuity.
4. Verified: 18/18 tests, 75/75 contract, typecheck/lint(0 errors)/build
   green (re-run on docs-complete tree).

## Files changed

- Updated: `docs/ACTIVE_TASK.md` (this file).

## Verification performed and actual results

- `main` at `9304022`, fetch clean, tree clean. Backend HEAD aa53d0c
  inspected without touching its worktree.

## Incomplete edits and uncommitted changes

- Checklist + evidence written and verified; sibling repos, backends,
  contracts untouched. Committing and pushing now.

## Blockers or unknowns

- None. Not blocked on Codex: this branch finishes independently.

## Exact next action

Commit, push `main`, verify remote hash; then return P011 evidence.
Stop after P011.

## Related-repository dependencies

auditor-backend `../auditor-backend` (Codex P006, uncommitted): inspect
committed files only; no staging/starts/installs/edits. No test uploads to
any live DB.

## Commit reference

P007: `9304022c8264d36b1b6729c45eebe15d5716402c` (pushed, verified).
P011: none yet.
