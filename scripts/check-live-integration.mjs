// Opt-in live integration check (P017, Agent A — OpenCode).
// Run: AUDITOR_TEST_BACKEND=http://127.0.0.1:4566 npm run check:live
// Uses committed fixtures only; tolerant of prior runs (dedup-aware).
// Without AUDITOR_TEST_BACKEND it prints a skip note and exits 0, so
// ordinary `npm test` never requires a server.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSummary,
  listDatasets,
  updateTariff,
  uploadDataset,
} from "../app/lib/auditor-api.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.AUDITOR_TEST_BACKEND;
if (!origin) {
  console.log("SKIP: set AUDITOR_TEST_BACKEND to run live integration checks.");
  process.exit(0);
}

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}

const fx = (n) => join(root, "contracts", "v1", "fixtures", n);
const asFile = (p, name, type) => new File([readFileSync(p)], name, { type });

// Import (accepted on a fresh DB, already_imported on reruns — both fine).
const r1 = await uploadDataset(origin, asFile(fx("reference.json"), "reference.json", "application/json"), "reference.json", fetch, 120000);
check("import acknowledged with a dataset_id", typeof r1.dataset_id === "string" && r1.dataset_id.length > 0);
const id = r1.dataset_id;

// Equivalent CSV reimport resolves to the same dataset without duplication.
const r2 = await uploadDataset(origin, asFile(fx("reference.csv"), "reference.csv", "text/csv"), "reference.csv", fetch, 120000);
check("CSV reimport returns the same dataset as already_imported", r2.dataset_id === id && r2.alreadyImported === true, r2.dataset_id);
const listed = await listDatasets(origin, fetch, 8000);
check("no duplicate dataset listed", listed.filter((d) => d.dataset_id === id).length === 1);

// Persisted energy and tariff round-trips (deterministic in any DB state).
const s1 = await getSummary(origin, id, fetch, 8000);
check("persisted energy is 0.03 kWh", Math.abs(s1.energy_kwh - 0.03) < 1e-9, s1.energy_kwh);
check("coverage present", s1.coverage?.device_intervals === 4 && s1.coverage?.room_intervals === 4);
await updateTariff(origin, id, 10, fetch, 8000);
const s2 = await getSummary(origin, id, fetch, 8000);
check("tariff 10 gives cost 0.30", Math.abs(s2.cost_inr - 0.3) < 1e-9 && s2.tariff_inr_per_kwh === 10, `${s2.cost_inr}`);
await updateTariff(origin, id, 0, fetch, 8000);
const s3 = await getSummary(origin, id, fetch, 8000);
check("explicit zero tariff retained with zero cost", s3.tariff_inr_per_kwh === 0 && s3.cost_inr === 0);

// Invalid file rejected without adding a dataset.
const before = (await listDatasets(origin, fetch, 8000)).length;
let rejected = false;
try {
  await uploadDataset(origin, new File(["{nope"], "bad.json", { type: "application/json" }), "bad.json", fetch, 30000);
} catch {
  rejected = true;
}
const after = (await listDatasets(origin, fetch, 8000)).length;
check("invalid file rejected", rejected);
check("no extra dataset after failure", before === after, `${before} -> ${after}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
