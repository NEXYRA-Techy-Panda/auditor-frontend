// Historical P023 analytics adapter (auditor-frontend only).
// The backend owns aggregation, coverage, pagination and tariff calculation.
// This module validates the committed response shapes and never recomputes
// energy from device metadata or fills missing buckets.

import { ApiError, type FetchLike } from "./auditor-api.ts";

export const HISTORICAL_TIMEOUT_MS = 10_000;
export const HISTORICAL_BUCKETS = [60, 300, 600, 900, 1800, 3600, 86400] as const;
export type HistoricalBucket = (typeof HISTORICAL_BUCKETS)[number];
export type CoverageStatus = "complete" | "partial" | "missing";

export type HistoricalScope =
  | { type: "office" }
  | { type: "room"; room_id: string }
  | { type: "device"; device_id: string };

export interface HistoricalWindow {
  from_utc: string;
  to_utc: string;
}

export interface HistoricalPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface HistoricalProvenance {
  synthetic: boolean | null;
  synthetic_label: string | null;
}

export interface TimeseriesCoverage {
  status: CoverageStatus;
  expected_seconds: number;
  covered_seconds: number;
  expected_device_count: number;
  covered_device_count: number;
  partial_source_intervals: number;
}

export interface RoomCoverage {
  status: CoverageStatus;
  expected_device_count: number;
  expected_seconds: number;
  covered_seconds: number;
  interval_count: number;
  partial_device_count: number;
  missing_device_count: number;
}

export interface DeviceCoverage {
  status: CoverageStatus;
  expected_seconds: number;
  covered_seconds: number;
  interval_count: number;
  source_partial: boolean;
  overlap_detected: boolean;
}

export interface TimeseriesItem {
  start_utc: string;
  end_utc: string;
  energy_kwh: number | null;
  cost_inr: number | null;
  coverage: TimeseriesCoverage;
}

export interface RoomAnalyticsItem {
  room_id: string;
  name: string;
  room_type: string;
  floor_area_m2: number | null;
  observed_energy_kwh: number | null;
  observed_cost_inr: number | null;
  observed_average_power_w: number | null;
  observed_peak_power_w: number | null;
  coverage: RoomCoverage;
}

export interface DeviceAnalyticsItem {
  device_id: string;
  room_id: string;
  name: string;
  device_type: string;
  quantity: number;
  nominal_rated_power_w: number;
  observed_energy_kwh: number | null;
  observed_cost_inr: number | null;
  observed_average_power_w: number | null;
  observed_peak_power_w: number | null;
  coverage: DeviceCoverage;
}

export interface HistoricalTimeseries {
  dataset_id: string;
  timezone: string;
  provenance: HistoricalProvenance;
  window: HistoricalWindow;
  bucket_seconds: HistoricalBucket;
  scope: HistoricalScope;
  tariff_inr_per_kwh: number | null;
  full_period_observed_energy_kwh: number | null;
  full_period_observed_cost_inr: number | null;
  full_period_complete: boolean;
  page_observed_energy_kwh: number | null;
  page_observed_cost_inr: number | null;
  items: TimeseriesItem[];
  pagination: HistoricalPagination;
}

export interface HistoricalBreakdown<T> {
  dataset_id: string;
  provenance: HistoricalProvenance;
  window: HistoricalWindow;
  tariff_inr_per_kwh: number | null;
  items: T[];
  total: number;
  pagination: HistoricalPagination;
  full_filtered_observed_energy_kwh: number | null;
  full_filtered_observed_cost_inr: number | null;
  full_filtered_complete: boolean;
  page_observed_energy_kwh: number | null;
  page_observed_cost_inr: number | null;
  aggregation: string;
}

export type HistoricalRooms = HistoricalBreakdown<RoomAnalyticsItem>;
export type HistoricalDevices = HistoricalBreakdown<DeviceAnalyticsItem>;

export interface WeekdayAnalyticsItem {
  weekday: string;
  weekday_number_iso: number;
  observed_energy_total_kwh: number | null;
  observed_cost_inr: number | null;
  complete_day_count: number;
  partial_day_count: number;
  mean_energy_per_complete_day_kwh: number | null;
  coverage_note: string;
}

