# ACTIVE_TASK — auditor-frontend

## prompt_id

P025

## agent

A — OpenCode

## Layer ID

A6

## Objective

Connect the selected-dataset auditor UI to the committed P020 public
forecast-job API at backend `df1ecbd08369d71f88de9cf5f26e6d8fd44e8ebd`
(Python P013 `7f71363aa9361e67a0cb2815b98aee79b0708cf9`): accessible
24-hour / 7-day / next-calendar-month request flow, queued/running/terminal
states, all returned hourly values in an accessible SVG + table, backend
coverage/warnings/assumptions, and tariff re-fetch without rerun. Preserve the
P017 import flow, P019 findings, and P014 printable dataset summary; forecasts
remain outside the printable report.

## Task status

completed

## Review status

pending

## Repository and owner

- Repository: `auditor-frontend` (`https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`)
- Agent: A — OpenCode, exclusive writer this assignment.
- Owner: Mohan.

## Current branch

`main` (P019 `855879caa33b1751430439bca5d393e99afb5f2e` was the clean,
remote-matched P025 baseline).

## Last checkpoint timestamp, including timezone

2026-09-25 00:10:00 +05:30 (IST) — P025 implementation, isolated real
integration, evidence and final verification complete; ready to commit/push.

## Applicable contract version

1.0.1 (read-only; no contract/sibling changes).

## Completed steps

1. Startup: no `auditor-frontend/AGENTS.md`; continuity, P017/P019 evidence,
   checklist, current import/summary/findings source and tests read; `main`
   clean/in-sync at expected baseline `855879c`.
2. Read committed P020 `df1ecbd` API examples/route/runner/job tests/evidence
   and P013 `7f71363` baseline evidence/service. No sibling working-tree reads
   or writes.
3. Implemented strict P020 adapter, all-horizon labels, null-vs-zero costing,
   scope/single-flight/recovery helpers, gap-safe chart preparation, and 13
   focused tests.
4. Implemented/wired the accessible forecast dashboard: exact job
   polling/states, stale guards, prior-completion preservation, tariff GET
   refresh, complete backend coverage/warnings/assumptions, responsive SVG,
   and all-hour table. P017 import, P019 findings, and P014 print boundary are
   preserved.
5. Isolated pinned P020 + P013 A–E checks passed through the actual frontend
   adapters: 672-hour import, 720-point full-month forecast, exact origin and
   total, unset/₹10/₹0 same-job costing, real insufficient-data, CORS
   preflight, and real P010 reference analysis (0.01 kWh / ₹0.10; refrigerator
   excluded).
6. The real analysis check exposed P019's incorrect top-level findings fixture:
   committed P015 nests findings/pagination in `result`. Corrected the adapter
   and tests; final A–E run passed.
7. Final verification: 65/65 tests, typecheck clean, lint 0 errors (one
   pre-existing verifier warning), contract 75/75, production build exit 0,
   served HTTP-200 markup. Browser interaction remains unverified because the
   built-in browser cannot reach a session-started localhost server.

## Files changed

- Created: `app/lib/forecast.ts`, `app/lib/__tests__/forecast.test.mjs`,
  `app/components/forecast-dashboard.tsx`,
  `docs/P025_FORECAST_DASHBOARD_EVIDENCE.md`.
- Updated: `app/components/auditor-screen.tsx`, `app/lib/analysis.ts`,
  `app/lib/__tests__/analysis.test.mjs`, `package.json`,
  `docs/ACTIVE_TASK.md`, `docs/HANDOFF.md`, `docs/PROGRESS_LOG.md`,
  `docs/AUDITOR_INTEGRATION_CHECKLIST.md`, and the P019 evidence addendum.

## Verification performed and actual results

- `npm test`: 65 passed, 0 failed.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, one pre-existing untouched verifier warning.
- `npm run verify:contract`: 75 passed, 0 failed.
- `npm run build`: exit 0.
- Real A–E: pass; values and distinctions recorded in P025 evidence.
- Git baseline/remote matched at start; sibling repos untouched.

## Incomplete edits and uncommitted changes

Implementation and task documentation are complete but not yet committed. No
known code defect or blocker.

## Blockers or unknowns

- Browser interaction, narrow-screen visual inspection, keyboard traversal and
  print-boundary confirmation remain pending because this session's built-in
  browser cannot open its self-hosted localhost server. This is a verification
  limitation, not a code blocker.
- Review remains pending; no approval is claimed.

## Exact next action

Inspect staged task-owned files, commit P025, push `main` normally without
force, verify local HEAD equals remote `origin/main`, record the hash, and
return the P025 evidence report. Stop after P025.

## Related-repository dependencies

- auditor-backend P020 `df1ecbd08369d71f88de9cf5f26e6d8fd44e8ebd`.
- energy-ml-service P013 `7f71363aa9361e67a0cb2815b98aee79b0708cf9`.
- Frontend calls Node only. Real checks used temporary committed exports and a
  scratch DB; the harness files and scratch DB were removed. One extra pinned
  backend source/build export remains in OS temp after automatic review
  rejected recursive cleanup; see the P025 evidence. It is outside Git and no
  service process remains running.

## Commit reference

P019: `855879caa33b1751430439bca5d393e99afb5f2e` (pushed, remote verified).
P025: `3beb07b8d97930ffabc040a797b1d0f3f963e453` (pushed, remote verified).
