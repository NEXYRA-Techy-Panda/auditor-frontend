"use client";

// Forecast dashboard (P025 / A6, Agent A — OpenCode).
// Uses only the committed P020 public job API. Historical observations,
// deterministic forecast consumption, and analysis avoidable energy remain
// explicitly separate. Forecast cost is not savings.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FORECAST_POLL_INTERVAL_MS,
  canRefreshForecastCost,
  completedForecastForDataset,
  createForecastSingleFlight,
  describeForecastHorizon,
  formatForecastInstant,
  getForecastJob,
  horizonLabel,
  isTerminalForecastStatus,
  prepareForecastChart,
  submitForecast,
  type ForecastChartPoint,
  type ForecastHorizon,
  type ForecastJob,
  type ForecastResult,
  type ForecastSubmission,
} from "../lib/forecast";
import { ApiError, createRequestTracker, type DatasetItem } from "../lib/auditor-api";
import { sanitizeOrigin } from "../lib/health";

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export default function ForecastDashboard({
  backendUrl,
  datasetId,
  dataset,
  tariffToken,
}: {
  backendUrl: string;
  datasetId: string | null;
  dataset: DatasetItem | null;
  tariffToken: number;
}) {
  const [horizon, setHorizon] = useState<ForecastHorizon>("next_24h");
  const [activeForecastId, setActiveForecastId] = useState<string | null>(null);
  const [activeHorizon, setActiveHorizon] = useState<ForecastHorizon | null>(null);
  const [submission, setSubmission] = useState<ForecastSubmission | null>(null);
  const [job, setJob] = useState<ForecastJob | null>(null);
  const [completedJob, setCompletedJob] = useState<ForecastJob | null>(null);
  const [creating, setCreating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // A new object identity for every dataset/horizon pair prevents even an
  // A → B → A late response from matching the earlier A request.
  const scopeToken = useMemo(
    () => ({ datasetId, horizon }),
    [datasetId, horizon],
  );
  const scopeTokenRef = useRef(scopeToken);
  useLayoutEffect(() => {
    scopeTokenRef.current = scopeToken;
  }, [scopeToken]);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());
  const createFlight = useRef(createForecastSingleFlight());
  const pollFlight = useRef(createForecastSingleFlight());
  const createAbort = useRef<AbortController | null>(null);
  const pollAbort = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const fetchJob = useCallback(
    async (
      forecastId: string,
      expectedHorizon: ForecastHorizon,
      expectedToken: object,
    ) => {
      const origin = sanitizeOrigin(backendUrl);
      if (!origin || !datasetId) {
        if (scopeTokenRef.current === expectedToken && mounted.current) {
          setRequestError("Backend URL is missing or invalid.");
        }
        return;
      }
      const flightToken = pollFlight.current.tryStart();
      if (flightToken === null) return;
      const controller = new AbortController();
      pollAbort.current = controller;
      const requestId = tracker.current.issue();
      try {
        const next = await getForecastJob(
          origin,
          forecastId,
          (url, init) => fetch(url, { ...init, signal: controller.signal }),
          datasetId,
          expectedHorizon,
        );
        if (
          !mounted.current ||
          scopeTokenRef.current !== expectedToken ||
          !tracker.current.isCurrent(requestId)
        ) {
          return;
        }
        setRequestError(null);
        if (next.horizon === horizon) setJob(next);
        if (next.status === "completed") {
          setCompletedJob(next);
          stopPolling();
        } else if (next.status === "failed") {
          stopPolling();
        }
      } catch (error) {
        if (
          !mounted.current ||
          scopeTokenRef.current !== expectedToken ||
          !tracker.current.isCurrent(requestId)
        ) {
          return;
        }
        setRequestError(messageFor(error, "Forecast status request failed."));
        if (
          error instanceof ApiError &&
          ["SCOPE_MISMATCH", "BAD_RESPONSE", "NOT_FOUND"].includes(
            error.code ?? "",
          )
        ) {
          stopPolling();
        }
        // A transient poll failure never erases the previous completed result.
      } finally {
        if (pollAbort.current === controller) pollAbort.current = null;
        pollFlight.current.finish(flightToken);
      }
    },
    [backendUrl, datasetId, horizon, stopPolling],
  );

  // Reset active request scope immediately on dataset/horizon change. The
  // previous completed result is retained, but can only render under an
  // explicit previous-result label and never as the current horizon.
  useEffect(() => {
    const requestTracker = tracker.current;
    const requestCreateFlight = createFlight.current;
    const requestPollFlight = pollFlight.current;
    mounted.current = true;
    requestTracker.issue();
    requestCreateFlight.invalidate();
    requestPollFlight.invalidate();
    createAbort.current?.abort();
    createAbort.current = null;
    pollAbort.current?.abort();
    pollAbort.current = null;
    stopPolling();
    const timer = setTimeout(() => {
      setActiveForecastId(null);
      setActiveHorizon(null);
      setSubmission(null);
      setJob(null);
      setCreating(false);
      setRequestError(null);
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      requestTracker.issue();
      requestCreateFlight.invalidate();
      requestPollFlight.invalidate();
      createAbort.current?.abort();
      createAbort.current = null;
      pollAbort.current?.abort();
      pollAbort.current = null;
      stopPolling();
    };
  }, [datasetId, horizon, scopeToken, stopPolling]);

  // Poll the exact accepted ID/horizon. Single-flight + abort + terminal stop
  // prevent overlap, late application and endless polling.
  useEffect(() => {
    if (
      !activeForecastId ||
      !activeHorizon ||
      activeHorizon !== horizon ||
      !datasetId
    ) {
      return;
    }
    if (job && isTerminalForecastStatus(job.status)) return;
    const currentPollFlight = pollFlight.current;
    const timer = setTimeout(() => {
      void fetchJob(activeForecastId, activeHorizon, scopeToken);
      pollTimer.current = setInterval(() => {
        void fetchJob(activeForecastId, activeHorizon, scopeToken);
      }, FORECAST_POLL_INTERVAL_MS);
    }, 0);
    return () => {
      clearTimeout(timer);
      stopPolling();
      pollAbort.current?.abort();
      pollAbort.current = null;
      currentPollFlight.invalidate();
    };
  }, [
    activeForecastId,
    activeHorizon,
    datasetId,
    fetchJob,
    horizon,
    job,
    scopeToken,
    stopPolling,
  ]);

  // A tariff save re-reads the currently displayed completed forecast. It
  // never submits another forecast/Python request.
  useEffect(() => {
    if (tariffToken === 0 || !datasetId) return;
    const currentCompleted = canRefreshForecastCost(job, datasetId, horizon)
      ? job
      : completedJob?.dataset_id === datasetId
        ? completedJob
        : null;
    if (!currentCompleted?.result) return;
    const timer = setTimeout(() => {
      void fetchJob(
        currentCompleted.forecast_id,
        currentCompleted.horizon,
        scopeToken,
      );
    }, 0);
    return () => clearTimeout(timer);
    // tariffToken intentionally triggers a same-job GET only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariffToken]);

  const requestForecast = useCallback(async () => {
    if (!datasetId) return;
    const expectedToken = scopeToken;
    const expectedHorizon = horizon;
    const flightToken = createFlight.current.tryStart();
    if (flightToken === null) return; // synchronous double-submit guard
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) {
      createFlight.current.finish(flightToken);
      setRequestError("Backend URL is missing or invalid.");
      return;
    }
    const controller = new AbortController();
    createAbort.current = controller;
    const requestId = tracker.current.issue();
    setCreating(true);
    setRequestError(null);
    try {
      const accepted = await submitForecast(
        origin,
        datasetId,
        expectedHorizon,
        (url, init) => fetch(url, { ...init, signal: controller.signal }),
      );
      if (
        !mounted.current ||
        scopeTokenRef.current !== expectedToken ||
        !tracker.current.isCurrent(requestId)
      ) {
        return;
      }
      setActiveForecastId(accepted.forecast_id);
      setActiveHorizon(accepted.horizon);
      setSubmission(accepted);
      setJob(null);
      // No automatic retry: a timeout/uncertain response is reported to the
      // user and only an explicit new click can create another job.
    } catch (error) {
      if (
        !mounted.current ||
        scopeTokenRef.current !== expectedToken ||
        !tracker.current.isCurrent(requestId)
      ) {
        return;
      }
      const base = messageFor(error, "Forecast submission failed.");
      setRequestError(
        error instanceof ApiError && error.status === null
          ? `${base} Request completion is unknown; no automatic retry was attempted.`
          : base,
      );
    } finally {
      if (createAbort.current === controller) createAbort.current = null;
      createFlight.current.finish(flightToken);
      if (
        mounted.current &&
        scopeTokenRef.current === expectedToken &&
        tracker.current.isCurrent(requestId)
      ) {
        setCreating(false);
      }
    }
  }, [backendUrl, datasetId, horizon, scopeToken]);

  if (!datasetId) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Energy forecast
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Select a dataset to request an energy forecast.
        </p>
      </section>
    );
  }

  const currentJob =
    job && job.dataset_id === datasetId && job.horizon === horizon ? job : null;
  const completed = completedForecastForDataset(
    currentJob,
    completedJob,
    datasetId,
  );
  const displayedCompleted =
    currentJob?.status === "completed" ? currentJob : completed;
  const isPreviousResult =
    displayedCompleted !== null &&
    (displayedCompleted !== currentJob || creating);
  const pendingCurrent =
    creating ||
    (activeForecastId !== null &&
      activeHorizon === horizon &&
      (currentJob === null || !isTerminalForecastStatus(currentJob.status)));
  const requestButtonDisabled = creating || pendingCurrent;

  return (
    <section
      aria-label={`Energy forecast for dataset ${datasetId}`}
      className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Energy forecast
      </h2>
      <p className="mt-1 break-all font-mono text-sm text-zinc-700 dark:text-zinc-300">
        {datasetId}
        {dataset?.run_id ? ` · run ${dataset.run_id}` : ""}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label
            htmlFor="forecast-horizon"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Forecast horizon
          </label>
          <select
            id="forecast-horizon"
            value={horizon}
            aria-describedby="forecast-horizon-help"
            onChange={(event) =>
              setHorizon(event.target.value as ForecastHorizon)
            }
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="next_24h">Next 24 hours</option>
            <option value="next_7d">Next 7 days</option>
            <option value="next_calendar_month">Next calendar month</option>
          </select>
          <p
            id="forecast-horizon-help"
            className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            Next calendar month means the complete following local calendar
            month in Asia/Kolkata, not the next 30 days. The server chooses the
            origin from the imported dataset end, not today.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void requestForecast()}
          disabled={requestButtonDisabled}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {creating
            ? "Submitting…"
            : currentJob?.status === "failed"
              ? "Request again"
              : pendingCurrent
                ? "Forecast requested"
                : "Request forecast"}
        </button>
      </div>

      {!activeForecastId && !requestError && !displayedCompleted && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Forecast not requested for this dataset and horizon yet.
        </p>
      )}

      {requestError && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {requestError}
        </p>
      )}

      {creating && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Submitting the forecast job request…
        </p>
      )}

      {!creating && submission && activeHorizon === horizon && !currentJob && !requestError && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Forecast queued. Forecast/job {submission.forecast_id}; waiting for
          the first status response.
        </p>
      )}

      {currentJob && !isTerminalForecastStatus(currentJob.status) && (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Forecast {currentJob.status}
          {currentJob.progress
            ? ` — step ${currentJob.progress.completed} of ${currentJob.progress.total}`
            : ""}
          . Origin {formatForecastInstant(currentJob.origin_utc, "Asia/Kolkata")} (
          {currentJob.origin_utc}).
        </p>
      )}

      {currentJob?.status === "failed" && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Forecast failed{currentJob.error?.code === "INSUFFICIENT_DATA"
              ? " — insufficient data"
              : ""}
            {currentJob.error ? `: ${currentJob.error.message}` : ""}
          </p>
          {currentJob.error && (
            <p className="mt-1 font-mono text-xs text-red-700 dark:text-red-300">
              Backend code: {currentJob.error.code}
            </p>
          )}
          {displayedCompleted && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">
              A previously completed forecast remains available below and is
              clearly labelled; it was not replaced by this failure.
            </p>
          )}
        </div>
      )}

      {displayedCompleted?.result && (
        <ForecastResultView
          forecastId={displayedCompleted.forecast_id}
          result={displayedCompleted.result}
          dataset={dataset}
          previous={isPreviousResult}
        />
      )}
    </section>
  );
}

