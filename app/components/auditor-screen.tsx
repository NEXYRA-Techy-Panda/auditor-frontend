"use client";

// Auditor workspace screen state (P007 / P012 A2-UI, Agent A — OpenCode).
// Upload → list refresh + select → summary. List failures never erase the
// upload result or a displayed summary. An upload completion auto-selects its
// dataset only when the user has not deliberately selected something newer;
// otherwise an explicit View action is offered.

import { useCallback, useRef, useState } from "react";
import ConnectionPanel from "./connection-panel";
import DatasetsPanel from "./datasets-panel";
import SummaryPanel from "./summary-panel";
import FindingsPanel from "./findings-panel";
import ForecastDashboard from "./forecast-dashboard";
import DetectorPanel from "./detector-panel";
import HistoricalAnalytics from "./historical-analytics";
import AuditReportPanel from "./audit-report-panel";
import UploadPanel from "./upload-panel";
import { createSelectionRevision, type DatasetItem, type DatasetSummary } from "../lib/auditor-api";
import type { AnalysisJob } from "../lib/analysis";
import type { DetectorJob } from "../lib/detectors";
import type { ForecastJob } from "../lib/forecast";
import type { AuditReportSnapshot } from "../lib/audit-report";

export default function AuditorScreen({ backendUrl }: { backendUrl: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listToken, setListToken] = useState(0);
  const [tariffToken, setTariffToken] = useState(0);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<DatasetSummary | null>(null);
  const [summaryRetrievedAt, setSummaryRetrievedAt] = useState<string | null>(null);
  const [vacancyJob, setVacancyJob] = useState<AnalysisJob | null>(null);
  const [vacancyRetrievedAt, setVacancyRetrievedAt] = useState<string | null>(null);
  const [detectorJob, setDetectorJob] = useState<DetectorJob | null>(null);
  const [detectorRetrievedAt, setDetectorRetrievedAt] = useState<string | null>(null);
  const [forecastJob, setForecastJob] = useState<ForecastJob | null>(null);
  const [forecastRetrievedAt, setForecastRetrievedAt] = useState<string | null>(null);
  const [reportRevision, setReportRevision] = useState(0);
  const [auditReportActive, setAuditReportActive] = useState(false);
  const revision = useRef(createSelectionRevision());

  const manualSelect = useCallback((datasetId: string) => {
    revision.current.manualSelect();
    setSelectedId(datasetId);
    setSummaryRetrievedAt(null);
    setVacancyRetrievedAt(null);
    setDetectorRetrievedAt(null);
    setForecastRetrievedAt(null);
    setReportRevision((value) => value + 1);
  }, []);

  const captureRevision = useCallback(() => revision.current.current(), []);

  const markReportSourceChanged = useCallback(() => {
    setReportRevision((value) => value + 1);
  }, []);

  const handleSummaryChange = useCallback((summary: DatasetSummary | null) => {
    setSelectedSummary(summary);
    setSummaryRetrievedAt(summary ? new Date().toISOString() : null);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleVacancyJobChange = useCallback((job: AnalysisJob | null) => {
    setVacancyJob(job);
    setVacancyRetrievedAt(job ? new Date().toISOString() : null);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleDetectorJobChange = useCallback((job: DetectorJob | null) => {
    setDetectorJob(job);
    setDetectorRetrievedAt(job ? new Date().toISOString() : null);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleForecastJobChange = useCallback((job: ForecastJob | null) => {
    setForecastJob(job);
    setForecastRetrievedAt(job ? new Date().toISOString() : null);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleAuditReportChange = useCallback((snapshot: AuditReportSnapshot | null) => {
    setAuditReportActive(snapshot !== null);
  }, []);

  const handleTariffMutationStart = useCallback(() => {
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleTariffCommitted = useCallback(() => {
    setTariffToken((t) => t + 1); // findings/forecasts refetch costs; no jobs rerun
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleListChange = useCallback((items: DatasetItem[]) => {
    setDatasets(items);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleImported = useCallback(
    (datasetId: string, submittedRev: number) => {
      setListToken((t) => t + 1); // reload the list either way
      if (revision.current.shouldAutoSelect(submittedRev)) {
        revision.current.autoSelect();
        setSelectedId(datasetId); // …select the new dataset and fetch summary
        setSummaryRetrievedAt(null);
        setVacancyRetrievedAt(null);
        setDetectorRetrievedAt(null);
        setForecastRetrievedAt(null);
        setReportRevision((value) => value + 1);
      }
      // Otherwise the user's newer manual selection stands; the upload panel
      // offers an explicit View action for the imported dataset.
    },
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-6">
        <UploadPanel
          backendUrl={backendUrl}
          onUploadStart={captureRevision}
          onImported={handleImported}
          onViewDataset={manualSelect}
        />
        <DatasetsPanel
          backendUrl={backendUrl}
          selectedId={selectedId}
          onSelect={manualSelect}
          refreshToken={listToken}
          onListChange={handleListChange}
        />
        <SummaryPanel
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          onSummaryChange={handleSummaryChange}
          onTariffMutationStart={handleTariffMutationStart}
          onTariffCommitted={handleTariffCommitted}
          refreshToken={tariffToken}
          suppressPrintSummary={auditReportActive}
        />
        <HistoricalAnalytics
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          summary={selectedSummary}
          tariffToken={tariffToken}
        />
        <FindingsPanel
          backendUrl={backendUrl}
          datasetId={selectedId}
          tariffToken={tariffToken}
          onJobChange={handleVacancyJobChange}
        />
        <DetectorPanel
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          summary={selectedSummary}
          onJobChange={handleDetectorJobChange}
        />
        <ForecastDashboard
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          tariffToken={tariffToken}
          onJobChange={handleForecastJobChange}
        />
        <AuditReportPanel
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          summary={selectedSummary}
          tariffToken={tariffToken}
          revision={reportRevision}
          summaryRetrievedAt={summaryRetrievedAt}
          vacancyRetrievedAt={vacancyRetrievedAt}
          detectorRetrievedAt={detectorRetrievedAt}
          forecastRetrievedAt={forecastRetrievedAt}
          vacancyJob={vacancyJob}
          detectorJob={detectorJob}
          forecastJob={forecastJob}
          onSnapshotChange={handleAuditReportChange}
        />
      </div>
      {/* Connection check and configuration: collapsed by default, out of the way. */}
      <details className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
          Settings — backend connection &amp; configuration
        </summary>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <ConnectionPanel backendUrl={backendUrl} kind="auditor" />
          <dl className="space-y-1 font-mono text-sm text-zinc-800 dark:text-zinc-200">
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                Backend API =
              </dt>
              <dd className="break-all">{backendUrl}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                Contract =
              </dt>
              <dd>v1.0.1 (read-only this layer)</dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}
