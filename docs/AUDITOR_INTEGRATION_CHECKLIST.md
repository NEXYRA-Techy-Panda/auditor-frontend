# Auditor integration checklist (Agent A — OpenCode, P011; P017 update below)

Future local verification of auditor-frontend (P007 UI) against a real
auditor-backend. Status as of P011: **not executed** — the backend's upload
endpoints (P006, Codex) are uncommitted work in progress. Last committed
backend inspected: `aa53d0c` (P003 SQLite foundation; only `GET /api/v1/health`
plus DB layer in committed `src/`). All items below are mock-only until run.

## P017 execution record (2026-09-24, isolated backend at pinned P006 commit 67998d5)

Backend items §1 (1–3), §2 (4–8) executed against an isolated temp backend
with scratch DBs — all passed (see `docs/P017_AUDITOR_REAL_INTEGRATION_EVIDENCE.md`):
201/200 dedup, 0.03 kWh, ₹10→₹0.30, zero-vs-unset, rejection without partial
import. Browser items (§3 items 9–13, §7) remain NOT executed — no browser
capability. The five open questions are resolved (envelope-only responses,
already_imported shape, details-carried validation, coverage+gaps semantics,
tariff echo/404/422); adapter aligned.

## 0. Preconditions

- auditor-backend with P006 committed, running locally on port 4001.
- auditor-frontend (this repo) running locally on port 3001 with
  `NEXT_PUBLIC_AUDITOR_BACKEND_URL=http://localhost:4001`.
- An **isolated scratch SQLite database** for the backend (fresh temp file via
  its configured DB path — never Mohan's or anyone's development database).
- Contract fixtures from any repo's `contracts/v1/fixtures/`:
  `reference.json` and standalone `reference.csv` (contract v1.0.1).
- A real browser (CORS, upload, selection, and tariff interactions cannot be
  proven by SSR or mocks).

## 1. Upload checks

1. Upload `reference.json`: expect accepted with a `dataset_id`; validation
   report shows no errors.
2. Upload standalone `reference.csv` (first-row metadata envelope, no paired
   JSON): expect accepted; inventory/policies resolve from the envelope alone.
3. Upload a deliberately broken file (e.g. envelope removed, or an unknown
   `policy_ref`): expect rejection with field/row-referenced errors and **no
   partial imported dataset** (list shows no new dataset afterwards).

## 2. Energy and reimport semantics

4. Select the JSON dataset, open its summary: expect total energy **0.03 kWh**.
5. Reimport the **same semantic dataset** (CSV after JSON): expect
   acknowledgement of the existing dataset — same `dataset_id`, **not
   double-counted** (office total across datasets unchanged).
6. Set tariff **₹10/kWh**, confirm, reload summary: expect cost **₹0.30**.
7. Set tariff **₹0/kWh** explicitly: expect accepted, cost **₹0.00**, and the
   UI distinguishes this from unset.
8. Fresh dataset with no tariff set: cost and tariff show **Not set**
   (never zero).

## 3. Interaction checks (browser)

9. CORS: browser console shows no CORS errors on upload/list/summary/tariff
   calls from `http://localhost:3001` to `http://localhost:4001`.
10. Selection: clicking datasets updates the summary; a slow earlier response
    never overwrites a newer selection.
11. Refresh: manual list refresh preserves selection; failed refresh keeps the
    old list with explanation and never erases the upload result or summary.
12. Upload: replace/remove file before submit works; double-clicking Upload
    sends one request; timeout shows unknown-completion guidance.
13. Tariff: blank rejected (not zero), invalid rejected with input preserved,
    save-then-confirm reloads the summary.

## 4. Open response questions for Codex (from P007)

1. Envelope vs bare bodies on imports routes?
2. Exact already-imported body/status?
3. Validation detail fields beyond message/field/row?
4. Summary gaps element shape?
5. Tariff-failure status/shape?
The frontend adapter tolerates documented variants; resolve these before
relying on any single shape in later layers.

## 5. Mock-vs-executed status

- Executed: 18/18 committed adapter checks (mock fetch), 75/75 contract
  checks, typecheck/lint/build green, SSR markup HTTP-200.
- NOT executed: every item in §1–§3 above. Do not mark this checklist done
  until each item has a dated, witnessed result.

## 6. P012 race-hardening now in the UI (still browser-pending)
The frontend guards rapid interactions (stale summary/tariff/upload
completions, scoped errors, aborts) and labels previous-vs-current data —
all covered by committed deferred-mock tests. Browser-witnessed runs of
§3 items 10–13 must additionally exercise: fast A→B→C selection switching,
tariff save during selection change, and upload completion after a manual
selection. None of these have been observed in a browser yet.

