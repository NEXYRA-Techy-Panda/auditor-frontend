// P025 forecast mapping and presentation checks (Agent A — OpenCode).
// Test fixtures only; no production fallback/demo data.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../auditor-api.ts";
import {
  canRefreshForecastCost,
  completedForecastForDataset,
  createForecastSingleFlight,
  describeForecastHorizon,
  formatForecastInstant,
  getForecastJob,
  horizonLabel,
  isTerminalForecastStatus,
  makeForecastScope,
  parseForecastJob,
  parseForecastSubmission,
  prepareForecastChart,
  sameForecastScope,
  submitForecast,
} from "../forecast.ts";

const ORIGIN = "http://127.0.0.1:1";
const HOUR_MS = 3_600_000;
const iso = (value) => new Date(value).toISOString().replace(".000Z", "Z");
const okJson = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function points(startUtc, count, energyKwh = 0.015) {
  const start = Date.parse(startUtc);
  return Array.from({ length: count }, (_, index) => ({
    start_utc: iso(start + index * HOUR_MS),
    energy_kwh: energyKwh,
    basis: "weekday_hour",
    support: 4,
  }));
}

function result(horizon, overrides = {}) {
  const origin = "2026-10-19T03:30:00Z";
  const start =
    horizon === "next_calendar_month"
      ? "2026-10-31T18:30:00Z"
      : origin;
  const count = horizon === "next_24h" ? 24 : horizon === "next_7d" ? 168 : 720;
  const hourlyPoints = points(start, count);
  return {
    dataset_id: "ds-1",
    horizon,
    origin_utc: origin,
    method: "statistical_baseline",
    baseline_version: "hourly-profile-median-v1",
    model_version: null,
    timezone: "Asia/Kolkata",
    horizon_start_utc: start,
    horizon_end_utc: iso(Date.parse(start) + count * HOUR_MS),
    points: hourlyPoints,
    total_energy_kwh: hourlyPoints.reduce((sum, point) => sum + point.energy_kwh, 0),
    uncertainty: "unavailable",
    history_coverage: {
      observed_hours: 672,
      min_observed_hours_required: count === 24 ? 168 : count === 168 ? 336 : 672,
      maximum_history_hours: 2160,
      candidate_hours: 672,
      observed_complete_hours: 672,
      incomplete_hours: 0,
      trailing_incomplete_hours: 0,
      gap_before_origin_hours: 0,
      incomplete_hours_by_reason: {},
      observed_start_utc: "2026-10-05T18:30:00Z",
      observed_end_utc: "2026-11-02T18:30:00Z",
    },
    office_hours_policy: {
      policy_id: "pol-hours",
      version: 2,
      effective_from_utc: origin,
    },
    synthetic: true,
    synthetic_label: "Generated deterministic hourly fixture; not measured.",
    warnings: [
      {
        code: "INPUTS_NOT_USED",
        message: "Schedule assumptions were recorded but do not influence this baseline.",
      },
    ],
    assumptions: ["Hourly grid anchored at origin_utc."],
    assumptions_recorded: {
      future_assumptions: { schedule: { policy_id: "pol-hours", version: 2 } },
    },
    limitations: [
      "Statistical profile baseline, not a trained model; no accuracy claim is made for this building.",
    ],
    basis_counts: { weekday_hour: count, day_class_hour: 0, hour_of_day: 0 },
    tariff_inr_per_kwh: null,
    forecast_cost_inr: null,
    ...overrides,
  };
}

function job(horizon = "next_24h", overrides = {}) {
  return {
    data: {
      forecast_id: "forecast-1",
      job_id: "forecast-1",
      dataset_id: "ds-1",
      status: "completed",
      horizon,
      origin_utc: "2026-10-19T03:30:00Z",
      method: "statistical_baseline",
      baseline_version: "hourly-profile-median-v1",
      progress: { completed: 1, total: 1 },
      result: result(horizon),
      ...overrides,
    },
  };
}

