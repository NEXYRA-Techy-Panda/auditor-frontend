# P012 auditor UI reliability evidence (Agent A — OpenCode)

Written before commit; commit hash is returned in the P012 evidence report.

## Status

A2-UI complete, review pending. Simulation-frontend untouched. Contract
1.0.1 authoritative, untouched. No redesign, no speculative backend shapes.

## Actual defects found and corrected

1. Summary shown under a newer selection's identity (header B + A's values,
   plus A's error persisting). Fixed: values render only when
   `summary.dataset_id === datasetId`; otherwise previous values stay
   explicitly labeled "Previous information for {id} — may be stale" with a
   "Loading {B}…" line; errors scoped per request (`errorForId`).
2. Tariff completion clobbering another selection (save for A reloading A's
   summary/form into B's view). Fixed: submitter ID captured; reload applies
   only while still selected, else a notice names both datasets and B is
   untouched.
3. Unconditional post-upload auto-select overwriting a deliberate newer
   selection. Fixed: timestamp guard (`shouldAutoSelectImport`) + explicit
   View action in the upload success box; list still refreshes either way.
4. Errors surviving selection changes (obsolete error under new request).
   Fixed: error/rateError/notice cleared on selection change; failures scoped.
5. Summary load had no abort controller (only a mounted guard). Fixed: abort
   on unmount like the other panels.
6. Tariff form carried a previous dataset's input/errors across selections.
   Fixed: reset on selection change; successful load fills.

## Safeguards confirmed without rewrites

Request-identity tracker for list/summary loads, refresh-failure preservation
(list + summary + upload result), unmount aborts in upload/datasets panels,
120 s upload timeout with unknown-completion explanation (no rollback claim),
duplicate-submission guards, no polling.

## User-visible improvements

- role="status" success/notice regions, role="alert" errors, aria-live
  loading line, aria-invalid + describedby tariff input, focus-visible
  outlines on all buttons/label/input.
- Unset cost/tariff read "Not set (no tariff applied)" / "Not set";
  explicit zero reads "₹0/kWh (explicit zero rate)".
- Synthetic disclosure only when the response says `synthetic: true`
  ("simulated for evaluation, not measured") — never inferred.
- Long names/errors wrap (break-all); tariff row flex-wraps for narrow
  screens. No accessibility conformance claimed from inspection.

## Race-condition tests and results

Committed `npm test` (node:test, zero deps): **23/23** (18 prior + 5 new) —
late-A summary ignored after B selected (deferred mocks through the real
`getSummary` + tracker), obsolete-error drop, tariff guard (3 cases),
auto-select guard (5 cases incl. equal timestamps), synthetic explicit-only
(4 cases). Tests exercise lib logic the UI calls (tracker, guards, parsers),
not a disconnected reimplementation; component render transitions remain
browser-pending.

## Mock vs browser vs real-backend verification

- Mock: 23/23 adapter/guard checks (mock fetch, real FormData).
- HTTP: served production `GET /` → 200 with upload/list/summary/panel shells
  (interactive states render client-side). Contract 75/75, typecheck clean,
  lint 0 errors, build exit 0.
- Real backend: `:4001/health` refused — zero live calls, nothing uploaded,
  no compatibility claimed. P006 committed state unknown this session beyond
  P011's aa53d0c finding; the 5 open questions stand.
- Browser: absent — keyboard, narrow layout, upload/selection/tariff
  interactions, live regions, and CORS unverified. Stated plainly.

## Files changed

- Updated: `app/lib/auditor-api.ts` (synthetic field, two guard helpers).
- Updated: `app/components/summary-panel.tsx` (rewrite: scoping, guards,
  abort, a11y, wording), `upload-panel.tsx` (timestamps, View action, roles,
  focus, wrapping), `datasets-panel.tsx` (focus, status role),
  `auditor-screen.tsx` (manual-select guard).
- Updated: `app/lib/__tests__/auditor-api.test.mjs` (+5 tests),
  `README.md` (test line already present — verified),
  `docs/HANDOFF.md`, `docs/ACTIVE_TASK.md`, `docs/PROGRESS_LOG.md`,
  `docs/AUDITOR_INTEGRATION_CHECKLIST.md` (race-interaction pending note).
- Created: `docs/P012_AUDITOR_UI_RELIABILITY_EVIDENCE.md` (this file).
- Preserved: contract, verifier, lockfile versions (no new dependencies).

## Remaining integration dependencies

Running auditor-backend for the checklist + 5 open questions; a browser for
interaction/CORS confirmation. No code dependency.

## Processes

None running at end. Port 3001 free. No sibling/foreign processes touched.

## Commit/push

Authorised P012 commit + push to `origin/main` (repo-local identity
mohan-madhu). No force-push. Hash verified via `ls-remote`; reported in the
P012 evidence report.
