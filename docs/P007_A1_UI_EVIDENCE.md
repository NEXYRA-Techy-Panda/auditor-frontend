# P007 A1-UI evidence — auditor-frontend (Agent A — OpenCode)

Written before commit; commit hash is returned in the P007 evidence report.

## Status

A1-UI complete, review pending. Upload → list/select → summary/tariff screen
works against the contract interface. No analysis, forecasts, charts, reports,
or comparison. Contract 1.0.1 authoritative, untouched. Simulation-frontend
untouched.

## Implemented flow

- Upload panel: accessible picker (.csv/.json), filename + size, Replace/
  Remove before submit, explicit Upload, empty/submitting/success/failure
  states, duplicate-submission guard, 120 s timeout, abort on unmount.
  FormData field `file`, no manual Content-Type. "Uploading and validating…"
  (no fake progress). Timeout → unknown-completion message + refresh-before-
  retry guidance, no rollback claim. Errors with field/row refs, warnings,
  duplicates, 413/409/unreachable handling; server text rendered as text.
- Datasets panel: independent load (loading/empty/error/loaded), manual
  Refresh, selection with metadata (run/scenario/interval/imported time),
  selection preserved across refresh, failed refresh keeps the old list with
  explanation, request-identity guard against stale selection responses.
- Post-import: list refreshes, returned dataset_id selected, summary fetched.
  Failed list refresh never erases the upload result or a shown summary.
- Summary panel: server values only (energy kWh, cost or "Not set", tariff or
  "Not set", gaps). Tariff input "Electricity rate (₹/kWh)": blank rejected
  (never zero), "0" valid, negatives/non-numbers rejected; explicit Save;
  summary reloaded on confirm; input preserved + error on failure. Flat-tariff
  estimate disclaimer (not a full bill).

## API assumptions and unresolved response questions (for Codex)

- Assumed: multipart field `file`; success bodies accepted bare OR in
  `{data}`; list accepted bare array OR `{data}/{items}/{datasets}}`.
- `already_imported:true` or `status:"already_imported"` honoured; other
  already-imported shapes display only documented fields.
- Rejected imports throw with the server report (errors/warnings/duplicates).
- 413→too-large guidance, 409→conflict (possibly already-imported),
  tariff PUT `{inr_per_kwh}` → `{dataset_id, inr_per_kwh}`.
- OPEN QUESTIONS: (1) Do imports routes use the `{data,meta}` envelope or
  bare bodies? (2) What exact body accompanies already-imported (status?
  dataset_id? 200 or 409)? (3) Validation detail field names beyond
  message/field/row? (4) Summary gaps element shape? (5) Tariff response on
  validation failure (422 vs 400, error shape)? Adapter tolerates all; UI
  shows only supported info.

## Verification results

- Committed `npm test` (node:test, no deps, direct .ts import via type
  stripping): **18/18** — multipart field + no manual Content-Type, bare/
  enveloped success, already-imported, rejected-with-report, 409/413,
  timeout-unknown, malformed→BAD_RESPONSE, unreachable, list parse/reject,
  tracker stale protection, unset-cost nulls, tariff blank-vs-zero, tariff
  PUT shape, timeout bounds.
- Contract verifier: 75/75 (unchanged). Typecheck: clean (fixed BodyInit
  mismatch). Lint: 0 errors (fixed sync-setState-in-effect via deferred load;
  1 pre-existing untouched-verifier warning).
- Production build: exit 0. Served `next start -p 3001` (own PID, stopped):
  `GET /` → 200 with upload/datasets/summary-placeholder/panel markup
  (tariff input renders after selection — correctly absent in SSR).
- No snapshot tests of static text. No test data uploaded anywhere.

## Actual/mock/browser distinctions

- Mock: all 18 adapter checks run against mock fetch + real FormData/File —
  no server needed; no backend ports used.
- Real backend: `:4001/health` and `:4001/imports` → connection refused
  (Codex P006 not serving). No live calls made; nothing uploaded to any DB.
  Integration (incl. the 5 open questions) pending; not waited on.
- Browser: NO browser capability in this session — upload interactions,
  selection, tariff editing, and CORS unverified beyond SSR markup. Stated
  plainly; SSR proves nothing about client transitions.

## Processes

None running at end. Port 3001 free. No sibling/foreign processes touched;
no backend started.

## Files changed

- Created: `app/lib/auditor-api.ts`, `app/lib/__tests__/auditor-api.test.mjs`,
  `app/components/upload-panel.tsx`, `app/components/datasets-panel.tsx`,
  `app/components/summary-panel.tsx`, `app/components/auditor-screen.tsx`,
  `docs/P007_A1_UI_EVIDENCE.md` (this file).
- Updated: `app/page.tsx`, `package.json` (test script), `README.md`,
  `docs/HANDOFF.md`, `docs/PROGRESS_LOG.md`, `docs/ACTIVE_TASK.md`.
- Preserved: contract, verifier, lockfile dependency versions (no new deps).

## Commit/push

Authorised P007 commit + push to `origin/main` (repo-local identity
mohan-madhu). No force-push. Hash verified via `ls-remote`; reported in the
P007 evidence report. Sibling repos untouched.

## Next-task dependencies

Running auditor-backend (Codex P006) to answer the 5 questions live; a
browser for interaction/CORS confirmation. No code dependency.
