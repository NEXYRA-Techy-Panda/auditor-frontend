"use client";

// Auditor workspace screen state (P007 / A1-UI, Agent A — OpenCode).
// Upload → list refresh + select → summary. List failures never erase the
// upload result or a displayed summary.

import { useCallback, useState } from "react";
import ConnectionPanel from "./connection-panel";
import DatasetsPanel from "./datasets-panel";
import SummaryPanel from "./summary-panel";
import UploadPanel from "./upload-panel";

export default function AuditorScreen({ backendUrl }: { backendUrl: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listToken, setListToken] = useState(0);

  const handleImported = useCallback((datasetId: string) => {
    setListToken((t) => t + 1); // reload the list…
    setSelectedId(datasetId); // …select the new dataset and fetch its summary
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        <UploadPanel backendUrl={backendUrl} onImported={handleImported} />
        <DatasetsPanel
          backendUrl={backendUrl}
          selectedId={selectedId}
          onSelect={setSelectedId}
          refreshToken={listToken}
        />
        <SummaryPanel backendUrl={backendUrl} datasetId={selectedId} />
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
                NEXT_PUBLIC_AUDITOR_BACKEND_URL =
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
