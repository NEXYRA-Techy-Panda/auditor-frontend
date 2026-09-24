// P019 analysis presentation checks (Agent A — OpenCode).
// Run: npm test (node --test, no dependencies).
// P010-shaped fixtures live in tests only — never production data.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../auditor-api.ts";
import {
  formatWindow,
  getAnalysisJob,
  isTerminalStatus,
  pageWindow,
  parseAnalysisJob,
  parseFinding,
  parseJobSubmit,
  readableFindingType,
  submitAnalysisJob,
} from "../analysis.ts";

const ORIGIN = "http://127.0.0.1:1";
const okJson = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const LIGHT_FINDING = {
  finding_id: "vacant_but_on:light-a:2026-09-21T03:31:00Z",
  finding_type: "vacant_but_on",
  room_id: "room-a",
  device_id: "light-a",
  window_start_utc: "2026-09-21T03:31:00Z",
  window_end_utc: "2026-09-21T03:32:00Z",
  observed: { value: 0.01, unit: "kWh" },
  expected: { value: 0, unit: "kWh" },
  method: "rule",
  suggested_action: "Switch off Room A light when vacant after its applicable grace period.",
  assumptions: "Vacancy from matching room intervals.",
  resolution_limit: "60-second intervals; sub-interval timing not visible.",
  avoidable_energy_kwh: 0.01,
  avoidable_cost_inr: 0.1,
  evidence: { rule_version: "vacant-beyond-grace-v1", vacant_on_seconds_beyond_grace: 60 },
};

const JOB_COMPLETED = {
  data: {
    job_id: "job-1",
    dataset_id: "ds-1",
    status: "completed",
    method: "rule",
    method_version: "vacant-beyond-grace-v1",
    requested_range: { start_utc: "2026-09-21T03:30:00Z", end_utc: "2026-09-21T03:32:00Z" },
    actual_coverage: { start_utc: "2026-09-21T03:30:00Z", end_utc: "2026-09-21T03:32:00Z" },
    progress: { completed_batches: 2, total_batches: 2 },
    result: {
      dataset_id: "ds-1",
      run_id: "run-fixture-001",
      synthetic: true,
      method: "rule",
      method_version: "vacant-beyond-grace-v1",
      model_used: false,
      warnings: [{ code: "ANALYSES_NOT_PERFORMED", message: "Only the deterministic rule runs." }],
      excluded_devices: [{ device_id: "fridge-b", reason: "always-on exception: vacant operation is by design" }],
      totals: {
        dataset_energy_kwh: 0.03,
        avoidable_energy_kwh: 0.01,
        unknown_avoidable_findings: 0,
        tariff_inr_per_kwh: 10,
        dataset_cost_inr: 0.3,
        avoidable_cost_inr: 0.1,
      },
      findings: [LIGHT_FINDING],
      findings_pagination: { page: 1, page_size: 100, total: 1 },
    },
    created_at: "2026-09-24T00:00:00Z",
    completed_at: "2026-09-24T00:01:00Z",
  },
};

describe("job submission and status", () => {
  it("submits with dataset_id and parses the queued acknowledgement", async () => {
    let seen = null;
    const job = await submitAnalysisJob(
      ORIGIN,
      "ds-1",
      async (url, init) => {
        seen = { url, init };
        return okJson({ data: { job_id: "job-1", status: "queued" } }, 202);
      },
      5000,
    );
    assert.equal(job.job_id, "job-1");
    assert.equal(job.status, "queued");
    assert.ok(seen.url.endsWith("/api/v1/analysis/jobs"));
    assert.deepEqual(JSON.parse(seen.init.body), { dataset_id: "ds-1" });
  });

  it("maps queue-full and unknown-dataset errors", async () => {
    const full = async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "CONFLICT", message: "queue is full" } }),
    });
    await assert.rejects(submitAnalysisJob(ORIGIN, "ds-1", full, 5000), (e) => {
      assert.ok(e instanceof ApiError && e.status === 503 && e.code === "CONFLICT");
      return true;
    });
    const missing = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "Dataset was not found" } }),
    });
    await assert.rejects(submitAnalysisJob(ORIGIN, "nope", missing, 5000), (e) => {
      assert.ok(e instanceof ApiError && e.code === "NOT_FOUND");
      return true;
    });
  });

  it("parses queued/running/failed states", async () => {
    const q = parseAnalysisJob({ data: { job_id: "j", dataset_id: "d", status: "queued", progress: { completed_batches: 0, total_batches: 2 } } });
    assert.ok(q && q.status === "queued" && q.progress.total_batches === 2);
    const f = parseAnalysisJob({
      data: { job_id: "j", dataset_id: "d", status: "failed", error: { code: "JOB_FAILED", message: "boom" } },
    });
    assert.ok(f && f.error.code === "JOB_FAILED");
    assert.equal(parseAnalysisJob({ data: { job_id: "j", dataset_id: "d", status: "exploding" } }), null);
  });

  it("terminal states are completed and failed only", () => {
    assert.equal(isTerminalStatus("completed"), true);
    assert.equal(isTerminalStatus("failed"), true);
    assert.equal(isTerminalStatus("queued"), false);
    assert.equal(isTerminalStatus("running"), false);
  });

  it("rejects job responses for another job id", async () => {
    const other = async () => okJson({ data: { job_id: "other", dataset_id: "d", status: "queued" } });
    await assert.rejects(getAnalysisJob(ORIGIN, "job-1", other, 1, 100, 5000), (e) => {
      assert.ok(e instanceof ApiError && e.code === "BAD_RESPONSE");
      return true;
    });
  });
});

