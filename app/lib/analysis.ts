// Analysis-job adapter (P019 / A4, Agent A — OpenCode).
// Shapes follow the committed P015 public API (backend 32d88be,
// AUDITOR_API_EXAMPLES.md + src/routes/analysis.ts at 49b61fc).
// The frontend calls auditor-backend only, never Python directly.
// Framework-agnostic and dependency-free (type-strippable syntax only).

import {
  ApiError,
  type FetchLike,
} from "./auditor-api.ts";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export function isTerminalStatus(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}

export interface JobRange {
  start_utc: string;
  end_utc: string;
}

export interface AnalysisTotals {
  dataset_energy_kwh: number;
  avoidable_energy_kwh: number;
  unknown_avoidable_findings: number;
  tariff_inr_per_kwh: number | null;
  dataset_cost_inr: number | null;
  avoidable_cost_inr: number | null;
}

export interface FindingValue {
  value: number;
  unit: string;
}

export interface Finding {
  finding_id: string;
  finding_type: string;
  room_id?: string;
  device_id?: string;
  window_start_utc?: string;
  window_end_utc?: string;
  observed?: FindingValue;
  expected?: FindingValue;
  method: string;
  suggested_action?: string;
  avoidable_energy_kwh?: number;
  avoidable_cost_inr?: number | null;
  assumptions?: string;
  resolution_limit?: string;
  evidence?: unknown;
}

export interface JobWarning {
  code: string;
  message: string;
}

export interface ExcludedDevice {
  device_id: string;
  reason: string;
}

export interface JobResult {
  dataset_id: string;
  run_id?: string;
  synthetic?: boolean | null;
  synthetic_label?: string | null;
  method: string;
  method_version: string;
  model_used?: boolean;
  requested_range?: JobRange | null;
  coverage?: Record<string, unknown> | null;
  warnings: JobWarning[];
  excluded_devices: ExcludedDevice[];
  totals: AnalysisTotals;
}

export interface AnalysisJob {
  job_id: string;
  dataset_id: string;
  status: JobStatus;
  method?: string;
  method_version?: string;
  requested_range?: JobRange | null;
  actual_coverage?: JobRange | null;
  progress?: { completed_batches: number; total_batches: number };
  created_at?: string;
  completed_at?: string | null;
  error?: { code: string; message: string } | null;
  result?: JobResult | null;
  findings?: Finding[];
  findings_pagination?: { page: number; page_size: number; total: number };
}

export const JOB_TIMEOUT_MS = 15000;
export const JOB_POLL_INTERVAL_MS = 2000;
export const FINDINGS_PAGE_SIZE = 100;
export const FINDINGS_MAX_PAGE_SIZE = 500;

/** Human-readable finding type. Unknown types fall back to spaced words. */
export function readableFindingType(findingType: string): string {
  if (findingType === "vacant_but_on") return "Vacant but on";
  return findingType.replace(/_/g, " ");
}

/** 1-based display window for "Showing a–b of N". Never implies more. */
export function pageWindow(
  total: number,
  page: number,
  pageSize: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(page * pageSize, total) };
}

