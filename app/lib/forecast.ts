// Forecast-job adapter and presentation helpers (P025 / A6, Agent A — OpenCode).
// Public shapes follow committed auditor-backend P020 at df1ecbd. The frontend
// calls auditor-backend only, never Python. Framework-agnostic and dependency-free.

import { ApiError, type FetchLike } from "./auditor-api.ts";

export const FORECAST_HORIZONS = [
  "next_24h",
  "next_7d",
  "next_calendar_month",
] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];
export type ForecastStatus = "queued" | "running" | "completed" | "failed";

export const FORECAST_TIMEOUT_MS = 15_000;
export const FORECAST_POLL_INTERVAL_MS = 2_000;

export interface ForecastWarning {
  code: string;
  message: string;
}

export interface ForecastPoint {
  start_utc: string;
  energy_kwh: number;
  basis: "weekday_hour" | "day_class_hour" | "hour_of_day";
  support: number;
}

export interface ForecastHistoryCoverage {
  observed_hours: number;
  min_observed_hours_required: number;
  maximum_history_hours?: number;
  candidate_hours?: number;
  observed_complete_hours?: number;
  incomplete_hours?: number;
  trailing_incomplete_hours?: number;
  gap_before_origin_hours?: number | null;
  incomplete_hours_by_reason?: Record<string, number>;
  observed_start_utc?: string | null;
  observed_end_utc?: string | null;
  span_start_utc?: string | null;
  span_end_utc?: string | null;
  span_hours?: number;
  missing_hours?: number;
  duplicates_deduped?: number;
}

export interface ForecastOfficePolicy {
  policy_id: string;
  version: number;
  effective_from_utc: string;
}

export interface ForecastResult {
  dataset_id: string;
  horizon: ForecastHorizon;
  origin_utc: string;
  method: "statistical_baseline";
  baseline_version: string;
  model_version: null;
  timezone: string;
  horizon_start_utc: string;
  horizon_end_utc: string;
  points: ForecastPoint[];
  total_energy_kwh: number;
  uncertainty: "unavailable";
  history_coverage: ForecastHistoryCoverage;
  office_hours_policy: ForecastOfficePolicy;
  synthetic: boolean;
  synthetic_label: string | null;
  warnings: ForecastWarning[];
  assumptions: string[];
  assumptions_recorded: Record<string, unknown>;
  limitations: string[];
  basis_counts?: Record<string, number>;
  tariff_inr_per_kwh: number | null;
  forecast_cost_inr: number | null;
}

export interface ForecastJob {
  forecast_id: string;
  job_id: string;
  dataset_id: string;
  status: ForecastStatus;
  horizon: ForecastHorizon;
  origin_utc: string;
  method?: string;
  baseline_version?: string;
  progress?: { completed: number; total: number };
  created_at?: string;
  completed_at?: string | null;
  error?: { code: string; message: string };
  result?: ForecastResult;
}

export interface ForecastSubmission {
  forecast_id: string;
  job_id: string;
  status: "queued";
  horizon: ForecastHorizon;
  origin_utc: string;
  synthetic: boolean;
  synthetic_label: string | null;
}

export interface ForecastScope {
  dataset_id: string;
  horizon: ForecastHorizon;
  revision: number;
}

export function isTerminalForecastStatus(status: ForecastStatus): boolean {
  return status === "completed" || status === "failed";
}

export function makeForecastScope(
  datasetId: string,
  horizon: ForecastHorizon,
  revision: number,
): ForecastScope {
  return { dataset_id: datasetId, horizon, revision };
}

/** Synchronous gate used before React state rerenders, preventing double submit/poll. */
export function createForecastSingleFlight(): {
  tryStart: () => number | null;
  finish: (token: number) => void;
  invalidate: () => void;
} {
  let current = 0;
  let next = 0;
  return {
    tryStart: () => {
      if (current !== 0) return null;
      next += 1;
      current = next;
      return current;
    },
    finish: (token: number) => {
      if (current === token) current = 0;
    },
    invalidate: () => {
      current = 0;
    },
  };
}

export function sameForecastScope(
  current: ForecastScope,
  candidate: ForecastScope,
): boolean {
  return (
    current.dataset_id === candidate.dataset_id &&
    current.horizon === candidate.horizon &&
    current.revision === candidate.revision
  );
}

