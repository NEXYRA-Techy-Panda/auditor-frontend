"use client";

// Dataset listing and selection (P007 / A1-UI, Agent A — OpenCode).
// Loads independently from the upload request; stale responses for older
// selections never replace the current one. No polling.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_TIMEOUT_MS,
  ApiError,
  createRequestTracker,
  listDatasets,
  type DatasetItem,
} from "../lib/auditor-api";
import { sanitizeOrigin } from "../lib/health";

type Phase = "loading" | "loaded" | "error";

export default function DatasetsPanel({
  backendUrl,
  selectedId,
  onSelect,
  refreshToken,
  onListChange,
}: {
  backendUrl: string;
  selectedId: string | null;
  onSelect: (datasetId: string) => void;
  refreshToken: number;
  onListChange?: (items: DatasetItem[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) {
      setError("Backend URL is missing or invalid.");
      setPhase("error");
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    const id = tracker.current.issue();
    if (items.length === 0) setPhase("loading");
    try {
      const list = await listDatasets(
        origin,
        (url, init) => fetch(url, { ...init, signal: controller.signal }),
        API_TIMEOUT_MS,
      );
      if (!mounted.current || !tracker.current.isCurrent(id)) return;
      setItems(list);
      onListChange?.(list);
      setError(null);
      setPhase("loaded");
    } catch (err) {
      if (!mounted.current || !tracker.current.isCurrent(id)) return;
      setError(
        err instanceof ApiError ? err.message : "Dataset list failed.",
      );
      if (items.length === 0) setPhase("error");
      // A failed refresh never erases an already shown list: items stay.
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [backendUrl, items.length, onListChange]);

  useEffect(() => {
    mounted.current = true;
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(t);
      inFlight.current?.abort();
      inFlight.current = null;
    };
    // refreshToken intentionally retriggers loading (manual + post-import).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Datasets
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {phase === "loading" && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Loading datasets…
        </p>
      )}

      {phase === "error" && items.length === 0 && (
        <div className="mt-3 rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {error && items.length > 0 && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Refresh failed — showing the previously loaded list. {error}
        </p>
      )}

      {phase === "loaded" && items.length === 0 && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          No datasets imported yet. Upload a CSV or JSON file above.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.dataset_id}>
              <button
                type="button"
                aria-pressed={item.dataset_id === selectedId}
                onClick={() => onSelect(item.dataset_id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  item.dataset_id === selectedId
                    ? "border-blue-700 bg-blue-50 dark:border-blue-300 dark:bg-blue-950"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                }`}
              >
                <p className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {item.dataset_id}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  run {item.run_id}
                  {item.scenario_id ? ` · ${item.scenario_id}` : ""}
                  {item.interval_seconds !== undefined
                    ? ` · ${item.interval_seconds}s`
                    : ""}
                </p>
                {item.imported_utc && (
                  <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    imported {new Date(item.imported_utc).toLocaleString()}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
