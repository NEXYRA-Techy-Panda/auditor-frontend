# P001 F4-A evidence — auditor-frontend (Agent A — OpenCode)

Written before commit; commit hashes are returned in the P001 evidence report.

## Status

F4-A complete, review pending. Browser-side connection panel replaces the
static message. No uploads, charts, sockets, or auth UI. Contract 1.0.1
authoritative, untouched.

## Behaviour implemented

- `app/lib/health.ts`: identical to simulation-frontend (same verified hash).
- `app/components/connection-panel.tsx`: same states/button/timeout/abort/
  dedup/no-polling behaviour; kind="auditor" notes — `ml_reachable:not_checked`
  renders amber "not checked ≠ connected"; `false` renders ML-unreachable
  note; valid payload otherwise neutral. Missing/invalid URL → unexpected
  with setup guidance.
- `app/page.tsx` renders the panel; foundation label kept.

## Verification and limitations

- Shared logic harness: **20/20** (same temp run covers both repos'
  identical lib).
- Contract verifier: 75/75 (unchanged). Typecheck: clean. Lint: 0 errors
  (1 pre-existing verifier warning).
- Production build: exit 0. Served `next start -p 3001` (PID 23200, stopped):
  `GET /` → 200 with panel markup, button, initial "Not checked".
- Mock-based UI behaviour: logic layer fully exercised; component render at
  SSR level only.
- Real backend HTTP: `GET localhost:4001/api/v1/health` — connection refused;
  service not running. Live integration check pending.
- Browser/CORS: NOT verified — no browser capability. Plain browser fetch in
  the panel will exercise CORS on first real load.

## Files changed

- Created: `app/lib/health.ts`, `app/components/connection-panel.tsx`,
  `docs/P001_F4_A_EVIDENCE.md` (this file).
- Updated: `app/page.tsx`, `docs/HANDOFF.md`, `docs/PROGRESS_LOG.md`,
  `docs/ACTIVE_TASK.md`.
- Preserved: contract, verifier, lockfile versions (no new dependencies).

## Processes

None running at end. Port 3001 free. No foreign processes touched.

## Commit/push

Authorised P001 commit + push to `origin/main` (repo-local identity).
No force-push. Hashes verified; reported in the P001 evidence report.
Backend repos untouched.

## Next task needs

A running auditor-backend (Codex's assignment) for the live check; a browser
for CORS confirmation. No code dependency.
