# ACTIVE_TASK — auditor-frontend

## prompt_id

P001

## agent

A — OpenCode

## Layer ID

F4-A

## Objective

Replace the static "not implemented" status with a real browser-side backend
connection panel (`NEXT_PUBLIC_AUDITOR_BACKEND_URL` + `/api/v1/health`):
states, Check button, initial check on load, bounded timeout, abort on
unmount, no duplicates, no polling. Typed parsing; show URL, contract
version, last-check time, actual state (ml_reachable:not_checked ≠ ML
connected). Verify via mock-server + logic tests, typecheck, lint, build,
HTTP. No uploads, charts, or auth UI. Contract 1.0.1 authoritative, read-only.

## Task status

completed

## Review status

pending

## Repository and owner

- Repository: `auditor-frontend` (`https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`)
- Agent: A — OpenCode, exclusive owner of the two frontends this layer.
- Owner (foundation + long-term): Mohan.

## Current branch

`main` (F2-A `8cf215a` pushed; tree clean at P001 start)

## Last checkpoint timestamp, including timezone

2026-09-24 19:55:00 +05:30 (IST) — P001 F4-A completed (auditor UI).

## Applicable contract version

1.0.1 (authoritative, read-only; F1-R2 accepted, F2-A accepted — dated
correction recorded).

## Completed steps

1. Startup: AGENTS.md absent; context/API/manifest read; git clean/in-sync;
   P001 recorded.
2. Implemented `app/lib/health.ts` + `app/components/connection-panel.tsx`,
   wired into page (kind="auditor").
3. Verified: shared 20/20 logic+mock checks; 75/75 contract; typecheck/lint(0
   errors)/build green; served + HTTP-200 panel markup; servers stopped.
   Real backend down (pending); no browser capability.

## Files changed

- Created: `app/lib/health.ts`, `app/components/connection-panel.tsx`,
  `docs/P001_F4_A_EVIDENCE.md`. Updated: `app/page.tsx`, `docs/HANDOFF.md`,
  `docs/PROGRESS_LOG.md`, `docs/ACTIVE_TASK.md`.

## Verification performed and actual results

- `main` at `8cf215a`, fetch clean, tree clean.

## Incomplete edits and uncommitted changes

- Panel implemented and verified; backend repos untouched. Committing and
  pushing now.

## Blockers or unknowns

- None.

## Exact next action

Commit, push `main`, verify remote hash; then return P001 evidence.
Stop after P001.

## Related-repository dependencies

Paired backend `../auditor-backend` (4001, Codex's assignment); read-only
health checks only if already running.

## Commit reference

F2-A: `8cf215aaff637bf12f28b6194f45e57a267b0015` (pushed, verified).
P001: none yet.
