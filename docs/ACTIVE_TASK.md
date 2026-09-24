# ACTIVE_TASK — auditor-frontend

## Assignment

- Prompt: P028-UI
- Developer: Mohan
- Agent: M-A — OpenCode
- Layer: Actionable audit report
- Owner: Mohan
- Exclusive write scope: `auditor-frontend` main working copy only
- Status: completed; review pending
- Review: pending

## Objective

Extend the existing fixed printable dataset summary into an actionable audit
report using only confirmed, available historical, vacancy-analysis, P026
device-observation and completed forecast results. Add an explicit immutable
“Build audit report” action, use the committed server report-preview economics
endpoint, preserve the existing dashboard and browser print mechanism, and
leave matched-run comparison unavailable unless verified provenance exists. Do
not create jobs or forecasts while building a report.

## Starting state

- Frontend branch: `main`, clean.
- Frontend HEAD: `7b7f9f44b727c2e405df56922f945c1b077d31ce`.
- Committed backend main inspected: `fa95b1308c8e2916ffde4e98c6d64cbb81edca9e`.
- Report preview feature merge: `c5db138d437280c77ae90c488ac067f8720b446e`.
- Committed report preview route: `POST /api/v1/reports/preview`.
- P028 economics preparation branch: `mohan/p028-report-math-prep` at
  `f4f20a3`; it is owned by M-B and is read-only for this task.
- P027 implementation commits remain published: `be99d03` and `13e5f5f`.
- No AGENTS.md exists in the parent or frontend repository.
- Contract: 1.0.1, read-only. Public API base remains
  `https://git-pipeline.metatronhost.in/auditor`.
- Do not modify, install into, start, or commit any sibling repository or
  worktree. Do not stop the process owning port 19002.

## Preserved P027 outcome

P027 delivered historical P023 analytics, committed P026 detector controls and
results, preserved vacancy/forecast/tariff/import behavior, and passed 81
frontend tests, typecheck, build and 75/75 contract verification. P027 browser
interaction and deployment confirmation remain pending; its Git push and
remote hash are recorded in `docs/P027_DASHBOARD_COMPLETION_EVIDENCE.md`.

## P028-UI implementation requirements

1. Read current report, analysis, forecast, historical and detector components.
2. Inspect and use the committed backend report-preview interface once; do not
   invent endpoints or duplicate economics math.
3. Add a typed immutable report snapshot containing dataset/job identities,
   retrieval timestamps, scope, source data, pagination counts, server-preview
   economics and limitations.
4. Add explicit Build audit report action/preview/print behavior with stale
   dataset/tariff invalidation and no automatic analysis/forecast creation.
5. Add focused snapshot, identity, pagination, null/zero, missing/failed and
   ROI/comparison-boundary tests.
6. Create `docs/P028_UI_AUDIT_REPORT_EVIDENCE.md` and update continuity files.
7. Run tests, typecheck, lint, build and contract verification; record real,
   mocked and browser evidence separately.

## Checkpoint 1 — startup

- Frontend is clean and remote-matched at the reported baseline.
- No production mutation, database access, job submission, or infrastructure
  change has been made.
- Exact next action: finish the committed-interface inspection and map the
  existing report/state boundaries before editing report source.

## Checkpoint 2 — report implementation

- Backend main `fa95b130` now commits the read-only
  `POST /api/v1/reports/preview` contract. The frontend sends stable persisted
  vacancy `finding_id` values and renders server economics, assumptions,
  overlap exclusions, ranking and unverified comparison without browser-side
  calculations.
- Added immutable typed report snapshots, explicit unavailable/unverified
  comparison boundaries, canonical office/full-export historical queries,
  bounded page retrieval, source retrieval timestamps, job identity/context
  checks, and explicit excerpt/omission counts.
- Added the Build/Rebuild audit report action and printable preview. Current
  analysis/detector/forecast jobs are observed only; Build never submits a job
  or forecast. Stale dataset/tariff/source contexts cannot be printed.
- Added current-job callbacks and report invalidation for selection, tariff
  mutation/commit, summary refresh, pagination and detector/form changes.
- Added seven focused report-model/fetch tests plus five committed preview-client
  tests; final verification passes with 93 tests, typecheck, lint, build and
  75/75 contract verification.
- Browser/print capability check returned `browser.disconnected`; no browser
  interaction or deployment of the committed backend route is claimed.
- P028-UI implementation commit `543c2c9734e50f7cf296580035f085de276cde7a`
  and final continuity commit `803efba15b3850d9d46213c38599d10bd6271696`
  were pushed normally to `origin/main`; local and remote refs match at the
  final checkpoint. A separate deployment observation is not claimed.
- Exact next action: return the P028-UI evidence report. Browser/print
  verification remains manual because the available browser was disconnected.