function submission(horizon = "next_24h", overrides = {}) {
  return {
    data: {
      forecast_id: "forecast-1",
      job_id: "forecast-1",
      status: "queued",
      horizon,
      origin_utc: "2026-10-19T03:30:00Z",
      synthetic: true,
      synthetic_label: "Generated deterministic hourly fixture; not measured.",
      ...overrides,
    },
  };
}

describe("P020 request and response mapping", () => {
  it("submits exactly dataset_id and horizon without inventing today's origin", async () => {
    let seen = null;
    const accepted = await submitForecast(
      ORIGIN,
      "ds-1",
      "next_calendar_month",
      async (url, init) => {
        seen = { url, init };
        return okJson(submission("next_calendar_month"), 202);
      },
      5000,
    );
    assert.equal(seen.url, `${ORIGIN}/api/v1/forecasts`);
    assert.equal(seen.init.method, "POST");
    assert.deepEqual(JSON.parse(seen.init.body), {
      dataset_id: "ds-1",
      horizon: "next_calendar_month",
    });
    assert.equal("origin_utc" in JSON.parse(seen.init.body), false);
    assert.equal(accepted.forecast_id, "forecast-1");
    assert.equal(accepted.status, "queued");
    assert.equal(accepted.origin_utc, "2026-10-19T03:30:00Z");
  });

  it("maps validation, unknown dataset, and queue errors from the public envelope", async () => {
    const cases = [
      [422, "VALIDATION_ERROR", "horizon is invalid"],
      [422, "VALIDATION_ERROR", "Dataset was not found"],
      [503, "CONFLICT", "queue is full"],
    ];
    for (const [status, code, message] of cases) {
      await assert.rejects(
        submitForecast(
          ORIGIN,
          "ds-1",
          "next_24h",
          async () =>
            okJson({ error: { code, message } }, status),
          5000,
        ),
        (error) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, status);
          assert.equal(error.code, code);
          assert.equal(error.message, message);
          return true;
        },
      );
    }
  });

  it("parses queued, running, completed, and failed job states", () => {
    const queued = parseForecastJob({
      data: {
        forecast_id: "f",
        job_id: "f",
        dataset_id: "ds-1",
        status: "queued",
        horizon: "next_24h",
        origin_utc: "2026-10-19T03:30:00Z",
        progress: { completed: 0, total: 1 },
      },
    });
    assert.ok(queued && queued.status === "queued" && queued.progress.total === 1);
    const running = parseForecastJob({
      data: {
        forecast_id: "f",
        job_id: "f",
        dataset_id: "ds-1",
        status: "running",
        horizon: "next_24h",
        origin_utc: "2026-10-19T03:30:00Z",
        progress: { completed: 0, total: 1 },
      },
    });
    assert.ok(running && running.status === "running");
    const completed = parseForecastJob(job());
    assert.ok(completed && completed.status === "completed" && completed.result);
    const failed = parseForecastJob({
      data: {
        forecast_id: "f",
        job_id: "f",
        dataset_id: "ds-1",
        status: "failed",
        horizon: "next_24h",
        origin_utc: "2026-10-19T03:30:00Z",
        error: { code: "INSUFFICIENT_DATA", message: "next_24h requires at least 168 observed history hours; got 0." },
      },
    });
    assert.ok(failed && failed.error.code === "INSUFFICIENT_DATA");
    assert.equal(isTerminalForecastStatus("queued"), false);
    assert.equal(isTerminalForecastStatus("running"), false);
    assert.equal(isTerminalForecastStatus("completed"), true);
    assert.equal(isTerminalForecastStatus("failed"), true);
  });

  it("rejects mismatched IDs, dataset scope, horizon scope, and malformed bodies", async () => {
    assert.equal(
      parseForecastSubmission({ data: { ...submission().data, job_id: "other" } }),
      null,
    );
    const wrongPayload = job();
    wrongPayload.data.dataset_id = "other";
    wrongPayload.data.result.dataset_id = "other";
    const wrongDataset = async () => okJson(wrongPayload);
    await assert.rejects(
      getForecastJob(ORIGIN, "forecast-1", wrongDataset, "ds-1", "next_24h", 5000),
      (error) => error instanceof ApiError && error.code === "SCOPE_MISMATCH",
    );
    await assert.rejects(
      getForecastJob(ORIGIN, "forecast-1", async () => okJson(job()), "ds-1", "next_7d", 5000),
      (error) => error instanceof ApiError && error.code === "SCOPE_MISMATCH",
    );
    assert.equal(parseForecastJob({ data: { forecast_id: "f", status: "running" } }), null);
  });

  it("preserves the backend total, points, coverage, warnings, and baseline metadata", () => {
    const parsed = parseForecastJob(job("next_7d"));
    assert.ok(parsed?.result);
    assert.equal(parsed.result.points.length, 168);
    assert.ok(Math.abs(parsed.result.total_energy_kwh - 2.52) < 1e-12);
    assert.equal(parsed.result.history_coverage.observed_hours, 672);
    assert.equal(parsed.result.history_coverage.min_observed_hours_required, 336);
    assert.equal(parsed.result.warnings[0].code, "INPUTS_NOT_USED");
    assert.equal(parsed.result.method, "statistical_baseline");
    assert.equal(parsed.result.baseline_version, "hourly-profile-median-v1");
    assert.equal(parsed.result.model_version, null);
    assert.equal(parsed.result.uncertainty, "unavailable");
    assert.equal("savings" in parsed.result, false);
  });

  it("distinguishes an unset forecast cost from a valid zero tariff/cost", async () => {
    const unset = parseForecastJob(job("next_24h"));
    assert.equal(unset.result.forecast_cost_inr, null);
    assert.equal(unset.result.tariff_inr_per_kwh, null);
    const zeroPayload = job("next_24h");
    zeroPayload.data.result.tariff_inr_per_kwh = 0;
    zeroPayload.data.result.forecast_cost_inr = 0;
    const zero = parseForecastJob(zeroPayload);
    assert.equal(zero.result.tariff_inr_per_kwh, 0);
    assert.equal(zero.result.forecast_cost_inr, 0);
  });
});

