# HANDOFF — auditor-frontend

## 0. Continuity and current layer (F0.1, 2026-09-24)

- Current layer: **P017 F5-UI** (real auditor integration, Agent A —
  OpenCode) — status **completed**, review **pending**. Contract: **1.0.1
  authoritative, read-only**.
- P001 F4-A addendum (completed, review pending): browser-side connection
  panel (`NEXT_PUBLIC_AUDITOR_BACKEND_URL` + `/api/v1/health`, 8 s timeout,
  abort on unmount, no duplicates/polling); ml_reachable:not_checked shown as
  not-connected information, never success. Verified: shared 20/20 logic+mock
  checks, 75/75 contract, typecheck/lint(0 errors)/build green, HTTP-200 panel
  markup; real backend not running (integration pending); browser/CORS not
  verifiable in-session. Details in [P001_F4_A_EVIDENCE.md](P001_F4_A_EVIDENCE.md).
  History preserved.
- P007 A1-UI addendum (completed, review pending): upload/list/select/
  summary/tariff screen — typed adapter, committed node:test checks (18/18),
  no fake data, unset-not-zero, explicit tariff save. Verified: typecheck/
  lint(0 errors)/build/75-75 green, HTTP-200 markup; real backend down
  (5 open response questions for Codex); browser interaction unverified.
  Details in [P007_A1_UI_EVIDENCE.md](P007_A1_UI_EVIDENCE.md).
  Simulation-frontend untouched. History preserved.
- P012 A2-UI addendum (completed, review pending): race hardening (scoped
  summaries/errors, tariff + auto-select guards, aborts), a11y pass (live
  regions, focus, zero-vs-unset wording, synthetic-only disclosure,
  wrapping), 23/23 committed tests. Verified: typecheck/lint(0 errors)/
  build/75-75 green, HTTP-200 shells; real backend down; browser
  interaction unverified. Details in
  [P012 evidence](P012_AUDITOR_UI_RELIABILITY_EVIDENCE.md).
  History preserved.
- P014 A3 addendum (completed, review pending): printable "Energy dataset
  summary" from a fixed coherent snapshot with eligibility gating
  (identity/loading/saving), print CSS via browser facility; monotonic
  selection revision replaces wall-clock auto-select guard (+ regression
  test). Verified: 29/29 tests, 75/75 contract, typecheck/lint(0 errors)/
  build green, HTTP-200 shells, print CSS in built bundle; real backend down;
  print preview/keyboard/browser unverified. Details in
  [P014 evidence](P014_DATASET_SUMMARY_EVIDENCE.md). History preserved.
- P017 F5-UI addendum (completed, review pending): aligned to committed P006
  (67998d5, isolated temp backend + scratch DBs): envelope-only parsing,
  details.report extraction, coverage/gaps semantics, stale-print block.
  Verified: A–F real checks 17/17, committed check:live 9/9 twice, 36/36
  unit tests, 75/75 contract, typecheck/lint(0 errors)/build green. CORS
  headers checked over HTTP only; browser/print interaction unverified.
  Details in [P017 evidence](P017_AUDITOR_REAL_INTEGRATION_EVIDENCE.md).
  History preserved.
- P011 addendum (completed, review pending): backend aa53d0c inspected
  (P006 uncommitted) → checklist branch, UI preserved; created
  [AUDITOR_INTEGRATION_CHECKLIST.md](AUDITOR_INTEGRATION_CHECKLIST.md) and
  [P011 evidence](P011_FRONTEND_HANDOFF_ALIGNMENT_EVIDENCE.md). Verified:
  18/18 tests, 75/75 contract, typecheck/lint(0 errors)/build green.
  History preserved.
- Dated correction (2026-09-24, P001): F1-R2 (contract 1.0.1) and F2-A are
  accepted based on supplied evidence; older "unaccepted"/"review pending"
  wording about the contract refers to pre-acceptance review state. Later
  layers carry their own review statuses. History preserved, not rewritten.
- F2-A addendum (2026-09-24, completed, review pending): independently runnable
  Next.js 16.3.6 + React 19.2.8 + TS 5.9.3 + Tailwind 4.3.3 app on port 3001
  ("Energy Auditor"; analysis-not-implemented foundation screen; no upload
  processing, charts, or backend calls). typecheck/lint(0 errors)/build/75-75
  verifier/HTTP-200 all green; browser inspection not available. Details in
  [F2_A_EVIDENCE.md](F2_A_EVIDENCE.md). History preserved.
