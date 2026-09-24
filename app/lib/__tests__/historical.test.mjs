import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoricalQuery,
  fetchHistoricalDevices,
  fetchHistoricalRooms,
  fetchHistoricalTimeseries,
  fetchHistoricalWeekdays,
  historicalChartSegments,
  scopeKey,
  validateHistoricalWindow,
} from "../historical.ts";

const WINDOW = {
  from_utc: "2026-09-21T03:30:00.000Z",
  to_utc: "2026-09-21T03:32:00.000Z",
};
const PROVENANCE = {
  synthetic: true,
  synthetic_label: "F1 known-answer fixture: hand-computed two-room/two-device dataset. Not measured data.",
};
const PAGINATION = { page: 1, page_size: 500, total: 2, total_pages: 1 };

const timeseries = {
  data: {
    dataset_id: "analytics-fixture",
    timezone: "Asia/Kolkata",
    provenance: PROVENANCE,
    window: WINDOW,
    bucket_seconds: 60,
    scope: { type: "office" },
    tariff_inr_per_kwh: 10,
    full_period_observed_energy_kwh: 0.01,
    full_period_observed_cost_inr: 0.1,
    full_period_complete: false,
    page_observed_energy_kwh: 0.01,
    page_observed_cost_inr: 0.1,
    items: [
      {
        start_utc: "2026-09-21T03:30:00.000Z",
        end_utc: "2026-09-21T03:31:00.000Z",
        energy_kwh: 0.01,
        cost_inr: 0.1,
        coverage: {
          status: "partial",
          expected_seconds: 120,
          covered_seconds: 60,
          expected_device_count: 2,
          covered_device_count: 1,
          partial_source_intervals: 0,
        },
      },
      {
        start_utc: "2026-09-21T03:31:00.000Z",
        end_utc: "2026-09-21T03:32:00.000Z",
        energy_kwh: null,
        cost_inr: null,
        coverage: {
          status: "missing",
          expected_seconds: 120,
          covered_seconds: 0,
          expected_device_count: 2,
          covered_device_count: 0,
          partial_source_intervals: 0,
        },
      },
    ],
    pagination: PAGINATION,
  },
};

const rooms = {
  data: {
    dataset_id: "analytics-fixture",
    provenance: PROVENANCE,
    window: WINDOW,
    tariff_inr_per_kwh: 10,
    items: [
      {
        room_id: "room-a",
        name: "Room A",
        room_type: "office",
        floor_area_m2: 20,
        observed_energy_kwh: 0.02,
        observed_cost_inr: 0.2,
        observed_average_power_w: 600,
        observed_peak_power_w: 600,
        coverage: {
          expected_device_count: 1,
          expected_seconds: 120,
          covered_seconds: 120,
          status: "complete",
          interval_count: 2,
          partial_device_count: 0,
          missing_device_count: 0,
        },
      },
      {
        room_id: "room-b",
        name: "Room B",
        room_type: "utility",
        floor_area_m2: 12,
        observed_energy_kwh: 0.01,
        observed_cost_inr: 0.1,
        observed_average_power_w: 300,
        observed_peak_power_w: 300,
        coverage: {
          expected_device_count: 1,
          expected_seconds: 120,
          covered_seconds: 120,
          status: "complete",
          interval_count: 2,
          partial_device_count: 0,
          missing_device_count: 0,
        },
      },
    ],
    total: 2,
    pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
    full_filtered_observed_energy_kwh: 0.03,
    full_filtered_observed_cost_inr: 0.3,
    full_filtered_complete: true,
    page_observed_energy_kwh: 0.03,
    page_observed_cost_inr: 0.3,
    aggregation: "sum of persisted device interval energy_kwh; room energy is the sum of its device intervals; quantity is not applied",
  },
};

