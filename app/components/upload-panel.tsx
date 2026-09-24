"use client";

// Dataset file upload (P007 / A1-UI, Agent A — OpenCode).
// Sends one CSV/JSON file as multipart field "file". Browser validation is a
// convenience only — backend validation is authoritative. No dataset parsing
// in the browser, no fabricated progress, no polling.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  UPLOAD_TIMEOUT_MS,
  uploadDataset,
  type ImportResult,
} from "../lib/auditor-api";

type Phase = "empty" | "ready" | "submitting" | "success" | "failure";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPanel({
  backendUrl,
  onImported,
}: {
  backendUrl: string;
  onImported: (datasetId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("empty");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [issues, setIssues] = useState<
    { message: string; field?: string; row?: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, []);

  const pick = useCallback((next: File | null) => {
    setFile(next);
    setPhase(next ? "ready" : "empty");
    setResult(null);
    setIssues([]);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!file || inFlight.current) return; // duplicate-submission prevention
    const origin = backendUrl.trim().replace(/\/+$/, "");
    if (!origin) {
      setError("Backend URL is missing or invalid.");
      setPhase("failure");
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setPhase("submitting");
    setError(null);
    setIssues([]);
    try {
      const r = await uploadDataset(
        origin,
        file,
        file.name,
        (url, init) => fetch(url, { ...init, signal: controller.signal }),
        UPLOAD_TIMEOUT_MS,
      );
      if (!mounted.current) return;
      setResult(r);
      setPhase("success");
      onImported(r.dataset_id);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.code === "VALIDATION_REJECTED") {
        const report = (
          err as ApiError & {
            report?: {
              errors: { message: string; field?: string; row?: number }[];
            };
          }
        ).report;
        setIssues(report?.errors ?? []);
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Upload failed with an unknown error.");
      }
      setPhase("failure");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [file, backendUrl, onImported]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Upload dataset
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label
          htmlFor="dataset-file"
          className="cursor-pointer rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Choose CSV or JSON file
        </label>
        <input
          ref={inputRef}
          id="dataset-file"
          type="file"
          accept=".csv,.json,application/json,text/csv"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        {file && (
          <>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {file.name} · {formatBytes(file.size)}
            </p>
            <button
              type="button"
              onClick={() => {
                pick(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Remove
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!file || phase === "submitting"}
        className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {phase === "submitting" ? "Uploading and validating…" : "Upload"}
      </button>

      {phase === "success" && result && (
        <div className="mt-4 rounded-lg bg-green-50 p-4 dark:bg-green-950">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Import {result.status}
            {result.alreadyImported ? " (already imported)" : ""} — dataset{" "}
            <span className="font-mono">{result.dataset_id}</span>
          </p>
          {result.report.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-green-800 dark:text-green-200">
              {result.report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {result.report.duplicates_deduped > 0 && (
            <p className="mt-2 text-sm text-green-800 dark:text-green-200">
              Duplicates deduplicated: {result.report.duplicates_deduped}
            </p>
          )}
        </div>
      )}

      {phase === "failure" && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Upload failed
          </p>
          {error && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          {issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700 dark:text-red-300">
              {issues.map((issue, i) => (
                <li key={i}>
                  {issue.message}
                  {issue.field ? ` (field: ${issue.field})` : ""}
                  {issue.row !== undefined ? ` (row ${issue.row})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