export interface HistoricalWeekdays {
  dataset_id: string;
  timezone: string;
  provenance: HistoricalProvenance;
  calendar: "calendar_weekday_only";
  window: HistoricalWindow;
  tariff_inr_per_kwh: number | null;
  weekdays: WeekdayAnalyticsItem[];
  coverage: {
    complete_day_count: number;
    partial_day_count: number;
    missing_day_count: number;
    note: string;
  };
}

export interface HistoricalQuery {
  fromUtc?: string;
  toUtc?: string;
  roomId?: string;
  deviceId?: string;
  bucketSeconds?: HistoricalBucket;
  page?: number;
  pageSize?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reqString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === "string" && item.length > 0 ? item : null;
}

function finiteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, min = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min
    ? value
    : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isCoverageStatus(value: unknown): value is CoverageStatus {
  return value === "complete" || value === "partial" || value === "missing";
}

function parseProvenance(value: unknown): HistoricalProvenance | null {
  if (!isRecord(value)) return null;
  if (value.synthetic !== undefined && typeof value.synthetic !== "boolean") return null;
  const label = value.synthetic_label === null
    ? null
    : typeof value.synthetic_label === "string"
      ? value.synthetic_label
      : undefined;
  if (label === undefined) return null;
  return {
    synthetic: value.synthetic === undefined ? null : value.synthetic,
    synthetic_label: label,
  };
}

function parseWindow(value: unknown): HistoricalWindow | null {
  if (!isRecord(value)) return null;
  const from = reqString(value, "from_utc");
  const to = reqString(value, "to_utc");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
  if (Date.parse(from) >= Date.parse(to)) return null;
  return { from_utc: from, to_utc: to };
}

function parsePagination(value: unknown): HistoricalPagination | null {
  if (!isRecord(value)) return null;
  const page = integer(value.page, 1);
  const pageSize = integer(value.page_size, 1);
  const total = integer(value.total);
  const totalPages = integer(value.total_pages);
  if (page === null || pageSize === null || total === null || totalPages === null) return null;
  return { page, page_size: pageSize, total, total_pages: totalPages };
}

function parseTimeseriesCoverage(value: unknown): TimeseriesCoverage | null {
  if (!isRecord(value) || !isCoverageStatus(value.status)) return null;
  const expectedSeconds = requiredNumber(value.expected_seconds);
  const coveredSeconds = requiredNumber(value.covered_seconds);
  const expectedDevices = integer(value.expected_device_count);
  const coveredDevices = integer(value.covered_device_count);
  const partial = integer(value.partial_source_intervals);
  if (
    expectedSeconds === null || coveredSeconds === null || expectedDevices === null ||
    coveredDevices === null || partial === null
  ) return null;
  return {
    status: value.status,
    expected_seconds: expectedSeconds,
    covered_seconds: coveredSeconds,
    expected_device_count: expectedDevices,
    covered_device_count: coveredDevices,
    partial_source_intervals: partial,
  };
}

function parseRoomCoverage(value: unknown): RoomCoverage | null {
  if (!isRecord(value) || !isCoverageStatus(value.status)) return null;
  const expectedDevices = integer(value.expected_device_count);
  const expectedSeconds = requiredNumber(value.expected_seconds);
  const coveredSeconds = requiredNumber(value.covered_seconds);
  const intervalCount = integer(value.interval_count);
  const partialDevices = integer(value.partial_device_count);
  const missingDevices = integer(value.missing_device_count);
  if (
    expectedDevices === null || expectedSeconds === null || coveredSeconds === null ||
    intervalCount === null || partialDevices === null || missingDevices === null
  ) return null;
  return {
    status: value.status,
    expected_device_count: expectedDevices,
    expected_seconds: expectedSeconds,
    covered_seconds: coveredSeconds,
    interval_count: intervalCount,
    partial_device_count: partialDevices,
    missing_device_count: missingDevices,
  };
}

