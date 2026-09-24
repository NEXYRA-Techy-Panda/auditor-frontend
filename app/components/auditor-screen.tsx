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
import UploadPanel from "./upload-panel";
import { createSelectionRevision, type DatasetItem, type DatasetSummary } from "../lib/auditor-api";

export default function AuditorScreen({ backendUrl }: { backendUrl: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listToken, setListToken] = useState(0);
  const [tariffToken, setTariffToken] = useState(0);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<DatasetSummary | null>(null);
  const revision = useRef(createSelectionRevision());

  const manualSelect = useCallback((datasetId: string) => {
    revision.current.manualSelect();
    setSelectedId(datasetId);
  }, []);

  const captureRevision = useCallback(() => revision.current.current(), []);

  const handleTariffSaved = useCallback(() => {
    setTariffToken((t) => t + 1); // findings refetch recomputed costs
  }, []);

  const handleListChange = useCallback((items: DatasetItem[]) => {
    setDatasets(items);
  }, []);

  const handleImported = useCallback(
    (datasetId: string, submittedRev: number) => {
      setListToken((t) => t + 1); // reload the list either way
      if (revision.current.shouldAutoSelect(submittedRev)) {
        revision.current.autoSelect();
        setSelectedId(datasetId); // …select the new dataset and fetch summary
      }
      // Otherwise the user's newer manual selection stands; the upload panel
      // offers an explicit View action for the imported dataset.
    },
    [],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
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
          onTariffSaved={handleTariffSaved}
          onSummaryChange={setSelectedSummary}
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
        />
        <DetectorPanel
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          summary={selectedSummary}
        />
        <ForecastDashboard
          backendUrl={backendUrl}
          datasetId={selectedId}
          dataset={datasets.find((d) => d.dataset_id === selectedId) ?? null}
          tariffToken={tariffToken}
        />
      </div>
      <div className="flex flex-col gap-6">
        <ConnectionPanel backendUrl={backendUrl} kind="auditor" />
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Configuration
          </h2>
          <dl className="mt-2 space-y-1 font-mono text-sm text-zinc-800 dark:text-zinc-200">
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
        </section>
      </div>
    </div>
  );
}
