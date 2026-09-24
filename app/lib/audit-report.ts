// P028-UI immutable audit-report model.
// This module only assembles confirmed frontend/API data. It does not create
// jobs, calculate ROI, compare arbitrary datasets, or call an LLM.

import { ApiError, type DatasetItem, type DatasetSummary, type FetchLike } from "./auditor-api.ts";
import type { AnalysisJob, JobResult } from "./analysis.ts";
import type {
  DetectorJob,
  DetectorResult,
} from "./detectors.ts";
import type { ForecastJob, ForecastResult } from "./forecast.ts";
import type { ReportPreviewResponse } from "./report-preview.ts";
import {
  fetchHistoricalDevices,
  fetchHistoricalRooms,
  fetchHistoricalTimeseries,
  fetchHistoricalWeekdays,
  type HistoricalWeekdays,
  type HistoricalWindow,
  type RoomAnalyticsItem,
  type DeviceAnalyticsItem,
  type TimeseriesItem,
} from "./historical.ts";

export const AUDIT_REPORT_MAX_PAGES = 20;
export const AUDIT_REPORT_TIMESERIES_PAGE_SIZE = 500;
export const AUDIT_REPORT_BREAKDOWN_PAGE_SIZE = 200;

export type ReportSectionStatus =
  | "available"
  | "not_run"
  | "in_progress"
  | "failed"
  | "unavailable";

export interface ReportPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  fetched_pages: number;
  included_count: number;
  excerpt: boolean;
  omitted_count: number;
}

export interface ReportHistoricalData {
  dataset_id: string | null;
  status: ReportSectionStatus;
  window: HistoricalWindow | null;
  timezone: string | null;
  bucket_seconds: number | null;
  full_period_observed_energy_kwh: number | null;
  full_period_observed_cost_inr: number | null;
  timeseries: ReportPage<TimeseriesItem> | null;
  rooms: ReportPage<RoomAnalyticsItem> | null;
  devices: ReportPage<DeviceAnalyticsItem> | null;
  weekdays: HistoricalWeekdays | null;
  errors: string[];
  retrieved_at: string;
  query: {
    scope: "office";
    from_utc: null;
    to_utc: null;
    timeseries_bucket_seconds: 3600;
    timeseries_page_size: number;
    breakdown_page_size: number;
    max_pages: number;
  };
}

export type ReportJobKind = "vacancy" | "detector" | "forecast";
export type ReportJobStatus =
  | "available"
  | "not_run"
  | "in_progress"
  | "failed"
  | "unavailable";

export interface ReportJobSnapshot {
  kind: ReportJobKind;
  job_id: string | null;
  secondary_id: string | null;
  status: ReportJobStatus;
  retrieved_at: string;
  result: JobResult | DetectorResult | ForecastResult | null;
  findings_included_count: number | null;
  findings_total: number | null;
  findings_page: number | null;
  findings_page_size: number | null;
  findings_total_pages: number | null;
  findings_fetched_pages: number | null;
  findings_excerpt: boolean;
  error: { code: string; message: string } | null;
  message: string | null;
}

export interface ReportEconomicsSnapshot {
  status: "available" | "unavailable";
  /** Aggregate fields intentionally remain null; the server response owns all calculations. */
  investment_cost: null;
  annual_savings: null;
  payback_months: null;
  roi_percent: null;
  reason: string | null;
  integration_boundary: string;
  preview: ReportPreviewResponse | null;
}

export interface ReportComparisonSnapshot {
  status: "unverified" | "unavailable";
  matched_run_evidence: false;
  reason: string;
  integration_boundary: string;
  preview_status: "unverified" | "unavailable" | null;
}

export interface ReportSourceTimestamps {
  summary: string | null;
  historical: string | null;
  vacancy: string | null;
  detector: string | null;
  forecast: string | null;
  preview: string | null;
}