## 7. P014 printable summary (browser-pending)
The UI offers a "Print summary" action producing a browser-print snapshot
from fetched data (eligibility-gated, fixed at click time). Still to witness
in a browser: print preview pagination with a real dataset, keyboard flow to
and from the print action, and a long-content example (many gaps/devices).
SSR markup and built-CSS inspection do not prove print pagination.
## 8. P019 analysis findings (Agent A, 2026-09-24)

- P006 follow-ups resolved without backend changes: summary synthetic provenance IS now supplied (P015-era backend returns synthetic/synthetic_label; adapter parses the flag); gaps still always [] per P015 docs, so "None reported" stands and absent still means "Not supplied".
- Findings UI wired to committed P015 (32d88be): initial P019 live check reached only an honest failed job because Python was absent. P025's isolated real-Python run exposed that committed findings/pagination are nested in `result`; the frontend adapter/tests were corrected. Final real reference analysis passed: one 0.01 kWh light finding, ₹0.10 at ₹10/kWh, refrigerator excluded.
- Still browser-pending: completed-findings interaction, pager clicks, and print-with-findings boundary review (findings intentionally stay out of the printable dataset summary).

## 9. P025 forecast dashboard (Agent A, 2026-09-25)

- Implemented actual P020 `df1ecbd` job wiring and presentation for next 24h / 7d / complete next local calendar month; forecast and analysis remain separate, and forecast cost is never called savings.
- Isolated pinned P020 + P013 A–E checks passed: 672-hour synthetic import; 720-point November forecast; backend total 10.799999999999999 kWh; unset→₹10→₹0 same-job costing; exact insufficient-data failure; real P010 reference finding 0.01 kWh / ₹0.10 with refrigerator excluded.
- CORS was verified by HTTP preflight only. The built-in browser cannot open this session-started localhost server, so horizon/request/poll/chart/table/tariff/narrow-screen/keyboard interactions and print boundary remain manual browser checks. Forecasts stay outside the P014 print snapshot.

## 10. P027 historical analytics (Mohan, M-A — OpenCode)

- Added a strict adapter for committed P023 rooms, devices, timeseries and
  weekday-analytics responses at backend `f3b8e2c` / feature `d683578`.
- Added Overview, Rooms & devices, and Weekday patterns tabs with office,
  room and device scope, half-open UTC window controls, Asia/Kolkata bucket
  semantics, bounded pagination, coverage text, synthetic provenance and
  `gap_assessment.status=not_performed` wording.
- Full-period and visible-page totals remain separate; missing buckets remain
  null and break the chart; room/device nominal values are not multiplied by
  quantity.
- P026 detector integration is complete against committed backend `d0fcd09`:
  catalogue-backed excess-consumption/gradual-trend selection, strict reference
  and evaluation windows, persisted polling/pagination, per-device assessment
  states, coverage/exclusions, and drift `other_changes` observations. Detector
  deviations remain unpriced and separate from vacancy totals.
- Historical data remains outside the P014 printable dataset summary.
- Verification is fixture/mock based for job results; read-only deployed
  catalogue/health checks succeeded, but public imports are empty, so no
  production analytics mutation or dataset upload was made. Browser interaction
  remains pending.

## 11. P028-UI actionable audit report (Mohan, M-A — OpenCode)

- Added an explicit Build/Rebuild audit report action backed by an immutable,
  schema-versioned frontend snapshot. Dataset, tariff, summary and current
  analysis/detector/forecast job identities are checked before capture.
- Historical report data uses a canonical office/full-export scope and bounded
  GET pagination with included/total/omitted counts and explicit excerpt labels.
  It does not mix dashboard drill-down pages with full-period totals.
- Report includes dataset/scope/provenance, historical consumption, vacancy
  findings, P026 observations, completed forecast summary, recommendations,
  limitations and explicit unavailable ROI/comparison boundaries.
- Build never creates jobs or forecasts. Selection, tariff mutation/commit,
  source refresh, pagination and detector-form changes invalidate the report;
  stale snapshots cannot be printed.
- Committed backend `fa95b130` report preview is wired using stable persisted
  vacancy `finding_id` values. Server economics, assumptions, overlap exclusions
  and ranking are displayed without browser calculations; comparison remains
  explicitly unverified.
- Focused model/fetch/preview tests are added; final verification passes (93
  tests, typecheck, lint with the existing warning only, build and contract).
  Browser/print evidence and separate deployment observation remain pending.
  No production mutation was performed.
