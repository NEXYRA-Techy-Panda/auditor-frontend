# P028-UI actionable audit report evidence

- Developer: Mohan
- Agent: M-A — OpenCode
- Assignment: P028-UI
- Layer: Actionable audit report
- Status: implementation complete; review pending
- Progress: Supporting reporting batch 27 / approximately 29. Final frontend
  verification is complete; browser/print and deployment observation remain.
  ROI is shown only from per-finding server statuses, and comparison remains
  unverified.

## Backend/interface boundary

The latest committed auditor-backend main inspected was
`fa95b1308c8e2916ffde4e98c6d64cbb81edca9e` (feature merge
`c5db138d437280c77ae90c488ac067f8720b446e`). The committed additive route is
`POST /api/v1/reports/preview`, backed by the prepared economics module. It
accepts only `dataset_id`, `job_id`, stable persisted vacancy `finding_ids` and
optional typed economics assumptions, and returns server-derived economics,
assumptions, overlap exclusions, ranking and an explicitly unverified
scenario-comparison state. No backend or Python files were modified.

P028-UI uses that response without calculating economics in the browser.
Original/improved comparison remains unavailable/unverified because matched-run
external-input provenance is not supplied. The committed Git interface is
verified; public deployment of that route is not claimed. A public route
absence/404 would therefore be reported as deployment availability, not as a
client parsing defect.

## Implemented report

- Explicit Build audit report / Rebuild audit report action.
- Immutable, schema-versioned snapshot containing dataset identity, source
  scope, source retrieval timestamps, current job IDs/statuses, limitations,
  server-preview economics/assumptions/overlap/ranking data, and explicit
  unavailable/unverified comparison boundaries.
- Canonical report history uses the backend’s full export range and office
  scope, with 3600-second timeseries buckets, bounded 500-item timeseries pages,
  bounded 200-item room/device pages, and a maximum of 20 pages per resource.
  Page counts, included counts, omitted counts and excerpt status are retained.
- Report sections:
  - dataset/scope/provenance/coverage/tariff/gaps;
  - historical energy/cost, rooms/devices and weekday comparison;
  - vacancy findings, exclusions, avoidable energy/cost and suggestions;
  - P026 device observations, coverage/exclusions and drift `other_changes`;
  - concise completed forecast summary, origin, baseline, cost and limitations;
  - server-derived economics, assumptions, overlap exclusions and ranking;
  - evidence-backed recommended actions;
  - explicit unavailable/unverified ROI and comparison boundaries.
- Build reads existing completed job state and bounded GET pages, then submits
  one read-only report-preview POST using stable persisted vacancy finding IDs.
  It never creates an analysis, detector or forecast job.
- Selection, tariff mutation/commit, summary refresh, job pagination, detector
  form scope and source refresh invalidate the report. Stale snapshots remain
  visible as historical previews but cannot be printed until rebuilt.
- Existing P014 summary-only print is suppressed while the extended report is
  active, preventing two print targets.

## Verification

Current focused checks include:

- `npm test`: **93 passing**, 0 failing.
- `npm run typecheck`: **pass**.
- `npm run lint`: **pass with 0 errors**; the existing
  `scripts/verify-contract.mjs` unused-variable warning remains unrelated.
- `npm run build`: **pass** (Next.js production build).
- `npm run verify:contract`: **75 passed, 0 failed** (contract `1.0.1`).
- `git diff --check`: **pass**; Git emitted only existing LF/CRLF normalization
  warnings for working-copy files.

Focused report tests cover immutable/source-independent snapshots, dataset/job
identity mismatches, context invalidation, null versus explicit zero,
complete/excerpt pagination, missing/failed jobs, detector/forecast separation,
server-preview stable-ID requests, server economics/assumptions/overlap and
unavailable/unverified comparison. The historical fetch test uses mocked
P023-shaped responses and verifies only bounded GET retrieval.

## Real/browser boundary

- No upload, tariff mutation, job submission, database access, simulator
  control, VPS change or infrastructure change was made.
- The public auditor was previously observed healthy; its import list was empty
  during P027, so no live report dataset was available for a mutation-free
  end-to-end report build. The committed preview route was not deployment-tested;
  this is an availability boundary, not a client-interface defect.
- The built-in browser tool was unavailable (`browser.disconnected`), so no
  clicks, preview, print dialog or narrow-layout interaction was witnessed.
  Build/CSS success is not print proof.

## Files

Created:

- `app/lib/audit-report.ts`
- `app/lib/report-preview.ts`
- `app/components/audit-report-panel.tsx`
- `app/lib/__tests__/audit-report.test.mjs`
- `app/lib/__tests__/report-preview.test.mjs`
- `docs/P028_UI_AUDIT_REPORT_EVIDENCE.md`

Updated frontend source/continuity:

- `app/components/auditor-screen.tsx`
- `app/components/summary-panel.tsx`
- `app/components/findings-panel.tsx`
- `app/components/detector-panel.tsx`
- `app/components/forecast-dashboard.tsx`
- `app/lib/analysis.ts`
- `app/globals.css`
- `package.json`
- `docs/ACTIVE_TASK.md`
- `docs/HANDOFF.md`
- `docs/PROGRESS_LOG.md`
- `docs/AUDITOR_INTEGRATION_CHECKLIST.md`

## Publication

- P028-UI implementation commit: `543c2c9734e50f7cf296580035f085de276cde7a`.
- It was pushed normally to `origin/main`; local HEAD matched the remote main
  ref immediately after the push.
- A separate Vercel deployment observation is not claimed. The committed
  backend route and the public deployment state remain distinct evidence.

## Remaining work

- Browser/print verification remains manual because the available browser was
  disconnected.
- A future assignment may add explicit user economics assumptions through the
  committed preview contract and may enable comparison only with matched-run
  external-input provenance.

Review remains pending; no approval is claimed.