function parseDeviceCoverage(value: unknown): DeviceCoverage | null {
  if (!isRecord(value) || !isCoverageStatus(value.status)) return null;
  const expectedSeconds = requiredNumber(value.expected_seconds);
  const coveredSeconds = requiredNumber(value.covered_seconds);
  const intervalCount = integer(value.interval_count);
  const sourcePartial = boolean(value.source_partial);
  const overlap = boolean(value.overlap_detected);
  if (
    expectedSeconds === null || coveredSeconds === null || intervalCount === null ||
    sourcePartial === null || overlap === null
  ) return null;
  return {
    status: value.status,
    expected_seconds: expectedSeconds,
    covered_seconds: coveredSeconds,
    interval_count: intervalCount,
    source_partial: sourcePartial,
    overlap_detected: overlap,
  };
}

function parseTimeseriesItem(value: unknown): TimeseriesItem | null {
  if (!isRecord(value)) return null;
  const start = reqString(value, "start_utc");
  const end = reqString(value, "end_utc");
  const energy = finiteNumber(value.energy_kwh);
  const cost = finiteNumber(value.cost_inr);
  const coverage = parseTimeseriesCoverage(value.coverage);
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || energy === undefined || cost === undefined || !coverage) return null;
  return { start_utc: start, end_utc: end, energy_kwh: energy, cost_inr: cost, coverage };
}

function parseRoomItem(value: unknown): RoomAnalyticsItem | null {
  if (!isRecord(value)) return null;
  const roomId = reqString(value, "room_id");
  const name = reqString(value, "name");
  const roomType = reqString(value, "room_type");
  const floor = value.floor_area_m2 === undefined ? null : finiteNumber(value.floor_area_m2);
  const energy = finiteNumber(value.observed_energy_kwh);
  const cost = finiteNumber(value.observed_cost_inr);
  const average = finiteNumber(value.observed_average_power_w);
  const peak = finiteNumber(value.observed_peak_power_w);
  const coverage = parseRoomCoverage(value.coverage);
  if (!roomId || !name || !roomType || floor === undefined || energy === undefined || cost === undefined || average === undefined || peak === undefined || !coverage) return null;
  return {
    room_id: roomId,
    name,
    room_type: roomType,
    floor_area_m2: floor,
    observed_energy_kwh: energy,
    observed_cost_inr: cost,
    observed_average_power_w: average,
    observed_peak_power_w: peak,
    coverage,
  };
}

function parseDeviceItem(value: unknown): DeviceAnalyticsItem | null {
  if (!isRecord(value)) return null;
  const deviceId = reqString(value, "device_id");
  const roomId = reqString(value, "room_id");
  const name = reqString(value, "name");
  const deviceType = reqString(value, "device_type");
  const quantity = integer(value.quantity, 1);
  const nominal = finiteNumber(value.nominal_rated_power_w);
  const energy = finiteNumber(value.observed_energy_kwh);
  const cost = finiteNumber(value.observed_cost_inr);
  const average = finiteNumber(value.observed_average_power_w);
  const peak = finiteNumber(value.observed_peak_power_w);
  const coverage = parseDeviceCoverage(value.coverage);
  if (!deviceId || !roomId || !name || !deviceType || quantity === null || nominal === null || nominal === undefined || energy === undefined || cost === undefined || average === undefined || peak === undefined || !coverage) return null;
  return {
    device_id: deviceId,
    room_id: roomId,
    name,
    device_type: deviceType,
    quantity,
    nominal_rated_power_w: nominal,
    observed_energy_kwh: energy,
    observed_cost_inr: cost,
    observed_average_power_w: average,
    observed_peak_power_w: peak,
    coverage,
  };
}

function parseWeekday(value: unknown): WeekdayAnalyticsItem | null {
  if (!isRecord(value)) return null;
  const weekday = reqString(value, "weekday");
  const number = integer(value.weekday_number_iso, 1);
  const total = finiteNumber(value.observed_energy_total_kwh);
  const cost = finiteNumber(value.observed_cost_inr);
  const complete = integer(value.complete_day_count);
  const partial = integer(value.partial_day_count);
  const mean = finiteNumber(value.mean_energy_per_complete_day_kwh);
  const note = reqString(value, "coverage_note");
  if (!weekday || number === null || number > 7 || total === undefined || cost === undefined || complete === null || partial === null || mean === undefined || !note) return null;
  return {
    weekday,
    weekday_number_iso: number,
    observed_energy_total_kwh: total,
    observed_cost_inr: cost,
    complete_day_count: complete,
    partial_day_count: partial,
    mean_energy_per_complete_day_kwh: mean,
    coverage_note: note,
  };
}

