# P027 dashboard completion evidence

- Developer: Mohan
- Agent: M-A — OpenCode
- Assignment: P027
- Status: implementation complete; review pending
- Progress: Mohan assignment 26 / approximately 29 planned; approximately 3
  further batches estimated.

## Backend interfaces used

The frontend is wired only to the committed auditor-backend P023 API at
`f3b8e2c8dac923957d91e1a55591abc7e03fe67c` (P023 feature commit
`d683578106e718a4e1a42f9a29ce796bcb2d2857`):

- `GET /api/v1/imports/:id/timeseries`
- `GET /api/v1/imports/:id/rooms`
- `GET /api/v1/imports/:id/devices`
- `GET /api/v1/imports/:id/weekday-analytics`
- `GET /api/v1/detectors`
- `POST /api/v1/analysis/jobs` for P026 detector jobs
- `GET /api/v1/analysis/jobs/:id` for P026 polling/results

The historical adapter uses canonical `from`/`to` query parameters, optional
exclusive room/device scope, bounded `page`/`page_size`, and the P023 response
envelope. Pagination is read from `data.pagination`.

P026 was committed during this task at
`d0fcd092fa39ca17a7efbcdaeffd4e43bd1c2eb1` (P026 device-analysis integration).
Only that immutable committed tree was used; later uncommitted M-D worktree
changes were not read or used.

## Delivered functionality

- Historical analytics panel inserted after Summary and before existing
  findings/forecasts.
- Overview tab with observed-energy SVG, null-gap line breaks, textual table,
  bucket resolution, timezone/window, current-page/full-period totals and
  pagination.
- Rooms/devices tab with room and device breakdowns, coverage, observed versus
  nominal power, cost, quantity separation and click-through drill-down.
- Weekday patterns tab with Monday–Sunday ISO ordering, observed totals,
  complete-day means, complete/partial/missing counts and the calendar-weekday
  (not working-day) explanation.
- Optional half-open UTC window controls; blank bounds use the backend export
  range.
- Coverage/provenance presentation distinguishes complete, partial and missing
  data; synthetic labels are shown when supplied; `gap_assessment:
  not_performed` is never rendered as “no gaps”.
- Summary/report handling now preserves nullable energy, explicit synthetic
  false/label and gap-assessment state. Historical data is not added to the
  P014 printable report.

## P026 detector integration

P026 is integrated from the committed backend interface at `d0fcd09`:

- Detector selection is loaded from `GET /api/v1/detectors`; the existing
  vacancy `FindingsPanel` remains unchanged as the default analysis path.
- Excess-consumption and gradual-trend submissions use the exact
  `reference_window`/`evaluation_window` request shape, with strict UTC
  second-precision, ordered, non-overlapping local validation.
- Jobs are persisted and polled through the existing analysis-job route; result
  pages, coverage, warnings, limitations, per-device assessment sources/reasons,
  aggregation exclusions and detector coverage are displayed.
- Insufficient reference/history, unsupported context/aggregation and
  no-comparable states are kept distinct from evaluated-no-findings.
- Drift `other_changes` (including level steps/offsets) are rendered as
  descriptive observations. Deviations are not labelled confirmed faults or
  guaranteed savings, are not priced, and are not added to vacancy totals.
- Detector state is reset/invalidated on dataset, detector and window changes;
  stale responses are rejected and a failed refresh retains the last successful
  state. No detector result is repriced or rerun on tariff changes.

## Verification

Current checks:

- `npm test`: **81 passed, 0 failed** (including P023 historical and P026
  detector adapter tests plus existing suites).
- `npm run typecheck`: passed.
- `npm run lint`: 0 errors; one pre-existing warning in
  `scripts/verify-contract.mjs`.
- `npm run build`: passed; `/` and `/_not_found` generated.
- `npm run verify:contract`: **75 passed, 0 failed**.
- `git diff --check`: clean.

The tests use committed P023/P026 field shapes and reference values: office
`0.03 kWh`, light `0.02 kWh`, refrigerator `0.01 kWh`, partial/missing
buckets, page/full totals, weekday means, quantity separation, detector
coverage/exclusions and drift observations. They are mock/fixture
verification, not a live database run.

Read-only deployed checks returned auditor health `ok` with
`ml_reachable:true`; `GET /api/v1/detectors` returned the committed P026
catalogue with both supported detector IDs. The public import list was empty,
so no live detector job was submitted. No fixture upload, tariff change, job
creation, production database access or simulation control was performed. Local
port `19002` was already occupied by an existing VS Code process, so no pinned
backend service was started. Browser interaction was not available; click,
responsive, keyboard and print checks remain manual.

## Files

Created:

- `app/lib/historical.ts`
- `app/components/historical-analytics.tsx`
- `app/lib/__tests__/historical.test.mjs`
- `app/lib/detectors.ts`
- `app/components/detector-panel.tsx`
- `app/lib/__tests__/detectors.test.mjs`
- `docs/P027_DASHBOARD_COMPLETION_EVIDENCE.md`
- `.gitattributes`

Updated source/continuity:

- `app/components/auditor-screen.tsx`
- `app/components/summary-panel.tsx`
- `app/components/report-view.tsx`
- `app/lib/auditor-api.ts`
- `app/lib/__tests__/auditor-api.test.mjs`
- `package.json`
- `docs/ACTIVE_TASK.md`
- `docs/HANDOFF.md`
- `docs/PROGRESS_LOG.md`
- `docs/AUDITOR_INTEGRATION_CHECKLIST.md`

## Commit / publication

- Feature implementation commit:
  `be99d03fef2dc550da6f24ff438defcd57f91c33`.
- A final continuity-only commit records the push/remote verification; the
  feature hash above is the implementation reference.
- Review remains pending; no approval is claimed.

## Remaining work

A future assignment should perform browser-witnessed historical/detector
interactions and complete the full audit-report/ROI/comparison workflow.
Review remains pending; no approval is claimed.
