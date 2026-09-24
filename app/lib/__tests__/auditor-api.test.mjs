// P007 auditor API adapter checks (Agent A — OpenCode).
// Run: npm test  (node --test, no dependencies).
// Uses contract-shaped fixtures inline in tests only — never production data.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  API_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  buildReportSnapshot,
  createRequestTracker,
  createSelectionRevision,
  getSummary,
  listDatasets,
  parseDatasetList,
  parseSummary,
  parseTariffInput,
  printEligibility,
  shouldApplyTariffResult,
  updateTariff,
  uploadDataset,
} from "../auditor-api.ts";

const ORIGIN = "http://127.0.0.1:1";

function okJson(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const IMPORT_OK = {
  dataset_id: "ds-1",
  run_id: "run-1",
  status: "accepted",
  report: { errors: [], warnings: ["w1"], duplicates_deduped: 2 },
};

describe("multipart upload", () => {
  it("sends field name file without manual Content-Type", async () => {
    let seen = null;
    const mockFetch = async (url, init) => {
      seen = { url, init };
      assert.equal(url, `${ORIGIN}/api/v1/imports`);
      assert.equal(init.method, "POST");
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get("file")?.name, "meter.csv");
      assert.ok(!init.headers || !init.headers["Content-Type"]);
      return okJson(IMPORT_OK);
    };
    const file = new File(["a,b\n1,2"], "meter.csv", { type: "text/csv" });
    const res = await uploadDataset(ORIGIN, file, file.name, mockFetch, 5000);
    assert.equal(res.dataset_id, "ds-1");
    assert.ok(seen);
  });

  it("parses enveloped success bodies", async () => {
    const mockFetch = async () => okJson({ data: IMPORT_OK });
    const res = await uploadDataset(
      ORIGIN,
      new Blob(["x"]),
      "f.json",
      mockFetch,
      5000,
    );
    assert.equal(res.run_id, "run-1");
    assert.equal(res.alreadyImported, false);
  });

  it("honours an already-imported acknowledgement", async () => {
    const mockFetch = async () =>
      okJson({ ...IMPORT_OK, status: "already_imported", already_imported: true });
    const res = await uploadDataset(
      ORIGIN,
      new Blob(["x"]),
      "f.json",
      mockFetch,
      5000,
    );
    assert.equal(res.alreadyImported, true);
  });

  it("throws rejected imports with the server report", async () => {
    const report = {
      errors: [{ message: "bad interval", field: "device_intervals[3]", row: 12 }],
      warnings: [],
      duplicates_deduped: 0,
    };
    const mockFetch = async () =>
      okJson({ dataset_id: "ds-9", run_id: "r", status: "rejected", report });
    await assert.rejects(
      uploadDataset(ORIGIN, new Blob(["x"]), "f.csv", mockFetch, 5000),
      (e) => e instanceof ApiError && e.code === "VALIDATION_REJECTED" && e.report.errors[0].row === 12,
    );
  });

  it("maps 409 conflict and 413 too-large", async () => {
    const m409 = async () => ({ ok: false, status: 409, json: async () => ({}) });
    await assert.rejects(
      uploadDataset(ORIGIN, new Blob(["x"]), "f", m409, 5000),
      (e) => e instanceof ApiError && e.code === "CONFLICT",
    );
    const m413 = async () => ({ ok: false, status: 413, json: async () => ({}) });
    await assert.rejects(
      uploadDataset(ORIGIN, new Blob(["x"]), "f", m413, 5000),
      (e) => e instanceof ApiError && e.code === "REQUEST_TOO_LARGE",
    );
  });

  it("timeout explains unknown completion instead of claiming rollback", async () => {
    const slow = async (_u, init) => {
      await new Promise((_, rej) =>
        init.signal.addEventListener("abort", () => rej(new DOMException("x", "AbortError"))),
      );
    };
    await assert.rejects(
      uploadDataset(ORIGIN, new Blob(["x"]), "f", slow, 50),
      (e) => e instanceof ApiError && e.code === "TIMEOUT_UNKNOWN" && /unknown/.test(e.message),
    );
  });

  it("malformed success bodies fail without fake success", async () => {
    const mockFetch = async () => okJson({ nope: true });
    await assert.rejects(
      uploadDataset(ORIGIN, new Blob(["x"]), "f", mockFetch, 5000),
      (e) => e instanceof ApiError && e.code === "BAD_RESPONSE",
    );
  });

  it("unreachable backends fail, never succeed", async () => {
    const down = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      uploadDataset(ORIGIN, new Blob(["x"]), "f", down, 5000),
      (e) => e instanceof ApiError && e.code === "UNREACHABLE",
    );
  });
});