function parseCommon(value: Record<string, unknown>): {
  dataset_id: string;
  provenance: HistoricalProvenance;
  window: HistoricalWindow;
  tariff_inr_per_kwh: number | null;
} | null {
  const datasetId = reqString(value, "dataset_id");
  const provenance = parseProvenance(value.provenance);
  const window = parseWindow(value.window);
  const tariff = value.tariff_inr_per_kwh === null ? null : finiteNumber(value.tariff_inr_per_kwh);
  if (!datasetId || !provenance || !window || tariff === undefined) return null;
  return { dataset_id: datasetId, provenance, window, tariff_inr_per_kwh: tariff };
}

function parseTimeseries(value: unknown): HistoricalTimeseries | null {
  if (!isRecord(value)) return null;
  const common = parseCommon(value);
  const timezone = reqString(value, "timezone");
  const bucket = integer(value.bucket_seconds);
  if (!common || !timezone || bucket === null || !HISTORICAL_BUCKETS.includes(bucket as HistoricalBucket)) return null;
  const scope = parseScope(value.scope);
  const fullEnergy = finiteNumber(value.full_period_observed_energy_kwh);
  const fullCost = finiteNumber(value.full_period_observed_cost_inr);
  const fullComplete = boolean(value.full_period_complete);
  const pageEnergy = finiteNumber(value.page_observed_energy_kwh);
  const pageCost = finiteNumber(value.page_observed_cost_inr);
  const items = Array.isArray(value.items) ? value.items.map(parseTimeseriesItem) : null;
  const pagination = parsePagination(value.pagination);
  if (!scope || fullEnergy === undefined || fullCost === undefined || fullComplete === null || pageEnergy === undefined || pageCost === undefined || !items || items.some((item) => item === null) || !pagination) return null;
  return {
    ...common,
    timezone,
    bucket_seconds: bucket as HistoricalBucket,
    scope,
    full_period_observed_energy_kwh: fullEnergy,
    full_period_observed_cost_inr: fullCost,
    full_period_complete: fullComplete,
    page_observed_energy_kwh: pageEnergy,
    page_observed_cost_inr: pageCost,
    items: items as TimeseriesItem[],
    pagination,
  };
}

function parseBreakdown<T>(value: unknown, itemParser: (item: unknown) => T | null): HistoricalBreakdown<T> | null {
  if (!isRecord(value)) return null;
  const common = parseCommon(value);
  const items = Array.isArray(value.items) ? value.items.map(itemParser) : null;
  const total = integer(value.total);
  const pagination = parsePagination(value.pagination);
  const fullEnergy = finiteNumber(value.full_filtered_observed_energy_kwh);
  const fullCost = finiteNumber(value.full_filtered_observed_cost_inr);
  const fullComplete = boolean(value.full_filtered_complete);
  const pageEnergy = finiteNumber(value.page_observed_energy_kwh);
  const pageCost = finiteNumber(value.page_observed_cost_inr);
  const aggregation = reqString(value, "aggregation");
  if (!common || !items || items.some((item) => item === null) || total === null || !pagination || fullEnergy === undefined || fullCost === undefined || fullComplete === null || pageEnergy === undefined || pageCost === undefined || !aggregation) return null;
  return {
    ...common,
    items: items as T[],
    total,
    pagination,
    full_filtered_observed_energy_kwh: fullEnergy,
    full_filtered_observed_cost_inr: fullCost,
    full_filtered_complete: fullComplete,
    page_observed_energy_kwh: pageEnergy,
    page_observed_cost_inr: pageCost,
    aggregation,
  };
}

