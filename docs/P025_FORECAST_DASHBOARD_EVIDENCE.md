# P025 forecast dashboard evidence (Agent A — OpenCode)

Date: 2026-09-25. Assignment: P025 / A6. Status: implementation and
isolated integration complete; review pending. Commit hash is reported after
the authorised push.

Progress: Mohan prompt 25 / approximately 34 planned. Estimated remaining
after this prompt: 9. This is a planning estimate, not a completion
percentage and does not establish any other assignment's status.

## Delivered scope and pinned interfaces

Delivered **presentation plus actual public job API wiring** in
`auditor-frontend` only. No sibling, contract, parent, database, environment,
or production dependency was changed.

Committed interfaces inspected read-only:

- auditor-backend P020 continuity commit
  `df1ecbd08369d71f88de9cf5f26e6d8fd44e8ebd` (implementation parent
  `a7129f2`): `docs/AUDITOR_API_EXAMPLES.md`, `src/routes/forecasts.ts`,
  `src/forecast/runner.ts`, forecast job submission, tests, and
  `docs/P020_FORECAST_INTEGRATION_EVIDENCE.md`.
- energy-ml-service P013
  `7f71363aa9361e67a0cb2815b98aee79b0708cf9`: baseline evidence, service,
  response model, and eligibility semantics.

The frontend calls only `POST /api/v1/forecasts` and
`GET /api/v1/forecasts/:id`. Submission sends exactly
`{dataset_id, horizon}`; no `origin_utc` or current browser date is invented.
The backend chooses the first local-hour origin at/after the imported dataset
end. The acknowledgement requires equal `forecast_id`/`job_id`, `queued`,
horizon, origin, and synthetic provenance.

## Request, polling and presentation behavior

- Accessible native horizon selector and explicit request action: next 24
  hours, next 7 days, and next calendar month.
- Real states: not requested, submitting, queued, running, completed, and
  failed/insufficient data. Origin, horizon, and progress use server values.
- Synchronous single-flight prevents duplicate POSTs before React rerenders.
  Polls have independent single-flight, abort, two-second cadence, terminal
  stop, and unmount/selection/horizon cleanup.
- An uncertain creation is explained and never automatically retried. An
  accepted job is never replaced in the UI by a fabricated new result.
- Dataset, forecast/job ID, and horizon form the response scope. Late A → B or
  A → B → A responses cannot apply. Malformed/mismatched status bodies are
  rejected rather than rendered.
- A later failed request keeps a same-dataset completed result under an
  explicit previous-result label. A different dataset can never display it.
- A tariff save re-reads the same completed forecast ID. It does not submit a
  forecast or call Python. Forecast energy/job identity stay stable.

Completed presentation includes dataset/run identity, forecast/job ID, server
origin, actual exclusive start/end in Asia/Kolkata plus UTC, backend total
forecast energy, current tariff and forecast cost, statistical baseline/version,
`model_version:null`, unavailable uncertainty, office policy, history coverage
and eligibility, warnings, assumptions, recorded assumptions, limitations, and
synthetic provenance.

Forecast consumption is explicitly distinguished from historical observed
consumption and deterministic-analysis avoidable energy. Forecast cost is
labelled **forecast cost, not savings**. No ROI, annualisation, accuracy,
confidence, uncertainty band, or savings claim is introduced.

## Horizon and chart semantics

`next_calendar_month` is explained from the returned timestamps as the complete
following Asia/Kolkata calendar month, not a rolling 30 days. The UI does not
calculate or substitute its own origin.

The dependency-free responsive SVG:

- plots every returned hourly timestamp as kWh per one-hour interval (never
  instantaneous watts);
- labels the reported building timezone and axis units;
- handles all-zero and non-zero flat series without divide-by-zero;
- breaks the line at null/missing values and never interpolates them;
- provides a visible numerical summary and an inspectable table containing
  every returned point, basis, and support count.

No daily aggregation is used, so no average is mislabeled as a daily total.
A full month retains all values. Structured text/JSON is rendered by React as
text, not injected HTML.

## Tariff and value protections

The adapter preserves null versus numeric zero independently for
`tariff_inr_per_kwh` and `forecast_cost_inr`. Unset cost says unavailable/not
set; explicit ₹0/kWh produces numeric zero. The backend `total_energy_kwh` is
displayed as returned; the UI does not manufacture a savings aggregate.
Missing history, warnings, and limitations are not converted to zero.

## Focused verification and static checks

- `npm test`: **65 passed, 0 failed** (52 prior P017/P019 checks + 13 P025
  forecast checks).
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors; one pre-existing warning in
  `scripts/verify-contract.mjs` (untouched).