function ForecastResultView({
  forecastId,
  result,
  dataset,
  previous,
}: {
  forecastId: string;
  result: ForecastResult;
  dataset: DatasetItem | null;
  previous: boolean;
}) {
  const chart = useMemo(() => prepareForecastChart(result.points), [result.points]);
  const originLocal = formatForecastInstant(result.origin_utc, result.timezone);
  const startLocal = formatForecastInstant(
    result.horizon_start_utc,
    result.timezone,
  );
  const endLocal = formatForecastInstant(result.horizon_end_utc, result.timezone);
  const coverage = result.history_coverage;
  const incompleteReasons = Object.entries(
    coverage.incomplete_hours_by_reason ?? {},
  );

  return (
    <div className="mt-5 border-t border-zinc-200 pt-5 dark:border-zinc-800">
      {previous && (
        <p className="mb-3 rounded-lg border border-dashed border-amber-500 p-2 text-sm text-amber-800 dark:text-amber-200">
          Previously completed result for {horizonLabel(result.horizon)} — not
          the current request/horizon.
        </p>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {horizonLabel(result.horizon)} forecast
        </h3>
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          Forecast ID / job ID {forecastId}
        </p>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Fact label="Dataset">
          {result.dataset_id}
          {dataset?.run_id ? ` · run ${dataset.run_id}` : ""}
        </Fact>
        <Fact label="Forecast origin">
          {originLocal} ({result.timezone}) · {result.origin_utc} (UTC)
        </Fact>
        <Fact label="Actual horizon start">
          {startLocal} ({result.timezone}) · {result.horizon_start_utc} (UTC)
        </Fact>
        <Fact label="Actual horizon end (exclusive)">
          {endLocal} ({result.timezone}) · {result.horizon_end_utc} (UTC)
        </Fact>
        <Fact label="Total forecast energy">
          {result.total_energy_kwh} kWh
        </Fact>
        <Fact label="Forecast cost (not savings)">
          {result.forecast_cost_inr === null
            ? "Unavailable — tariff not set"
            : `${formatInr(result.forecast_cost_inr)} at ${formatInr(result.tariff_inr_per_kwh ?? 0)}/kWh`}
        </Fact>
        <Fact label="Applied tariff">
          {result.tariff_inr_per_kwh === null
            ? "Not set"
            : `${result.tariff_inr_per_kwh} ₹/kWh`}
        </Fact>
        <Fact label="Baseline">
          {result.method} · {result.baseline_version}
        </Fact>
        <Fact label="Trained model">
          None — {result.model_version === null ? "model_version is null" : "unexpected model"}
        </Fact>
        <Fact label="Uncertainty">
          Unavailable — no prediction interval was supplied
        </Fact>
        <Fact label="Office-hours policy">
          {result.office_hours_policy.policy_id} · version {result.office_hours_policy.version}, effective{" "}
          {result.office_hours_policy.effective_from_utc}
        </Fact>
      </dl>

      <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
        Forecast consumption is expected building energy, not avoidable energy
        and not savings. Historical observed consumption and deterministic
        vacancy-analysis findings remain separate datasets/results.
      </p>

      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {describeForecastHorizon(result)}
      </p>

      {result.synthetic && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Synthetic dataset provenance: {result.synthetic_label ?? "No label supplied"}
        </p>
      )}

      <section className="mt-4" aria-label="Historical coverage and eligibility">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Historical coverage and eligibility
        </h4>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          {coverage.observed_hours} complete observed hours used; minimum for
          this horizon is {coverage.min_observed_hours_required} hours.
          {coverage.observed_start_utc
            ? ` Observed span: ${formatForecastInstant(coverage.observed_start_utc, result.timezone)} to ${coverage.observed_end_utc ? formatForecastInstant(coverage.observed_end_utc, result.timezone) : "not supplied"}.`
            : ""}
        </p>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          Candidate hours: {coverage.candidate_hours ?? "not supplied"};
          complete hours: {coverage.observed_complete_hours ?? "not supplied"};
          incomplete: {coverage.incomplete_hours ?? "not supplied"};
          trailing incomplete: {coverage.trailing_incomplete_hours ?? "not supplied"};
          gap before origin: {coverage.gap_before_origin_hours ?? "not supplied"}.
        </p>
        {incompleteReasons.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
            {incompleteReasons.map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count}
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.warnings.length > 0 && (
        <section className="mt-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-950" aria-label="Forecast warnings">
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Warnings
          </h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-100">
            {result.warnings.map((warning) => (
              <li key={`${warning.code}:${warning.message}`}>
                {warning.message} <span className="font-mono text-xs">({warning.code})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4" aria-label="Forecast assumptions and limitations">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Assumptions and limitations
        </h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {result.assumptions.map((assumption, index) => (
            <li key={`${index}:${assumption}`}>{assumption}</li>
          ))}
          {result.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600 underline dark:text-zinc-400">
            Recorded assumptions payload
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 font-mono text-xs whitespace-pre-wrap break-all text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {JSON.stringify(result.assumptions_recorded, null, 2)}
          </pre>
        </details>
      </section>

      <ForecastChartView result={result} chart={chart} />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words font-mono text-zinc-900 dark:text-zinc-50">
        {children}
      </dd>
    </div>
  );
}

function ForecastChartView({
  result,
  chart,
}: {
  result: ForecastResult;
  chart: ReturnType<typeof prepareForecastChart>;
}) {
  const tickIndices = Array.from(
    new Set([
      0,
      Math.floor((chart.points.length - 1) / 2),
      chart.points.length - 1,
    ]),
  ).filter((index) => index >= 0 && index < chart.points.length);
  const xTicks = tickIndices
    .map((index) => chart.points[index])
    .filter((point): point is ForecastChartPoint => point !== undefined);
  const average =
    chart.averageEnergyKwh === null
      ? "not available"
      : `${chart.averageEnergyKwh} kWh/hour`;

  return (
    <section className="mt-5" aria-label="Hourly forecast chart and data">
      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Hourly forecast energy
      </h4>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        {chart.numericCount} hourly energy values, each kWh per one-hour
        interval; minimum {chart.minEnergyKwh ?? "not available"} kWh,
        maximum {chart.maxEnergyKwh} kWh, average {average}. This is forecast
        consumption, not observed consumption or savings.
      </p>
      {chart.flat && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Flat series: all returned numeric values are equal.
        </p>
      )}
      {chart.missingCount > 0 && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          {chart.missingCount} point(s) are missing. The line breaks at missing
          values; no point is interpolated.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-auto min-w-[640px] w-full"
          role="img"
          aria-label={`Hourly forecast energy in kilowatt-hours per interval for ${horizonLabel(result.horizon)} in ${result.timezone}`}
        >
          <rect
            x={chart.plotLeft}
            y={chart.plotTop}
            width={chart.plotWidth}
            height={chart.plotHeight}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
          />
          {[0, 0.5, 1].map((fraction) => {
            const y = chart.plotTop + chart.plotHeight * (1 - fraction);
            const value = chart.maxEnergyKwh * fraction;
            return (
              <g key={fraction}>
                <line
                  x1={chart.plotLeft}
                  x2={chart.plotLeft + chart.plotWidth}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />
                <text
                  x={chart.plotLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="currentColor"
                >
                  {value}
                </text>
              </g>
            );
          })}
          {chart.linePaths.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {chart.isolatedPoints.map((point) => (
            <circle
              key={point.index}
              cx={point.x}
              cy={point.y ?? 0}
              r="3"
              fill="currentColor"
            />
          ))}
          {xTicks.map((point) => (
              <text
                key={point.index}
                x={point.x}
                y={chart.height - 12}
                textAnchor={point.index === 0 ? "start" : point.index === chart.points.length - 1 ? "end" : "middle"}
                fontSize="11"
                fill="currentColor"
              >
                {formatForecastInstant(point.start_utc, result.timezone)}
              </text>
            ))}
          <text
            x={chart.plotLeft}
            y={12}
            fontSize="11"
            fill="currentColor"
          >
            kWh per hourly interval
          </text>
        </svg>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
          Inspect all {result.points.length} returned hourly values
        </summary>
        <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              All returned hourly forecast energy values in {result.timezone}
            </caption>
            <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <tr>
                <th scope="col" className="px-3 py-2">Interval start</th>
                <th scope="col" className="px-3 py-2">UTC</th>
                <th scope="col" className="px-3 py-2">Energy</th>
                <th scope="col" className="px-3 py-2">Basis</th>
                <th scope="col" className="px-3 py-2">Support</th>
              </tr>
            </thead>
            <tbody>
              {result.points.map((point) => (
                <tr key={point.start_utc} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {formatForecastInstant(point.start_utc, result.timezone)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{point.start_utc}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{point.energy_kwh} kWh</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{point.basis}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{point.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
