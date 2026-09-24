"use client";

// Backend connection panel (P001 / F4-A, Agent A — OpenCode).
// Browser-side fetch so real CORS behaviour is exercised when the service is
// available. One bounded request per check, no polling, no duplicates.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HEALTH_TIMEOUT_MS,
  checkHealth,
  sanitizeOrigin,
  type CheckResult,
  type CheckState,
} from "../lib/health";

const badge: Record<CheckState, string> = {
  "not-checked":
    "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  checking: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  reachable:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  unreachable: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  unexpected:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

const label: Record<CheckState, string> = {
  "not-checked": "Not checked",
  checking: "Checking…",
  reachable: "Reachable",
  unreachable: "Unreachable / request failed",
  unexpected: "Unexpected response",
};

export default function ConnectionPanel({
  backendUrl,
  kind,
}: {
  backendUrl: string;
  kind: "simulator" | "auditor";
}) {
  const [state, setState] = useState<CheckState>("not-checked");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(() =>
    sanitizeOrigin(backendUrl),
  );
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    if (inFlight.current) return; // never duplicate an outstanding request
    const origin = sanitizeOrigin(backendUrl);
    setDisplayUrl(origin);
    if (!origin) {
      setResult({
        outcome: "unexpected",
        data: null,
        error:
          "Backend API URL is missing or invalid. Verify the deployment configuration.",
        checkedAtIso: new Date().toISOString(),
      });
      setState("unexpected");
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setState("checking");
    try {
      const r = await checkHealth(
        origin,
        (url, init) => fetch(url, { ...init, signal: controller.signal }),
        HEALTH_TIMEOUT_MS,
      );
      if (!mounted.current) return;
      setResult(r);
      setState(r.outcome);
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [backendUrl]);

  useEffect(() => {
    mounted.current = true;
    // Defer past the effect body: keeps the initial check out of the
    // synchronous effect path and lets StrictMode cleanup cancel it.
    const t = setTimeout(() => {
      void run(); // initial check on page load
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(t);
      inFlight.current?.abort(); // cancel outstanding work on unmount
      inFlight.current = null;
    };
  }, [run]);

  const data = result?.data ?? null;
  const showEngineNote =
    kind === "simulator" && data?.status === "not_initialized";
  const showMlNote =
    kind === "auditor" &&
    (data?.mlReachable === "not_checked" || data?.mlReachable === false);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Backend connection
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${badge[state]}`}
        >
          {label[state]}
        </span>
      </div>

      <dl className="mt-4 space-y-1 font-mono text-sm text-zinc-800 dark:text-zinc-200">
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">URL</dt>
          <dd className="break-all">{displayUrl ?? "(invalid or missing)"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Contract
          </dt>
          <dd>{data?.contractVersion ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
            Last check
          </dt>
          <dd>
            {result
              ? new Date(result.checkedAtIso).toLocaleString()
              : "—"}
          </dd>
        </div>
      </dl>

      {result?.error && (
        <p className="mt-3 text-sm leading-6 text-red-700 dark:text-red-300">
          {result.error}
        </p>
      )}

      {state === "reachable" && showEngineNote && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Backend is reachable, but the simulation engine is not ready
          (not_initialized). This is not an error — start the engine before
          using simulator features.
        </p>
      )}

      {state === "reachable" && showMlNote && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {data?.mlReachable === false
            ? "The auditor backend is reachable, but it reports the ML service as not reachable."
            : "ML connectivity has not been checked — this does not mean ML is connected."}
        </p>
      )}

      {state === "reachable" && !showEngineNote && !showMlNote && (
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Backend responded with a valid health payload.
        </p>
      )}

      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "checking"}
        className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {state === "checking" ? "Checking…" : "Check connection"}
      </button>
    </section>
  );
}