function parseWeekdays(value: unknown): HistoricalWeekdays | null {
  if (!isRecord(value)) return null;
  const common = parseCommon(value);
  const timezone = reqString(value, "timezone");
  const calendar = value.calendar;
  const weekdays = Array.isArray(value.weekdays) ? value.weekdays.map(parseWeekday) : null;
  const coverage = isRecord(value.coverage)
    ? {
        complete_day_count: integer(value.coverage.complete_day_count),
        partial_day_count: integer(value.coverage.partial_day_count),
        missing_day_count: integer(value.coverage.missing_day_count),
        note: reqString(value.coverage, "note"),
      }
    : null;
  if (!common || !timezone || calendar !== "calendar_weekday_only" || !weekdays || weekdays.some((item) => item === null) || !coverage || coverage.complete_day_count === null || coverage.partial_day_count === null || coverage.missing_day_count === null || !coverage.note) return null;
  return {
    ...common,
    timezone,
    calendar,
    weekdays: weekdays as WeekdayAnalyticsItem[],
    coverage: {
      complete_day_count: coverage.complete_day_count,
      partial_day_count: coverage.partial_day_count,
      missing_day_count: coverage.missing_day_count,
      note: coverage.note,
    },
  };
}

function parseScope(value: unknown): HistoricalScope | null {
  if (!isRecord(value)) return null;
  if (value.type === "office") return { type: "office" };
  if (value.type === "room") {
    const room = reqString(value, "room_id");
    return room ? { type: "room", room_id: room } : null;
  }
  if (value.type === "device") {
    const device = reqString(value, "device_id");
    return device ? { type: "device", device_id: device } : null;
  }
  return null;
}

export function scopeToQuery(scope: HistoricalScope): { roomId?: string; deviceId?: string } {
  if (scope.type === "room") return { roomId: scope.room_id };
  if (scope.type === "device") return { deviceId: scope.device_id };
  return {};
}

export function scopeKey(scope: HistoricalScope): string {
  return scope.type === "office" ? "office" : `${scope.type}:${scope.type === "room" ? scope.room_id : scope.device_id}`;
}

export function scopeLabel(scope: HistoricalScope): string {
  return scope.type === "office" ? "Office" : scope.type === "room" ? `Room ${scope.room_id}` : `Device ${scope.device_id}`;
}

export function buildHistoricalQuery(query: HistoricalQuery): string {
  if (query.roomId && query.deviceId) {
    throw new ApiError("Choose either a room or a device scope, not both.", null, "VALIDATION_ERROR");
  }
  const params = new URLSearchParams();
  if (query.fromUtc) params.set("from", query.fromUtc);
  if (query.toUtc) params.set("to", query.toUtc);
  if (query.roomId) params.set("room_id", query.roomId);
  if (query.deviceId) params.set("device_id", query.deviceId);
  if (query.bucketSeconds !== undefined) params.set("bucket_seconds", String(query.bucketSeconds));
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("page_size", String(query.pageSize));
  return params.toString();
}

export function validateHistoricalWindow(
  fromUtc: string,
  toUtc: string,
): { ok: true; fromUtc?: string; toUtc?: string } | { ok: false; error: string } {
  const from = fromUtc.trim();
  const to = toUtc.trim();
  if (!from && !to) return { ok: true };
  if (from && Number.isNaN(Date.parse(from))) return { ok: false, error: "From must be a valid ISO UTC timestamp." };
  if (to && Number.isNaN(Date.parse(to))) return { ok: false, error: "To must be a valid ISO UTC timestamp." };
  if (from && to && Date.parse(from) >= Date.parse(to)) return { ok: false, error: "The window is half-open [from, to); From must be earlier than To." };
  return { ok: true, ...(from ? { fromUtc: from } : {}), ...(to ? { toUtc: to } : {}) };
}

