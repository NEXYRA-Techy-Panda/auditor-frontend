# ACTIVE_TASK — auditor-frontend

## Assignment

- Prompt: P027
- Developer: Mohan
- Agent: M-A — OpenCode
- Layer: Dashboard completion / historical analytics
- Owner: Mohan
- Exclusive write scope: `auditor-frontend` only
- Status: completed
- Review: pending

## Objective

Finish the auditor dashboard with committed P023 historical analytics:
office timeseries, room/device breakdowns and drill-down, weekday comparison,
coverage and synthetic provenance. Preserve imports, tariff editing, vacancy
findings, forecasts, and the P014 printable dataset summary. P026 detector
integration is now included because its committed interface appeared during
this task.

## Starting state

- Frontend branch: `main`, clean.
- Frontend HEAD: `6f7a94b523f5b27a56cebcb3bedfe645798cee60`.
- Committed auditor-backend historical reference: `f3b8e2c8dac923957d91e1a55591abc7e03fe67c`.
- P023 feature reference: `d683578106e718a4e1a42f9a29ce796bcb2d2857`.
- P026 committed interface used: `d0fcd092fa39ca17a7efbcdaeffd4e43bd1c2eb1`.
- Later P026 worktree edits remain under M-D ownership; they were not read,
  edited, installed, started, or committed.
- No `AGENTS.md` exists in the parent or frontend repository.
- Contract: 1.0.1, read-only; public base remains
  `https://git-pipeline.metatronhost.in/auditor`.

## Preserved prior outcome

P025 is complete and published: the forecast adapter/dashboard, P020 job
polling, accessible chart/table, null-versus-zero tariff semantics, and the
P019 nested-findings correction are preserved. P025 review remains pending;
no approval is claimed.

### Prior P025 record retained for continuity

- Baseline was clean/remote-matched at P019 `855879c`; P025 used committed P020
  `df1ecbd` and Python P013 `7f71363` only.
- Implemented all forecast horizons, strict lifecycle/origin parsing, polling,
  recovery, tariff GET repricing without rerun, coverage/warnings/assumptions,
  accessible SVG plus all-hour table, and 65 passing tests at that layer.
- Isolated A–E checks covered a 672-hour import, 720-point month, ₹10→₹0
  same-job costing, insufficient data, CORS, and real P010 output (0.01 kWh /
  ₹0.10; refrigerator excluded). P019’s nested `result.findings` correction is
  preserved. Browser interaction remained unverified due the session browser
  limitation. P025 commit was `3beb07b8d97930ffabc040a797b1d0f3f963e453`.

## Required implementation

1. Add a strict P023 adapter using actual committed response shapes.
2. Add historical dashboard sections/tabs for overview, rooms/devices, and
   weekday patterns without redesigning existing panels.
3. Preserve half-open windows, explicit Asia/Kolkata timezone, page/full-period
   totals, null/missing/partial states, gap-assessment wording, and explicit
   synthetic provenance.
4. Add focused fixtures/tests for the P023 reference values and stale guards.
5. Update continuity/evidence/checklist files only within this repository.
6. Do not query or mutate production, touch databases, change deployment
   settings, or access Python directly.

## Checkpoint 1 — adapter, dashboard, and fixtures

- Strict P023 adapter added at `app/lib/historical.ts` using the committed
  `f3b8e2c` route shapes and canonical `from`/`to` query names.
- Historical dashboard added at `app/components/historical-analytics.tsx` with
  Overview, Rooms & devices, and Weekday patterns tabs.
- Summary/print handling now preserves nullable energy, explicit provenance,
  and `gap_assessment.status=not_performed` without calling an empty gaps array
  “no gaps”.
- Added `.gitattributes` LF rules for the mirrored contract paths.
- Added seven historical adapter tests using P023-shaped fixtures, including
  page/full totals, partial/missing buckets, reference energy, weekday means,
  quantity separation, and `UNSUPPORTED_INPUT`.
- Existing frontend checks currently pass: 73 tests, typecheck clean, lint has
  only the pre-existing verifier warning, build and contract verification pass.
- Public read-only check found the deployed auditor healthy but with zero
  imported datasets; no production mutation was attempted. Local port 19002
  is occupied by an existing VS Code process, so no pinned backend service was
  started.

## Checkpoint 2 — P026 interface discovered and integrated

- A post-P023 backend check found committed P026 at `d0fcd09`; the committed
  catalogue, submit/poll/pagination, window, coverage, exclusion and detector
  result shapes were read without opening later M-D worktree edits.
- Added `app/lib/detectors.ts`, `app/components/detector-panel.tsx` and seven
  P026 fixture tests. The existing vacancy FindingsPanel remains the default
  and is not replaced.
- Added catalogue-backed excess-consumption/gradual-trend controls, strict
  reference/evaluation windows, persisted job polling, scoped stale guards,
  coverage/exclusion/device assessment display, drift `other_changes`, and
  explicit insufficient/unsupported states. Detector output is unpriced and
  separate from vacancy totals.
- Read-only deployed `GET /api/v1/detectors` returned both supported IDs;
  public imports remain empty, so no detector job was submitted.
- Current checks: 81 tests passed, typecheck passed, lint has only the
  pre-existing verifier warning, build and contract verification pass.

## Publication

- Feature implementation commit: `be99d03fef2dc550da6f24ff438defcd57f91c33`.
- A final continuity-only commit will record the remote verification; the
  feature commit above remains the implementation reference.
- Review remains pending; no approval is claimed.

Exact next action: push the completed P027 commits normally, verify local HEAD
matches `origin/main`, then return the P027 evidence report. Browser-witnessed
historical/detector interactions and the later full report workflow remain
future work.