- Continuity files: [ACTIVE_TASK.md](ACTIVE_TASK.md) and [PROGRESS_LOG.md](PROGRESS_LOG.md).
- Continuation procedure for a replacement agent: read `AGENTS.md` (absent at
  F0.1 — record if still absent), then `PROJECT_CONTEXT.md`, `WORKSPACE_MAP.md`,
  this `HANDOFF.md`, `ACTIVE_TASK.md`, and recent `PROGRESS_LOG.md` entries;
  inspect `git branch/status/log` and source; reconcile docs with code; resume
  the ACTIVE_TASK next action. Do not restart completed work. See
  [AGENT_START_PROMPT.md](AGENT_START_PROMPT.md) for the full protocol.
- Verified vs planned: **verified** = §2 state below (empty repo on `main`,
  no commits, docs-only untracked files, origins/ports/tooling as measured).
  Everything marked "Not implemented" or "planned" is **not** built. This repo
  has NOT completed application setup — F2 has not run.
- Layer clarifications: **F1 is contract work and does not require Python.**
  Python installation/runtime verification belongs to **F2 for
  energy-ml-service**. Auditor Node work can proceed independently; Python is
  required only for the relevant auditor↔Python integration checks (F4).
  Runtime recommendations from F0 (Node `>=20.9`, Python `3.12`, npm,
  venv+pip) remain **provisional until checked against chosen dependency
  versions and official compatibility documentation during F2**.
- F0 review status: accepted by architecture lead based on supplied evidence;
  local files were not directly inspected by the lead.
- F1 addendum (2026-09-24, completed, review pending): contract v1.0.0 defined;
  this repo holds a byte-identical mirror under `contracts/v1/` (canonical:
  `simulation-backend/contracts/v1/`; see `contracts/v1/manifest.json`).
  `node scripts/verify-contract.mjs` → 49 passed, 0 failed in all five repos
  (semantic checks only; formal schema validation is F2). Links:
  [contract](contracts/v1/CONTRACT.md), [schema](contracts/v1/dataset.schema.json),
  [CSV](contracts/v1/CSV_COLUMNS.md), [API](contracts/v1/API.md),
  [evidence](F1_EVIDENCE.md), [active task](ACTIVE_TASK.md),
  [progress](PROGRESS_LOG.md).
- Dated corrections (history preserved in PROGRESS_LOG): Python 3.13.15
  verified (F1 and this repo need no Python); F0.1 "read-only sibling" wording
  corrected — F0.1 explicitly covered all five repositories; runtime
  recommendations stay provisional until F2; hosting plan — frontends on
  Vercel, Node backends + Python service on Mohan's VPS (no deployment in F1);
  from F1 onward completed layer work is committed and pushed (F0/F0.1 no-push
  was historical only).
- F1-R1 addendum (2026-09-24, completed, review pending): pre-acceptance
  corrections, version retained at 1.0.0 (not published). This repo holds the
  corrected mirror: self-contained envelope CSV, 12 dp precision + consistent
  tolerances, extended verifier (reconstruction parity + negatives + budget).
  54/54 in all five repos. Repo-local identity configured. History preserved.
- F1-R2 addendum (2026-09-24, completed, review pending): version 1.0.1
  (replaces unaccepted 1.0.0 prototype). This repo holds the corrected mirror:
  9dp power precision + fractional checks, V/I average semantics,
  kind-specific closed policy rules, persist-until-cleared overrides, concrete
  Python A/B requests with bounds, full API paths + scaffold health states.
  75/75 in all five repos; CSV-alone parity unchanged. History preserved.

## 1. Purpose and owner

- **Purpose**: Auditor user interface. Next.js + React + TypeScript + Tailwind +
  charts app for CSV/JSON upload, validation preview, office/room/device
  analytics, weekday/schedule analysis, tariff editing (flat ₹/kWh), waste/
  anomaly display, next-day/week/month forecasts, original/improved comparison,
  and printable monthly report. Calls the auditor backend only — never Python
  or SQLite directly.
- **Owner (foundation + long-term)**: Mohan.

## 2. Current verified state (F0, 2026-09-24)

