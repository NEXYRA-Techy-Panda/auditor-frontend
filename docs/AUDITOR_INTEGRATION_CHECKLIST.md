# Auditor integration checklist (Agent A — OpenCode, P011)

Future local verification of auditor-frontend (P007 UI) against a real
auditor-backend. Status as of P011: **not executed** — the backend's upload
endpoints (P006, Codex) are uncommitted work in progress. Last committed
backend inspected: `aa53d0c` (P003 SQLite foundation; only `GET /api/v1/health`
plus DB layer in committed `src/`). All items below are mock-only until run.

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