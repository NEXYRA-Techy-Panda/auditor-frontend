"use client";

// P026 device-detector controls and results. The existing vacancy FindingsPanel
// remains the default analysis path; this panel submits only the committed
// excess-consumption/gradual-trend job shapes and never prices deviations.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DETECTOR_POLL_INTERVAL_MS,
  DETECTOR_PAGE_SIZE,
  detectorIsTerminal,
  detectorStatusLabel,
  fetchDetectorCatalogue,
  getDetectorJob,
  submitDetectorJob,
  validateDetectorWindows,
  type DetectorCatalogue,
  type DetectorDevice,
  type DetectorFinding,
  type DetectorId,
  type DetectorJob,
  type DetectorResult,
} from "../lib/detectors";
import {
  ApiError,
  createRequestTracker,
  type DatasetItem,
  type DatasetSummary,
} from "../lib/auditor-api";
import { formatWindow } from "../lib/analysis";
import { sanitizeOrigin } from "../lib/health";

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 6 });
}

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "Supplied structured value";
  }
}

function fieldString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function detectorName(detector: DetectorId): string {
  return detector === "excess_consumption" ? "Excess consumption" : "Gradual trend";
}

function statusExplanation(status: string): string {
  if (status === "insufficient_reference") return "Insufficient comparable reference data; this is not a clean no-findings result.";
  if (status === "insufficient_history") return "Insufficient supported history for the trend; this is not a clean no-findings result.";
  if (status === "unsupported_context" || status === "unsupported_aggregation") return "The selected context or aggregation was not assessable; inspect the device reasons and exclusions.";
  if (status === "no_comparable_observations") return "No comparable observations were available; this is not a clean no-findings result.";
  return "The returned status is shown as supplied by the backend.";
}