describe("dataset list and selection", () => {
  it("parses bare and enveloped lists", async () => {
    const items = [{ dataset_id: "a", run_id: "r1", scenario_id: "original" }];
    assert.deepEqual(await listDatasets(ORIGIN, async () => okJson(items), 5000), [
      { dataset_id: "a", run_id: "r1", scenario_id: "original" },
    ]);
    assert.deepEqual(
      (await listDatasets(ORIGIN, async () => okJson({ data: items }), 5000)).length,
      1,
    );
  });

  it("rejects malformed lists", async () => {
    await assert.rejects(
      listDatasets(ORIGIN, async () => okJson([{ run_id: "x" }]), 5000),
      (e) => e instanceof ApiError && e.code === "BAD_RESPONSE",
    );
  });

  it("stale selection responses are ignorable via tracker", () => {
    const t = createRequestTracker();
    const first = t.issue();
    const second = t.issue();
    assert.equal(t.isCurrent(first), false);
    assert.equal(t.isCurrent(second), true);
  });

  it("parseDatasetList keeps documented metadata", () => {
    const parsed = parseDatasetList([
      { dataset_id: "a", run_id: "r", interval_seconds: 60, imported_utc: "2026-09-24T00:00:00Z" },
    ]);
    assert.equal(parsed[0].interval_seconds, 60);
    assert.equal(parsed[0].imported_utc, "2026-09-24T00:00:00Z");
  });
});

describe("summary and tariff", () => {
  it("parses full summaries", async () => {
    const s = await getSummary(
      ORIGIN,
      "ds-1",
      async (url) => {
        assert.ok(url.endsWith("/api/v1/imports/ds-1/summary"));
        return okJson({
          dataset_id: "ds-1",
          energy_kwh: 12.5,
          cost_inr: 125,
          tariff_inr_per_kwh: 10,
          gaps: [],
        });
      },
      5000,
    );
    assert.equal(s.energy_kwh, 12.5);
    assert.equal(s.cost_inr, 125);
  });

  it("unset cost/tariff stay null (never zero)", async () => {
    const s = await getSummary(
      ORIGIN,
      "ds-1",
      async () => okJson({ dataset_id: "ds-1", energy_kwh: 12.5 }),
      5000,
    );
    assert.equal(s.cost_inr, null);
    assert.equal(s.tariff_inr_per_kwh, null);
    assert.deepEqual(parseSummary({ dataset_id: "x", energy_kwh: 1 }).gaps, []);
  });

  it("tariff validation: blank rejected, zero accepted, negatives rejected", () => {
    assert.deepEqual(parseTariffInput(""), { ok: false, error: "Enter an electricity rate — blank is not zero." });
    assert.equal(parseTariffInput("   ").ok, false);
    assert.deepEqual(parseTariffInput("0"), { ok: true, value: 0 });
    assert.deepEqual(parseTariffInput(" 10.5 "), { ok: true, value: 10.5 });
    assert.equal(parseTariffInput("-1").ok, false);
    assert.equal(parseTariffInput("abc").ok, false);
  });

  it("tariff update posts JSON and returns the confirmed rate", async () => {
    let seen = null;
    const s = await updateTariff(
      ORIGIN,
      "ds-1",
      10,
      async (url, init) => {
        seen = { url, init };
        return okJson({ dataset_id: "ds-1", inr_per_kwh: 10 });
      },
      5000,
    );
    assert.equal(s.inr_per_kwh, 10);
    assert.equal(seen.init.method, "PUT");
    assert.equal(seen.init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(seen.init.body), { inr_per_kwh: 10 });
  });

  it("tariff failures preserve input callers (throw, no silent zero)", async () => {
    const down = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(updateTariff(ORIGIN, "ds-1", 5, down, 5000), ApiError);
  });
});

describe("timeouts", () => {
  it("upload default is month-size suitable, api default is short", () => {
    assert.ok(UPLOAD_TIMEOUT_MS >= 60000);
    assert.ok(API_TIMEOUT_MS <= 15000);
  });
});