describe("horizon labels and chart preparation", () => {
  it("uses returned dates and explains the complete next local calendar month", () => {
    for (const [horizon, expectedLabel] of [
      ["next_24h", "Next 24 hours"],
      ["next_7d", "Next 7 days"],
      ["next_calendar_month", "Next calendar month"],
    ]) {
      assert.equal(horizonLabel(horizon), expectedLabel);
      const parsed = parseForecastJob(job(horizon));
      const text = describeForecastHorizon(parsed.result);
      assert.match(text, /Asia\/Kolkata/);
      assert.ok(text.includes(formatForecastInstant(parsed.result.horizon_start_utc, parsed.result.timezone)));
    }
    const month = parseForecastJob(job("next_calendar_month"));
    assert.equal(month.result.points.length, 720);
    assert.match(describeForecastHorizon(month.result), /whole following local month, not the next 30 days/);
    assert.match(describeForecastHorizon(month.result), /1 Nov 2026/);
    assert.match(describeForecastHorizon(month.result), /1 Dec 2026/);
  });

  it("renders a correct zero/flat series without dividing by zero", () => {
    const zero = prepareForecastChart([
      { start_utc: "2026-01-01T00:00:00Z", energy_kwh: 0 },
      { start_utc: "2026-01-01T01:00:00Z", energy_kwh: 0 },
    ]);
    assert.equal(zero.maxEnergyKwh, 0);
    assert.equal(zero.flat, true);
    assert.equal(zero.linePaths.length, 1);
    assert.deepEqual(zero.points.map((point) => point.y), [zero.plotTop + zero.plotHeight, zero.plotTop + zero.plotHeight]);
    const flat = prepareForecastChart([
      { start_utc: "2026-01-01T00:00:00Z", energy_kwh: 2 },
      { start_utc: "2026-01-01T01:00:00Z", energy_kwh: 2 },
    ]);
    assert.equal(flat.flat, true);
    assert.equal(flat.points[0].y, flat.points[1].y);
  });

  it("keeps missing points missing and never interpolates them", () => {
    const chart = prepareForecastChart([
      { start_utc: "2026-01-01T00:00:00Z", energy_kwh: 1 },
      { start_utc: "2026-01-01T01:00:00Z", energy_kwh: null },
      { start_utc: "2026-01-01T02:00:00Z", energy_kwh: 3 },
      { start_utc: "2026-01-01T03:00:00Z", energy_kwh: 2 },
      { start_utc: "2026-01-01T04:00:00Z", energy_kwh: 4 },
    ]);
    assert.equal(chart.missingCount, 1);
    assert.equal(chart.points[1].y, null);
    assert.equal(chart.linePaths.length, 1);
    assert.match(chart.linePaths[0], /^M/);
    assert.equal(chart.points.length, 5);
  });
});

