# P014 dataset summary evidence (Agent A — OpenCode)

Written before commit; commit hash is returned in the P014 evidence report.

## Status

A3 complete, review pending. Auditor-frontend only. No simulator work, no
backend/contract changes, no new dependencies.

## Report behavior and actual supported fields

- "Print summary" button in the summary section, enabled only when a current,
  matching, settled summary exists. Disabled otherwise with an explicit
  reason (no selection / nothing loaded / identity mismatch / loading /
  tariff saving).
- "Energy dataset summary" report from one fixed snapshot: dataset id, run /
  scenario / interval / imported time when the list supplies them (else
  "Not supplied"), energy kWh, tariff (explicit-zero vs unset wording),
  cost or unset, gaps (none-reported vs listed), synthetic disclosure only
  when explicitly true, summary-fetch vs report-generation UTC times.
- Caveats printed: flat-rate disclaimer; "Anomaly analysis, savings
  recommendations and forecasts are not included in this summary."
  No findings/forecasts/savings/recommendations/ROI invented; consumed
  energy never called avoidable; no calendar-month/coverage/measurement
  inference from missing metadata.
- Snapshot copies all values at click time (gaps array copied); later
  responses cannot mutate the preview. Print uses the browser facility
  ("Save as PDF" supported); no PDF generated or claimed. Print CSS:
  report-only visibility, A4-ish margins, page-break control, wrapping IDs,
  black-on-white without background dependence.

## Snapshot consistency and print eligibility

`printEligibility` gates on identity match + settled state; `buildReportSnapshot`
returns null otherwise. Tariff input is never mixed into the report — only
server-confirmed values. Late-A responses cannot label B (identity check).

## Auto-selection guard finding and correction

Finding: `shouldAutoSelectImport` ordered actions by wall-clock ms — same-ms
actions or clock jumps could misorder. Replaced with monotonic
`createSelectionRevision` (revision captured at submit; completion applies
only when unchanged). Old helper removed; screen + upload panel reworked
(`onUploadStart` capture). Regression test covers same-ms ordering.

## Test results

Committed `npm test`: **29/29** (23 prior + revision test replacing the
timestamp test + 6 snapshot/eligibility cases: coherent build, mismatch/
loading/saving refusals, unset-vs-zero, snapshot immutability, missing
metadata nulls, synthetic explicit-only). Contract 75/75 (unchanged).
Typecheck clean. Lint 0 errors (fixed sync setState-in-effect, unescaped
entities; 1 pre-existing untouched-verifier warning). Build exit 0.
Served production `GET /` → 200 (upload/list/summary/panel shells; report
renders only after selection+snapshot, so absent in SSR — correct).
Print CSS verified present in the built CSS bundle.

## Browser/print verification limitations

No browser capability: print preview pagination, keyboard flow, long-content
rendering, and the window.print call path are unverified; report markup and
CSS verified by inspection + build output only. SSR/HTTP do not prove print.

## Files changed and processes remaining

- Updated: `app/lib/auditor-api.ts` (revision guard, snapshot helpers),
  `app/components/auditor-screen.tsx` + `upload-panel.tsx` (revision flow),
  `app/components/summary-panel.tsx` (snapshot/print/eligibility),
  `app/components/datasets-panel.tsx` (list passthrough),
  `app/lib/__tests__/auditor-api.test.mjs`, `app/globals.css` (print CSS),
  `README.md` (print note), continuity files, checklist.
- Created: `app/components/report-view.tsx`, this evidence doc.
- Processes: none running; port 3001 free; no sibling/foreign processes.

## Commit hash and remote verification

Authorised P014 commit + push to `origin/main` (repo-local identity
mohan-madhu). No force-push. Hash verified via `ls-remote`; reported in the
P014 evidence report.

## Next action

Run the integration checklist against a committed backend (answers the 5
open questions + print flow with real data in a browser). Stop after P014.