/** Keep a completed result visible only for its own dataset, labelled by callers. */
export function completedForecastForDataset(
  current: ForecastJob | null,
  previous: ForecastJob | null,
  datasetId: string,
): ForecastJob | null {
  if (
    current?.status === "completed" &&
    current.dataset_id === datasetId
  ) {
    return current;
  }
  if (
    previous?.status === "completed" &&
    previous.dataset_id === datasetId
  ) {
    return previous;
  }
  return null;
}

export function canRefreshForecastCost(
  job: ForecastJob | null,
  datasetId: string,
  horizon: ForecastHorizon,
): boolean {
  return (
    job?.status === "completed" &&
    job.dataset_id === datasetId &&
    job.horizon === horizon
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = object[key];
  return typeof value === "string" ? value : undefined;
}

function requiredFinite(
  object: Record<string, unknown>,
  key: string,
): number | null {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalFinite(
  object: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const value = object[key];
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validNullableFinite(
  object: Record<string, unknown>,
  key: string,
): boolean {
  const value = object[key];
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isHorizon(value: unknown): value is ForecastHorizon {
  return FORECAST_HORIZONS.includes(value as ForecastHorizon);
}

function isStatus(value: unknown): value is ForecastStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
  );
}

function unwrap(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;
  return isRecord(json.data) ? json.data : json;
}

function parseWarning(value: unknown): ForecastWarning | null {
  if (!isRecord(value)) return null;
  const code = requiredString(value, "code");
  const message = requiredString(value, "message");
  return code && message ? { code, message } : null;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return [...value] as string[];
}

function parsePoint(value: unknown): ForecastPoint | null {
  if (!isRecord(value)) return null;
  const start_utc = requiredString(value, "start_utc");
  const energy_kwh = requiredFinite(value, "energy_kwh");
  const basis = requiredString(value, "basis");
  const support = value.support;
  if (
    !start_utc ||
    energy_kwh === null ||
    energy_kwh < 0 ||
    !Number.isFinite(Date.parse(start_utc)) ||
    (basis !== "weekday_hour" &&
      basis !== "day_class_hour" &&
      basis !== "hour_of_day") ||
    typeof support !== "number" ||
    !Number.isInteger(support) ||
    support < 1
  ) {
    return null;
  }
  return { start_utc, energy_kwh, basis, support };
}

function parseCountRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      return null;
    }
    result[key] = count;
  }
  return result;
}

function parseCoverage(value: unknown): ForecastHistoryCoverage | null {
  if (!isRecord(value)) return null;
  const observed_hours = requiredFinite(value, "observed_hours");
  const min_observed_hours_required = requiredFinite(
    value,
    "min_observed_hours_required",
  );
  if (
    observed_hours === null ||
    !Number.isInteger(observed_hours) ||
    observed_hours < 0 ||
    min_observed_hours_required === null ||
    !Number.isInteger(min_observed_hours_required) ||
    min_observed_hours_required < 0
  ) {
    return null;
  }
  const coverage: ForecastHistoryCoverage = {
    observed_hours,
    min_observed_hours_required,
  };
  for (const key of [
    "maximum_history_hours",
    "candidate_hours",
    "observed_complete_hours",
    "incomplete_hours",
    "trailing_incomplete_hours",
    "gap_before_origin_hours",
    "span_hours",
    "missing_hours",
    "duplicates_deduped",
  ] as const) {
    const parsed = optionalFinite(value, key);
    if (parsed === undefined) return null;
    if (parsed !== null) coverage[key] = parsed;
  }
  if (value.incomplete_hours_by_reason !== undefined) {
    const reasons = parseCountRecord(value.incomplete_hours_by_reason);
    if (!reasons) return null;
    coverage.incomplete_hours_by_reason = reasons;
  }
  for (const key of [
    "observed_start_utc",
    "observed_end_utc",
    "span_start_utc",
    "span_end_utc",
  ] as const) {
    const parsed = value[key];
    if (parsed !== undefined && parsed !== null && typeof parsed !== "string") {
      return null;
    }
    if (typeof parsed === "string") coverage[key] = parsed;
  }
  return coverage;
}

function parseOfficePolicy(value: unknown): ForecastOfficePolicy | null {
  if (!isRecord(value)) return null;
  const policy_id = requiredString(value, "policy_id");
  const version = requiredFinite(value, "version");
  const effective_from_utc = requiredString(value, "effective_from_utc");
  if (
    !policy_id ||
    version === null ||
    !Number.isInteger(version) ||
    version < 1 ||
    !effective_from_utc
  ) {
    return null;
  }
  return { policy_id, version, effective_from_utc };
}