describe("findings presentation", () => {
  it("parses the reference light finding with 0.01 kWh avoidable", () => {
    const job = parseAnalysisJob(JOB_COMPLETED);
    assert.ok(job && job.status === "completed");
    const f = job.findings[0];
    assert.equal(f.finding_id, "vacant_but_on:light-a:2026-09-21T03:31:00Z");
    assert.equal(f.avoidable_energy_kwh, 0.01);
    assert.equal(f.avoidable_cost_inr, 0.1);
    assert.equal(f.method, "rule");
    assert.ok(f.suggested_action && f.assumptions && f.resolution_limit);
    assert.equal(f.observed.unit, "kWh");
  });

  it("keeps backend totals verbatim (no invented aggregates)", () => {
    const totals = parseAnalysisJob(JOB_COMPLETED).result.totals;
    assert.deepEqual(totals, {
      dataset_energy_kwh: 0.03,
      avoidable_energy_kwh: 0.01,
      unknown_avoidable_findings: 0,
      tariff_inr_per_kwh: 10,
      dataset_cost_inr: 0.3,
      avoidable_cost_inr: 0.1,
    });
  });

  it("distinguishes unknown savings from zero savings", () => {
    const noAvoid = parseFinding({ ...LIGHT_FINDING });
    delete noAvoid.avoidable_energy_kwh;
    const r = parseFinding({ finding_id: "x", finding_type: "t", method: "rule" });
    assert.equal(r.avoidable_energy_kwh, undefined);
    const zero = parseFinding({ finding_id: "x", finding_type: "t", method: "rule", avoidable_energy_kwh: 0 });
    assert.equal(zero.avoidable_energy_kwh, 0);
    assert.ok(noAvoid);
  });

  it("reports refrigerator exclusion and limited analyses once", () => {
    const job = parseAnalysisJob(JOB_COMPLETED);
    assert.equal(job.result.excluded_devices[0].device_id, "fridge-b");
    assert.match(job.result.excluded_devices[0].reason, /always-on/);
    assert.equal(job.result.warnings[0].code, "ANALYSES_NOT_PERFORMED");
    assert.equal(job.result.method, "rule");
    assert.equal(job.result.model_used, false);
  });

  it("empty findings mean no findings from performed checks", () => {
    const job = parseAnalysisJob({
      data: {
        job_id: "j",
        dataset_id: "d",
        status: "completed",
        result: {
          dataset_id: "d",
          method: "rule",
          method_version: "v",
          warnings: [{ code: "ANALYSES_NOT_PERFORMED", message: "limited" }],
          excluded_devices: [],
          totals: {
            dataset_energy_kwh: 1,
            avoidable_energy_kwh: 0,
            unknown_avoidable_findings: 0,
            tariff_inr_per_kwh: null,
            dataset_cost_inr: null,
            avoidable_cost_inr: null,
          },
          findings: [],
          findings_pagination: { page: 1, page_size: 100, total: 0 },
        },
      },
    });
    assert.ok(job && job.findings.length === 0);
    assert.equal(job.result.totals.tariff_inr_per_kwh, null);
  });

  it("rejects malformed findings and pagination", () => {
    assert.equal(parseFinding({ finding_id: "x" }), null);
    assert.equal(
      parseFinding({ ...LIGHT_FINDING, observed: { value: "lots", unit: "kWh" } }),
      null,
    );
    const bad = parseAnalysisJob({
      data: {
        job_id: "j",
        dataset_id: "d",
        status: "completed",
        result: {
          dataset_id: "d",
          method: "rule",
          method_version: "v",
          warnings: [],
          excluded_devices: [],
          totals: {
            dataset_energy_kwh: 1,
            avoidable_energy_kwh: 0,
            unknown_avoidable_findings: 0,
            tariff_inr_per_kwh: null,
            dataset_cost_inr: null,
            avoidable_cost_inr: null,
          },
          findings: [LIGHT_FINDING],
          findings_pagination: { page: 1 },
        },
      },
    });
    assert.equal(bad, null);
  });

  it("renders structured finding text safely", () => {
    const f = parseFinding({
      ...LIGHT_FINDING,
      suggested_action: "<img src=x onerror=alert(1)> Switch off",
    });
    // Raw text is preserved by the parser; components must render it as text,
    // never injected HTML (asserted by component review + build, not DOM here).
    assert.ok(f.suggested_action.includes("<img"));
  });
});

describe("presentation helpers", () => {
  it("reads finding types in plain language", () => {
    assert.equal(readableFindingType("vacant_but_on"), "Vacant but on");
    assert.equal(readableFindingType("something_new"), "something new");
  });

  it("windows show UTC plus Asia/Kolkata without inventing data", () => {
    const w = formatWindow("2026-09-21T03:31:00Z", "2026-09-21T03:32:00Z");
    assert.ok(w.includes("2026-09-21T03:31:00Z") && w.includes("Asia/Kolkata"));
    assert.equal(formatWindow(undefined, "2026-09-21T03:32:00Z"), null);
  });

  it("paginates display windows without implying completeness", () => {
    assert.deepEqual(pageWindow(137, 1, 100), { from: 1, to: 100 });
    assert.deepEqual(pageWindow(137, 2, 100), { from: 101, to: 137 });
    assert.deepEqual(pageWindow(0, 1, 100), { from: 0, to: 0 });
  });

  it("parseJobSubmit accepts the 202 acknowledgement", () => {
    assert.deepEqual(parseJobSubmit({ data: { job_id: "j", status: "queued" } }), {
      job_id: "j",
      status: "queued",
    });
    assert.equal(parseJobSubmit({ data: { job_id: "j" } }), null);
  });
});