export interface AuditReportContext {
  dataset_id: string;
  tariff_token: number;
  revision: number;
  vacancy_job_id: string | null;
  detector_job_id: string | null;
  forecast_job_id: string | null;
  summary_retrieved_at?: string | null;
  vacancy_retrieved_at?: string | null;
  detector_retrieved_at?: string | null;
  forecast_retrieved_at?: string | null;
}

export interface AuditReportSnapshot {
  schema_version: "1.0.1";
  report_id: string;
  generated_at: string;
  retrieved_at: ReportSourceTimestamps;
  context: AuditReportContext;
  dataset: {
    dataset_id: string;
    run_id: string | null;
    scenario_id: string | null;
    interval_seconds: number | null;
    imported_utc: string | null;
    building_name: string | null;
  };
  scope: {
    window: HistoricalWindow | null;
    timezone: string | null;
  };
  provenance: {
    synthetic: boolean | null;
    synthetic_label: string | null;
  };
  summary: DatasetSummary | null;
  historical: ReportHistoricalData;
  vacancy: ReportJobSnapshot;
  detector: ReportJobSnapshot;
  forecast: ReportJobSnapshot;
  economics: ReportEconomicsSnapshot;
  comparison: ReportComparisonSnapshot;
  limitations: string[];
  source_notes: string[];
}