async function readErrorBody(res: { json: () => Promise<unknown> }): Promise<{ code?: string; message?: string; field?: string; row?: number; details?: unknown }> {
  try {
    const body = await res.json();
    if (!isRecord(body)) return {};
    const error = isRecord(body.error) ? body.error : body;
    return {
      ...(typeof error.code === "string" ? { code: error.code } : {}),
      ...(typeof error.message === "string" ? { message: error.message } : {}),
      ...(typeof error.field === "string" ? { field: error.field } : {}),
      ...(typeof error.row === "number" && Number.isInteger(error.row) ? { row: error.row } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  } catch {
    return {};
  }
}

function apiError(status: number, fallback: string, detail: { code?: string; message?: string; field?: string; row?: number; details?: unknown }): ApiError {
  const error = new ApiError(detail.message ?? `${fallback} (HTTP ${status}).`, status, detail.code ?? null, detail.details);
  if (detail.field !== undefined) error.field = detail.field;
  if (detail.row !== undefined) error.row = detail.row;
  return error;
}

async function requestHistorical(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  fallback: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetchImpl(url, { signal: requestSignal });
    if (!res.ok) throw apiError(res.status, fallback, await readErrorBody(res));
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError(`${fallback}: response was not valid JSON.`, res.status, "BAD_RESPONSE");
    }
    if (!isRecord(json) || !isRecord(json.data)) {
      throw new ApiError(`${fallback}: response body was malformed.`, res.status, "BAD_RESPONSE");
    }
    return json.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ApiError(
      aborted ? `${fallback}: timed out or aborted after ${timeoutMs} ms.` : error instanceof Error ? `${fallback}: ${error.message}` : `${fallback}: unknown error.`,
      null,
      aborted ? "TIMEOUT" : "UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

function withQuery(path: string, query: HistoricalQuery): string {
  const encoded = buildHistoricalQuery(query);
  return encoded ? `${path}?${encoded}` : path;
}

function badBody(fallback: string, status: number): ApiError {
  return new ApiError(`${fallback}: response body did not match the P023 shape.`, status, "BAD_RESPONSE");
}

export async function fetchHistoricalTimeseries(
  origin: string,
  datasetId: string,
  query: HistoricalQuery,
  fetchImpl: FetchLike,
  timeoutMs = HISTORICAL_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<HistoricalTimeseries> {
  const fallback = "Historical timeseries request failed";
  const data = await requestHistorical(withQuery(`${origin}/api/v1/imports/${encodeURIComponent(datasetId)}/timeseries`, query), fetchImpl, timeoutMs, fallback, signal);
  const parsed = parseTimeseries(data);
  if (!parsed) throw badBody(fallback, 200);
  return parsed;
}

export async function fetchHistoricalRooms(
  origin: string,
  datasetId: string,
  query: Omit<HistoricalQuery, "roomId" | "deviceId" | "bucketSeconds">,
  fetchImpl: FetchLike,
  timeoutMs = HISTORICAL_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<HistoricalRooms> {
  const fallback = "Room breakdown request failed";
  const data = await requestHistorical(withQuery(`${origin}/api/v1/imports/${encodeURIComponent(datasetId)}/rooms`, query), fetchImpl, timeoutMs, fallback, signal);
  const parsed = parseBreakdown(data, parseRoomItem);
  if (!parsed) throw badBody(fallback, 200);
  return parsed;
}

export async function fetchHistoricalDevices(
  origin: string,
  datasetId: string,
  query: Omit<HistoricalQuery, "deviceId" | "bucketSeconds">,
  fetchImpl: FetchLike,
  timeoutMs = HISTORICAL_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<HistoricalDevices> {
  const fallback = "Device breakdown request failed";
  const data = await requestHistorical(withQuery(`${origin}/api/v1/imports/${encodeURIComponent(datasetId)}/devices`, query), fetchImpl, timeoutMs, fallback, signal);
  const parsed = parseBreakdown(data, parseDeviceItem);
  if (!parsed) throw badBody(fallback, 200);
  return parsed;
}

export async function fetchHistoricalWeekdays(
  origin: string,
  datasetId: string,
  query: Omit<HistoricalQuery, "page" | "pageSize" | "bucketSeconds">,
  fetchImpl: FetchLike,
  timeoutMs = HISTORICAL_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<HistoricalWeekdays> {
  const fallback = "Weekday analytics request failed";
  const data = await requestHistorical(withQuery(`${origin}/api/v1/imports/${encodeURIComponent(datasetId)}/weekday-analytics`, query), fetchImpl, timeoutMs, fallback, signal);
  const parsed = parseWeekdays(data);
  if (!parsed) throw badBody(fallback, 200);
  return parsed;
}

/** Split a series at null/missing buckets; callers must not bridge the gap. */
export function historicalChartSegments(items: TimeseriesItem[]): TimeseriesItem[][] {
  const segments: TimeseriesItem[][] = [];
  let current: TimeseriesItem[] = [];
  for (const item of items) {
    if (item.energy_kwh === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
