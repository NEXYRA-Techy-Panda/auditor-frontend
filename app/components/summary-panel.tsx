"use client";

// Selected-dataset summary and tariff editing (P007 / P012 A2-UI, Agent A).
// Shows only server-supplied values; unset cost/tariff render as unset, never
// zero. Every value block is labelled with the dataset it belongs to: while a
// new selection loads, previous values stay explicitly marked as previous.
// Tariff completions apply only to the still-selected dataset.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_TIMEOUT_MS,
  ApiError,
  buildReportSnapshot,
  createRequestTracker,
  describeGap,
  getSummary,
  parseTariffInput,
  printEligibility,
  shouldApplyTariffResult,
  updateTariff,
  type DatasetItem,
  type DatasetSummary,
  type ReportSnapshot,
} from "../lib/auditor-api";
import { sanitizeOrigin } from "../lib/health";
import ReportView from "./report-view";

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Render a structured gap object meaningfully — never "[object Object]". */
function gapText(gap: unknown): string {
  return describeGap(gap);
}

export default function SummaryPanel({
  backendUrl,
  datasetId,
  dataset,
  onTariffSaved,
}: {
  backendUrl: string;
  datasetId: string | null;
  dataset: DatasetItem | null;
  onTariffSaved?: () => void;
}) {
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorForId, setErrorForId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [rateError, setRateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetchedAtIso, setFetchedAtIso] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());
  const inFlight = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(datasetId);

  const load = useCallback(
    async (id: string) => {
      if (inFlight.current) return;
      const origin = sanitizeOrigin(backendUrl);
      if (!origin) {
        setError("Backend URL is missing or invalid.");
        setErrorForId(id);
        return;
      }
      const controller = new AbortController();
      inFlight.current = controller;
      const reqId = tracker.current.issue();
      setLoading(true);
      try {
        const s = await getSummary(
          origin,
          id,
          (url, init) => fetch(url, { ...init, signal: controller.signal }),
          API_TIMEOUT_MS,
        );
        if (!mounted.current || !tracker.current.isCurrent(reqId)) return;
        setSummary(s);
        setFetchedAtIso(new Date().toISOString());
        setError(null);
        setErrorForId(null);
        setRateInput(
          s.tariff_inr_per_kwh !== null ? String(s.tariff_inr_per_kwh) : "",
        );
      } catch (err) {
        if (!mounted.current || !tracker.current.isCurrent(reqId)) return;
        // Scoped to this request: an obsolete error can never replace the
        // current request's state, and a failed reload never erases the
        // previously displayed summary.
        setError(
          err instanceof ApiError ? err.message : "Summary request failed.",
        );
        setErrorForId(id);
      } finally {
        if (mounted.current && tracker.current.isCurrent(reqId)) {
          setLoading(false);
        }
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [backendUrl],
  );

  useEffect(() => {
    mounted.current = true;
    selectedRef.current = datasetId;
    // The form belongs to the selection: reset it on change, never carry a
    // previous dataset's errors, notice, input, or print snapshot forward.
    // Defer past the effect body (same pattern as the other panels).
    const t = setTimeout(() => {
      setRateError(null);
      setNotice(null);
      setError(null);
      setErrorForId(null);
      setSnapshot(null);
      if (datasetId) {
        setRateInput("");
        void load(datasetId);
      } else {
        setSummary(null);
        setRateInput("");
      }
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(t);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [datasetId, load]);

  const save = useCallback(async () => {
    if (!datasetId || saving) return;
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) {
      setRateError("Backend URL is missing or invalid.");
      return;
    }
    const parsed = parseTariffInput(rateInput);
    if (!parsed.ok) {
      setRateError(parsed.error);
      return;
    }
    const submittedId = datasetId;
    const submittedValue = parsed.value;
    setRateError(null);
    setNotice(null);
    setSaving(true);
    try {
      await updateTariff(origin, submittedId, submittedValue, fetch, API_TIMEOUT_MS);
      if (!mounted.current) return;
      if (!shouldApplyTariffResult(submittedId, selectedRef.current)) {
        // Completion for A must not overwrite B's form or summary.
        setNotice(
          `Tariff saved for ${submittedId}. You are now viewing ${selectedRef.current ?? "nothing"} — its values are unchanged.`,
        );
        return;
      }
      await load(submittedId); // reload only after the server confirms
      onTariffSaved?.(); // let findings refetch recomputed costs (no rerun)
    } catch (err) {
      if (!mounted.current) return;
      // Input preserved; error shown.
      setRateError(
        err instanceof ApiError ? err.message : "Tariff save failed.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [datasetId, rateInput, saving, backendUrl, load, onTariffSaved]);

  useEffect(() => {
    if (!snapshot) return;
    // Browser print facility ("Save as PDF" supported by the browser).
    // No PDF is generated by this app; nothing is claimed beyond print.
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  }, [snapshot]);

  if (!datasetId) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Summary
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Select a dataset to see its energy summary.
        </p>
      </section>
    );
  }

  const current = summary && summary.dataset_id === datasetId ? summary : null;
  const previous =
    summary && summary.dataset_id !== datasetId ? summary : null;
  const showError = error && errorForId === datasetId ? error : null;

  const eligibility = printEligibility({
    selectedId: datasetId,
    summary,
    loading,
    saving,
    hasError: showError !== null,
  });

  const openPrint = () => {
    if (!summary || !fetchedAtIso) return;
    const snap = buildReportSnapshot({
      selectedId: datasetId,
      summary,
      dataset: dataset
        ? {
            run_id: dataset.run_id,
            scenario_id: dataset.scenario_id,
            interval_seconds: dataset.interval_seconds,
            imported_utc: dataset.imported_utc,
          }
        : null,
      loading,
      saving,
      hasError: showError !== null,
      fetchedAtIso,
      generatedAtIso: new Date().toISOString(),
    });
    if (snap) setSnapshot(snap);
  };

  return (
    <section
      aria-label={`Summary for dataset ${datasetId}`}
      className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Summary
      </h2>
      <p className="mt-1 break-all font-mono text-sm text-zinc-700 dark:text-zinc-300">
        {datasetId}
      </p>

      {loading && (
        <p aria-live="polite" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Loading summary for {datasetId}…
        </p>
      )}

      {showError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {showError}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200"
        >
          {notice}
        </p>
      )}

      {current && (
        <SummaryValues summary={current} label={null} />
      )}

      {previous && (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Previous information for {previous.dataset_id} — may be stale
          </p>
          <SummaryValues summary={previous} label={previous.dataset_id} />
        </div>
      )}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label
          htmlFor="tariff-rate"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Electricity rate (₹/kWh)
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="tariff-rate"
            type="text"
            inputMode="decimal"
            value={rateInput}
            aria-invalid={rateError !== null}
            aria-describedby={rateError ? "tariff-rate-error" : undefined}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder="e.g. 10"
            className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {rateError && (
          <p
            id="tariff-rate-error"
            role="alert"
            className="mt-2 text-sm text-red-700 dark:text-red-300"
          >
            {rateError}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Estimates energy charges using a flat tariff — not a complete
          electricity bill.
        </p>
      </form>

      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          disabled={!eligibility.eligible}
          onClick={openPrint}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Print summary
        </button>
        {!eligibility.eligible && eligibility.reason && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Printing unavailable: {eligibility.reason}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Opens the browser print preview (&ldquo;Save as PDF&rdquo; supported by the
          browser). The preview is a fixed snapshot — later responses cannot
          change it.
        </p>
      </div>

      <ReportView snapshot={snapshot} />
    </section>
  );
}

function SummaryValues({
  summary,
  label,
}: {
  summary: DatasetSummary;
  label: string | null;
}) {
  return (
    <div className="mt-3">
      {label && (
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          Values below belong to {label}.
        </p>
      )}
      {summary.synthetic === true && (
        <p className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Synthetic data — simulated for evaluation, not measured.
        </p>
      )}
      <dl className="mt-1 space-y-1 text-sm">
      <div className="flex gap-2">
        <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
          Total energy
        </dt>
        <dd className="font-mono break-all text-zinc-900 dark:text-zinc-50">
          {summary.energy_kwh} kWh
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
          Estimated cost
        </dt>
        <dd className="font-mono break-all text-zinc-900 dark:text-zinc-50">
          {summary.cost_inr !== null
            ? formatInr(summary.cost_inr)
            : "Not set (no tariff applied)"}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
          Applied tariff
        </dt>
        <dd className="font-mono break-all text-zinc-900 dark:text-zinc-50">
          {summary.tariff_inr_per_kwh !== null
            ? summary.tariff_inr_per_kwh === 0
              ? "₹0/kWh (explicit zero rate)"
              : `₹${summary.tariff_inr_per_kwh}/kWh`
            : "Not set"}
        </dd>
      </div>
      {summary.coverage ? (
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Data period
          </dt>
          <dd className="font-mono text-xs break-all text-zinc-700 dark:text-zinc-300">
            {summary.coverage.start_utc} → {summary.coverage.end_utc} (UTC)
            · {summary.coverage.device_intervals} device intervals ·{" "}
            {summary.coverage.room_intervals} room intervals
          </dd>
        </div>
      ) : (
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Data period
          </dt>
          <dd className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            Not supplied by the backend
          </dd>
        </div>
      )}
      {summary.gaps === null ? (
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Coverage gaps
          </dt>
          <dd className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            Not supplied by the backend
          </dd>
        </div>
      ) : summary.gaps.length === 0 ? (
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Coverage gaps
          </dt>
          <dd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
            None reported
          </dd>
        </div>
      ) : (
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Coverage gaps
          </dt>
          <dd className="font-mono text-xs break-all text-zinc-700 dark:text-zinc-300">
            {summary.gaps.length} reported:{" "}
            {summary.gaps.map((g) => gapText(g)).join("; ")}
          </dd>
        </div>
      )}
      </dl>
    </div>
  );
}