- `npm run verify:contract`: **75 passed, 0 failed**.
- `npm run build`: exit 0; `/` prerendered.
- Production source scan: only committed Node routes; no direct Python URL,
  production demo forecast, generated ID, or hard-coded P025 history value.
- Served frontend with the isolated backend configured: `GET /` HTTP 200 with
  upload, findings, summary, and forecast section markup. This is HTTP/SSR
  evidence only, not interaction evidence.

Focused tests cover exact request/ack mapping, all states/errors, all horizons
and returned month dates, dataset/job/horizon mismatch, stale revisions,
duplicate-request gate, previous-result recovery, null/zero cost, GET-only
reprice, no savings aggregate, complete backend total, flat/zero charts, and
missing-point gaps.

## Isolated real P020 + P013 checks (HTTP/adapter, not browser)

Both pinned sources were exported with `git archive` to task-owned OS temp
directories. Only the temp backend received `npm ci`; Python ran from the
committed P013 temp `app/` tree with the compatible existing interpreter in
`-B` mode and no bytecode writes. Services used unused loopback ports 4571 and
8571, a scratch SQLite database, explicit `FRONTEND_ORIGIN`, and only owned
processes. Final A–E result: **pass**.

1. CORS preflight returned 204 with exact allow-origin
   `http://localhost:3001` (HTTP evidence only).
2. A generated, labelled synthetic 672-hour dataset imported through the
   frontend upload adapter.
3. The frontend forecast adapter submitted `next_calendar_month`; the real job
   completed from origin `2026-10-19T03:30:00Z` with **720 points**, full
   local boundaries `2026-10-31T18:30:00Z` → `2026-11-30T18:30:00Z`, 672
   observed hours, and backend total `10.799999999999999 kWh`.
4. Unset cost was null. Saving ₹10/kWh re-read the same job at
   `107.99999999999999 INR`; saving ₹0/kWh re-read the same job at numeric
   `0`. Energy and job ID stayed stable; no second forecast was submitted.
5. The tiny committed reference fixture produced a persisted failed forecast
   with exact `INSUFFICIENT_DATA`: at least 168 complete observed hours, got
   0; missing hours were explicitly not treated as zero.
6. The same reference fixture completed real P010 analysis through the
   frontend adapter: one `light-a` `vacant_but_on` finding, **0.01 kWh**
   avoidable and **INR 0.10** at ₹10/kWh; `fridge-b` was excluded.

The first real-analysis attempt exposed a P019 integration defect: committed
P015 carries `findings` and `findings_pagination` inside `result`, while the
P019 test fixture incorrectly put them at job top level. The adapter and tests
were corrected to the committed nested shape; the full A–E run then passed.
This is a frontend-only corrective integration change, not a backend/contract
change.

## Browser verification boundary

The available built-in browser facility cannot open a localhost server started
by this coding session, so no browser clicks, polling observation, chart
resizing, keyboard traversal, or narrow-screen visual result is claimed.
CORS was checked by HTTP preflight only. A manual browser checklist remains:
select dataset; choose/request each horizon; observe submit/queued/result;
inspect chart/table; switch missing/flat data only through a future compatible
fixture; save ₹10 then ₹0 and confirm same-job repricing; keyboard through
selector/actions/details/table; review narrow layout and print that still
contains only the P014 dataset summary.

## Files, cleanup and remaining dependencies

Created:

- `app/lib/forecast.ts`
- `app/lib/__tests__/forecast.test.mjs`
- `app/components/forecast-dashboard.tsx`
- `docs/P025_FORECAST_DASHBOARD_EVIDENCE.md`

Updated:

- `app/components/auditor-screen.tsx`
- `app/lib/analysis.ts` and `app/lib/__tests__/analysis.test.mjs` for the
  committed P015 nested-findings correction
- `package.json`
- `docs/ACTIVE_TASK.md`, `docs/HANDOFF.md`, `docs/PROGRESS_LOG.md`,
  `docs/AUDITOR_INTEGRATION_CHECKLIST.md`

No chart package, Python call, generated dataset, database, secret, archive, or
build output is committed. All task-owned frontend/backend/Python processes
were stopped, ports 3001/4571/8571 have no listener, and the integration
harness's temp source, scratch DB, and generated files were removed. An extra
task-owned P020 source/build export remains outside the repositories at
`%TEMP%\\nexyra-p025-41f8a7d21d234a69b73a77216df37067`; it contains the pinned
backend source and its temporary `node_modules`, with no DB or dataset. The
environment's automatic review rejected the recursive cleanup command, so
that directory was left intact. No code dependency remains; review and a
browser-capable environment are the remaining verification work.