function parseResult(value: unknown): ForecastResult | null {
  if (!isRecord(value)) return null;
  const dataset_id = requiredString(value, "dataset_id");
  const horizon = value.horizon;
  const origin_utc = requiredString(value, "origin_utc");
  const method = requiredString(value, "method");
  const baseline_version = requiredString(value, "baseline_version");
  const model_version = value.model_version;
  const timezone = requiredString(value, "timezone");
  const horizon_start_utc = requiredString(value, "horizon_start_utc");
  const horizon_end_utc = requiredString(value, "horizon_end_utc");
  const total_energy_kwh = requiredFinite(value, "total_energy_kwh");
  const uncertainty = value.uncertainty;
  const history_coverage = parseCoverage(value.history_coverage);
  const office_hours_policy = parseOfficePolicy(value.office_hours_policy);
  const synthetic = value.synthetic;
  const synthetic_label = value.synthetic_label;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map(parseWarning)
    : null;
  const assumptions = parseStringArray(value.assumptions);
  const limitations = parseStringArray(value.limitations);
  if (
    !dataset_id ||
    !isHorizon(horizon) ||
    !origin_utc ||
    method !== "statistical_baseline" ||
    !baseline_version ||
    model_version !== null ||
    !timezone ||
    !horizon_start_utc ||
    !horizon_end_utc ||
    total_energy_kwh === null ||
    total_energy_kwh < 0 ||
    uncertainty !== "unavailable" ||
    !history_coverage ||
    !office_hours_policy ||
    typeof synthetic !== "boolean" ||
    (synthetic_label !== null && typeof synthetic_label !== "string") ||
    !warnings ||
    warnings.some((warning) => warning === null) ||
    !assumptions ||
    !limitations ||
    !isRecord(value.assumptions_recorded) ||
    !validNullableFinite(value, "tariff_inr_per_kwh") ||
    !validNullableFinite(value, "forecast_cost_inr") ||
    !Array.isArray(value.points)
  ) {
    return null;
  }

  const points: ForecastPoint[] = [];
  for (const rawPoint of value.points) {
    const point = parsePoint(rawPoint);
    if (!point) return null;
    points.push(point);
  }
  const startMs = Date.parse(horizon_start_utc);
  const endMs = Date.parse(horizon_end_utc);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    (endMs - startMs) % 3_600_000 !== 0 ||
    points.length !== (endMs - startMs) / 3_600_000
  ) {
    return null;
  }
  let pointTotal = 0;
  for (let index = 0; index < points.length; index += 1) {
    if (Date.parse(points[index].start_utc) !== startMs + index * 3_600_000) {
      return null;
    }
    pointTotal += points[index].energy_kwh;
  }
  if (
    Math.abs(pointTotal - total_energy_kwh) >
    Math.max(1e-9, Math.abs(pointTotal) * 1e-12)
  ) {
    return null;
  }

  const result: ForecastResult = {
    dataset_id,
    horizon,
    origin_utc,
    method: "statistical_baseline",
    baseline_version,
    model_version: null,
    timezone,
    horizon_start_utc,
    horizon_end_utc,
    points,
    total_energy_kwh,
    uncertainty: "unavailable",
    history_coverage,
    office_hours_policy,
    synthetic,
    synthetic_label,
    warnings: warnings as ForecastWarning[],
    assumptions,
    assumptions_recorded: value.assumptions_recorded,
    limitations,
    tariff_inr_per_kwh:
      optionalFinite(value, "tariff_inr_per_kwh") ?? null,
    forecast_cost_inr: optionalFinite(value, "forecast_cost_inr") ?? null,
  };
  if (value.basis_counts !== undefined) {
    const basisCounts = parseCountRecord(value.basis_counts);
    if (!basisCounts) return null;
    result.basis_counts = basisCounts;
  }
  return result;
}

export function parseForecastSubmission(json: unknown): ForecastSubmission | null {
  const object = unwrap(json);
  if (!object) return null;
  const forecast_id = requiredString(object, "forecast_id");
  const job_id = requiredString(object, "job_id");
  const horizon = object.horizon;
  const origin_utc = requiredString(object, "origin_utc");
  const synthetic = object.synthetic;
  const synthetic_label = object.synthetic_label;
  if (
    !forecast_id ||
    !job_id ||
    forecast_id !== job_id ||
    object.status !== "queued" ||
    !isHorizon(horizon) ||
    !origin_utc ||
    !Number.isFinite(Date.parse(origin_utc)) ||
    typeof synthetic !== "boolean" ||
    (synthetic_label !== null && typeof synthetic_label !== "string")
  ) {
    return null;
  }
  return {
    forecast_id,
    job_id,
    status: "queued",
    horizon,
    origin_utc,
    synthetic,
    synthetic_label,
  };
}

