# HANDOFF — auditor-frontend

## 0. Continuity and current layer (F0.1, 2026-09-24)

- Current layer: **F1** (shared contract v1.0.0) — status
  **blocked** (contract authored + verified; commit/push await git identity),
  review **pending**. Contract: **1.0.0 defined** (canonical
  `simulation-backend/contracts/v1/`, mirrored to siblings).
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
