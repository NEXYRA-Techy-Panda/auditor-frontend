import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchDetectorCatalogue,
  getDetectorJob,
  submitDetectorJob,
  validateDetectorWindows,
} from "../detectors.ts";

const IDENTITY = {
  id: "excess_consumption",
  label: "Excess-consumption deviation versus an earlier comparable reference",
  method: "rule",
  method_version: "excess-power-mad-v1",
  technique: "robust_median_mad",
  finding_type: "excess_consumption_deviation",
  request_format: "excess-power-request-v1",
};

const WINDOWS = {
  reference: { start_utc: "2026-01-01T00:00:00Z", end_utc: "2026-01-03T00:00:00Z" },
  evaluation: { start_utc: "2026-01-03T00:00:00Z", end_utc: "2026-01-05T00:00:00Z" },
};

const RESULT = {
  status: "findings_detected",
  dataset_id: "detector-dataset",
  run_id: "run-1",
  synthetic: true,
  synthetic_label: "Synthetic detector fixture; not measured data.",
  detector: {
    ...IDENTITY,
    model_used: false,
    parameters: { threshold_multiplier: 1.5 },
  },
  windows: WINDOWS,
  coverage: {
    start_utc: WINDOWS.evaluation.start_utc,
    end_utc: WINDOWS.evaluation.end_utc,
    devices: 1,
    unsupported_devices: 1,
    detector_calls: 1,
    max_section_records: 2000,
  },
  detector_coverage: {
    evaluation_device_intervals: 576,
    evaluated: 576,
    flagged: 288,
    insufficient_reference: 1,
    excluded: {},
  },
  devices: [
    {
      device_id: "light-a",
      room_id: "room-a",
      device_type: "lighting",
      status: "deviation_found",
      assessment_source: "detector",
      comparison: "own fully-on reference",
    },
    {
      device_id: "fridge-b",
      room_id: "room-b",
      device_type: "refrigerator",
      status: "unsupported_context",
      assessment_source: "auditor_precheck",
      reason: "missing_room_context",
    },
  ],
  aggregation: {
    stored_interval_seconds: 60,
    max_section_records: 2000,
    resolutions_by_device: { "light-a": 300, "fridge-b": "not_assessed" },
    emitted_bins_by_device: { "light-a": 1152 },
    excluded_device_bins: { "light-a": { mixed_duty_or_off: 12 } },
  },
  warnings: [
    { code: "NOT_A_DIAGNOSIS", message: "Statistical deviation only." },
    { code: "NOT_AVOIDABLE_SAVINGS", message: "Not a guaranteed avoidable amount." },
  ],
  exclusions: [],
  totals: { findings: 1, other_changes: 0, exclusions_listed: 0, exclusions_total: 12 },
  findings: [
    {
      finding_id: "excess_consumption_deviation:light-a:2026-01-04T00:00:00Z",
      finding_type: "excess_consumption_deviation",
      device_id: "light-a",
      room_id: "room-a",
      method: "rule",
      technique: "robust_median_mad",
      detector_version: "excess-power-mad-v1",
      detector_id: "excess_consumption",
      window_start_utc: "2026-01-04T00:00:00Z",
      window_end_utc: "2026-01-05T00:00:00Z",
      observed: { value: 1000, unit: "W" },
      expected: { value: 600, unit: "W" },
      threshold_w: 660,
      reference_support: 576,
      deviation: { watts: 400, ratio: 1.67 },
      energy_above_baseline_kwh: 9.6,
      energy_note: "Energy above the reference median; NOT a guaranteed avoidable amount.",
      suggested_action: "Check the schedule/manual state.",
    },
  ],
  findings_pagination: { page: 1, page_size: 100, total: 1 },
  limitations: ["Not a confirmed malfunction or efficiency diagnosis."],
};

