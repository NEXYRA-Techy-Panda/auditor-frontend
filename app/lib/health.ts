// Browser-side backend health-check logic (P001 / F4-A, Agent A — OpenCode).
// Framework-agnostic: no React imports, so the pure functions can be exercised
// outside a browser (see P001_F4_A_EVIDENCE.md). Contract v1.0.1, read-only.

export type CheckState =
  | "not-checked"
  | "checking"
  | "reachable"
  | "unreachable"
  | "unexpected";

export interface ParsedHealth {
  status: string;
  contractVersion: string | null;
  runId: string | null;
  simTimeUtc: string | null;
  mlReachable: boolean | "not_checked" | null;
  modelAvailable: boolean | null;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface CheckResult {
  outcome: "reachable" | "unreachable" | "unexpected";
  data: ParsedHealth | null;
  error: string | null;
  checkedAtIso: string;
}

/** Bounded request time. No polling exists anywhere in F4-A. */
export const HEALTH_TIMEOUT_MS = 8000;

/**
 * Validate the configured origin and strip any credentials for display and
 * transport. Returns null for missing/invalid values. The variable is an
 * origin — never append an API prefix to it here; callers add full route
 * paths (contract v1.0.1, e.g. /api/v1/health).
 */
export function sanitizeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.username = "";
  url.password = "";
  return url.toString().replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" ? value : undefined;
}

/**
 * Typed parse of a health payload. Returns null for anything that is not a
 * well-shaped object with a non-empty string `status` and correctly typed
 * optional fields. Malformed input is never coerced into a success.
 */
export function parseHealthResponse(json: unknown): ParsedHealth | null {
  if (!isRecord(json)) return null;
  // The public API uses the standard { data, meta } envelope. Accept the
  // historical bare object as well, but never fall back from a malformed
  // `data` member to fields on the outer envelope.
  const hasDataMember = Object.prototype.hasOwnProperty.call(json, "data");
  const o = hasDataMember ? json.data : json;
  if (!isRecord(o)) return null;
  if (typeof o.status !== "string" || o.status.length === 0) return null;

  const contractVersion = optionalString(o.contract_version);
  const runId = optionalString(o.run_id);
  const simTimeUtc = optionalString(o.sim_time_utc);
  if (
    contractVersion === undefined ||
    runId === undefined ||
    simTimeUtc === undefined
  ) {
    return null;
  }

  let mlReachable: ParsedHealth["mlReachable"] = null;
  if (o.ml_reachable !== undefined) {
    if (
      typeof o.ml_reachable !== "boolean" &&
      o.ml_reachable !== "not_checked"
    ) {
      return null;
    }
    mlReachable = o.ml_reachable;
  }

  let modelAvailable: ParsedHealth["modelAvailable"] = null;
  if (o.model_available !== undefined) {
    if (typeof o.model_available !== "boolean") return null;
    modelAvailable = o.model_available;
  }

  return {
    status: o.status,
    contractVersion,
    runId,
    simTimeUtc,
    mlReachable,
    modelAvailable,
  };
}

/**
 * Perform one bounded health request. Classification:
 * - reachable: HTTP 2xx with a well-shaped health payload (including
 *   not_initialized / ml_reachable:not_checked — those describe service
 *   readiness, not transport failure).
 * - unreachable: network failure, refused connection, timeout/abort.
 * - unexpected: non-2xx status, invalid JSON, or malformed payload.
 */
export async function checkHealth(
  origin: string,
  fetchImpl: FetchLike,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<CheckResult> {
  const checkedAtIso = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${origin}/api/v1/health`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        outcome: "unexpected",
        data: null,
        error: `Backend answered HTTP ${res.status}; expected a 2xx health response.`,
        checkedAtIso,
      };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return {
        outcome: "unexpected",
        data: null,
        error: "Backend answered 2xx but the body was not valid JSON.",
        checkedAtIso,
      };
    }
    const data = parseHealthResponse(json);
    if (!data) {
      return {
        outcome: "unexpected",
        data: null,
        error: "Backend answered 2xx but the payload did not match the health shape.",
        checkedAtIso,
      };
    }
    return { outcome: "reachable", data, error: null, checkedAtIso };
  } catch (err) {
    const aborted =
      err instanceof Error && err.name === "AbortError";
    return {
      outcome: "unreachable",
      data: null,
      error: aborted
        ? `Request timed out or was aborted after ${timeoutMs} ms.`
        : err instanceof Error
          ? `Request failed: ${err.message}`
          : "Request failed with an unknown error.",
      checkedAtIso,
    };
  } finally {
    clearTimeout(timer);
  }
}
