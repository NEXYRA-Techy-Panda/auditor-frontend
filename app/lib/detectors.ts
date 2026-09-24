// P026 detector-job adapter (auditor-frontend only).
// The committed backend persists detector jobs and owns selection, aggregation,
// Python calls, coverage and result pagination. This module never calls Python,
// prices a deviation, or turns a not-assessed state into a clean result.

import { ApiError, type FetchLike } from "./auditor-api.ts";
import {
  isTerminalStatus,
  type JobStatus,
} from "./analysis.ts";

export const DETECTOR_TIMEOUT_MS = 15_000;
export const DETECTOR_POLL_INTERVAL_MS = 2_000;
export const DETECTOR_PAGE_SIZE = 100;
export const DETECTOR_MAX_PAGE_SIZE = 500;

export type DetectorId = "excess_consumption" | "gradual_trend";
export type DetectorResultStatus =
  | "findings_detected"
  | "evaluated_no_deviation"
  | "evaluated_no_gradual_trend"
  | "insufficient_reference"
  | "insufficient_history"
  | "unsupported_context"
  | "unsupported_aggregation"
  | "no_comparable_observations";

const DETECTOR_RESULT_STATUSES = new Set<string>([
  "findings_detected",
  "evaluated_no_deviation",
  "evaluated_no_gradual_trend",
  "insufficient_reference",
  "insufficient_history",
  "unsupported_context",
  "unsupported_aggregation",
  "no_comparable_observations",
]);

export interface DetectorWindow {
  start_utc: string;
  end_utc: string;
}

export interface DetectorQuantity {
  value: number;
  unit: string;
}

export interface DetectorIdentity {
  id: DetectorId;
  label: string;
  method: string;
  method_version: string;
  technique: string;
  finding_type: string;
  request_format: string;
}

export interface DetectorCatalogueEntry {
  id: DetectorId;
  label: string;
  method: string;
  method_version: string;
  technique: string;
  finding_type: string;
  request_format: string;
  request: Record<string, unknown>;
  section_bounds: {
    device_intervals: number;
    room_intervals: number;
  } | null;
  single_evaluation_section?: boolean;
  requirements: string[];
}

export interface DetectorCatalogue {
  detectors: DetectorCatalogueEntry[];
  limits: {
    max_section_records: number;
    max_findings_per_job: number;
  };
  aggregation: Record<string, unknown>;
  notes: string[];
}

export interface DetectorCoverage {
  start_utc: string;
  end_utc: string;
  devices: number;
  unsupported_devices: number;
  detector_calls: number;
  max_section_records: number;
}