- Local path: `K:\NEXYRA\auditor-frontend` (portable: `../auditor-frontend`).
- Remote: `https://github.com/NEXYRA-Techy-Panda/auditor-frontend.git`
  (verified; fetch OK).
- Branch: `main`. HEAD: **No commits yet** (`ls-remote --heads` empty).
- Working tree before F0 docs: clean (only `.git/`).
- After F0 docs (uncommitted): new untracked `docs/PROJECT_CONTEXT.md`,
  `docs/WORKSPACE_MAP.md`, `docs/HANDOFF.md` (this file),
  `docs/AGENT_START_PROMPT.md`, `README.md`. Not committed/pushed.
- Parent is not a Git repository. No `AGENTS.md` found at F0.
- Tooling: Git `2.55.0.windows.5`, Node `v24.21.0`, npm `11.19.0`. Proposed
  port `3001` free at F0.
- Application state: **Not implemented** — no `package.json`, no source.

## 3. Completed layers and evidence

- **F0 (in review)**: cloned empty repo; verified origin/branch/HEAD/status;
  fetched; recorded tooling/ports; created docs. Evidence in F0 report +
  untracked docs files.
- **F1–F6**: Not implemented.

## 4. Pre-existing implementation discovered during inspection

None. Empty repository; nothing to preserve.

## 5. Planned next layers

- **F1**: adopt shared contract (upload + analysis response shapes, tariff
  semantics, forecast horizons, comparison semantics, UTC/Asia-Kolkata rules).
- **F2**: Next.js + React + TypeScript + Tailwind + charts scaffold via npm;
  Node pin.
- **F3**: N/A (no DB in frontend) — document.
- **F4**: wire `NEXT_PUBLIC_AUDITOR_BACKEND_URL` (proposed) to
  `http://localhost:4001`; upload → results flow; CORS validated server-side.
- **F5**: reference-data displays (office/room/device selectors matching
  simulator's 5 rooms / 18 devices).
- **F6**: verified end-to-end (upload → analytics → forecasts → report) for
  Mohan's continued ownership.

## 6. Prerequisites

- Git, Node `>=20.9` + npm.
- Sibling `../auditor-backend` (port `4001`) from F4 onward.
- F1 contract first. No Python/SQLite in this repo.

## 7. Actual run/check commands, if implemented

No app commands exist. F0 checks:

```powershell
git -C auditor-frontend rev-parse --show-toplevel
git -C auditor-frontend remote -v
git -C auditor-frontend branch --show-current; git -C auditor-frontend status -sb
git -C auditor-frontend rev-parse HEAD   # unknown revision — no commits
git -C auditor-frontend log --oneline -5 # no commits yet
git -C auditor-frontend fetch --all
git -C auditor-frontend ls-remote --heads origin  # empty
node --version; npm --version; git --version
netstat -ano | Select-String ':3000 |:3001 |:4000 |:4001 |:8000 '  # no matches
```

Do not invent `npm run dev/build/test` output.

## 8. Configuration names without secret values

Proposed only (no `.env` at F0):

- `NEXT_PUBLIC_AUDITOR_BACKEND_URL` → `http://localhost:4001`
- No secrets or credentials.

## 9. Contracts and external dependencies

- **F1 contract**: Not implemented. Must not define competing shapes.
- **Planned**: HTTP to auditor-backend only. No Python, no SQLite, no
  simulator-backend calls.
- **npm deps**: none yet.

## 10. Database/migration status

Not applicable. No DB, migrations, or seeds. Must never access SQLite.

## 11. Known issues and blockers

1. Empty remote — greenfield.
2. Node pin undecided; build not yet verified.
3. F0 docs uncommitted — pending review.

## 12. Deferred features

Per shared context: auditor live mode, advanced tariffs (flat ₹/kWh only in
MVP1), sensor/BMS, pricing discussion, elaborate animations. No direct file
parsing bypassing backend validation.

## 13. Last verification date and relevant existing commit references

- Date: 2026-09-24. No commits. F0 docs untracked, pending review.

## 14. Instructions to update this document after every completed layer

After each layer, update date, branch/HEAD, §§2–3/7–11 with actual files,
commands and results; preserve history; keep §§1/12/14 unless scope formally
changes. Return updated sections as evidence.