/** Render a UTC window with the building timezone alongside (no invention). */
export function formatWindow(
  startUtc: string | undefined,
  endUtc: string | undefined,
): string | null {
  if (!startUtc || !endUtc) return null;
  const fmt = (iso: string): string => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const local = new Date(t).toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    });
    return `${iso} (UTC) = ${local} (Asia/Kolkata)`;
  };
  return `${fmt(startUtc)} → ${fmt(endUtc)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function reqString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function optString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" ? v : undefined;
}

function reqFinite(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function optFinite(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isJobStatus(v: unknown): v is JobStatus {
  return (
    v === "queued" || v === "running" || v === "completed" || v === "failed"
  );
}

function parseRange(v: unknown): JobRange | null {
  if (!isRecord(v)) return null;
  const start_utc = reqString(v, "start_utc");
  const end_utc = reqString(v, "end_utc");
  if (!start_utc || !end_utc) return null;
  return { start_utc, end_utc };
}

function parseQuantity(v: unknown): FindingValue | null {
  if (!isRecord(v)) return null;
  const value = reqFinite(v, "value");
  const unit = reqString(v, "unit");
  if (value === null || !unit) return null;
  return { value, unit };
}

export function parseFinding(v: unknown): Finding | null {
  if (!isRecord(v)) return null;
  const finding_id = reqString(v, "finding_id");
  const finding_type = reqString(v, "finding_type");
  const method = reqString(v, "method");
  if (!finding_id || !finding_type || !method) return null;
  const f: Finding = { finding_id, finding_type, method };
  const room_id = optString(v, "room_id");
  if (room_id !== undefined) f.room_id = room_id;
  const device_id = optString(v, "device_id");
  if (device_id !== undefined) f.device_id = device_id;
  const window_start_utc = optString(v, "window_start_utc");
  if (window_start_utc !== undefined) f.window_start_utc = window_start_utc;
  const window_end_utc = optString(v, "window_end_utc");
  if (window_end_utc !== undefined) f.window_end_utc = window_end_utc;
  if (v.observed !== undefined) {
    const observed = parseQuantity(v.observed);
    if (!observed) return null;
    f.observed = observed;
  }
  if (v.expected !== undefined) {
    const expected = parseQuantity(v.expected);
    if (!expected) return null;
    f.expected = expected;
  }
  const suggested_action = optString(v, "suggested_action");
  if (suggested_action !== undefined) f.suggested_action = suggested_action;
  if (v.avoidable_energy_kwh !== undefined) {
    const ae = reqFinite(v as Record<string, unknown>, "avoidable_energy_kwh");
    if (ae === null) return null;
    f.avoidable_energy_kwh = ae;
  }
  if (v.avoidable_cost_inr !== undefined && v.avoidable_cost_inr !== null) {
    const ac = reqFinite(v as Record<string, unknown>, "avoidable_cost_inr");
    if (ac === null) return null;
    f.avoidable_cost_inr = ac;
  }
  const assumptions = optString(v, "assumptions");
  if (assumptions !== undefined) f.assumptions = assumptions;
  const resolution_limit = optString(v, "resolution_limit");
  if (resolution_limit !== undefined) f.resolution_limit = resolution_limit;
  if (v.evidence !== undefined) f.evidence = v.evidence;
  return f;
}

function parseWarning(v: unknown): JobWarning | null {
  if (!isRecord(v)) return null;
  const code = reqString(v, "code");
  const message = reqString(v, "message");
  if (!code || !message) return null;
  return { code, message };
}

function parseExcluded(v: unknown): ExcludedDevice | null {
  if (!isRecord(v)) return null;
  const device_id = reqString(v, "device_id");
  const reason = reqString(v, "reason");
  if (!device_id || !reason) return null;
  return { device_id, reason };
}

function parseTotals(v: unknown): AnalysisTotals | null {
  if (!isRecord(v)) return null;
  const dataset_energy_kwh = reqFinite(v, "dataset_energy_kwh");
  const avoidable_energy_kwh = reqFinite(v, "avoidable_energy_kwh");
  const unknownRaw = v.unknown_avoidable_findings;
  if (
    dataset_energy_kwh === null ||
    avoidable_energy_kwh === null ||
    typeof unknownRaw !== "number" ||
    !Number.isInteger(unknownRaw) ||
    unknownRaw < 0
  ) {
    return null;
  }
  return {
    dataset_energy_kwh,
    avoidable_energy_kwh,
    unknown_avoidable_findings: unknownRaw,
    tariff_inr_per_kwh: optFinite(v, "tariff_inr_per_kwh"),
    dataset_cost_inr: optFinite(v, "dataset_cost_inr"),
    avoidable_cost_inr: optFinite(v, "avoidable_cost_inr"),
  };
}

function parseJobResult(v: unknown): JobResult | null {
  if (!isRecord(v)) return null;
  const dataset_id = reqString(v, "dataset_id");
  const method = reqString(v, "method");
  const method_version = reqString(v, "method_version");
  const totals = parseTotals(v.totals);
  if (!dataset_id || !method || !method_version || !totals) return null;
  const warnings: JobWarning[] = [];
  if (v.warnings !== undefined) {
    if (!Array.isArray(v.warnings)) return null;
    for (const w of v.warnings) {
      const warning = parseWarning(w);
      if (!warning) return null;
      warnings.push(warning);
    }
  }
  const excluded_devices: ExcludedDevice[] = [];
  if (v.excluded_devices !== undefined) {
    if (!Array.isArray(v.excluded_devices)) return null;
    for (const e of v.excluded_devices) {
      const excluded = parseExcluded(e);
      if (!excluded) return null;
      excluded_devices.push(excluded);
    }
  }
  const result: JobResult = {
    dataset_id,
    method,
    method_version,
    warnings,
    excluded_devices,
    totals,
  };
  const run_id = optString(v, "run_id");
  if (run_id !== undefined) result.run_id = run_id;
  if (v.synthetic === true) result.synthetic = true;
  else if (v.synthetic === false) result.synthetic = false;
  const synthetic_label = optString(v, "synthetic_label");
  if (synthetic_label !== undefined) result.synthetic_label = synthetic_label;
  if (typeof v.model_used === "boolean") result.model_used = v.model_used;
  if (v.requested_range !== undefined && v.requested_range !== null) {
    const range = parseRange(v.requested_range);
    if (!range) return null;
    result.requested_range = range;
  }
  if (v.coverage !== undefined && v.coverage !== null) {
    if (!isRecord(v.coverage)) return null;
    result.coverage = v.coverage;
  }
  return result;
}

/**
 * Validate a GET /api/v1/analysis/jobs/:id body (bare or { data }).
 * Findings ride along only on completed jobs; dataset/job mismatch is
 * rejected by the caller comparing job.dataset_id.
 */
export function parseAnalysisJob(json: unknown): AnalysisJob | null {
  const o = isRecord(json) && isRecord(json.data)
    ? (json.data as Record<string, unknown>)
    : isRecord(json)
      ? json
      : null;
  if (!o) return null;
  const job_id = reqString(o, "job_id");
  const dataset_id = reqString(o, "dataset_id");
  if (!job_id || !dataset_id || !isJobStatus(o.status)) return null;
  const job: AnalysisJob = { job_id, dataset_id, status: o.status };
  const method = optString(o, "method");
  if (method !== undefined) job.method = method;
  const method_version = optString(o, "method_version");
  if (method_version !== undefined) job.method_version = method_version;
  if (o.requested_range !== undefined && o.requested_range !== null) {
    const range = parseRange(o.requested_range);
    if (!range) return null;
    job.requested_range = range;
  }
  if (o.actual_coverage !== undefined && o.actual_coverage !== null) {
    const range = parseRange(o.actual_coverage);
    if (!range) return null;
    job.actual_coverage = range;
  }
  if (o.progress !== undefined) {
    if (!isRecord(o.progress)) return null;
    const completed = o.progress.completed_batches;
    const total = o.progress.total_batches;
    if (
      typeof completed !== "number" ||
      !Number.isInteger(completed) ||
      typeof total !== "number" ||
      !Number.isInteger(total)
    ) {
      return null;
    }
    job.progress = { completed_batches: completed, total_batches: total };
  }
  const created_at = optString(o, "created_at");
  if (created_at !== undefined) job.created_at = created_at;
  if (o.completed_at !== undefined && o.completed_at !== null) {
    const completed_at = reqString(o, "completed_at");
    if (!completed_at) return null;
    job.completed_at = completed_at;
  }
  if (o.error !== undefined && o.error !== null) {
    if (!isRecord(o.error)) return null;
    const code = reqString(o.error, "code");
    const message = reqString(o.error, "message");
    if (!code || !message) return null;
    job.error = { code, message };
  }
  if (o.result !== undefined && o.result !== null) {
    const result = parseJobResult(o.result);
    if (!result) return null;
    job.result = result;
  }
  if (o.findings !== undefined) {
    if (!Array.isArray(o.findings)) return null;
    const findings: Finding[] = [];
    for (const f of o.findings) {
      const finding = parseFinding(f);
      if (!finding) return null;
      findings.push(finding);
    }
    job.findings = findings;
  }
  if (o.findings_pagination !== undefined) {
    if (!isRecord(o.findings_pagination)) return null;
    const page = o.findings_pagination.page;
    const page_size = o.findings_pagination.page_size;
    const total = o.findings_pagination.total;
    if (
      typeof page !== "number" ||
      typeof page_size !== "number" ||
      typeof total !== "number"
    ) {
      return null;
    }
    job.findings_pagination = { page, page_size, total };
  }
  return job;
}

export function parseJobSubmit(json: unknown): {
  job_id: string;
  status: JobStatus;
} | null {
  const o = isRecord(json) && isRecord(json.data)
    ? (json.data as Record<string, unknown>)
    : isRecord(json)
      ? json
      : null;
  if (!o) return null;
  const job_id = reqString(o, "job_id");
  if (!job_id || !isJobStatus(o.status)) return null;
  return { job_id, status: o.status };
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
    const res = await fetchImpl(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail: { code?: string; message?: string; field?: string } = {};
      try {
        const body = await res.json();
        const err = isRecord(body) && isRecord(body.error) ? body.error : {};
        if (isRecord(err)) {
          detail = {
            code: typeof err.code === "string" ? err.code : undefined,
            message: typeof err.message === "string" ? err.message : undefined,
            field: typeof err.field === "string" ? err.field : undefined,
          };
        }
      } catch {
        // fall through to status-based message
      }
      const err = new ApiError(
        detail.message ?? `${fallback} (HTTP ${res.status}).`,
        res.status,
        detail.code ?? null,
      );
      if (detail.field !== undefined) err.field = detail.field;
      throw err;
    }
    try {
      return await res.json();
    } catch {
      throw new ApiError(
        `${fallback}: response was not valid JSON.`,
        res.status,
        "BAD_RESPONSE",
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new ApiError(
      aborted
        ? `${fallback}: timed out or aborted after ${timeoutMs} ms.`
        : err instanceof Error
          ? `${fallback}: ${err.message}`
          : `${fallback}: unknown error.`,
      null,
      aborted ? "TIMEOUT" : "UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Create an analysis job for a dataset. 202 → { job_id, status }. */
export async function submitAnalysisJob(
  origin: string,
  datasetId: string,
  fetchImpl: FetchLike,
  timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<{ job_id: string; status: JobStatus }> {
  const json = await requestJson(
    `${origin}/api/v1/analysis/jobs`,
    fetchImpl,
    timeoutMs,
    "Analysis submission failed",
    { method: "POST", body: JSON.stringify({ dataset_id: datasetId }) },
  );
  const parsed = parseJobSubmit(json);
  if (!parsed) {
    throw new ApiError(
      "Analysis submission answered 2xx but the body was malformed.",
      null,
      "BAD_RESPONSE",
    );
  }
  return parsed;
}

/** Fetch one job page. Findings ride along only on completed jobs. */
export async function getAnalysisJob(
  origin: string,
  jobId: string,
  fetchImpl: FetchLike,
  page = 1,
  pageSize: number = FINDINGS_PAGE_SIZE,
  timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<AnalysisJob> {
  const json = await requestJson(
    `${origin}/api/v1/analysis/jobs/${encodeURIComponent(jobId)}?page=${page}&page_size=${pageSize}`,
    fetchImpl,
    timeoutMs,
    "Analysis status request failed",
  );
  const parsed = parseAnalysisJob(json);
  if (!parsed || parsed.job_id !== jobId) {
    throw new ApiError(
      "Analysis status answered 2xx but the body was malformed.",
      null,
      "BAD_RESPONSE",
    );
  }
  return parsed;
}
