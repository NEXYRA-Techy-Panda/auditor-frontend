// Typed auditor-backend adapter (P007 / A1-UI, Agent A — OpenCode).
// Contract v1.0.1, read-only. Framework-agnostic and dependency-free so the
// pure functions run under node:test (type-strippable syntax only: no enums,
// namespaces, or parameter properties).
//
// API assumptions (exact questions for Codex integration review are listed in
// docs/P007_A1_UI_EVIDENCE.md):
// - Success bodies are accepted bare OR wrapped in { data } (both parsed).
// - Rejected imports surface report.errors; unknown extra fields are ignored.
// - An already-imported acknowledgement is honoured only when the body carries
//   already_imported:true or status:"already_imported"; otherwise only the
//   documented fields are displayed.

export interface ValidationIssue {
  message: string;
  field?: string;
  row?: number;
}

export interface ImportReport {
  errors: ValidationIssue[];
  warnings: string[];
  duplicates_deduped: number;
  /** True when the backend truncated the issue list (P006 caps at 100). */
  additional_errors: boolean;
}

export interface ImportResult {
  dataset_id: string;
  run_id: string;
  status: string;
  report: ImportReport;
  alreadyImported: boolean;
}

export interface DatasetItem {
  dataset_id: string;
  run_id: string;
  scenario_id?: string;
  interval_seconds?: number;
  imported_utc?: string;
}

export interface DatasetSummary {
  dataset_id: string;
  energy_kwh: number | null;
  cost_inr: number | null;
  tariff_inr_per_kwh: number | null;
  coverage: {
    start_utc: string;
    end_utc: string;
    device_intervals: number;
    room_intervals: number;
  } | null;
  /** Null when the response carries no gap information (not "no gaps"). */
  gaps: unknown[] | null;
  /**
   * True/false only when the backend explicitly supplies the flag. Absent
   * means unknown — never infer that imported data is synthetic.
   */
  synthetic: boolean | null;
  /** Optional P023 provenance label; never used to infer measured data. */
  synthetic_label?: string | null;
  /** P023's explicit gap-assessment state; an empty gaps array is not "no gaps". */
  gap_assessment?: {
    status: string;
    message: string;
  } | null;
}

/** HTTP or transport failure. Never fabricated as success. */
export class ApiError extends Error {
  status: number | null;
  code: string | null;
  /** Single field/row reference when the backend supplied one. */
  field?: string;
  row?: number;
  /** Raw server `details` payload when the backend supplied one. */
  details?: unknown;
  /** Parsed import report, attached to validation rejections. */
  report?: ImportReport;
  /** Dataset the rejection refers to, when known. */
  datasetId?: string;