export interface DetectorDevice {
  device_id: string;
  room_id: string;
  device_type: string;
  status: string;
  assessment_source: "detector" | "auditor_precheck";
  reason?: string;
  comparison?: string;
  reference?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DetectorWarning {
  code: string;
  message: string;
}

export interface DetectorExclusion extends Record<string, unknown> {
  device_id?: string;
  room_id?: string;
  reason?: string;
}

export interface DetectorAggregation extends Record<string, unknown> {
  stored_interval_seconds: number;
  max_section_records: number;
  resolutions_by_device: Record<string, number | string>;
  emitted_bins_by_device: Record<string, number>;
  excluded_device_bins: Record<string, Record<string, number>>;
}

export interface DetectorTotals {
  findings: number;
  other_changes: number;
  exclusions_listed: number;
  exclusions_total: number;
}

export interface DetectorFinding {
  finding_id: string;
  finding_type: string;
  method: string;
  device_id?: string;
  room_id?: string;
  detector_id?: DetectorId;
  detector_version?: string;
  technique?: string;
  window_start_utc?: string;
  window_end_utc?: string;
  observed?: DetectorQuantity;
  expected?: DetectorQuantity;
  threshold_w?: number;
  reference_support?: number;
  reference_level_w?: number;
  energy_above_baseline_kwh?: number;
  energy_note?: string;
  deviation?: { watts?: number; ratio?: number; [key: string]: unknown };
  trend?: {
    watts_per_day?: number;
    relative_change_over_period?: number;
    percent_change?: number;
    [key: string]: unknown;
  };
  // P026 deliberately leaves these nested detector-specific fields open.
  persistence?: unknown;
  support?: unknown;
  assessed_period?: unknown;
  raw: Record<string, unknown>;
}

export interface DetectorOtherChange extends Record<string, unknown> {
  classification?: string;
  device_id?: string;
  detector_id?: DetectorId;
}

export interface DetectorResult {
  dataset_id: string;
  status: DetectorResultStatus;
  synthetic: boolean | null;
  synthetic_label: string | null;
  detector: DetectorIdentity;
  windows: { reference: DetectorWindow; evaluation: DetectorWindow };
  coverage: DetectorCoverage;
  detector_coverage: Record<string, unknown>;
  devices: DetectorDevice[];
  aggregation: DetectorAggregation;
  warnings: DetectorWarning[];
  exclusions: unknown[];
  totals: DetectorTotals;
  findings: DetectorFinding[];
  findings_pagination: { page: number; page_size: number; total: number };
  limitations: string[];
  other_changes?: DetectorOtherChange[];
}

export interface DetectorJob {
  job_id: string;
  dataset_id: string;
  status: JobStatus;
  method?: string;
  method_version?: string;
  requested_range?: DetectorWindow | null;
  actual_coverage?: DetectorWindow | null;
  progress?: { completed_batches: number; total_batches: number };
  created_at?: string;
  completed_at?: string | null;
  error?: { code: string; message: string } | null;
  detector?: DetectorIdentity;
  windows?: { reference: DetectorWindow; evaluation: DetectorWindow };
  result?: DetectorResult | null;
}

export interface DetectorSubmitAck {
  job_id: string;
  status: JobStatus;
  detector: DetectorId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reqString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === "string" && item.length > 0 ? item : null;
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalFinite(value: Record<string, unknown>, key: string): number | undefined {
  const item = value[key];
  if (item === undefined || item === null) return undefined;
  return finiteNumber(item) ?? undefined;
}

function integer(value: unknown, min = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min
    ? value
    : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseWindow(value: unknown): DetectorWindow | null {
  if (!isRecord(value)) return null;
  const start = reqString(value, "start_utc");
  const end = reqString(value, "end_utc");
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
  if (Date.parse(start) >= Date.parse(end)) return null;
  return { start_utc: start, end_utc: end };
}

function parseIdentity(value: unknown): DetectorIdentity | null {
  if (!isRecord(value)) return null;
  const id = reqString(value, "id");
  const label = reqString(value, "label");
  const method = reqString(value, "method");
  const methodVersion = reqString(value, "method_version");
  const technique = reqString(value, "technique");
  const findingType = reqString(value, "finding_type");
  const requestFormat = reqString(value, "request_format");
  if (!id || !label || !method || !methodVersion || !technique || !findingType || !requestFormat) return null;
  if (id !== "excess_consumption" && id !== "gradual_trend") return null;
  return {
    id,
    label,
    method,
    method_version: methodVersion,
    technique,
    finding_type: findingType,
    request_format: requestFormat,
  };
}

function parseCatalogueEntry(value: unknown): DetectorCatalogueEntry | null {
  if (!isRecord(value)) return null;
  const id = reqString(value, "id");
  if (id !== "excess_consumption" && id !== "gradual_trend") return null;
  const label = reqString(value, "label");
  const method = reqString(value, "method");
  const methodVersion = reqString(value, "method_version");
  const technique = reqString(value, "technique");
  const findingType = reqString(value, "finding_type");
  const requestFormat = reqString(value, "request_format");
  const request = isRecord(value.request) ? value.request : null;
  const requirements = Array.isArray(value.requirements)
    ? value.requirements.filter((item): item is string => typeof item === "string")
    : null;
  if (!label || !method || !methodVersion || !technique || !findingType || !requestFormat || !request || !requirements) return null;
  const sectionBounds = value.section_bounds === null
    ? null
    : isRecord(value.section_bounds)
      ? {
          device_intervals: integer(value.section_bounds.device_intervals, 1),
          room_intervals: integer(value.section_bounds.room_intervals, 1),
        }
      : undefined;
  if (sectionBounds === undefined || sectionBounds === null || sectionBounds.device_intervals === null || sectionBounds.room_intervals === null) return null;
  const normalizedSectionBounds = {
    device_intervals: sectionBounds.device_intervals,
    room_intervals: sectionBounds.room_intervals,
  };
  const single = value.single_evaluation_section === undefined ? undefined : boolean(value.single_evaluation_section);
  if (value.single_evaluation_section !== undefined && single === null) return null;
  const typedSingle = single === null ? undefined : single;
  return {
    id,
    label,
    method,
    method_version: methodVersion,
    technique,
    finding_type: findingType,
    request_format: requestFormat,
    request,
    section_bounds: normalizedSectionBounds,
    ...(typedSingle === undefined ? {} : { single_evaluation_section: typedSingle }),
    requirements,
  };
}

function parseCatalogue(value: unknown): DetectorCatalogue | null {
  if (!isRecord(value)) return null;
  const rawEntries = Array.isArray(value.detectors)
    ? value.detectors.filter((item) => isRecord(item) && item.id !== "vacancy")
    : null;
  const entries = rawEntries ? rawEntries.map(parseCatalogueEntry) : null;
  const limits = isRecord(value.limits)
    ? {
        max_section_records: integer(value.limits.max_section_records, 1),
        max_findings_per_job: integer(value.limits.max_findings_per_job, 1),
      }
    : null;
  const aggregation = isRecord(value.aggregation) ? value.aggregation : null;
  const notes = Array.isArray(value.notes)
    ? value.notes.filter((item): item is string => typeof item === "string")
    : null;
  if (!entries || entries.some((entry) => entry === null) || !limits || limits.max_section_records === null || limits.max_findings_per_job === null || !aggregation || !notes) return null;
  return {
    detectors: entries as DetectorCatalogueEntry[],
    limits: {
      max_section_records: limits.max_section_records,
      max_findings_per_job: limits.max_findings_per_job,
    },
    aggregation,
    notes,
  };
}

function parseQuantity(value: unknown): DetectorQuantity | null {
  if (!isRecord(value)) return null;
  const amount = finiteNumber(value.value);
  const unit = reqString(value, "unit");
  return amount === null || !unit ? null : { value: amount, unit };
}

function parseDeviation(value: unknown): DetectorFinding["deviation"] {
  if (!isRecord(value)) return undefined;
  const watts = optionalFinite(value, "watts");
  const ratio = optionalFinite(value, "ratio");
  if (watts === undefined && ratio === undefined) return undefined;
  return {
    ...(watts === undefined ? {} : { watts }),
    ...(ratio === undefined ? {} : { ratio }),
  };
}

function parseTrend(value: unknown): DetectorFinding["trend"] {
  if (!isRecord(value)) return undefined;
  const wattsPerDay = optionalFinite(value, "watts_per_day");
  const relativeChange = optionalFinite(value, "relative_change_over_period");
  const percentChange = optionalFinite(value, "percent_change");
  if (wattsPerDay === undefined && relativeChange === undefined && percentChange === undefined) return undefined;
  return {
    ...(wattsPerDay === undefined ? {} : { watts_per_day: wattsPerDay }),
    ...(relativeChange === undefined ? {} : { relative_change_over_period: relativeChange }),
    ...(percentChange === undefined ? {} : { percent_change: percentChange }),
  };
}

function parseFinding(value: unknown): DetectorFinding | null {
  if (!isRecord(value)) return null;
  const findingId = reqString(value, "finding_id");
  const findingType = reqString(value, "finding_type");
  const method = reqString(value, "method");
  if (!findingId || !findingType || !method) return null;
  const observed = value.observed === undefined ? undefined : parseQuantity(value.observed);
  const expected = value.expected === undefined ? undefined : parseQuantity(value.expected);
  if (value.observed !== undefined && !observed) return null;
  if (value.expected !== undefined && !expected) return null;
  const deviceId = optionalString(value, "device_id");
  const roomId = optionalString(value, "room_id");
  const detectorId = value.detector_id === undefined ? undefined : reqString(value, "detector_id");
  if (value.detector_id !== undefined && (detectorId !== "excess_consumption" && detectorId !== "gradual_trend")) return null;
  const typedDetectorId = detectorId as DetectorId | undefined;
  const windowStart = optionalString(value, "window_start_utc");
  const windowEnd = optionalString(value, "window_end_utc");
  if ((windowStart && Number.isNaN(Date.parse(windowStart))) || (windowEnd && Number.isNaN(Date.parse(windowEnd)))) return null;
  const threshold = value.threshold_w === undefined ? undefined : finiteNumber(value.threshold_w);
  if (value.threshold_w !== undefined && threshold === null) return null;
  const typedThreshold = threshold === null ? undefined : threshold;
  const support = value.reference_support === undefined ? undefined : finiteNumber(value.reference_support);
  if (value.reference_support !== undefined && support === null) return null;
  const typedSupport = support === null ? undefined : support;
  const energy = value.energy_above_baseline_kwh === undefined ? undefined : finiteNumber(value.energy_above_baseline_kwh);
  if (value.energy_above_baseline_kwh !== undefined && energy === null) return null;
  const typedEnergy = energy === null ? undefined : energy;
  const referenceLevel = value.reference_level_w === undefined ? undefined : finiteNumber(value.reference_level_w);
  if (value.reference_level_w !== undefined && referenceLevel === null) return null;
  const typedReferenceLevel = referenceLevel === null ? undefined : referenceLevel;
  const persistence = value.persistence;
  const supportValue = value.support;
  const assessed = value.assessed_period;
  return {
    finding_id: findingId,
    finding_type: findingType,
    method,
    ...(deviceId === undefined ? {} : { device_id: deviceId }),
    ...(roomId === undefined ? {} : { room_id: roomId }),
    ...(typedDetectorId === undefined ? {} : { detector_id: typedDetectorId }),
    ...(optionalString(value, "detector_version") === undefined ? {} : { detector_version: optionalString(value, "detector_version") }),
    ...(optionalString(value, "technique") === undefined ? {} : { technique: optionalString(value, "technique") }),
    ...(windowStart === undefined ? {} : { window_start_utc: windowStart }),
    ...(windowEnd === undefined ? {} : { window_end_utc: windowEnd }),
    ...(observed ? { observed } : {}),
    ...(expected ? { expected } : {}),
    ...(typedThreshold === undefined ? {} : { threshold_w: typedThreshold }),
    ...(typedSupport === undefined ? {} : { reference_support: typedSupport }),
    ...(typedReferenceLevel === undefined ? {} : { reference_level_w: typedReferenceLevel }),
    ...(typedEnergy === undefined ? {} : { energy_above_baseline_kwh: typedEnergy }),
    ...(optionalString(value, "energy_note") === undefined ? {} : { energy_note: optionalString(value, "energy_note") }),
    ...(parseDeviation(value.deviation) ? { deviation: parseDeviation(value.deviation) } : {}),
    ...(parseTrend(value.trend) ? { trend: parseTrend(value.trend) } : {}),
    ...(persistence === undefined ? {} : { persistence }),
    ...(supportValue === undefined ? {} : { support: supportValue }),
    ...(assessed === undefined ? {} : { assessed_period: assessed }),
    raw: value,
  };
}

function parseDevice(value: unknown): DetectorDevice | null {
  if (!isRecord(value)) return null;
  const deviceId = reqString(value, "device_id");
  const roomId = reqString(value, "room_id");
  const deviceType = reqString(value, "device_type");
  const status = reqString(value, "status");
  const source = reqString(value, "assessment_source");
  if (!deviceId || !roomId || !deviceType || !status || (source !== "detector" && source !== "auditor_precheck")) return null;
  return {
    ...value,
    device_id: deviceId,
    room_id: roomId,
    device_type: deviceType,
    status,
    assessment_source: source,
    ...(optionalString(value, "reason") === undefined ? {} : { reason: optionalString(value, "reason") }),
    ...(optionalString(value, "comparison") === undefined ? {} : { comparison: optionalString(value, "comparison") }),
    ...(isRecord(value.reference) ? { reference: value.reference } : {}),
    ...(isRecord(value.evaluation) ? { evaluation: value.evaluation } : {}),
  };
}

function parseCoverage(value: unknown): DetectorCoverage | null {
  if (!isRecord(value)) return null;
  const start = reqString(value, "start_utc");
  const end = reqString(value, "end_utc");
  const devices = integer(value.devices);
  const unsupported = integer(value.unsupported_devices);
  const calls = integer(value.detector_calls);
  const max = integer(value.max_section_records, 1);
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || devices === null || unsupported === null || calls === null || max === null) return null;
  return {
    start_utc: start,
    end_utc: end,
    devices,
    unsupported_devices: unsupported,
    detector_calls: calls,
    max_section_records: max,
  };
}

function parseTotals(value: unknown): DetectorTotals | null {
  if (!isRecord(value)) return null;
  const findings = integer(value.findings);
  const otherChanges = integer(value.other_changes);
  const listed = integer(value.exclusions_listed);
  const total = integer(value.exclusions_total);
  if (findings === null || otherChanges === null || listed === null || total === null) return null;
  return { findings, other_changes: otherChanges, exclusions_listed: listed, exclusions_total: total };
}

function parsePagination(value: unknown): DetectorResult["findings_pagination"] | null {
  if (!isRecord(value)) return null;
  const page = integer(value.page, 1);
  const pageSize = integer(value.page_size, 1);
  const total = integer(value.total);
  if (page === null || pageSize === null || total === null) return null;
  return { page, page_size: pageSize, total };
}

function parseResult(value: unknown): DetectorResult | null {
  if (!isRecord(value)) return null;
  const datasetId = reqString(value, "dataset_id");
  const status = reqString(value, "status");
  const detector = parseIdentity(value.detector);
  const windows = isRecord(value.windows)
    ? { reference: parseWindow(value.windows.reference), evaluation: parseWindow(value.windows.evaluation) }
    : null;
  const coverage = parseCoverage(value.coverage);
  const detectorCoverage = isRecord(value.detector_coverage) ? value.detector_coverage : null;
  const devices = Array.isArray(value.devices) ? value.devices.map(parseDevice) : null;
  const aggregation = isRecord(value.aggregation)
    ? {
        ...value.aggregation,
        stored_interval_seconds: integer(value.aggregation.stored_interval_seconds, 1),
        max_section_records: integer(value.aggregation.max_section_records, 1),
        resolutions_by_device: isRecord(value.aggregation.resolutions_by_device) ? value.aggregation.resolutions_by_device as Record<string, number> : null,
        emitted_bins_by_device: isRecord(value.aggregation.emitted_bins_by_device) ? value.aggregation.emitted_bins_by_device as Record<string, number> : null,
        excluded_device_bins: isRecord(value.aggregation.excluded_device_bins) ? value.aggregation.excluded_device_bins as Record<string, Record<string, number>> : null,
      }
    : null;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map((item) => isRecord(item) && reqString(item, "code") && reqString(item, "message") ? { code: reqString(item, "code") as string, message: reqString(item, "message") as string } : null)
    : null;
  const exclusions = Array.isArray(value.exclusions) ? value.exclusions : null;
  const totals = parseTotals(value.totals);
  const findings = Array.isArray(value.findings) ? value.findings.map(parseFinding) : null;
  const pagination = parsePagination(value.findings_pagination);
  const limitations = Array.isArray(value.limitations) ? value.limitations.filter((item): item is string => typeof item === "string") : null;
  const otherChanges = value.other_changes === undefined ? undefined : Array.isArray(value.other_changes) ? value.other_changes : null;
  if (!datasetId || !status || !DETECTOR_RESULT_STATUSES.has(status) || !detector || !windows || !windows.reference || !windows.evaluation || Date.parse(windows.reference.end_utc) > Date.parse(windows.evaluation.start_utc) || !coverage || !detectorCoverage || !devices || devices.some((item) => item === null) || !aggregation || aggregation.stored_interval_seconds === null || aggregation.max_section_records === null || !aggregation.resolutions_by_device || !aggregation.emitted_bins_by_device || !aggregation.excluded_device_bins || !warnings || warnings.some((item) => item === null) || !exclusions || !totals || !findings || findings.some((item) => item === null) || !pagination || !limitations || otherChanges === null && value.other_changes !== undefined) return null;
  const synthetic = value.synthetic === true ? true : value.synthetic === false ? false : null;
  return {
    dataset_id: datasetId,
    status: status as DetectorResultStatus,
    synthetic,
    synthetic_label: typeof value.synthetic_label === "string" ? value.synthetic_label : null,
    detector,
    windows: { reference: windows.reference, evaluation: windows.evaluation },
    coverage,
    detector_coverage: detectorCoverage,
    devices: devices as DetectorDevice[],
    aggregation: aggregation as DetectorAggregation,
    warnings: warnings as DetectorWarning[],
    exclusions,
    totals,
    findings: findings as DetectorFinding[],
    findings_pagination: pagination,
    limitations,
    ...(otherChanges ? { other_changes: otherChanges as DetectorOtherChange[] } : {}),
  };
}

function parseJob(json: unknown): DetectorJob | null {
  const value = isRecord(json) && isRecord(json.data) ? json.data : json;
  if (!isRecord(value)) return null;
  const jobId = reqString(value, "job_id");
  const datasetId = reqString(value, "dataset_id");
  const statusValue = reqString(value, "status");
  if (!jobId || !datasetId || !statusValue || !isJobStatus(statusValue)) return null;
  const job: DetectorJob = { job_id: jobId, dataset_id: datasetId, status: statusValue };
  const method = optionalString(value, "method");
  if (method !== undefined) job.method = method;
  const methodVersion = optionalString(value, "method_version");
  if (methodVersion !== undefined) job.method_version = methodVersion;
  if (value.requested_range !== undefined && value.requested_range !== null) {
    const range = parseWindow(value.requested_range);
    if (!range) return null;
    job.requested_range = range;
  }
  if (value.actual_coverage !== undefined && value.actual_coverage !== null) {
    const range = parseWindow(value.actual_coverage);
    if (!range) return null;
    job.actual_coverage = range;
  }
  if (value.progress !== undefined) {
    if (!isRecord(value.progress)) return null;
    const completed = integer(value.progress.completed_batches);
    const total = integer(value.progress.total_batches);
    if (completed === null || total === null) return null;
    job.progress = { completed_batches: completed, total_batches: total };
  }
  const created = optionalString(value, "created_at");
  if (created !== undefined) job.created_at = created;
  if (value.completed_at !== undefined && value.completed_at !== null) {
    const completedAt = reqString(value, "completed_at");
    if (!completedAt) return null;
    job.completed_at = completedAt;
  }
  if (value.error !== undefined && value.error !== null) {
    if (!isRecord(value.error)) return null;
    const code = reqString(value.error, "code");
    const message = reqString(value.error, "message");
    if (!code || !message) return null;
    job.error = { code, message };
  }
  if (value.detector !== undefined && value.detector !== null) {
    const detector = parseIdentity(value.detector);
    if (!detector) return null;
    job.detector = detector;
  }
  if (value.windows !== undefined && value.windows !== null) {
    if (!isRecord(value.windows)) return null;
    const reference = parseWindow(value.windows.reference);
    const evaluation = parseWindow(value.windows.evaluation);
    if (!reference || !evaluation) return null;
    job.windows = { reference, evaluation };
  }
  if (value.result !== undefined && value.result !== null) {
    const result = parseResult(value.result);
    if (!result) return null;
    job.result = result;
  }
  return job;
}

function parseSubmitAck(json: unknown): DetectorSubmitAck | null {
  const value = isRecord(json) && isRecord(json.data) ? json.data : json;
  if (!isRecord(value)) return null;
  const jobId = reqString(value, "job_id");
  const status = reqString(value, "status");
  const detector = reqString(value, "detector");
  if (!jobId || !status || !isJobStatus(status) || (detector !== "excess_consumption" && detector !== "gradual_trend")) return null;
  return { job_id: jobId, status, detector };
}

function isJobStatus(value: string): value is JobStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed";
}

async function requestJson(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  fallback: string,
  init?: { method?: string; body?: BodyInit | null; signal?: AbortSignal },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestSignal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    const response = await fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: requestSignal,
    });
    if (!response.ok) {
      let detail: { code?: string; message?: string; field?: string } = {};
      try {
        const body = await response.json();
        const error = isRecord(body) && isRecord(body.error) ? body.error : isRecord(body) ? body : {};
        detail = {
          ...(typeof error.code === "string" ? { code: error.code } : {}),
          ...(typeof error.message === "string" ? { message: error.message } : {}),
          ...(typeof error.field === "string" ? { field: error.field } : {}),
        };
      } catch {
        // Use the status fallback below.
      }
      const error = new ApiError(detail.message ?? `${fallback} (HTTP ${response.status}).`, response.status, detail.code ?? null);
      if (detail.field !== undefined) error.field = detail.field;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      throw new ApiError(`${fallback}: response was not valid JSON.`, response.status, "BAD_RESPONSE");
    }
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

