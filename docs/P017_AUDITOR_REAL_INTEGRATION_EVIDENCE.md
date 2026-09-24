# P017 auditor real-integration evidence (Agent A — OpenCode)

Written before commit; commit hash is returned in the P017 evidence report.

## Backend commit and isolation

- Pinned commit `67998d5` (P006, Codex) exported read-only via two-step
  `git archive` into task-owned `...\Temp\opencode\p017-backend`
  (PowerShell-piped tar corrupts the stream — use the file round-trip).
  Backend repo untouched: no checkout/reset/stash, no worktree change.
- `npm ci --ignore-scripts` (better-sqlite3 has no VS toolchain here, but
  its tarball bundles a working win32-x64 prebuild — verified with an
  in-memory query; nothing copied from sibling environments), `tsc` build.
- Ran with: PORT 4566, HOST 127.0.0.1, fresh scratch DBs
  (`p017-data/scratch.sqlite`, then `p017-data-2/` for the repeatability
  run), FRONTEND_ORIGIN=http://localhost:3001, no Python needed. Never the
  normal data/auditor.sqlite; never a foreign process (PIDs 18084, 17184 —
  both stopped by this task; port free at end).

## Five API questions — actual answers (all resolved)

1. Envelope vs bare: every success uses `{data, meta:{request_id}}`;
   errors use `{error:{code,message,field?,row?,details?}}`. Adapter now
   requires the envelope; bare/items/datasets shapes rejected.
2. Already-imported: HTTP 200, same server-UUID dataset_id,
   `status:"already_imported"`, `already_imported:true`.
3. Validation: 400 malformed transport, 422 schema/semantic; issue list in
   `details` directly (not `details.report`) with `{field, message, row?}`;
   reports carry `additional_errors` (100-issue cap). 409 carries
   "Export identity conflict: …".
4. List: `{data:[...]}` newest-first, all five fields, no pagination.
   Summary: always `{coverage{start_utc,end_utc,device_intervals,
   room_intervals}, gaps[]}` (currently always empty); cost/tariff null when
   unset. Tariff echoes the submitted value; 404 unknown id; 422 invalid.
5. No synthetic field on summary responses — disclosure stays explicit-only
   (never fires against P006).

## Adapter/UI defects corrected

- Envelope-only parsing (bare/items/datasets removed as drift-hiders).
- 422/400 `details` extracted into VALIDATION_REJECTED with issue list +
  field/row (previously only the generic message survived).
- Coverage parsed and displayed (period UTC + interval counts) or "Not
  supplied"; gaps absent→null ("Not supplied"), []→"None reported";
  structured gaps via `describeGap` (never "[object Object]").
- Print blocked after a failed refresh (retained stale data must not print
  as current) — defect found during P017, fixed, regression-tested.

## Real import/dedup/tariff results (isolated backend, committed fixtures)

- A: reference.json → 201 accepted, already_imported=false; energy 0.03 kWh;
  tariff/cost null; coverage 4+4.
- B: reference.csv → 200, same dataset_id, already_imported=true; one row
  listed (no duplication).
- C: tariff ₹10 → energy 0.03, cost ₹0.30.
- D: tariff ₹0 retained with cost 0; blank rejected client-side.
- E: invalid file → useful validation error; dataset count unchanged.
- F: identity stable across refreshes; summary stays on the same dataset.
- Full A–F harness: 17/17 (fresh DB). Committed opt-in
  `npm run check:live` (AUDITOR_TEST_BACKEND): 9/9 twice incl. rerun —
  repeatable; skips cleanly without the env var.

## Report eligibility and data consistency

Snapshot/eligibility extended with coverage + failed-refresh block; print
preview still fixed-at-click and immune to later responses. Report shows the
same confirmed summary values.

## Browser/CORS/print checks

- CORS headers verified over HTTP: allow-origin echoes the test origin;
  tariff PUT preflight allows PUT. This is NOT browser verification.
- No browser capability: upload/selection/tariff interaction, live regions,
  print preview pagination, narrow layout unverified. SSR/HTTP prove nothing
  about them. Manual checklist for Mohan: run backend per P006 docs with a
  scratch DB, run this repo on :3001, walk checklist §1–§3 + §7 in a browser.

## Tests and remaining blockers

- Committed `npm test`: 36/36 (23 prior + details/coverage/gaps/envelope/
  stale-print/gap-text additions). Contract 75/75, typecheck clean, lint 0
  errors, build exit 0. No new production dependencies.
- Blockers: none. P015/P016 may change the backend later — re-run
  `check:live` then.

## Processes remaining

None. Test backends stopped; ports free. Temp export/DBs/scripts remain on
disk outside Git (p017-*), harmless to remove.

## Commit/push

Authorised P017 commit + push to `origin/main` (repo-local identity
mohan-madhu). No force-push. Secrets/env/DBs/uploads/build artifacts
excluded. Hash verified via `ls-remote`; reported in the P017 evidence report.