export function parseForecastJob(json: unknown): ForecastJob | null {
  const object = unwrap(json);
  if (!object) return null;
  const forecast_id = requiredString(object, "forecast_id");
  const job_id = requiredString(object, "job_id");
  const dataset_id = requiredString(object, "dataset_id");
  const status = object.status;
  const horizon = object.horizon;
  const origin_utc = requiredString(object, "origin_utc");
  if (
    !forecast_id ||
    !job_id ||
    forecast_id !== job_id ||
    !dataset_id ||
    !isStatus(status) ||
    !isHorizon(horizon) ||
    !origin_utc ||
    !Number.isFinite(Date.parse(origin_utc))
  ) {
    return null;
  }
  const job: ForecastJob = {
    forecast_id,
    job_id,
    dataset_id,
    status,
    horizon,
    origin_utc,
  };
  const method = optionalString(object, "method");
  if (method !== undefined) job.method = method;
  const baseline_version = optionalString(object, "baseline_version");
  if (baseline_version !== undefined) job.baseline_version = baseline_version;
  if (object.progress !== undefined) {
    if (!isRecord(object.progress)) return null;
    const completed = object.progress.completed;
    const total = object.progress.total;
    if (
      typeof completed !== "number" ||
      !Number.isInteger(completed) ||
      completed < 0 ||
      typeof total !== "number" ||
      !Number.isInteger(total) ||
      total < 0
    ) {
      return null;
    }
    job.progress = { completed, total };
  }
  const created_at = optionalString(object, "created_at");
  if (created_at !== undefined) job.created_at = created_at;
  if (object.completed_at !== undefined && object.completed_at !== null) {
    const completed_at = requiredString(object, "completed_at");
    if (!completed_at) return null;
    job.completed_at = completed_at;
  }
  if (status === "failed") {
    if (!isRecord(object.error)) return null;
    const code = requiredString(object.error, "code");
    const message = requiredString(object.error, "message");
    if (!code || !message) return null;
    job.error = { code, message };
  }
  if (status === "completed") {
    const result = parseResult(object.result);
    if (!result) return null;
    if (
      result.dataset_id !== dataset_id ||
      result.horizon !== horizon ||
      result.origin_utc !== origin_utc
    ) {
      return null;
    }
    job.result = result;
  }
  return job;
}