function badResponse(fallback: string): ApiError {
  return new ApiError(`${fallback}: response body did not match the committed P026 shape.`, 200, "BAD_RESPONSE");
}

const DETECTOR_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function validDetectorUtc(value: string): boolean {
  if (!DETECTOR_UTC_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().replace(".000Z", "Z") === value;
}

export function validateDetectorWindows(
  reference: { start_utc: string; end_utc: string },
  evaluation: { start_utc: string; end_utc: string },
): { ok: true } | { ok: false; error: string } {
  if (!validDetectorUtc(reference.start_utc) || !validDetectorUtc(reference.end_utc) || !validDetectorUtc(evaluation.start_utc) || !validDetectorUtc(evaluation.end_utc)) {
    return { ok: false, error: "Use real UTC timestamps with second precision, for example 2026-01-01T00:00:00Z." };
  }
  const referenceWindow = parseWindow(reference);
  const evaluationWindow = parseWindow(evaluation);
  if (!referenceWindow || !evaluationWindow) return { ok: false, error: "Reference and evaluation windows must be ordered ISO UTC ranges." };
  if (Date.parse(referenceWindow.end_utc) > Date.parse(evaluationWindow.start_utc)) {
    return { ok: false, error: "Reference must end at or before evaluation starts." };
  }
  return { ok: true };
}

export async function fetchDetectorCatalogue(
  origin: string,
  fetchImpl: FetchLike,
  timeoutMs = DETECTOR_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<DetectorCatalogue> {
  const fallback = "Detector catalogue request failed";
  const json = await requestJson(`${origin}/api/v1/detectors`, fetchImpl, timeoutMs, fallback, { signal });
  const value = isRecord(json) && isRecord(json.data) ? json.data : null;
  const parsed = value ? parseCatalogue(value) : null;
  if (!parsed) throw badResponse(fallback);
  return parsed;
}

export async function submitDetectorJob(
  origin: string,
  datasetId: string,
  detector: DetectorId,
  reference: DetectorWindow,
  evaluation: DetectorWindow,
  fetchImpl: FetchLike,
  timeoutMs = DETECTOR_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<DetectorSubmitAck> {
  const fallback = "Detector job submission failed";
  const json = await requestJson(
    `${origin}/api/v1/analysis/jobs`,
    fetchImpl,
    timeoutMs,
    fallback,
    {
      method: "POST",
      body: JSON.stringify({
        dataset_id: datasetId,
        detector,
        reference_window: reference,
        evaluation_window: evaluation,
      }),
      signal,
    },
  );
  const parsed = parseSubmitAck(json);
  if (!parsed || parsed.detector !== detector) throw badResponse(fallback);
  return parsed;
}

export async function getDetectorJob(
  origin: string,
  jobId: string,
  fetchImpl: FetchLike,
  page = 1,
  pageSize = DETECTOR_PAGE_SIZE,
  timeoutMs = DETECTOR_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<DetectorJob> {
  const fallback = "Detector job status request failed";
  const json = await requestJson(
    `${origin}/api/v1/analysis/jobs/${encodeURIComponent(jobId)}?page=${page}&page_size=${pageSize}`,
    fetchImpl,
    timeoutMs,
    fallback,
    { signal },
  );
  const parsed = parseJob(json);
  if (!parsed || parsed.job_id !== jobId) throw badResponse(fallback);
  return parsed;
}

export function detectorStatusLabel(status: DetectorResultStatus | string): string {
  return status.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function detectorIsTerminal(job: DetectorJob): boolean {
  return isTerminalStatus(job.status);
}
