# P019 analysis-findings UI evidence (Agent A — OpenCode)

Written before commit; commit hash is returned in the P019 evidence report.

## Status

A4 complete, review pending. Auditor-frontend only. No simulator work, no
backend/contract changes, no new production dependencies.

## Committed interface inspected; P015 availability

P015 is committed at `32d88be` (docs) over `49b61fc` (job implementation).
Inspected read-only: `docs/AUDITOR_API_EXAMPLES.md` (checked against routes
+ P010 at 36f5832), `src/routes/analysis.ts`, `src/analysis/jobs.ts`.
Backend worktree untouched. **Wiring implemented** (not presentation-only):
submit → poll → terminal states, paginated findings, tariff-save refetch.

## Findings, warnings, exclusions displayed

- Job states: not-run ("Run analysis"), queued/running with batch progress,
  completed (totals, warnings, exclusions, finding cards, pager), failed with
  safe error (+ retained prior completed result labeled as such).
- Cards: readable type ("Vacant but on"), room/device ids, UTC window +
  Asia/Kolkata local, observed/expected with units, avoidable kWh or "not
  supplied", avoidable cost only when supplied, suggested action, method
  ("deterministic rule — not AI diagnosis"), assumptions, resolution limits,
  expandable evidence rendered as text.
- Empty completed: "No findings from the checks performed." + explicit "does
  not mean no waste" note. Totals shown verbatim (backend aggregates only —
  UI sums nothing). Warnings (e.g. ANALYSES_NOT_PERFORMED) and the
  always-on refrigerator exclusion render once, not per card.

## API wiring implemented vs pending

- Implemented: submit (`{dataset_id}` → 202 `{job_id,queued}`), status polls
  (`?page=&page_size=`, default 100, cap 500), queued→terminal polling ~2 s
  with single-flight + abort + stale guards, pager with explicit
  "Showing a–b of N", tariff-save refetch (no rerun), dataset/job mismatch
  rejection, duplicate-submit guards, no auto-retry on uncertain creation.
- Pending: nothing structural. Completed-findings display against a live
  backend awaits a Python service (see live results).

## Unknown-value and dataset/job consistency protections

- Missing savings stay "not supplied" (never zero); costs only from supplied
  tariff-derived fields; consumption never labeled savings.
- Job responses applied only when `job.dataset_id` matches the selection and
  the request is still current; selection change resets job scope and stops
  polling; failed polls never erase completed findings.

## Tests and real/mock/browser verification distinctions

- Committed `npm test`: **52/52** (36 prior + 16 analysis: submit shapes,
  queue-full/unknown-dataset errors, state parsing, reference light finding
  0.01 kWh, verbatim totals, unknown-vs-zero savings, exclusion + warnings,
  empty-with-limits, malformed rejection, helpers, 202 ack).
- Contract 75/75 (unchanged). Typecheck clean. Lint 0 errors (1 pre-existing
  untouched-verifier warning). Build exit 0. Served production `GET /` → 200
  with findings section markup.
- Live (isolated temp backend at 32d88be, scratch DB, port 4566, stopped
  after): import accepted, submit→queued→terminal, terminal is honestly
  *failed* without Python (never empty-success), dataset scope kept,
  unknown-job 404 — **6/6**. Completed-findings rendering stays
  mock-verified (P010 rule needs Python); real `:4001` never touched; no
  foreign DB mutated.
- Browser: absent — clicks/polling/pager/keyboard/CORS/print unverified
  beyond SSR markup; no screenshots. Stated plainly.

## Files changed and remaining dependencies

- Created: `app/lib/analysis.ts`, `app/lib/__tests__/analysis.test.mjs`,
  `app/components/findings-panel.tsx`,
  `docs/P019_ANALYSIS_FINDINGS_UI_EVIDENCE.md` (this file).
- Updated: `app/components/auditor-screen.tsx`,
  `app/components/summary-panel.tsx`, `package.json` (test script),
  `docs/HANDOFF.md`, `docs/ACTIVE_TASK.md`, `docs/PROGRESS_LOG.md`,
  `docs/AUDITOR_INTEGRATION_CHECKLIST.md`.
- Remaining: Python service for a live completed-findings run; a browser for
  interaction confirmation. No code dependency.

## Processes remaining

None. Test backend + frontend servers stopped; ports free. Temp export/DBs/
scripts remain outside Git (harmless to remove).

## Commit hash and remote verification

Authorised P019 commit + push to `origin/main` (repo-local identity
mohan-madhu). No force-push. Hash verified via `ls-remote`; reported in the
P019 evidence report.

## P006 follow-ups recorded (no backend changes)

- Summary synthetic provenance: P015-era backend now supplies
  `synthetic`/`synthetic_label`; adapter parses the flag (label display
  remains a small future addition — recorded, not implemented).
- Gaps: still always `[]` per P015 docs → "None reported" stands; absent
  still means "Not supplied". No complete-coverage claim made.

## P025 real-integration addendum (2026-09-25)

P025's isolated pinned P020 + P010 run completed the previously pending real
analysis check and exposed one frontend mapping defect: committed P015 returns
`findings` and `findings_pagination` inside `result`, while the original P019
fixture placed them at job top level. P025 corrected the adapter and fixture to
the committed nested shape. The final real reference run returned one
`light-a` 0.01 kWh finding costing ₹0.10 at ₹10/kWh and excluded `fridge-b`.
Browser interaction remains unverified. See
[P025 evidence](P025_FORECAST_DASHBOARD_EVIDENCE.md).
