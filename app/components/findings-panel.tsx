"use client";

// Analysis findings presentation (P019 / A4, Agent A — OpenCode).
// Real public job API only (P015): submit → poll → terminal states, paginated
// findings. No invented endpoints, findings, forecasts, or savings. Backend
// totals are displayed verbatim, never recomputed or summed by the UI.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FINDINGS_PAGE_SIZE,
  JOB_POLL_INTERVAL_MS,
  formatWindow,
  getAnalysisJob,
  isTerminalStatus,
  pageWindow,
  readableFindingType,
  submitAnalysisJob,
  type AnalysisJob,
  type Finding,
} from "../lib/analysis";
import { ApiError, createRequestTracker } from "../lib/auditor-api";

export default function FindingsPanel({
  backendUrl,
  datasetId,
  tariffToken,
}: {
  backendUrl: string;
  datasetId: string | null;
  tariffToken: number;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [completedJob, setCompletedJob] = useState<AnalysisJob | null>(null);
  const [creating, setCreating] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());
  const inFlight = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const fetchPage = useCallback(
    async (id: string, pageNum: number) => {
      const origin = backendUrl.trim().replace(/\/+$/, "");
      if (!origin) {
        setJobError("Backend URL is missing or invalid.");
        return;
      }
      if (inFlight.current) return; // no overlapping status requests
      const controller = new AbortController();
      inFlight.current = controller;
      const reqId = tracker.current.issue();
      try {
        const next = await getAnalysisJob(
          origin,
          id,
          (url, init) => fetch(url, { ...init, signal: controller.signal }),
          pageNum,
          FINDINGS_PAGE_SIZE,
        );
        if (!mounted.current || !tracker.current.isCurrent(reqId)) return;
        if (next.dataset_id !== datasetId) {
          // Late result for another dataset: never apply it here.
          return;
        }
        setJob(next);
        setJobError(null);
        if (next.status === "completed") {
          setCompletedJob(next);
          stopPolling();
        } else if (next.status === "failed") {
          stopPolling();
        }
      } catch (err) {
        if (!mounted.current || !tracker.current.isCurrent(reqId)) return;
        // A failed status check never erases prior completed findings.
        setJobError(
          err instanceof ApiError ? err.message : "Analysis status request failed.",
        );
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [backendUrl, datasetId, stopPolling],
  );

  // Reset job scope when the selection changes; poll while non-terminal.
  // Deferred past the effect body (same pattern as the other panels).
  useEffect(() => {
    mounted.current = true;
    const t = setTimeout(() => {
      stopPolling();
      inFlight.current?.abort();
      inFlight.current = null;
      setJobId(null);
      setJob(null);
      setCompletedJob(null);
      setJobError(null);
      setPage(1);
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(t);
      stopPolling();
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [datasetId, stopPolling]);

  useEffect(() => {
    if (!jobId || !datasetId) return;
    if (job && isTerminalStatus(job.status)) return;
    // Defer past the effect body.
    const t = setTimeout(() => {
      void fetchPage(jobId, page);
      pollTimer.current = setInterval(() => {
        void fetchPage(jobId, page);
      }, JOB_POLL_INTERVAL_MS);
    }, 0);
    return () => {
      clearTimeout(t);
      stopPolling();
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [jobId, datasetId, page, job, fetchPage, stopPolling]);

  // Tariff saves recompute costs server-side: refetch the displayed completed
  // job. Never reruns analysis.
  useEffect(() => {
    if (tariffToken === 0 || !jobId || !datasetId) return;
    if (job && job.status === "completed" && job.dataset_id === datasetId) {
      const t = setTimeout(() => {
        void fetchPage(jobId, page);
      }, 0);
      return () => clearTimeout(t);
    }
    // tariffToken intentionally retriggers only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariffToken]);

  const create = useCallback(async () => {
    if (!datasetId || creating) return; // no duplicate submissions
    const origin = backendUrl.trim().replace(/\/+$/, "");
    if (!origin) {
      setJobError("Backend URL is missing or invalid.");
      return;
    }
    setCreating(true);
    setJobError(null);
    try {
      const ack = await submitAnalysisJob(origin, datasetId, fetch);
      if (!mounted.current) return;
      setJobId(ack.job_id);
      setPage(1);
      // No optimistic job object: the first poll establishes real state.
      // An uncertain creation is never auto-retried; failure just re-enables
      // the button via the error below.
    } catch (err) {
      if (!mounted.current) return;
      setJobError(
        err instanceof ApiError ? err.message : "Analysis submission failed.",
      );
    } finally {
      if (mounted.current) setCreating(false);
    }
  }, [datasetId, creating, backendUrl]);

  if (!datasetId) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Analysis findings
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Select a dataset to check for analysis findings.
        </p>
      </section>
    );
  }

  const shown = job && job.dataset_id === datasetId ? job : null;
  const completed =
    completedJob && completedJob.dataset_id === datasetId ? completedJob : null;
  const pagination = shown?.findings_pagination ?? null;
  const window = pagination ? pageWindow(pagination.total, pagination.page, pagination.page_size) : null;

  return (
    <section
      aria-label={`Analysis findings for dataset ${datasetId}`}
      className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Analysis findings
        </h2>
        {!jobId && (
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {creating ? "Starting analysis…" : "Run analysis"}
          </button>
        )}
      </div>

      {!jobId && !jobError && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Analysis not run for this dataset yet.
        </p>
      )}

      {jobError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {jobError}
        </p>
      )}

      {shown && !isTerminalStatus(shown.status) && (
        <p aria-live="polite" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Analysis {shown.status}
          {shown.progress
            ? ` — batch ${shown.progress.completed_batches} of ${shown.progress.total_batches}`
            : ""}
          …
        </p>
      )}

      {shown?.status === "failed" && (
        <div className="mt-3 rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Analysis failed{shown.error ? `: ${shown.error.message}` : ""}
          </p>
          {completed && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              Showing the previously completed result below; it is unchanged.
            </p>
          )}
        </div>
      )}

      {(shown?.status === "completed" ? shown : completed) &&
        (() => {
          const view = (shown?.status === "completed" ? shown : completed)!;
          const result = view.result;
          if (!result) {
            return (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                The completed job carries no result payload.
              </p>
            );
          }
          const findings = view.findings ?? [];
          return (
            <div className="mt-4">
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                Deterministic rule {result.method_version} — not an AI
                diagnosis; no confidence scores; spike/drift detection was not
                performed.
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                    Dataset energy
                  </dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                    {result.totals.dataset_energy_kwh} kWh
                    {result.totals.dataset_cost_inr !== null &&
                      ` (${formatInr(result.totals.dataset_cost_inr)})`}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                    Avoidable energy
                  </dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                    {result.totals.avoidable_energy_kwh} kWh
                    {result.totals.avoidable_cost_inr !== null &&
                      ` (${formatInr(result.totals.avoidable_cost_inr)})`}
                  </dd>
                </div>
                {result.totals.unknown_avoidable_findings > 0 && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                      Unknown avoidable
                    </dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                      {result.totals.unknown_avoidable_findings} finding(s)
                      without a computed saving
                    </dd>
                  </div>
                )}
              </dl>

              {result.warnings.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    Analysis scope
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
                    {result.warnings.map((w, i) => (
                      <li key={i}>
                        {w.message}{" "}
                        <span className="font-mono text-xs">({w.code})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.excluded_devices.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Excluded from checks
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {result.excluded_devices.map((e) => (
                      <li key={e.device_id} className="font-mono text-xs">
                        {e.device_id}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {findings.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  No findings from the checks performed. This does not mean
                  the building has no waste — only the checks above ran.
                </p>
              ) : (
                <>
                  <ul className="mt-3 space-y-3">
                    {findings.map((f) => (
                      <FindingCard key={f.finding_id} finding={f} />
                    ))}
                  </ul>
                  {pagination && window && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        Showing {window.from}–{window.to} of {pagination.total}{" "}
                        findings
                      </p>
                      <button
                        type="button"
                        disabled={pagination.page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded-full border border-zinc-300 px-4 py-1 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={
                          pagination.page * pagination.page_size >= pagination.total
                        }
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-full border border-zinc-300 px-4 py-1 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}
    </section>
  );

  function formatInr(value: number): string {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
}

function FindingCard({ finding: f }: { finding: Finding }) {
  const windowText = formatWindow(f.window_start_utc, f.window_end_utc);
  return (
    <li className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {readableFindingType(f.finding_type)}{" "}
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          {f.room_id ?? "unknown room"}
          {f.device_id ? ` · ${f.device_id}` : ""}
        </span>
      </p>
      {windowText && (
        <p className="mt-1 font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
          {windowText}
        </p>
      )}
      <dl className="mt-2 space-y-1 text-sm">
        {f.observed && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Observed</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {f.observed.value} {f.observed.unit}
            </dd>
          </div>
        )}
        {f.expected && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">Expected</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {f.expected.value} {f.expected.unit}
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Avoidable energy
          </dt>
          <dd className="font-mono text-zinc-900 dark:text-zinc-50">
            {f.avoidable_energy_kwh !== undefined
              ? `${f.avoidable_energy_kwh} kWh`
              : "not supplied"}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Avoidable cost
          </dt>
          <dd className="font-mono text-zinc-900 dark:text-zinc-50">
            {f.avoidable_cost_inr !== undefined && f.avoidable_cost_inr !== null
              ? formatInr(f.avoidable_cost_inr)
              : "not supplied"}
          </dd>
        </div>
      </dl>
      {f.suggested_action && (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Suggested action: </span>
          {f.suggested_action}
        </p>
      )}
      <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
        Method: {f.method} (deterministic rule — not AI diagnosis)
      </p>
      {f.assumptions && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Assumptions: {f.assumptions}
        </p>
      )}
      {f.resolution_limit && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Resolution limit: {f.resolution_limit}
        </p>
      )}
      {f.evidence !== undefined && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600 underline dark:text-zinc-400">
            Evidence
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 font-mono text-xs break-all whitespace-pre-wrap text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {JSON.stringify(f.evidence, null, 2)}
          </pre>
        </details>
      )}
    </li>
  );

  function formatInr(value: number): string {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
}