export interface BuildAuditReportInput {
  context: AuditReportContext;
  dataset: DatasetItem | null;
  summary: DatasetSummary | null;
  historical: ReportHistoricalData;
  vacancyJob: AnalysisJob | null;
  detectorJob: DetectorJob | null;
  forecastJob: ForecastJob | null;
  reportPreview?: ReportPreviewResponse | null;
  generated_at?: string;
  report_id?: string;
  source_notes?: string[];
  retrieved_at?: Partial<ReportSourceTimestamps>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function makeReportPage<T>(
  items: T[],
  total: number,
  pageCount: number,
  maxPages = AUDIT_REPORT_MAX_PAGES,
  pageSize = Math.max(items.length, 1),
  fetchedPages = 1,
): ReportPage<T> {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Report page total must be a non-negative safe integer.");
  if (!Number.isSafeInteger(pageCount) || pageCount < 0) throw new Error("Report page count must be a non-negative safe integer.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("Report page size must be a positive safe integer.");
  if (!Number.isSafeInteger(fetchedPages) || fetchedPages < 0) throw new Error("Report fetched page count must be a non-negative safe integer.");
  const included = items.length;
  const excerpt = included < total || pageCount > maxPages || fetchedPages < pageCount;
  return {
    items,
    page: 1,
    page_size: pageSize,
    total,
    total_pages: pageCount,
    fetched_pages: fetchedPages,
    included_count: included,
    excerpt,
    omitted_count: Math.max(0, total - included),
  };
}

export function mergeReportPages<T>(
  pages: T[][],
  total: number,
  pageCount: number,
  maxPages = AUDIT_REPORT_MAX_PAGES,
  pageSize?: number,
): ReportPage<T> {
  const includedItems = pages.slice(0, maxPages).flat();
  return makeReportPage(
    includedItems,
    total,
    pageCount,
    maxPages,
    pageSize ?? Math.max(includedItems.length, pages[0]?.length ?? 1),
    Math.min(pages.length, maxPages),
  );
}

export function reportContextKey(context: AuditReportContext): string {
  return [
    context.dataset_id,
    context.tariff_token,
    context.revision,
    context.vacancy_job_id ?? "",
    context.detector_job_id ?? "",
    context.forecast_job_id ?? "",
    context.summary_retrieved_at ?? "",
    context.vacancy_retrieved_at ?? "",
    context.detector_retrieved_at ?? "",
    context.forecast_retrieved_at ?? "",
  ].join("|");
}

export function sameReportContext(
  left: AuditReportContext,
  right: AuditReportContext,
): boolean {
  return reportContextKey(left) === reportContextKey(right);
}

function makeUnavailableHistorical(datasetId: string | null, errors: string[], retrievedAt: string): ReportHistoricalData {
  return {
    dataset_id: datasetId,
    status: "unavailable",
    window: null,
    timezone: null,
    bucket_seconds: null,
    full_period_observed_energy_kwh: null,
    full_period_observed_cost_inr: null,
    timeseries: null,
    rooms: null,
    devices: null,
    weekdays: null,
    errors,
    retrieved_at: retrievedAt,
    query: {
      scope: "office",
      from_utc: null,
      to_utc: null,
      timeseries_bucket_seconds: 3600,
      timeseries_page_size: AUDIT_REPORT_TIMESERIES_PAGE_SIZE,
      breakdown_page_size: AUDIT_REPORT_BREAKDOWN_PAGE_SIZE,
      max_pages: AUDIT_REPORT_MAX_PAGES,
    },
  };
}

function makeJobSnapshot(
  kind: ReportJobKind,
  job: AnalysisJob | DetectorJob | ForecastJob | null,
  retrievedAt: string,
): ReportJobSnapshot {
  if (!job) {
    return {
      kind,
      job_id: null,
      secondary_id: null,
      status: "not_run",
      retrieved_at: retrievedAt,
      result: null,
      findings_included_count: null,
      findings_total: null,
      findings_page: null,
      findings_page_size: null,
      findings_total_pages: null,
      findings_fetched_pages: null,
      findings_excerpt: false,
      error: null,
      message: "Not run",
    };
  }
  const jobId = "job_id" in job ? job.job_id : null;
  const secondaryId = kind === "forecast" && "forecast_id" in job ? job.forecast_id : null;
  if (job.status === "completed") {
    const result = "result" in job ? job.result ?? null : null;
    const findings = result && "findings" in result && Array.isArray(result.findings) ? result.findings : null;
    const pagination = result && "findings_pagination" in result ? result.findings_pagination : null;
    const findingsTotal = pagination && typeof pagination.total === "number" ? pagination.total : null;
    const findingsIncluded = findings ? findings.length : null;
    const findingsPage = pagination && typeof pagination.page === "number" ? pagination.page : null;
    const findingsPageSize = pagination && typeof pagination.page_size === "number" ? pagination.page_size : null;
    const findingsTotalPages = findingsTotal !== null && findingsPageSize !== null ? Math.ceil(findingsTotal / findingsPageSize) : null;
    const findingsFetchedPages = findingsTotal !== null && findingsTotalPages !== null && findingsIncluded !== null
      ? (findingsIncluded >= findingsTotal ? findingsTotalPages : Math.min(findingsTotalPages, Math.ceil(findingsIncluded / Math.max(findingsPageSize ?? 1, 1))))
      : null;
    return {
      kind,
      job_id: jobId,
      secondary_id: secondaryId,
      status: result ? "available" : "unavailable",
      retrieved_at: retrievedAt,
      result,
      findings_included_count: findingsIncluded,
      findings_total: findingsTotal,
      findings_page: findingsPage,
      findings_page_size: findingsPageSize,
      findings_total_pages: findingsTotalPages,
      findings_fetched_pages: findingsFetchedPages,
      findings_excerpt: findingsTotal !== null && findingsIncluded !== null && findingsIncluded < findingsTotal,
      error: null,
      message: result ? null : "Completed job returned no result payload",
    };
  }
  if (job.status === "failed") {
    return {
      kind,
      job_id: jobId,
      secondary_id: secondaryId,
      status: "failed",
      retrieved_at: retrievedAt,
      result: null,
      findings_included_count: null,
      findings_total: null,
      findings_page: null,
      findings_page_size: null,
      findings_total_pages: null,
      findings_fetched_pages: null,
      findings_excerpt: false,
      error: job.error ? { code: job.error.code, message: job.error.message } : null,
      message: job.error?.message ?? "Job failed",
    };
  }
  return {
    kind,
    job_id: jobId,
    secondary_id: secondaryId,
    status: "in_progress",
    retrieved_at: retrievedAt,
    result: null,
    findings_included_count: null,
    findings_total: null,
    findings_page: null,
    findings_page_size: null,
    findings_total_pages: null,
    findings_fetched_pages: null,
    findings_excerpt: false,
    error: null,
    message: `Job status: ${job.status}`,
  };
}

function collectLimitations(
  summary: DatasetSummary | null,
  historical: ReportHistoricalData,
  vacancy: ReportJobSnapshot,
  detector: ReportJobSnapshot,
  forecast: ReportJobSnapshot,
): string[] {
  const limitations: string[] = [];
  if (summary?.gap_assessment?.status === "not_performed") {
    limitations.push("Gap assessment not performed; an empty compatibility gaps array is not a no-gaps claim.");
  }
  limitations.push(...historical.errors);
  for (const job of [vacancy, detector, forecast]) {
    if (job.message) limitations.push(`${job.kind}: ${job.message}`);
  }
  if (detector.result && "limitations" in detector.result) {
    limitations.push(...detector.result.limitations);
  }
  if (forecast.result && "limitations" in forecast.result) {
    limitations.push(...forecast.result.limitations);
  }
  return [...new Set(limitations)];
}

export function buildAuditReportSnapshot(input: BuildAuditReportInput): AuditReportSnapshot {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const datasetId = input.context.dataset_id;
  if (!datasetId) throw new Error("A dataset is required before building an audit report.");
  if (input.dataset && input.dataset.dataset_id !== datasetId) {
    throw new Error("Dataset identity changed while preparing the audit report.");
  }
  if (input.summary && input.summary.dataset_id !== datasetId) {
    throw new Error("Summary identity does not match the selected dataset.");
  }
  if (input.vacancyJob && input.vacancyJob.dataset_id !== datasetId) {
    throw new Error("Vacancy job identity does not match the selected dataset.");
  }
  if (input.detectorJob && input.detectorJob.dataset_id !== datasetId) {
    throw new Error("Detector job identity does not match the selected dataset.");
  }
  if (input.forecastJob && input.forecastJob.dataset_id !== datasetId) {
    throw new Error("Forecast job identity does not match the selected dataset.");
  }
  if (input.context.vacancy_job_id !== (input.vacancyJob?.job_id ?? null)) {
    throw new Error("Vacancy job changed while preparing the audit report.");
  }
  if (input.context.detector_job_id !== (input.detectorJob?.job_id ?? null)) {
    throw new Error("Detector job changed while preparing the audit report.");
  }
  if (input.context.forecast_job_id !== (input.forecastJob?.job_id ?? null)) {
    throw new Error("Forecast job changed while preparing the audit report.");
  }
  if (input.historical.dataset_id !== null && input.historical.dataset_id !== datasetId) {
    throw new Error("Historical data identity does not match the selected dataset.");
  }
  if (input.vacancyJob?.result && input.vacancyJob.result.dataset_id !== datasetId) {
    throw new Error("Vacancy result identity does not match the selected dataset.");
  }
  if (input.detectorJob?.result && input.detectorJob.result.dataset_id !== datasetId) {
    throw new Error("Detector result identity does not match the selected dataset.");
  }
  if (input.forecastJob?.result && input.forecastJob.result.dataset_id !== datasetId) {
    throw new Error("Forecast result identity does not match the selected dataset.");
  }
  if (input.detectorJob?.result && input.detectorJob.result.detector.id !== input.detectorJob.detector?.id) {
    throw new Error("Detector result identity changed while preparing the audit report.");
  }
  if (input.detectorJob?.result && input.detectorJob.windows && JSON.stringify(input.detectorJob.windows) !== JSON.stringify(input.detectorJob.result.windows)) {
    throw new Error("Detector result windows do not match the current job.");
  }
  if (input.forecastJob?.result && (input.forecastJob.result.horizon !== input.forecastJob.horizon || input.forecastJob.result.origin_utc !== input.forecastJob.origin_utc)) {
    throw new Error("Forecast result scope does not match the current job.");
  }

  const sourceTimestamps: ReportSourceTimestamps = {
    summary: input.retrieved_at?.summary ?? null,
    historical: input.retrieved_at?.historical ?? input.historical.retrieved_at ?? null,
    vacancy: input.retrieved_at?.vacancy ?? null,
    detector: input.retrieved_at?.detector ?? null,
    forecast: input.retrieved_at?.forecast ?? null,
    preview: input.retrieved_at?.preview ?? null,
  };
  const historical = input.historical.status === "available"
    ? input.historical
    : makeUnavailableHistorical(datasetId, input.historical.errors, sourceTimestamps.historical ?? generatedAt);
  const vacancy = makeJobSnapshot("vacancy", input.vacancyJob, sourceTimestamps.vacancy ?? generatedAt);
  const detector = makeJobSnapshot("detector", input.detectorJob, sourceTimestamps.detector ?? generatedAt);
  const forecast = makeJobSnapshot("forecast", input.forecastJob, sourceTimestamps.forecast ?? generatedAt);
  const summary = input.summary ? cloneJson(input.summary) : null;
  const reportId = input.report_id ?? `audit-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reportPreview = input.reportPreview ?? null;
  const previewLimitations = reportPreview?.recommendations.flatMap((recommendation) => [
    ...(recommendation.economics.unavailable_reason ? [`Economics unavailable: ${recommendation.economics.unavailable_reason}`] : []),
    ...recommendation.evidence.coverage_limitations,
  ]) ?? [];
  const economics: ReportEconomicsSnapshot = reportPreview
    ? {
        status: "available",
        investment_cost: null,
        annual_savings: null,
        payback_months: null,
        roi_percent: null,
        reason: null,
        integration_boundary: "Preview values are server-derived; this frontend performs no ROI or payback calculation.",
        preview: cloneJson(reportPreview),
      }
    : {
        status: "unavailable",
        investment_cost: null,
        annual_savings: null,
        payback_months: null,
        roi_percent: null,
        reason: input.source_notes?.[0] ?? "No supported completed vacancy findings were available for report preview.",
        integration_boundary: "A future committed preview response may be added without browser-side economics calculations.",
        preview: null,
      };
  const comparison: ReportComparisonSnapshot = reportPreview
    ? {
        status: reportPreview.scenario_comparison.status,
        matched_run_evidence: false,
        reason: reportPreview.scenario_comparison.reason,
        integration_boundary: "Matched-scenario comparison remains unverified until external-input provenance is persisted and verified.",
        preview_status: reportPreview.scenario_comparison.status,
      }
    : {
        status: "unavailable",
        matched_run_evidence: false,
        reason: "Original/improved comparison requires matched-run evidence, which was not supplied.",
        integration_boundary: "No arbitrary dataset comparison is performed; a future matched-run integration may populate this boundary.",
        preview_status: null,
      };
  const snapshot: AuditReportSnapshot = {
    schema_version: "1.0.1",
    report_id: reportId,
    generated_at: generatedAt,
    retrieved_at: sourceTimestamps,
    context: cloneJson(input.context),
    dataset: {
      dataset_id: datasetId,
      run_id: input.dataset?.run_id ?? null,
      scenario_id: input.dataset?.scenario_id ?? null,
      interval_seconds: input.dataset?.interval_seconds ?? null,
      imported_utc: input.dataset?.imported_utc ?? null,
      building_name: null,
    },
    scope: {
      window: historical.window ? cloneJson(historical.window) : null,
      timezone: historical.timezone,
    },
    provenance: {
      synthetic: summary?.synthetic ?? null,
      synthetic_label: summary?.synthetic_label ?? null,
    },
    summary,
    historical: cloneJson(historical),
    vacancy: cloneJson(vacancy),
    detector: cloneJson(detector),
    forecast: cloneJson(forecast),
    economics,
    comparison,
    limitations: [...collectLimitations(summary, historical, vacancy, detector, forecast), ...previewLimitations, ...(input.source_notes ?? [])],
    source_notes: cloneJson(input.source_notes ?? []),
  };
  return deepFreeze(snapshot);
}

async function fetchTimeseriesForReport(
  origin: string,
  datasetId: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<{
  first: Awaited<ReturnType<typeof fetchHistoricalTimeseries>> | null;
  page: ReportPage<TimeseriesItem> | null;
}> {
  const pages: TimeseriesItem[][] = [];
  let first: Awaited<ReturnType<typeof fetchHistoricalTimeseries>> | null = null;
  let total = 0;
  let totalPages = 0;
  for (let page = 1; page <= AUDIT_REPORT_MAX_PAGES; page += 1) {
    const result = await fetchHistoricalTimeseries(
      origin,
      datasetId,
      { bucketSeconds: 3600, page, pageSize: AUDIT_REPORT_TIMESERIES_PAGE_SIZE },
      fetchImpl,
      undefined,
      signal,
    );
    if (first === null) {
      first = result;
      total = result.pagination.total;
      totalPages = result.pagination.total_pages;
    }
    pages.push(result.items);
    if (page >= totalPages || page >= AUDIT_REPORT_MAX_PAGES) break;
  }
  if (!first) return { first: null, page: null };
  return { first, page: mergeReportPages(pages, total, totalPages, AUDIT_REPORT_MAX_PAGES, AUDIT_REPORT_TIMESERIES_PAGE_SIZE) };
}

async function fetchRoomsForReport(
  origin: string,
  datasetId: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<{
  first: Awaited<ReturnType<typeof fetchHistoricalRooms>> | null;
  page: ReportPage<RoomAnalyticsItem> | null;
}> {
  const pages: RoomAnalyticsItem[][] = [];
  let first: Awaited<ReturnType<typeof fetchHistoricalRooms>> | null = null;
  let total = 0;
  let totalPages = 0;
  for (let page = 1; page <= AUDIT_REPORT_MAX_PAGES; page += 1) {
    const result = await fetchHistoricalRooms(
      origin,
      datasetId,
      { page, pageSize: AUDIT_REPORT_BREAKDOWN_PAGE_SIZE },
      fetchImpl,
      undefined,
      signal,
    );
    if (first === null) {
      first = result;
      total = result.pagination.total;
      totalPages = result.pagination.total_pages;
    }
    pages.push(result.items);
    if (page >= totalPages || page >= AUDIT_REPORT_MAX_PAGES) break;
  }
  if (!first) return { first: null, page: null };
  return { first, page: mergeReportPages(pages, total, totalPages, AUDIT_REPORT_MAX_PAGES, AUDIT_REPORT_BREAKDOWN_PAGE_SIZE) };
}

async function fetchDevicesForReport(
  origin: string,
  datasetId: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<{
  first: Awaited<ReturnType<typeof fetchHistoricalDevices>> | null;
  page: ReportPage<DeviceAnalyticsItem> | null;
}> {
  const pages: DeviceAnalyticsItem[][] = [];
  let first: Awaited<ReturnType<typeof fetchHistoricalDevices>> | null = null;
  let total = 0;
  let totalPages = 0;
  for (let page = 1; page <= AUDIT_REPORT_MAX_PAGES; page += 1) {
    const result = await fetchHistoricalDevices(
      origin,
      datasetId,
      { page, pageSize: AUDIT_REPORT_BREAKDOWN_PAGE_SIZE },
      fetchImpl,
      undefined,
      signal,
    );
    if (first === null) {
      first = result;
      total = result.pagination.total;
      totalPages = result.pagination.total_pages;
    }
    pages.push(result.items);
    if (page >= totalPages || page >= AUDIT_REPORT_MAX_PAGES) break;
  }
  if (!first) return { first: null, page: null };
  return { first, page: mergeReportPages(pages, total, totalPages, AUDIT_REPORT_MAX_PAGES, AUDIT_REPORT_BREAKDOWN_PAGE_SIZE) };
}

export async function fetchReportHistorical(
  origin: string,
  datasetId: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<ReportHistoricalData> {
  const errors: string[] = [];
  const message = (error: unknown, label: string) =>
    error instanceof ApiError ? error.message : `${label}: ${error instanceof Error ? error.message : "request failed"}`;
  const [timeseriesResult, roomsResult, devicesResult, weekdaysResult] = await Promise.allSettled([
    fetchTimeseriesForReport(origin, datasetId, fetchImpl, signal),
    fetchRoomsForReport(origin, datasetId, fetchImpl, signal),
    fetchDevicesForReport(origin, datasetId, fetchImpl, signal),
    fetchHistoricalWeekdays(origin, datasetId, {}, fetchImpl, undefined, signal),
  ]);
  const timeseries = timeseriesResult.status === "fulfilled" ? timeseriesResult.value : null;
  const rooms = roomsResult.status === "fulfilled" ? roomsResult.value : null;
  const devices = devicesResult.status === "fulfilled" ? devicesResult.value : null;
  const weekdays = weekdaysResult.status === "fulfilled" ? weekdaysResult.value : null;
  if (timeseriesResult.status === "rejected") errors.push(message(timeseriesResult.reason, "Timeseries"));
  if (roomsResult.status === "rejected") errors.push(message(roomsResult.reason, "Rooms"));
  if (devicesResult.status === "rejected") errors.push(message(devicesResult.reason, "Devices"));
  if (weekdaysResult.status === "rejected") errors.push(message(weekdaysResult.reason, "Weekdays"));
  const first = timeseries?.first ?? null;
  const available = Boolean(timeseries || rooms || devices || weekdays);
  return {
    dataset_id: datasetId,
    status: available ? "available" : "unavailable",
    window: first?.window ?? rooms?.first?.window ?? devices?.first?.window ?? null,
    timezone: first?.timezone ?? weekdays?.timezone ?? null,
    bucket_seconds: first?.bucket_seconds ?? null,
    full_period_observed_energy_kwh: first?.full_period_observed_energy_kwh ?? null,
    full_period_observed_cost_inr: first?.full_period_observed_cost_inr ?? null,
    timeseries: timeseries?.page ?? null,
    rooms: rooms?.page ?? null,
    devices: devices?.page ?? null,
    weekdays: weekdays ?? null,
    errors,
    retrieved_at: new Date().toISOString(),
    query: {
      scope: "office",
      from_utc: null,
      to_utc: null,
      timeseries_bucket_seconds: 3600,
      timeseries_page_size: AUDIT_REPORT_TIMESERIES_PAGE_SIZE,
      breakdown_page_size: AUDIT_REPORT_BREAKDOWN_PAGE_SIZE,
      max_pages: AUDIT_REPORT_MAX_PAGES,
    },
  };
}

export function reportJobResult<T extends JobResult | DetectorResult | ForecastResult>(
  job: ReportJobSnapshot,
  predicate: (result: JobResult | DetectorResult | ForecastResult) => result is T,
): T | null {
  if (!job.result) return null;
  return predicate(job.result) ? job.result : null;
}

export function isReportExcerpt(page: ReportPage<unknown> | null): boolean {
  return Boolean(page?.excerpt);
}

export function isReportContextCurrent(
  snapshot: AuditReportSnapshot,
  context: AuditReportContext,
): boolean {
  return sameReportContext(snapshot.context, context);
}

export function canPrintAuditReport(
  snapshot: AuditReportSnapshot,
  context: AuditReportContext,
): boolean {
  return isReportContextCurrent(snapshot, context);
}

export function reportStatusText(status: ReportSectionStatus): string {
  if (status === "available") return "Available";
  if (status === "not_run") return "Not run";
  if (status === "in_progress") return "In progress";
  if (status === "failed") return "Failed";
  return "Unavailable";
}

export function reportSummaryValue(value: number | null, unit: string): string {
  return value === null ? `Not supplied (${unit})` : `${value} ${unit}`;
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