  constructor(
    message: string,
    status: number | null,
    code: string | null = null,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Month-size imports need a generous bound; the 8 s health timeout is wrong here. */
export const UPLOAD_TIMEOUT_MS = 120000;
export const API_TIMEOUT_MS = 8000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** P006 uses the success envelope on every route: { data, meta }. Bare
 * bodies and alternate list keys are rejected so backend drift is loud. */
function requireData(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;
  if (!isRecord(json.data)) return null;
  return json.data;
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

function parseIssue(v: unknown): ValidationIssue | null {
  // P006 issues are objects with message + field and optional row.
  // Anything else is malformed — never coerced.
  if (!isRecord(v)) return null;
  const message = reqString(v, "message");
  if (!message) return null;
  const issue: ValidationIssue = { message };
  const field = optString(v, "field");
  if (field !== undefined) issue.field = field;
  const row = v.row;
  if (typeof row === "number" && Number.isInteger(row)) issue.row = row;
  return issue;
}

function parseReport(v: unknown): ImportReport | null {
  if (!isRecord(v)) return null;
  if (!Array.isArray(v.errors) || !Array.isArray(v.warnings)) return null;
  const errors: ValidationIssue[] = [];
  for (const e of v.errors) {
    const issue = parseIssue(e);
    if (!issue) return null;
    errors.push(issue);
  }
  if (!v.warnings.every((w) => typeof w === "string")) return null;
  const dup = v.duplicates_deduped;
  if (typeof dup !== "number" || !Number.isInteger(dup) || dup < 0) return null;
  const additional = v.additional_errors;
  if (typeof additional !== "boolean") return null;
  return {
    errors,
    warnings: v.warnings as string[],
    duplicates_deduped: dup,
    additional_errors: additional,
  };
}

export function parseImportResult(json: unknown): ImportResult | null {
  const o = requireData(json);
  if (!o) return null;
  const dataset_id = reqString(o, "dataset_id");
  const run_id = reqString(o, "run_id");
  const status = reqString(o, "status");
  if (!dataset_id || !run_id || !status) return null;
  const report = parseReport(o.report);
  if (!report) return null;
  const alreadyImported =
    o.already_imported === true || status === "already_imported";
  return { dataset_id, run_id, status, report, alreadyImported };
}

function parseDatasetItem(v: unknown): DatasetItem | null {
  if (!isRecord(v)) return null;
  const dataset_id = reqString(v, "dataset_id");
  const run_id = reqString(v, "run_id");
  if (!dataset_id || !run_id) return null;
  const item: DatasetItem = { dataset_id, run_id };
  const scenario = optString(v, "scenario_id");
  if (scenario !== undefined) item.scenario_id = scenario;
  const interval = v.interval_seconds;
  if (typeof interval === "number" && Number.isInteger(interval)) {
    item.interval_seconds = interval;
  }
  const imported = optString(v, "imported_utc");
  if (imported !== undefined) item.imported_utc = imported;
  return item;
}

export function parseDatasetList(json: unknown): DatasetItem[] | null {
  // P006 returns the array under { data } with no pagination. Bare arrays
  // and alternate keys are rejected so backend drift is loud.
  if (!isRecord(json) || !Array.isArray(json.data)) return null;
  const out: DatasetItem[] = [];
  for (const v of json.data) {
    const item = parseDatasetItem(v);
    if (!item) return null;
    out.push(item);
  }
  return out;
}

function parseCoverage(v: unknown): DatasetSummary["coverage"] {
  if (!isRecord(v)) return null;
  const start_utc = reqString(v, "start_utc");
  const end_utc = reqString(v, "end_utc");
  const device_intervals = v.device_intervals;
  const room_intervals = v.room_intervals;
  if (
    !start_utc ||
    !end_utc ||
    typeof device_intervals !== "number" ||
    !Number.isInteger(device_intervals) ||
    device_intervals < 0 ||
    typeof room_intervals !== "number" ||
    !Number.isInteger(room_intervals) ||
    room_intervals < 0
  ) {
    return null;
  }
  return { start_utc, end_utc, device_intervals, room_intervals };
}

function parseGapAssessment(value: unknown): DatasetSummary["gap_assessment"] {
  if (!isRecord(value)) return null;
  const status = reqString(value, "status");
  const message = reqString(value, "message");
  return status && message ? { status, message } : null;
}

export function parseSummary(json: unknown): DatasetSummary | null {
  const o = requireData(json);
  if (!o) return null;
  const dataset_id = reqString(o, "dataset_id");
  const energy_kwh =
    o.energy_kwh === null
      ? null
      : typeof o.energy_kwh === "number" && Number.isFinite(o.energy_kwh)
        ? o.energy_kwh
        : undefined;
  if (!dataset_id || energy_kwh === undefined) return null;
  const gaps = o.gaps;
  const syntheticRaw = o.synthetic;
  const syntheticLabel =
    o.synthetic_label === null
      ? null
      : typeof o.synthetic_label === "string"
        ? o.synthetic_label
        : null;
  return {
    dataset_id,
    energy_kwh,
    cost_inr: optFinite(o, "cost_inr"),
    tariff_inr_per_kwh: optFinite(o, "tariff_inr_per_kwh"),
    coverage: parseCoverage(o.coverage),
    gaps: Array.isArray(gaps) ? gaps : null,
    synthetic: syntheticRaw === true ? true : syntheticRaw === false ? false : null,
    synthetic_label: syntheticLabel,
    gap_assessment: parseGapAssessment(o.gap_assessment),
  };
}

/**
 * Tariff input validation. Blank is rejected (never silently zero);
 * "0" is a valid explicit zero; negatives and non-numbers are rejected.
 */
export function parseTariffInput(
  text: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Enter an electricity rate — blank is not zero." };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `"${trimmed}" is not a number.` };
  }
  if (value < 0) {
    return { ok: false, error: "The rate cannot be negative." };
  }
  return { ok: true, value };
}

/**
 * Monotonic request identity so a slower response for an old selection never
 * replaces the current one. The component keeps the tracker in a ref, takes
 * an id before awaiting, and applies results only while isCurrent(id).
 */
export function createRequestTracker(): {
  issue: () => number;
  isCurrent: (id: number) => boolean;
} {
  let latest = 0;
  return {
    issue: () => {
      latest += 1;
      return latest;
    },
    isCurrent: (id: number) => id === latest,
  };
}

/**
 * Render a structured gap value meaningfully — never "[object Object]".
 * Objects surface their known identifying fields; anything else falls back
 * to JSON text.
 */
export function describeGap(gap: unknown): string {
  if (typeof gap === "string") return gap;
  if (typeof gap === "number" || typeof gap === "boolean") return String(gap);
  if (gap !== null && typeof gap === "object" && !Array.isArray(gap)) {
    const o = gap as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of [
      "room_id",
      "device_id",
      "start_utc",
      "end_utc",
      "interval_start_utc",
      "interval_end_utc",
      "kind",
      "reason",
      "message",
    ]) {
      if (o[key] !== undefined) parts.push(`${key}: ${String(o[key])}`);
    }
    if (parts.length > 0) return parts.join(", ");
  }
  try {
    return JSON.stringify(gap) ?? "unrepresentable value";
  } catch {
    return "unrepresentable value";
  }
}

/**
 * Post-upload auto-select guard (monotonic revision, no wall clock). The
 * screen bumps the revision on every deliberate selection change (manual
 * select or applied auto-select). An upload captures the revision at submit;
 * its completion auto-selects only when nothing newer happened.
 * Same-millisecond actions and wall-clock jumps cannot misorder this.
 */
export function createSelectionRevision(): {
  current: () => number;
  manualSelect: () => void;
  autoSelect: () => void;
  shouldAutoSelect: (submittedRev: number) => boolean;
} {
  let rev = 0;
  return {
    current: () => rev,
    manualSelect: () => {
      rev += 1;
    },
    autoSelect: () => {
      rev += 1;
    },
    shouldAutoSelect: (submittedRev: number) => submittedRev === rev,
  };
}

/**
 * Tariff-completion guard. A save issued for dataset A applies its reload
 * only while A is still selected; otherwise the caller must leave B's form
 * and summary untouched and say so.
 */
export function shouldApplyTariffResult(
  submittedDatasetId: string,
  currentDatasetId: string | null,
): boolean {
  return currentDatasetId !== null && submittedDatasetId === currentDatasetId;
}

/**
 * Fixed print snapshot. Built only from one coherent fetched summary (plus
 * optional list metadata); every field is copied, so later responses can
 * never mutate the preview.
 */
export interface ReportSnapshot {
  datasetId: string;
  runId: string | null;
  scenarioId: string | null;
  intervalSeconds: number | null;
  importedUtc: string | null;
  energyKwh: number | null;
  costInr: number | null;
  tariffInrPerKwh: number | null;
  coverage: {
    start_utc: string;
    end_utc: string;
    device_intervals: number;
    room_intervals: number;
  } | null;
  gaps: unknown[] | null;
  synthetic: boolean | null;
  synthetic_label?: string | null;
  gap_assessment?: {
    status: string;
    message: string;
  } | null;
  fetchedAtIso: string;
  generatedAtIso: string;
}

export interface ReportEligibility {
  eligible: boolean;
  /** Human reason shown when printing is unavailable; null when eligible. */
  reason: string | null;
}

/**
 * Decide whether the print action may run. Printing requires a current,
 * matching, settled summary — never a previous dataset's values, a loading
 * state, or a pending tariff mutation.
 */
export function printEligibility(args: {
  selectedId: string | null;
  summary: DatasetSummary | null;
  loading: boolean;
  saving: boolean;
  /** A scoped, unresolved summary-load failure — retained data is stale. */
  hasError: boolean;
}): ReportEligibility {
  if (!args.selectedId) {
    return { eligible: false, reason: "Select a dataset before printing." };
  }
  if (!args.summary) {
    return { eligible: false, reason: "No summary is loaded yet." };
  }
  if (args.summary.dataset_id !== args.selectedId) {
    return {
      eligible: false,
      reason: `The loaded summary belongs to ${args.summary.dataset_id}, not the selected ${args.selectedId}. Wait for the current load to finish.`,
    };
  }
  if (args.loading) {
    return { eligible: false, reason: "The summary is still loading." };
  }
  if (args.saving) {
    return {
      eligible: false,
      reason: "A tariff change is saving — print after it confirms.",
    };
  }
  if (args.hasError) {
    return {
      eligible: false,
      reason:
        "The last summary refresh failed — reload successfully before printing.",
    };
  }
  return { eligible: true, reason: null };
}

export function buildReportSnapshot(args: {
  selectedId: string;
  summary: DatasetSummary;
  dataset?: { run_id?: string; scenario_id?: string; interval_seconds?: number; imported_utc?: string } | null;
  loading: boolean;
  saving: boolean;
  hasError: boolean;
  fetchedAtIso: string;
  generatedAtIso: string;
}): ReportSnapshot | null {
  const check = printEligibility({
    selectedId: args.selectedId,
    summary: args.summary,
    loading: args.loading,
    saving: args.saving,
    hasError: args.hasError,
  });
  if (!check.eligible) return null;
  if (args.summary.dataset_id !== args.selectedId) return null;
  const coverage = args.summary.coverage
    ? { ...args.summary.coverage }
    : null;
  return {
    datasetId: args.summary.dataset_id,
    runId: args.dataset?.run_id ?? null,
    scenarioId: args.dataset?.scenario_id ?? null,
    intervalSeconds: args.dataset?.interval_seconds ?? null,
    importedUtc: args.dataset?.imported_utc ?? null,
    energyKwh: args.summary.energy_kwh,
    costInr: args.summary.cost_inr,
    tariffInrPerKwh: args.summary.tariff_inr_per_kwh,
    coverage,
    gaps: args.summary.gaps ? [...args.summary.gaps] : null,
    synthetic: args.summary.synthetic,
    synthetic_label: args.summary.synthetic_label ?? null,
    gap_assessment: args.summary.gap_assessment ?? null,
    fetchedAtIso: args.fetchedAtIso,
    generatedAtIso: args.generatedAtIso,
  };
}

async function readJsonError(
  res: { status: number; json: () => Promise<unknown> },
): Promise<{ code?: string; message?: string; field?: string; row?: number; details?: unknown }> {
  try {
    const body = await res.json();
    if (isRecord(body)) {
      const err = isRecord(body.error) ? body.error : body;
      const row = err.row;
      return {
        code: typeof err.code === "string" ? err.code : undefined,
        message: typeof err.message === "string" ? err.message : undefined,
        field: typeof err.field === "string" ? err.field : undefined,
        row: typeof row === "number" && Number.isInteger(row) ? row : undefined,
        details: err.details !== undefined ? err.details : undefined,
      };
    }
  } catch {
    // fall through to the status-based message
  }
  return {};
}

function httpError(
  status: number,
  fallback: string,
  detail: { code?: string; message?: string; field?: string; row?: number; details?: unknown },
): ApiError {
  if (status === 413) {
    return new ApiError(
      detail.message ??
        "File too large for the server to accept (HTTP 413). Try a smaller time range.",
      status,
      detail.code ?? "REQUEST_TOO_LARGE",
      detail.details,
    );
  }
  if (status === 409) {
    return new ApiError(
      detail.message ??
        "The server reported a conflict (HTTP 409) — possibly an already-imported dataset.",
      status,
      detail.code ?? "CONFLICT",
      detail.details,
    );
  }
  if (status === 404) {
    return new ApiError(
      detail.message ?? "Not found (HTTP 404).",
      status,
      detail.code ?? "NOT_FOUND",
      detail.details,
    );
  }
  if (status === 422 || status === 400) {
    const err = new ApiError(
      detail.message ?? `${fallback} (HTTP ${status}).`,
      status,
      detail.code ?? "VALIDATION_ERROR",
      detail.details,
    );
    if (detail.field !== undefined) err.field = detail.field;
    if (detail.row !== undefined) err.row = detail.row;
    return err;
  }
  return new ApiError(
    detail.message ?? `${fallback} (HTTP ${status}).`,
    status,
    detail.code ?? null,
    detail.details,
  );
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
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw httpError(res.status, fallback, await readJsonError(res));
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

/**
 * Upload one dataset file. Sends FormData with field name "file" and lets the
 * browser supply the multipart boundary (never set Content-Type manually).
 * Rejected imports throw an ApiError carrying the server report in `report`.
 */
export async function uploadDataset(
  origin: string,
  file: Blob,
  filename: string,
  fetchImpl: FetchLike,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file, filename);
  let json: unknown;
  try {
    json = await requestJson(
      `${origin}/api/v1/imports`,
      fetchImpl,
      timeoutMs,
      "Upload failed",
      { method: "POST", body: form },
    );
  } catch (err) {
    if (err instanceof ApiError && err.code === "TIMEOUT") {
      throw new ApiError(
        "Upload timed out. Completion is unknown — refresh the dataset list before retrying. No rollback is claimed.",
        null,
        "TIMEOUT_UNKNOWN",
      );
    }
    if (
      err instanceof ApiError &&
      (err.status === 400 || err.status === 422) &&
      err.details !== undefined
    ) {
      // P006 validation failures carry the full issue list in details.
      const report = parseReport(err.details);
      if (report) {
        const first = report.errors[0]?.message ?? "validation failed";
        const rejection = new ApiError(
          `Import rejected: ${first}`,
          err.status,
          "VALIDATION_REJECTED",
        );
        rejection.report = report;
        if (err.field !== undefined) rejection.field = err.field;
        if (err.row !== undefined) rejection.row = err.row;
        throw rejection;
      }
    }
    throw err;
  }
  const parsed = parseImportResult(json);
  if (!parsed) {
    throw new ApiError(
      "Upload answered 2xx but the body did not match the import shape.",
      null,
      "BAD_RESPONSE",
    );
  }
  if (parsed.status === "rejected" || parsed.report.errors.length > 0) {
    const first = parsed.report.errors[0]?.message ?? "validation failed";
    const err = new ApiError(
      `Import rejected: ${first}`,
      null,
      "VALIDATION_REJECTED",
    );
    err.report = parsed.report;
    err.datasetId = parsed.dataset_id;
    throw err;
  }
  return parsed;
}

export async function listDatasets(
  origin: string,
  fetchImpl: FetchLike,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<DatasetItem[]> {
  const json = await requestJson(
    `${origin}/api/v1/imports`,
    fetchImpl,
    timeoutMs,
    "Dataset list failed",
  );
  const parsed = parseDatasetList(json);
  if (!parsed) {
    throw new ApiError(
      "Dataset list answered 2xx but the body did not match the list shape.",
      null,
      "BAD_RESPONSE",
    );
  }
  return parsed;
}

export async function getSummary(
  origin: string,
  datasetId: string,
  fetchImpl: FetchLike,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<DatasetSummary> {
  const json = await requestJson(
    `${origin}/api/v1/imports/${encodeURIComponent(datasetId)}/summary`,
    fetchImpl,
    timeoutMs,
    "Summary request failed",
  );
  const parsed = parseSummary(json);
  if (!parsed) {
    throw new ApiError(
      "Summary answered 2xx but the body did not match the summary shape.",
      null,
      "BAD_RESPONSE",
    );
  }
  return parsed;
}

export async function updateTariff(
  origin: string,
  datasetId: string,
  inrPerKwh: number,
  fetchImpl: FetchLike,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<{ dataset_id: string; inr_per_kwh: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `${origin}/api/v1/imports/${encodeURIComponent(datasetId)}/tariff`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inr_per_kwh: inrPerKwh }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      throw httpError(res.status, "Tariff update failed", await readJsonError(res));
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError(
        "Tariff update answered 2xx but the body was not valid JSON.",
        res.status,
        "BAD_RESPONSE",
      );
    }
    const o = requireData(json);
    if (!o) {
      throw new ApiError(
        "Tariff update answered 2xx but the body was malformed.",
        res.status,
        "BAD_RESPONSE",
      );
    }
    const dataset_id = reqString(o, "dataset_id");
    const rate = reqFinite(o, "inr_per_kwh");
    if (!dataset_id || rate === null) {
      throw new ApiError(
        "Tariff update answered 2xx but the body did not match the tariff shape.",
        res.status,
        "BAD_RESPONSE",
      );
    }
    return { dataset_id, inr_per_kwh: rate };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new ApiError(
      aborted
        ? `Tariff update timed out or aborted after ${timeoutMs} ms.`
        : err instanceof Error
          ? `Tariff update failed: ${err.message}`
          : "Tariff update failed with an unknown error.",
      null,
      aborted ? "TIMEOUT" : "UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}