const devices = {
  data: {
    dataset_id: "analytics-fixture",
    provenance: PROVENANCE,
    window: WINDOW,
    tariff_inr_per_kwh: 10,
    items: [
      {
        device_id: "light-a",
        room_id: "room-a",
        name: "Room A light",
        device_type: "lighting",
        quantity: 1,
        nominal_rated_power_w: 600,
        observed_energy_kwh: 0.02,
        observed_cost_inr: 0.2,
        observed_average_power_w: 600,
        observed_peak_power_w: 600,
        coverage: {
          expected_seconds: 120,
          covered_seconds: 120,
          status: "complete",
          interval_count: 2,
          source_partial: false,
          overlap_detected: false,
        },
      },
      {
        device_id: "fridge-b",
        room_id: "room-b",
        name: "Room B refrigerator",
        device_type: "refrigerator",
        quantity: 7,
        nominal_rated_power_w: 300,
        observed_energy_kwh: 0.01,
        observed_cost_inr: 0.1,
        observed_average_power_w: 300,
        observed_peak_power_w: 300,
        coverage: {
          expected_seconds: 120,
          covered_seconds: 120,
          status: "complete",
          interval_count: 2,
          source_partial: false,
          overlap_detected: false,
        },
      },
    ],
    total: 2,
    pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
    full_filtered_observed_energy_kwh: 0.03,
    full_filtered_observed_cost_inr: 0.3,
    full_filtered_complete: true,
    page_observed_energy_kwh: 0.03,
    page_observed_cost_inr: 0.3,
    aggregation: "sum of persisted device interval energy_kwh; room energy is the sum of its device intervals; quantity is not applied",
  },
};