async function requestJson(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  fallback: string,
  init?: { method?: string; body?: BodyInit | null },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      let code: string | undefined;
      let message: string | undefined;
      let field: string | undefined;
      try {
        const body = await response.json();
        const error = isRecord(body) && isRecord(body.error) ? body.error : null;
        if (error) {
          code = optionalString(error, "code");
          message = optionalString(error, "message");
          field = optionalString(error, "field");
        }
      } catch {
        // Use the status-based safe fallback below.
      }
      const error = new ApiError(
        message ?? `${fallback} (HTTP ${response.status}).`,
        response.status,
        code ?? null,
      );
      if (field !== undefined) error.field = field;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      throw new ApiError(
        `${fallback}: response was not valid JSON.`,
        response.status,
        "BAD_RESPONSE",
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ApiError(
      aborted
        ? `${fallback}: timed out or aborted after ${timeoutMs} ms.`
        : error instanceof Error
          ? `${fallback}: ${error.message}`
          : `${fallback}: unknown error.`,
      null,
      aborted ? "TIMEOUT" : "UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Create one persisted P020 forecast job. No wall-clock origin is sent. */
export async function submitForecast(
  origin: string,
  datasetId: string,
  horizon: ForecastHorizon,
  fetchImpl: FetchLike,
  timeoutMs: number = FORECAST_TIMEOUT_MS,
): Promise<ForecastSubmission> {
  const json = await requestJson(
    `${origin}/api/v1/forecasts`,
    fetchImpl,
    timeoutMs,
    "Forecast submission failed",
    {
      method: "POST",
      body: JSON.stringify({ dataset_id: datasetId, horizon }),
    },
  );
  const submission = parseForecastSubmission(json);
  if (!submission || submission.horizon !== horizon) {
    throw new ApiError(
      "Forecast submission answered 2xx but the body was malformed.",
      null,
      "BAD_RESPONSE",
    );
  }
  return submission;
}

/** Poll one exact dataset/forecast-job scope. */
export async function getForecastJob(
  origin: string,
  forecastId: string,
  fetchImpl: FetchLike,
  expectedDatasetId: string,
  expectedHorizon: ForecastHorizon,
  timeoutMs: number = FORECAST_TIMEOUT_MS,
): Promise<ForecastJob> {
  const json = await requestJson(
    `${origin}/api/v1/forecasts/${encodeURIComponent(forecastId)}`,
    fetchImpl,
    timeoutMs,
    "Forecast status request failed",
  );
  const job = parseForecastJob(json);
  if (!job || job.forecast_id !== forecastId) {
    throw new ApiError(
      "Forecast status answered 2xx but the body was malformed.",
      null,
      "BAD_RESPONSE",
    );
  }
  if (
    job.dataset_id !== expectedDatasetId ||
    job.horizon !== expectedHorizon
  ) {
    throw new ApiError(
      "Forecast status belongs to a different dataset or horizon.",
      null,
      "SCOPE_MISMATCH",
    );
  }
  return job;
}

export function horizonLabel(horizon: ForecastHorizon): string {
  if (horizon === "next_24h") return "Next 24 hours";
  if (horizon === "next_7d") return "Next 7 days";
  return "Next calendar month";
}

export function formatForecastInstant(
  timestamp: string,
  timezone: string,
): string {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return timestamp;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(time));
}

export function describeForecastHorizon(result: ForecastResult): string {
  const start = formatForecastInstant(
    result.horizon_start_utc,
    result.timezone,
  );
  const end = formatForecastInstant(result.horizon_end_utc, result.timezone);
  if (result.horizon === "next_calendar_month") {
    return `Complete next local calendar month (${result.timezone}): ${start} to ${end} (end exclusive). This is the whole following local month, not the next 30 days.`;
  }
  return `${horizonLabel(result.horizon)} (${result.timezone}): ${start} to ${end} (end exclusive).`;
}

export interface ForecastChartInput {
  start_utc: string;
  energy_kwh: number | null;
}

export interface ForecastChartPoint extends ForecastChartInput {
  index: number;
  x: number;
  y: number | null;
}

export interface ForecastChart {
  width: number;
  height: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  points: ForecastChartPoint[];
  linePaths: string[];
  isolatedPoints: ForecastChartPoint[];
  maxEnergyKwh: number;
  minEnergyKwh: number | null;
  averageEnergyKwh: number | null;
  numericCount: number;
  missingCount: number;
  flat: boolean;
}

/** Prepare every returned timestamp. Null values remain gaps; no interpolation. */
export function prepareForecastChart(
  input: readonly ForecastChartInput[],
  width = 960,
  height = 280,
): ForecastChart {
  const plotLeft = 58;
  const plotTop = 20;
  const plotWidth = Math.max(1, width - plotLeft - 18);
  const plotHeight = Math.max(1, height - plotTop - 42);
  const numericValues = input
    .map((point) => point.energy_kwh)
    .filter((value): value is number => value !== null);
  const maxEnergyKwh = numericValues.length > 0 ? Math.max(...numericValues) : 0;
  const total = numericValues.reduce((sum, value) => sum + value, 0);
  const points = input.map((point, index) => ({
    ...point,
    index,
    x:
      input.length <= 1
        ? plotLeft + plotWidth / 2
        : plotLeft + (index / (input.length - 1)) * plotWidth,
    y:
      point.energy_kwh === null
        ? null
        : maxEnergyKwh === 0
          ? plotTop + plotHeight
          : plotTop + plotHeight - (point.energy_kwh / maxEnergyKwh) * plotHeight,
  }));

  const linePaths: string[] = [];
  const isolatedPoints: ForecastChartPoint[] = [];
  let segment: ForecastChartPoint[] = [];
  const flush = () => {
    if (segment.length === 1) isolatedPoints.push(segment[0]);
    else if (segment.length > 1) {
      linePaths.push(
        segment
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y?.toFixed(2)}`,
          )
          .join(" "),
      );
    }
    segment = [];
  };
  for (const point of points) {
    if (point.y === null) flush();
    else segment.push(point);
  }
  flush();

  return {
    width,
    height,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    points,
    linePaths,
    isolatedPoints,
    maxEnergyKwh,
    minEnergyKwh:
      numericValues.length > 0 ? Math.min(...numericValues) : null,
    averageEnergyKwh:
      numericValues.length > 0 ? total / numericValues.length : null,
    numericCount: numericValues.length,
    missingCount: input.length - numericValues.length,
    flat:
      numericValues.length > 0 &&
      numericValues.every((value) => value === numericValues[0]),
  };
}
