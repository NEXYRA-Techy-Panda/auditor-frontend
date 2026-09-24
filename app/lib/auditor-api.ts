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
  energy_kwh: number;
  cost_inr: number | null;
  tariff_inr_per_kwh: number | null;
  gaps: unknown[];
  /**
   * True only when the backend explicitly marks the dataset synthetic.
   * Absent/false means unknown — never infer that imported data is synthetic.
   */
  synthetic: boolean | null;
}

/** HTTP or transport failure. Never fabricated as success. */
export class ApiError extends Error {
  status: number | null;
  code: string | null;

  constructor(message: string, status: number | null, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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

/** Accept a bare body or a { data } envelope; anything else is malformed. */
function unwrap(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;
  if (isRecord(json.data)) return json.data;
  return json;
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
  if (typeof v === "string") return { message: v };
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
  return { errors, warnings: v.warnings as string[], duplicates_deduped: dup };
}

export function parseImportResult(json: unknown): ImportResult | null {
  const o = unwrap(json);
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
  const o = unwrap(json);
  const arr = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.data)
      ? (json.data as unknown[])
      : o && Array.isArray(o.items)
        ? o.items
        : o && Array.isArray(o.datasets)
          ? o.datasets
          : null;
  const list = arr;
  if (!Array.isArray(list)) return null;
  const out: DatasetItem[] = [];
  for (const v of list) {
    const item = parseDatasetItem(v);
    if (!item) return null;
    out.push(item);
  }
  return out;
}

export function parseSummary(json: unknown): DatasetSummary | null {
  const o = unwrap(json);
  if (!o) return null;
  const dataset_id = reqString(o, "dataset_id");
  const energy_kwh = reqFinite(o, "energy_kwh");
  if (!dataset_id || energy_kwh === null) return null;
  const gaps = o.gaps;
  const syntheticRaw = o.synthetic;
  return {
    dataset_id,
    energy_kwh,
    cost_inr: optFinite(o, "cost_inr"),
    tariff_inr_per_kwh: optFinite(o, "tariff_inr_per_kwh"),
    gaps: Array.isArray(gaps) ? gaps : [],
    synthetic: syntheticRaw === true ? true : null,
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
 * Post-upload auto-select guard. An upload completion selects its dataset
 * only when the user has not deliberately selected something newer since the
 * upload started (timestamps from the same clock). Otherwise the UI keeps
 * the newer selection and offers an explicit View action instead.
 */
export function shouldAutoSelectImport(
  uploadStartedAtMs: number | null,
  lastManualSelectAtMs: number | null,
): boolean {
  if (uploadStartedAtMs === null || lastManualSelectAtMs === null) return true;
  return lastManualSelectAtMs <= uploadStartedAtMs;
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

async function readJsonError(
  res: { status: number; json: () => Promise<unknown> },
): Promise<{ code?: string; message?: string }> {
  try {
    const body = await res.json();
    if (isRecord(body)) {
      const err = isRecord(body.error) ? body.error : body;
      return {
        code: typeof err.code === "string" ? err.code : undefined,
        message: typeof err.message === "string" ? err.message : undefined,
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
  detail: { code?: string; message?: string },
): ApiError {
  if (status === 413) {
    return new ApiError(
      detail.message ??
        "File too large for the server to accept (HTTP 413). Try a smaller time range.",
      status,
      detail.code ?? "REQUEST_TOO_LARGE",
    );
  }
  if (status === 409) {
    return new ApiError(
      detail.message ??
        "The server reported a conflict (HTTP 409) — possibly an already-imported dataset.",
      status,
      detail.code ?? "CONFLICT",
    );
  }
  if (status === 404) {
    return new ApiError(
      detail.message ?? "Not found (HTTP 404).",
      status,
      detail.code ?? "NOT_FOUND",
    );
  }
  return new ApiError(
    detail.message ?? `${fallback} (HTTP ${status}).`,
    status,
    detail.code ?? null,
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
    (err as ApiError & { report?: ImportReport }).report = parsed.report;
    (err as ApiError & { datasetId?: string }).datasetId = parsed.dataset_id;
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
    const o = unwrap(json);
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