describe("race guards (deferred mocks, same mechanism the UI uses)", () => {
  function deferred() {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("a summary resolving after B was selected is ignored", async () => {
    const tracker = createRequestTracker();
    const gateA = deferred();
    const gateB = deferred();
    const fetchFor = (gate, body) => async () => {
      await gate.promise;
      return { ok: true, status: 200, json: async () => body };
    };
    const applied = [];
    const idA = tracker.issue();
    const pA = getSummary(ORIGIN, "A", fetchFor(gateA, { dataset_id: "A", energy_kwh: 1 }), 5000)
      .then((s) => {
        if (tracker.isCurrent(idA)) applied.push(["A", s]);
      });
    const idB = tracker.issue();
    const pB = getSummary(ORIGIN, "B", fetchFor(gateB, { dataset_id: "B", energy_kwh: 2 }), 5000)
      .then((s) => {
        if (tracker.isCurrent(idB)) applied.push(["B", s]);
      });
    gateA.resolve();
    await pA;
    gateB.resolve();
    await pB;
    assert.deepEqual(applied.map(([id]) => id), ["B"]);
  });

  it("an obsolete error never replaces current state", async () => {
    const tracker = createRequestTracker();
    const idA = tracker.issue();
    const idB = tracker.issue();
    const errors = [];
    // Late failure for A arrives while B is current: must be dropped.
    if (tracker.isCurrent(idA)) errors.push("A-error");
    if (tracker.isCurrent(idB)) errors.push("B-ok");
    assert.deepEqual(errors, ["B-ok"]);
  });

  it("tariff completion applies only to the still-selected dataset", () => {
    assert.equal(shouldApplyTariffResult("A", "A"), true);
    assert.equal(shouldApplyTariffResult("A", "B"), false);
    assert.equal(shouldApplyTariffResult("A", null), false);
  });

  it("upload completion auto-selects only without a newer selection event", () => {
    // Deterministic event ordering: same-millisecond actions and wall-clock
    // jumps cannot misorder a monotonic revision (the P012 wall-clock flaw).
    const rev = createSelectionRevision();
    const submitted = rev.current(); // upload submitted at revision 0
    rev.manualSelect(); // user selects something newer before completion
    assert.equal(rev.shouldAutoSelect(submitted), false);
    const rev2 = createSelectionRevision();
    const submitted2 = rev2.current();
    assert.equal(rev2.shouldAutoSelect(submitted2), true);
    rev2.autoSelect();
    // An older upload finishing after the auto-select must not reselect.
    assert.equal(rev2.shouldAutoSelect(submitted2), false);
  });

  it("synthetic flag is explicit-only, never inferred", () => {
    assert.equal(parseSummary({ dataset_id: "x", energy_kwh: 1, synthetic: true }).synthetic, true);
    assert.equal(parseSummary({ dataset_id: "x", energy_kwh: 1 }).synthetic, null);
    assert.equal(parseSummary({ dataset_id: "x", energy_kwh: 1, synthetic: false }).synthetic, null);
    assert.equal(parseSummary({ dataset_id: "x", energy_kwh: 1, synthetic: "yes" }).synthetic, null);
  });
});

describe("print snapshot and eligibility", () => {
  const base = {
    selectedId: "ds-1",
    summary: {
      dataset_id: "ds-1",
      energy_kwh: 0.03,
      cost_inr: 0.3,
      tariff_inr_per_kwh: 10,
      gaps: [],
      synthetic: null,
    },
    dataset: { run_id: "run-1", scenario_id: "original" },
    loading: false,
    saving: false,
    fetchedAtIso: "2026-09-24T00:01:00Z",
    generatedAtIso: "2026-09-24T00:02:00Z",
  };

  it("builds a fixed snapshot from a coherent current summary", () => {
    const snap = buildReportSnapshot(base);
    assert.ok(snap);
    assert.equal(snap.datasetId, "ds-1");
    assert.equal(snap.runId, "run-1");
    assert.equal(snap.energyKwh, 0.03);
    assert.equal(snap.fetchedAtIso, "2026-09-24T00:01:00Z");
    assert.equal(snap.generatedAtIso, "2026-09-24T00:02:00Z");
  });

  it("refuses mismatched identity, loading, and pending tariff", () => {
    assert.equal(
      buildReportSnapshot({ ...base, selectedId: "ds-2" }),
      null,
    );
    assert.match(
      printEligibility({ ...base, selectedId: "ds-2" }).reason,
      /ds-1/,
    );
    assert.equal(buildReportSnapshot({ ...base, loading: true }), null);
    assert.equal(buildReportSnapshot({ ...base, saving: true }), null);
    assert.equal(
      buildReportSnapshot({ ...base, selectedId: null }),
      null,
    );
    assert.equal(printEligibility({ ...base, summary: null }).eligible, false);
  });

  it("preserves unset versus explicit zero tariff", () => {
    const unset = buildReportSnapshot({
      ...base,
      summary: { ...base.summary, cost_inr: null, tariff_inr_per_kwh: null },
    });
    assert.equal(unset.costInr, null);
    assert.equal(unset.tariffInrPerKwh, null);
    const zero = buildReportSnapshot({
      ...base,
      summary: { ...base.summary, cost_inr: 0, tariff_inr_per_kwh: 0 },
    });
    assert.equal(zero.costInr, 0);
    assert.equal(zero.tariffInrPerKwh, 0);
  });

  it("snapshot is fixed against later responses", () => {
    const summary = { ...base.summary };
    const snap = buildReportSnapshot({ ...base, summary });
    assert.ok(snap);
    summary.energy_kwh = 999;
    summary.cost_inr = 999;
    assert.equal(snap.energyKwh, 0.03);
    assert.equal(snap.costInr, 0.3);
  });

  it("missing optional metadata becomes null, never invented", () => {
    const snap = buildReportSnapshot({ ...base, dataset: null });
    assert.ok(snap);
    assert.equal(snap.runId, null);
    assert.equal(snap.scenarioId, null);
    assert.equal(snap.importedUtc, null);
  });

  it("synthetic disclosure follows the explicit flag only", () => {
    assert.equal(
      buildReportSnapshot({ ...base, summary: { ...base.summary, synthetic: true } }).synthetic,
      true,
    );
    assert.equal(
      buildReportSnapshot({ ...base, summary: { ...base.summary, synthetic: null } }).synthetic,
      null,
    );
  });
});
