"use client";

// Selected-dataset summary and tariff editing (P007 / A1-UI, Agent A — OpenCode).
// Shows only server-supplied values; unset cost/tariff render as unset, never
// zero. Tariff saves explicitly and reloads the summary on confirmation.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_TIMEOUT_MS,
  ApiError,
  createRequestTracker,
  getSummary,
  parseTariffInput,
  updateTariff,
  type DatasetSummary,
} from "../lib/auditor-api";
import { sanitizeOrigin } from "../lib/health";

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function SummaryPanel({
  backendUrl,
  datasetId,
}: {
  backendUrl: string;
  datasetId: string | null;
}) {
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [rateError, setRateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());

  const load = useCallback(
    async (id: string) => {
      const origin = sanitizeOrigin(backendUrl);
      if (!origin) {
        setError("Backend URL is missing or invalid.");
        return;
      }
      const reqId = tracker.current.issue();
      setLoading(true);
      try {
        const s = await getSummary(origin, id, fetch, API_TIMEOUT_MS);
        if (!mounted.current || !tracker.current.isCurrent(reqId)) return;
        setSummary(s);
        setError(null);
        setRateInput(
          s.tariff_inr_per_kwh !== null ? String(s.tariff_inr_per_kwh) : "",
        );
      } catch (err) {
        if (!mounted.current || !tracker.current.isCurrent(reqId)) return;
        setError(
          err instanceof ApiError ? err.message : "Summary request failed.",
        );
        // A failed reload never erases an already displayed summary silently:
        // the previous summary stays with this error shown above it.
      } finally {
        if (mounted.current && tracker.current.isCurrent(reqId)) {
          setLoading(false);
        }
      }
    },
    [backendUrl],
  );

  useEffect(() => {
    mounted.current = true;
    // Defer past the effect body (same pattern as the other panels).
    const t = setTimeout(() => {
      if (datasetId) void load(datasetId);
      else {
        setSummary(null);
        setError(null);
        setRateInput("");
      }
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(t);
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
    setRateError(null);
    setSaving(true);
    try {
      await updateTariff(origin, datasetId, parsed.value, fetch, API_TIMEOUT_MS);
      if (!mounted.current) return;
      await load(datasetId); // reload only after the server confirms
    } catch (err) {
      if (!mounted.current) return;
      // Input preserved; error shown.
      setRateError(
        err instanceof ApiError ? err.message : "Tariff save failed.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [datasetId, rateInput, saving, backendUrl, load]);

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

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Summary
      </h2>
      <p className="mt-1 font-mono text-sm text-zinc-700 dark:text-zinc-300">
        {datasetId}
      </p>

      {loading && !summary && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Loading summary…
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {summary && (
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
              Total energy
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {summary.energy_kwh} kWh
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
              Estimated cost
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {summary.cost_inr !== null
                ? formatInr(summary.cost_inr)
                : "Not set"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
              Applied tariff
            </dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-50">
              {summary.tariff_inr_per_kwh !== null
                ? `₹${summary.tariff_inr_per_kwh}/kWh`
                : "Not set"}
            </dd>
          </div>
          {summary.gaps.length > 0 && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                Coverage gaps
              </dt>
              <dd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {summary.gaps.length} reported:{" "}
                {summary.gaps.map((g) => JSON.stringify(g)).join("; ")}
              </dd>
            </div>
          )}
        </dl>
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
        <div className="mt-1 flex gap-2">
          <input
            id="tariff-rate"
            type="text"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder="e.g. 10"
            className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {rateError && (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            {rateError}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Estimates energy charges using a flat tariff — not a complete
          electricity bill.
        </p>
      </form>
    </section>
  );
}