const CATALOGUE = {
  data: {
    detectors: [
      {
        id: "vacancy",
        label: "Vacant-but-on (contract rule)",
        method: "rule",
        method_version: "vacant-beyond-grace-v1",
        technique: null,
        finding_type: "vacant_but_on",
        request: { endpoint: "POST /api/v1/analysis/jobs", body: { dataset_id: "required" } },
        section_bounds: null,
        requirements: ["Readings with matching room intervals."],
      },
      {
        id: "excess_consumption",
        label: IDENTITY.label,
        method: "rule",
        method_version: IDENTITY.method_version,
        technique: IDENTITY.technique,
        finding_type: IDENTITY.finding_type,
        request_format: IDENTITY.request_format,
        request: { endpoint: "POST /api/v1/analysis/jobs", body: { detector: "excess_consumption" } },
        section_bounds: { device_intervals: 2000, room_intervals: 2000 },
        single_evaluation_section: false,
        requirements: ["Fully-on intervals only."],
      },
      {
        id: "gradual_trend",
        label: "Sustained gradual upward power trend",
        method: "rule",
        method_version: "gradual-power-trend-v1",
        technique: "theil_sen_context_normalised_daily",
        finding_type: "sustained_upward_power_trend",
        request_format: "drift-request-v1",
        request: { endpoint: "POST /api/v1/analysis/jobs", body: { detector: "gradual_trend" } },
        section_bounds: { device_intervals: 2000, room_intervals: 2000 },
        single_evaluation_section: true,
        requirements: ["Reference and evaluation need supported days."],
      },
    ],
    limits: { max_section_records: 2000, max_findings_per_job: 100000 },
    aggregation: { requested_interval_nominals_seconds: [60, 300, 600, 900, 1800, 3600] },
    notes: ["Detector output is not a confirmed malfunction."],
  },
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("P026 detector catalogue and requests", () => {
  it("parses the committed catalogue while leaving vacancy to the existing panel", async () => {
    const catalogue = await fetchDetectorCatalogue("http://x", async () => response(CATALOGUE));
    assert.deepEqual(catalogue.detectors.map((entry) => entry.id), ["excess_consumption", "gradual_trend"]);
    assert.equal(catalogue.limits.max_section_records, 2000);
    assert.equal(catalogue.detectors[1].single_evaluation_section, true);
  });

  it("submits the exact reference/evaluation detector body", async () => {
    let capturedUrl = "";
    let capturedInit;
    const ack = await submitDetectorJob(
      "http://x",
      "detector-dataset",
      "excess_consumption",
      WINDOWS.reference,
      WINDOWS.evaluation,
      async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return response({ data: { job_id: "job-1", status: "queued", detector: "excess_consumption" } }, 202);
      },
    );
    assert.equal(ack.job_id, "job-1");
    assert.equal(capturedUrl, "http://x/api/v1/analysis/jobs");
    assert.equal(capturedInit.method, "POST");
    assert.deepEqual(JSON.parse(capturedInit.body), {
      dataset_id: "detector-dataset",
      detector: "excess_consumption",
      reference_window: WINDOWS.reference,
      evaluation_window: WINDOWS.evaluation,
    });
  });

  it("requires ordered, non-overlapping second-precision UTC windows", () => {
    assert.equal(validateDetectorWindows(WINDOWS.reference, WINDOWS.evaluation).ok, true);
    assert.equal(validateDetectorWindows(
      { start_utc: "2026-01-03T00:00:00Z", end_utc: "2026-01-04T00:00:00Z" },
      WINDOWS.evaluation,
    ).ok, false);
    assert.equal(validateDetectorWindows(
      { start_utc: "2026-01-01T00:00:00.000Z", end_utc: "2026-01-03T00:00:00Z" },
      WINDOWS.evaluation,
    ).ok, false);
  });
});

describe("P026 detector result parsing", () => {
  it("keeps coverage, exclusions and deviation observations out of vacancy totals", async () => {
    let capturedUrl = "";
    const job = await getDetectorJob("http://x", "job-1", async (url) => {
      capturedUrl = url;
      return response({
        data: {
          job_id: "job-1",
          dataset_id: "detector-dataset",
          status: "completed",
          method: "rule",
          method_version: IDENTITY.method_version,
          requested_range: WINDOWS.evaluation,
          detector: IDENTITY,
          windows: WINDOWS,
          progress: { completed_batches: 1, total_batches: 1 },
          result: RESULT,
        },
      });
    });
    assert.match(capturedUrl, /page=1&page_size=100$/);
    assert.equal(job.result.status, "findings_detected");
    assert.equal(job.result.coverage.unsupported_devices, 1);
    assert.equal(job.result.devices[1].assessment_source, "auditor_precheck");
    assert.equal(job.result.aggregation.excluded_device_bins["light-a"].mixed_duty_or_off, 12);
    assert.equal(job.result.findings[0].energy_above_baseline_kwh, 9.6);
    assert.equal(job.result.findings[0].energy_above_baseline_kwh === job.result.totals.findings, false);
    assert.equal(job.result.findings_pagination.total, 1);
  });

  it("preserves drift steps and open detector-specific fields", async () => {
    const driftResult = {
      ...RESULT,
      status: "evaluated_no_gradual_trend",
      detector: { ...IDENTITY, id: "gradual_trend", method_version: "gradual-power-trend-v1", technique: "theil_sen_context_normalised_daily", finding_type: "sustained_upward_power_trend" },
      findings: [],
      findings_pagination: { page: 1, page_size: 100, total: 0 },
      other_changes: [{ classification: "abrupt_level_change", device_id: "light-a", offset_w: 120 }],
      totals: { findings: 0, other_changes: 1, exclusions_listed: 0, exclusions_total: 0 },
    };
    const job = await getDetectorJob("http://x", "job-2", async () => response({ data: { job_id: "job-2", dataset_id: "detector-dataset", status: "completed", detector: driftResult.detector, windows: WINDOWS, result: driftResult } }));
    assert.equal(job.result.status, "evaluated_no_gradual_trend");
    assert.equal(job.result.other_changes[0].classification, "abrupt_level_change");
    assert.equal(job.result.findings.length, 0);
  });

  it("does not turn an insufficient result into a clean empty result", async () => {
    const insufficient = { ...RESULT, status: "insufficient_reference", findings: [], findings_pagination: { page: 1, page_size: 100, total: 0 }, totals: { findings: 0, other_changes: 0, exclusions_listed: 0, exclusions_total: 0 } };
    const job = await getDetectorJob("http://x", "job-3", async () => response({ data: { job_id: "job-3", dataset_id: "detector-dataset", status: "completed", detector: IDENTITY, windows: WINDOWS, result: insufficient } }));
    assert.equal(job.result.status, "insufficient_reference");
    assert.equal(job.result.findings.length, 0);
  });

  it("preserves server validation errors", async () => {
    await assert.rejects(
      submitDetectorJob("http://x", "detector-dataset", "gradual_trend", WINDOWS.reference, WINDOWS.evaluation, async () => response({ error: { code: "VALIDATION_ERROR", message: "evaluation_window must align", field: "evaluation_window" } }, 422)),
      (error) => error.code === "VALIDATION_ERROR" && error.field === "evaluation_window",
    );
  });
});