describe("request scope and recovery helpers", () => {
  it("rejects stale dataset/horizon revisions", () => {
    const current = makeForecastScope("ds-1", "next_24h", 4);
    assert.equal(sameForecastScope(current, makeForecastScope("ds-1", "next_24h", 4)), true);
    assert.equal(sameForecastScope(current, makeForecastScope("ds-1", "next_24h", 3)), false);
    assert.equal(sameForecastScope(current, makeForecastScope("ds-2", "next_24h", 4)), false);
    assert.equal(sameForecastScope(current, makeForecastScope("ds-1", "next_7d", 4)), false);
  });

  it("prevents overlapping creates synchronously", () => {
    const gate = createForecastSingleFlight();
    const first = gate.tryStart();
    assert.ok(first !== null);
    assert.equal(gate.tryStart(), null);
    gate.finish(first);
    assert.ok(gate.tryStart() !== null);
    gate.invalidate();
    assert.ok(gate.tryStart() !== null);
  });

  it("retains a same-dataset completed result after a later failure, never across datasets", () => {
    const completed = parseForecastJob(job());
    const failed = parseForecastJob({
      data: {
        forecast_id: "forecast-2",
        job_id: "forecast-2",
        dataset_id: "ds-1",
        status: "failed",
        horizon: "next_24h",
        origin_utc: "2026-10-19T03:30:00Z",
        error: { code: "PYTHON_UNAVAILABLE", message: "Forecast unavailable." },
      },
    });
    assert.equal(completedForecastForDataset(failed, completed, "ds-1").forecast_id, "forecast-1");
    assert.equal(completedForecastForDataset(failed, completed, "ds-2"), null);
    assert.equal(canRefreshForecastCost(completed, "ds-1", "next_24h"), true);
    assert.equal(canRefreshForecastCost(completed, "ds-1", "next_7d"), false);
  });

  it("re-prices the same forecast job by GET only; it does not create a new job", async () => {
    let gets = 0;
    let posts = 0;
    const fetchImpl = async (_url, init) => {
      if (init?.method === "POST") posts += 1;
      else gets += 1;
      const payload = job("next_24h");
      payload.data.result.tariff_inr_per_kwh = gets === 1 ? 10 : 0;
      payload.data.result.forecast_cost_inr = gets === 1 ? 3.6 : 0;
      return okJson(payload);
    };
    const priced = await getForecastJob(ORIGIN, "forecast-1", fetchImpl, "ds-1", "next_24h", 5000);
    const repriced = await getForecastJob(ORIGIN, "forecast-1", fetchImpl, "ds-1", "next_24h", 5000);
    assert.equal(priced.result.forecast_cost_inr, 3.6);
    assert.equal(repriced.result.forecast_cost_inr, 0);
    assert.equal(priced.forecast_id, repriced.forecast_id);
    assert.equal(priced.result.total_energy_kwh, repriced.result.total_energy_kwh);
    assert.equal(gets, 2);
    assert.equal(posts, 0);
  });
});