function statusClass(status: string): string {
  if (status === "findings_detected" || status === "deviation_found") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  if (status.startsWith("insufficient") || status.startsWith("unsupported") || status === "no_comparable_observations") {
    return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
}

function provenanceText(result: DetectorResult): string {
  if (result.synthetic === true) {
    return result.synthetic_label ? `Synthetic source: ${result.synthetic_label}` : "Synthetic source; no measured-data claim.";
  }
  if (result.synthetic === false) {
    return "The backend supplied non-synthetic provenance; no independent measurement claim is made.";
  }
  return "Source provenance was not specified by the backend.";
}

function windowText(start: string, end: string): string {
  return formatWindow(start, end) ?? `${start} → ${end}`;
}

function RecordDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-zinc-500">Unavailable</span>;
  if (typeof value !== "object") return <span className="font-mono text-xs">{formatUnknown(value)}</span>;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-zinc-500">No fields supplied</span>;
  return (
    <dl className="grid gap-1 text-xs sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <div key={key} className="flex gap-1">
          <dt className="text-zinc-500">{key}:</dt>
          <dd className="font-mono break-all text-zinc-700 dark:text-zinc-300">{formatUnknown(item)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetectorCoveragePanel({ result }: { result: DetectorResult }) {
  const aggregationEntries = Object.entries(result.aggregation.excluded_device_bins);
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><p className="text-xs uppercase text-zinc-500">Evaluation devices</p><p className="mt-1 font-mono text-sm">{result.coverage.devices}</p></div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><p className="text-xs uppercase text-zinc-500">Not assessed devices</p><p className="mt-1 font-mono text-sm">{result.coverage.unsupported_devices}</p></div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><p className="text-xs uppercase text-zinc-500">Detector calls</p><p className="mt-1 font-mono text-sm">{result.coverage.detector_calls}</p></div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><p className="text-xs uppercase text-zinc-500">Section bound</p><p className="mt-1 font-mono text-sm">{result.coverage.max_section_records} records</p></div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Evaluation coverage: {windowText(result.coverage.start_utc, result.coverage.end_utc)}. Reference and evaluation coverage are returned separately; this is not a combined completeness claim.</p>
      <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><summary className="cursor-pointer text-sm font-medium">Detector coverage counters</summary><div className="mt-2"><RecordDetails value={result.detector_coverage} /></div></details>
      <section>
        <h4 className="text-sm font-semibold">Per-device assessment</h4>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">A device can be assessed by Python, rejected by the auditor precheck, or not assessed. These states are not interchangeable with “no findings”.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm"><caption className="sr-only">Detector device assessment</caption><thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800"><tr><th className="py-2 pr-3">Device</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Assessment source</th><th className="py-2">Reason / comparison</th></tr></thead><tbody>{result.devices.map((device, index) => <DetectorDeviceRow key={`${device.device_id}-${index}`} device={device} />)}</tbody></table>
        </div>
      </section>
      <section>
        <h4 className="text-sm font-semibold">Aggregation and exclusions</h4>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Stored readings are passed through when they fit; otherwise only eligible bins are aggregated. Excluded bins are counted, never zero-filled.</p>
        <div className="mt-2 grid gap-3 md:grid-cols-2"><div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"><p className="text-xs font-medium">Resolution by device</p><div className="mt-1"><RecordDetails value={result.aggregation.resolutions_by_device} /></div><p className="mt-2 text-xs font-medium">Emitted bins</p><div><RecordDetails value={result.aggregation.emitted_bins_by_device} /></div></div><div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"><p className="text-xs font-medium">Excluded device bins</p>{aggregationEntries.length === 0 ? <p className="mt-1 text-xs text-zinc-500">No excluded bins reported.</p> : <div className="mt-1 space-y-1">{aggregationEntries.map(([device, reasons]) => <div key={device}><p className="font-mono text-xs">{device}</p><RecordDetails value={reasons} /></div>)}</div>}</div></div>
        <div className="mt-3"><p className="text-xs font-medium">Listed exclusions ({result.totals.exclusions_listed} of {result.totals.exclusions_total})</p>{result.exclusions.length === 0 ? <p className="mt-1 text-xs text-zinc-500">No individual exclusion records supplied.</p> : <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-300">{result.exclusions.map((item, index) => <li key={index} className="break-all font-mono">{formatUnknown(item)}</li>)}</ul>}</div>
      </section>
    </div>
  );
}

function DetectorDeviceRow({ device }: { device: DetectorDevice }) {
  return (
    <tr className="border-b border-zinc-100 align-top dark:border-zinc-900"><td className="py-2 pr-3"><p className="font-medium">{device.device_id}</p><p className="font-mono text-xs text-zinc-500">{device.room_id} · {device.device_type}</p></td><td className="py-2 pr-3"><span className={`rounded-full px-2 py-1 text-xs ${statusClass(device.status)}`}>{detectorStatusLabel(device.status)}</span></td><td className="py-2 pr-3 text-xs">{device.assessment_source === "auditor_precheck" ? "Auditor precheck" : "Detector"}</td><td className="py-2 text-xs">{device.reason ?? device.comparison ?? "No reason supplied"}</td></tr>
  );
}

function DetectorFindingCard({ finding }: { finding: DetectorFinding }) {
  const suggested = fieldString(finding.raw, "suggested_action");
  const support = finding.support;
  const persistence = finding.persistence;
  const assessed = finding.assessed_period;
  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{detectorStatusLabel(finding.finding_type)}</p><p className="font-mono text-xs text-zinc-500">{finding.device_id ?? "device not supplied"}{finding.room_id ? ` · ${finding.room_id}` : ""}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">Observation, not a confirmed fault</span></div>{finding.window_start_utc && finding.window_end_utc && <p className="mt-2 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">{windowText(finding.window_start_utc, finding.window_end_utc)}</p>}<dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><FindingValue label="Observed" value={finding.observed ? `${formatNumber(finding.observed.value)} ${finding.observed.unit}` : null} /><FindingValue label="Reference / expected" value={finding.expected ? `${formatNumber(finding.expected.value)} ${finding.expected.unit}` : null} /><FindingValue label="Deviation" value={finding.deviation?.watts === undefined ? null : `${formatNumber(finding.deviation.watts)} W${finding.deviation.ratio === undefined ? "" : ` (ratio ${formatNumber(finding.deviation.ratio)})`}`} /><FindingValue label="Trend" value={finding.trend?.watts_per_day === undefined ? null : `${formatNumber(finding.trend.watts_per_day)} W/day${finding.trend.relative_change_over_period === undefined ? "" : ` · ${formatNumber(finding.trend.relative_change_over_period)}% over period`}`} /></dl>{finding.energy_above_baseline_kwh !== undefined && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950"><p className="font-medium text-amber-900 dark:text-amber-100">Energy above reference baseline: {formatNumber(finding.energy_above_baseline_kwh)} kWh</p><p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{finding.energy_note ?? "This is an observed deviation quantity, not a guaranteed avoidable amount."}</p></div>}{suggested && <p className="mt-3 text-sm"><span className="font-medium">Suggested check: </span>{suggested}</p>}{(support !== undefined || persistence !== undefined || assessed !== undefined) && <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><FindingValue label="Support" value={formatUnknown(support)} /><FindingValue label="Persistence" value={formatUnknown(persistence)} /><FindingValue label="Assessed period" value={formatUnknown(assessed)} /></div>}</li>
  );
}

function FindingValue({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-zinc-500 dark:text-zinc-400">{label}</dt><dd className="font-mono text-zinc-800 dark:text-zinc-200">{value ?? "Not supplied"}</dd></div>;
}

function OtherChanges({ result }: { result: DetectorResult }) {
  if (!result.other_changes || result.other_changes.length === 0) return null;
  return <section className="mt-5"><h4 className="text-sm font-semibold">Other descriptive changes</h4><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">These observations are separate from findings and do not establish a fault or a savings amount.</p><ul className="mt-2 space-y-2">{result.other_changes.map((change, index) => { const record = typeof change === "object" && change !== null ? change as Record<string, unknown> : {}; return <li key={index} className="rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900"><p className="font-medium">{formatUnknown(record.classification ?? record.type ?? "Unclassified change")}</p><div className="mt-1"><RecordDetails value={change} /></div></li>; })}</ul></section>;
}

function DetectorResultView({ result, page, onPage }: { result: DetectorResult; page: number; onPage: (page: number) => void }) {
  const pagination = result.findings_pagination;
  const hasPage = pagination.total > 0;
  const evaluatedClean = result.status === "evaluated_no_deviation" || result.status === "evaluated_no_gradual_trend";
  const notAssessed = result.status === "insufficient_reference" || result.status === "insufficient_history" || result.status === "unsupported_context" || result.status === "unsupported_aggregation" || result.status === "no_comparable_observations";
  return <div className="mt-5"><div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><p className="text-xs uppercase tracking-wide text-zinc-500">Result status</p><p className="mt-1"><span className={`rounded-full px-2 py-1 text-sm ${statusClass(result.status)}`}>{detectorStatusLabel(result.status)}</span></p><p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Reference: {windowText(result.windows.reference.start_utc, result.windows.reference.end_utc)} · Evaluation: {windowText(result.windows.evaluation.start_utc, result.windows.evaluation.end_utc)}</p><p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{provenanceText(result)} {statusExplanation(result.status)} Detector results are observations, not priced savings, and are not added to vacancy totals.</p></div><DetectorCoveragePanel result={result} />{result.warnings.length > 0 && <section className="mt-5"><h4 className="text-sm font-semibold">Warnings</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">{result.warnings.map((warning, index) => <li key={index}>{warning.message} <span className="font-mono text-xs">({warning.code})</span></li>)}</ul></section>}{result.limitations.length > 0 && <section className="mt-4"><h4 className="text-sm font-semibold">Limitations</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-300">{result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}<section className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">Findings page</h4><p className="mt-1 text-xs text-zinc-500">Page {pagination.page} · {pagination.page_size} per page · {pagination.total} total findings</p></div></div>{result.findings.length === 0 ? <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">{evaluatedClean ? "The detector evaluated comparable observations and returned no findings." : notAssessed ? "The detector did not establish a clean evaluated result. No findings are being claimed; inspect device statuses and reasons." : "No findings were returned for this page."}</p> : <ul className="mt-3 space-y-3">{result.findings.map((finding) => <DetectorFindingCard key={finding.finding_id} finding={finding} />)}</ul>}{hasPage && <div className="mt-3 flex items-center gap-3"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-zinc-700">Previous</button><span className="font-mono text-xs text-zinc-500">Page {pagination.page}</span><button type="button" disabled={page * pagination.page_size >= pagination.total} onClick={() => onPage(page + 1)} className="rounded-full border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-zinc-700">Next</button></div>}</section><OtherChanges result={result} /></div>;
}

export default function DetectorPanel({ backendUrl, datasetId, dataset, summary, onJobChange }: { backendUrl: string; datasetId: string | null; dataset: DatasetItem | null; summary: DatasetSummary | null; onJobChange?: (job: DetectorJob | null) => void }) {
  const [catalogue, setCatalogue] = useState<DetectorCatalogue | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [detector, setDetector] = useState<DetectorId>("excess_consumption");
  const [referenceStart, setReferenceStart] = useState("");
  const [referenceEnd, setReferenceEnd] = useState("");
  const [evaluationStart, setEvaluationStart] = useState("");
  const [evaluationEnd, setEvaluationEnd] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<DetectorJob | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());
  const inFlight = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentDataset = dataset?.dataset_id === datasetId ? dataset : null;
  const currentSummary = summary?.dataset_id === datasetId ? summary : null;

  const stopPolling = useCallback(() => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; } }, []);
  const resetJob = useCallback(() => { stopPolling(); inFlight.current?.abort(); inFlight.current = null; tracker.current.issue(); setJobId(null); setJob(null); onJobChange?.(null); setPage(1); setJobError(null); }, [onJobChange, stopPolling]);
  const availableDetectors = useMemo(() => catalogue?.detectors ?? [], [catalogue]);

  const loadCatalogue = useCallback(async () => {
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) { setCatalogueError("Backend URL is missing or invalid."); return; }
    setCatalogueLoading(true); setCatalogueError(null);
    const controller = new AbortController();
    try {
      const next = await fetchDetectorCatalogue(origin, fetch, undefined, controller.signal);
      if (!mounted.current) return;
      setCatalogue(next);
      setDetector((current) => next.detectors.some((entry) => entry.id === current) ? current : next.detectors[0]?.id ?? current);
    } catch (error) { if (mounted.current) setCatalogueError(messageFor(error, "Detector catalogue request failed.")); }
    finally { if (mounted.current) setCatalogueLoading(false); }
  }, [backendUrl]);

  useEffect(() => { mounted.current = true; const timer = setTimeout(() => void loadCatalogue(), 0); return () => { mounted.current = false; clearTimeout(timer); }; }, [loadCatalogue]);

  useEffect(() => { const timer = setTimeout(() => { resetJob(); setReferenceStart(""); setReferenceEnd(""); setEvaluationStart(""); setEvaluationEnd(""); setFormError(null); }, 0); return () => clearTimeout(timer); }, [datasetId, resetJob]);

  const fetchJob = useCallback(async (id: string, pageNum: number) => {
    if (!datasetId) return;
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) { setJobError("Backend URL is missing or invalid."); return; }
    if (inFlight.current) return;
    const controller = new AbortController(); inFlight.current = controller; const requestId = tracker.current.issue();
    try {
      const next = await getDetectorJob(origin, id, fetch, pageNum, DETECTOR_PAGE_SIZE, undefined, controller.signal);
      if (!mounted.current || !tracker.current.isCurrent(requestId)) return;
      if (next.dataset_id !== datasetId || next.detector?.id !== detector) { setJobError("A detector response for another dataset or detector was ignored."); return; }
      setJob(next); onJobChange?.(next); setJobError(null);
      if (detectorIsTerminal(next)) stopPolling();
    } catch (error) { if (mounted.current && tracker.current.isCurrent(requestId)) setJobError(messageFor(error, "Detector status request failed.")); }
    finally { if (inFlight.current === controller) inFlight.current = null; }
  }, [backendUrl, datasetId, detector, onJobChange, stopPolling]);

  const jobStatus = job?.status;

  useEffect(() => {
    if (!jobId || jobStatus === "completed" || jobStatus === "failed") return;
    const timer = setTimeout(() => { void fetchJob(jobId, page); pollTimer.current = setInterval(() => void fetchJob(jobId, page), DETECTOR_POLL_INTERVAL_MS); }, 0);
    return () => { clearTimeout(timer); stopPolling(); inFlight.current?.abort(); inFlight.current = null; };
  }, [fetchJob, jobId, jobStatus, page, stopPolling]);

  const changeScope = useCallback(() => { resetJob(); setFormError(null); }, [resetJob]);
  const changePage = useCallback((nextPage: number) => { onJobChange?.(null); setPage(nextPage); }, [onJobChange]);

  const create = useCallback(async () => {
    if (!datasetId || creating || availableDetectors.length === 0) return;
    const reference = { start_utc: referenceStart.trim(), end_utc: referenceEnd.trim() };
    const evaluation = { start_utc: evaluationStart.trim(), end_utc: evaluationEnd.trim() };
    const validation = validateDetectorWindows(reference, evaluation);
    if (!validation.ok) { setFormError(validation.error); return; }
    const origin = sanitizeOrigin(backendUrl); if (!origin) { setFormError("Backend URL is missing or invalid."); return; }
    setCreating(true); setFormError(null); setJobError(null); setPage(1);
    const controller = new AbortController();
    try {
      const ack = await submitDetectorJob(origin, datasetId, detector, reference, evaluation, fetch, undefined, controller.signal);
      if (!mounted.current) return;
      if (ack.detector !== detector) { setFormError("The submitted detector identity did not match the selection."); return; }
      setJobId(ack.job_id); setJob(null); onJobChange?.(null);
    } catch (error) { if (mounted.current) setFormError(messageFor(error, "Detector job submission failed.")); }
    finally { if (mounted.current) setCreating(false); }
  }, [availableDetectors.length, backendUrl, creating, datasetId, detector, evaluationEnd, evaluationStart, onJobChange, referenceEnd, referenceStart]);

  if (!datasetId) return <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"><h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Device detectors</h2><p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Select a dataset to run an excess-consumption or gradual-trend analysis.</p></section>;

  const result = job?.status === "completed" ? job.result ?? null : null;
  return <section aria-label={`Device detector analysis for dataset ${datasetId}`} className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Device detectors (P026)</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Persisted excess-consumption and gradual-trend jobs. These deviations are observations, not confirmed faults or priced savings.</p><p className="mt-1 break-all font-mono text-xs text-zinc-500">{datasetId}{currentDataset?.run_id ? ` · run ${currentDataset.run_id}` : ""}</p>{currentSummary?.coverage && <p className="mt-1 text-xs text-zinc-500">Imported coverage: {windowText(currentSummary.coverage.start_utc, currentSummary.coverage.end_utc)}</p>}</div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Backend only · no direct Python</span></div>{catalogueLoading && <p aria-live="polite" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading supported detectors…</p>}{catalogueError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{catalogueError}</p>}<div className="mt-4 grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 md:grid-cols-2"><label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Detector<select value={detector} onChange={(event) => { setDetector(event.target.value as DetectorId); changeScope(); }} disabled={catalogueLoading || availableDetectors.length === 0} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">{availableDetectors.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label><div className="text-xs text-zinc-600 dark:text-zinc-300"><p className="font-medium">Request windows</p><p className="mt-1 text-zinc-500">Both windows are required, ordered, non-overlapping, and aligned by the backend.</p></div><label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Reference from (UTC)<input value={referenceStart} onChange={(event) => { setReferenceStart(event.target.value); changeScope(); }} placeholder="2026-01-01T00:00:00Z" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label><label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Reference to (UTC, exclusive)<input value={referenceEnd} onChange={(event) => { setReferenceEnd(event.target.value); changeScope(); }} placeholder="2026-01-03T00:00:00Z" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label><label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Evaluation from (UTC)<input value={evaluationStart} onChange={(event) => { setEvaluationStart(event.target.value); changeScope(); }} placeholder="2026-01-03T00:00:00Z" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label><label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Evaluation to (UTC, exclusive)<input value={evaluationEnd} onChange={(event) => { setEvaluationEnd(event.target.value); changeScope(); }} placeholder="2026-01-05T00:00:00Z" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label></div>{formError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{formError}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void create()} disabled={creating || catalogueLoading || availableDetectors.length === 0} className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900">{creating ? "Submitting…" : `Run ${detectorName(detector).toLowerCase()}`}</button><span className="self-center text-xs text-zinc-500">Reference/evaluation values are never moved or expanded automatically.</span></div>{availableDetectors.find((entry) => entry.id === detector) && <details className="mt-3 text-xs text-zinc-600 dark:text-zinc-300"><summary className="cursor-pointer">Detector requirements and limits</summary><ul className="mt-1 list-disc pl-5">{availableDetectors.find((entry) => entry.id === detector)?.requirements.map((item) => <li key={item}>{item}</li>)}</ul></details>}{jobError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{jobError}{job ? " Showing the last successful detector state." : ""}</p>}{job && !detectorIsTerminal(job) && <p aria-live="polite" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Detector job {job.status}{job.progress ? ` — batch ${job.progress.completed_batches} of ${job.progress.total_batches}` : ""}…</p>}{job?.status === "failed" && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"><p className="font-medium">Detector job failed{job.error ? `: ${job.error.message}` : ""}</p>{job.error?.code?.toUpperCase().includes("INSUFFICIENT") && <p className="mt-1">The selected windows do not provide sufficient reference/history for this detector.</p>}{job.error?.code?.toUpperCase().includes("UNSUPPORTED") && <p className="mt-1">The selected context is unsupported for this detector.</p>}</div>}{result && <DetectorResultView result={result} page={page} onPage={changePage} />}{!jobId && !job && !creating && <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">No P026 detector job has been submitted for this dataset and window selection.</p>}</section>;
}