const weekdays = {
  data: {
    dataset_id: "analytics-fixture",
    timezone: "Asia/Kolkata",
    provenance: PROVENANCE,
    calendar: "calendar_weekday_only",
    window: { from_utc: "2026-09-20T18:30:00.000Z", to_utc: "2026-09-28T18:30:00.000Z" },
    tariff_inr_per_kwh: 10,
    weekdays: [
      { weekday: "Monday", weekday_number_iso: 1, observed_energy_total_kwh: 43.2, observed_cost_inr: 432, complete_day_count: 2, partial_day_count: 0, mean_energy_per_complete_day_kwh: 21.6, coverage_note: "Calendar weekdays in Asia/Kolkata; partial and missing days are excluded from complete-day mean. Office-hours policy is not applied." },
      { weekday: "Tuesday", weekday_number_iso: 2, observed_energy_total_kwh: 21.6, observed_cost_inr: 216, complete_day_count: 1, partial_day_count: 0, mean_energy_per_complete_day_kwh: 21.6, coverage_note: "Calendar weekdays in Asia/Kolkata; partial and missing days are excluded from complete-day mean. Office-hours policy is not applied." },
      { weekday: "Sunday", weekday_number_iso: 7, observed_energy_total_kwh: null, observed_cost_inr: null, complete_day_count: 0, partial_day_count: 0, mean_energy_per_complete_day_kwh: null, coverage_note: "Calendar weekdays in Asia/Kolkata; partial and missing days are excluded from complete-day mean. Office-hours policy is not applied." },
    ],
    coverage: { complete_day_count: 3, partial_day_count: 0, missing_day_count: 4, note: "A complete local calendar day requires every expected device to cover the entire expected export period without partial or overlapping source intervals." },
  },
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("P023 historical query and validation", () => {
  it("uses canonical half-open query names and bounded pagination", () => {
    assert.equal(
      buildHistoricalQuery({ fromUtc: "2026-09-21T03:30:00Z", toUtc: "2026-09-21T03:32:00Z", bucketSeconds: 3600, page: 2, pageSize: 500 }),
      "from=2026-09-21T03%3A30%3A00Z&to=2026-09-21T03%3A32%3A00Z&bucket_seconds=3600&page=2&page_size=500",
    );
    assert.equal(buildHistoricalQuery({ roomId: "room-a" }), "room_id=room-a");
    assert.throws(() => buildHistoricalQuery({ roomId: "room-a", deviceId: "light-a" }));
  });

  it("rejects reversed or invalid local windows before a request", () => {
    assert.deepEqual(validateHistoricalWindow("", ""), { ok: true });
    assert.equal(validateHistoricalWindow("bad", "").ok, false);
    assert.equal(validateHistoricalWindow("2026-09-21T03:32:00Z", "2026-09-21T03:30:00Z").ok, false);
    assert.deepEqual(validateHistoricalWindow("2026-09-21T03:30:00Z", "2026-09-21T03:32:00Z"), {
      ok: true,
      fromUtc: "2026-09-21T03:30:00Z",
      toUtc: "2026-09-21T03:32:00Z",
    });
  });

  it("keeps scope keys distinct and stable", () => {
    assert.equal(scopeKey({ type: "office" }), "office");
    assert.equal(scopeKey({ type: "room", room_id: "room-a" }), "room:room-a");
    assert.equal(scopeKey({ type: "device", device_id: "light-a" }), "device:light-a");
  });
});

describe("P023 response parsing", () => {
  it("keeps observed zero distinct from missing and splits chart gaps", () => {
    const items = [
      { ...timeseries.data.items[0], start_utc: "a", energy_kwh: 0 },
      { ...timeseries.data.items[1], start_utc: "b", energy_kwh: null },
      { ...timeseries.data.items[0], start_utc: "c", energy_kwh: 0 },
    ];
    const segments = historicalChartSegments(items);
    assert.equal(segments.length, 2);
    assert.equal(segments[0][0].energy_kwh, 0);
    assert.equal(segments[1][0].energy_kwh, 0);
  });

  it("parses office timeseries, page totals and null missing buckets", async () => {
    const result = await fetchHistoricalTimeseries("http://x", "analytics-fixture", { page: 1, pageSize: 500, bucketSeconds: 60 }, async () => response(timeseries));
    assert.equal(result.full_period_observed_energy_kwh, 0.01);
    assert.equal(result.page_observed_energy_kwh, 0.01);
    assert.equal(result.items[0].energy_kwh, 0.01);
    assert.equal(result.items[0].coverage.status, "partial");
    assert.equal(result.items[1].energy_kwh, null);
    assert.equal(result.items[1].coverage.status, "missing");
    assert.equal(historicalChartSegments(result.items).length, 1);
  });

  it("parses room and device values without multiplying quantity", async () => {
    const roomResult = await fetchHistoricalRooms("http://x", "analytics-fixture", {}, async () => response(rooms));
    const deviceResult = await fetchHistoricalDevices("http://x", "analytics-fixture", {}, async () => response(devices));
    assert.equal(roomResult.full_filtered_observed_energy_kwh, 0.03);
    assert.equal(roomResult.items[0].observed_energy_kwh, 0.02);
    assert.equal(deviceResult.items[1].observed_energy_kwh, 0.01);
    assert.equal(deviceResult.items[1].quantity, 7);
    assert.equal(deviceResult.items[1].nominal_rated_power_w, 300);
    assert.equal(deviceResult.items[1].observed_energy_kwh, 0.01);
  });

  it("parses weekday means, ISO numbering and null means", async () => {
    const result = await fetchHistoricalWeekdays("http://x", "analytics-fixture", {}, async () => response(weekdays));
    assert.equal(result.weekdays[0].weekday, "Monday");
    assert.equal(result.weekdays[0].mean_energy_per_complete_day_kwh, 21.6);
    assert.equal(result.weekdays[2].weekday_number_iso, 7);
    assert.equal(result.weekdays[2].mean_energy_per_complete_day_kwh, null);
    assert.equal(result.coverage.missing_day_count, 4);
  });

  it("preserves server UNSUPPORTED_INPUT errors", async () => {
    await assert.rejects(
      fetchHistoricalTimeseries("http://x", "analytics-fixture", { fromUtc: "2026-09-21T03:30:30Z" }, async () => response({ error: { code: "UNSUPPORTED_INPUT", message: "Window boundaries must align" } }, 422)),
      (error) => error.code === "UNSUPPORTED_INPUT" && /align/.test(error.message),
    );
  });
});
