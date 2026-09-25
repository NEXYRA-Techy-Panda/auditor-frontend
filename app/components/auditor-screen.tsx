"use client";

// Auditor workspace screen state (Enterprise SaaS "God Mode" Edition).
// Hand-crafted, precision-engineered UI/UX with atmospheric obsidian styling,
// Linear/Raycast-grade micro-interactions, responsive bento grid, and persistent state.

import { useCallback, useRef, useState, useId } from "react";
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

type TabKey = "overview" | "analytics" | "detectors" | "forecast" | "report" | "datasets" | "all";

export default function AuditorScreen({ backendUrl }: { backendUrl: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
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
  const datasetSelectId = useId();

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
    setTariffToken((t) => t + 1);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleListChange = useCallback((items: DatasetItem[]) => {
    setDatasets(items);
    markReportSourceChanged();
  }, [markReportSourceChanged]);

  const handleImported = useCallback(
    (datasetId: string, submittedRev: number) => {
      setListToken((t) => t + 1);
      if (revision.current.shouldAutoSelect(submittedRev)) {
        revision.current.autoSelect();
        setSelectedId(datasetId);
        setSummaryRetrievedAt(null);
        setVacancyRetrievedAt(null);
        setDetectorRetrievedAt(null);
        setForecastRetrievedAt(null);
        setReportRevision((value) => value + 1);
      }
    },
    [],
  );

  const selectedDataset = datasets.find((d) => d.dataset_id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      {/* ========================================================================= */}
      {/* 1. ULTRA-PREMIUM COMMAND HEADER                                           */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070a12]/85 backdrop-blur-2xl transition-all">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand & System Badges */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-[0_0_20px_-3px_rgba(16,185,129,0.5)]">
              <div className="absolute inset-[1px] rounded-[11px] bg-[#070b14]/80 backdrop-blur-xs flex items-center justify-center">
                <svg className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold tracking-tight text-white sm:text-base">NEXYRA</span>
                <span className="h-3 w-[1px] bg-white/20"></span>
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-xs font-black tracking-widest text-transparent uppercase">
                  ENERGY AUDITOR
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.2 text-[9px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
                  ENTERPRISE
                </span>
              </div>
              <p className="text-[11px] font-medium tracking-tight text-slate-400">
                Commercial Telemetry • Anomaly Detection • Fiscal Forecasting
              </p>
            </div>
          </div>

          {/* Center Facility Command Selector */}
          <div className="hidden lg:flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 shadow-inner">
            <div className="flex items-center gap-1.5 text-slate-400">
              <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <label htmlFor={datasetSelectId} className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
                Facility Target:
              </label>
            </div>

            <select
              id={datasetSelectId}
              value={selectedId ?? ""}
              onChange={(e) => {
                if (e.target.value) manualSelect(e.target.value);
              }}
              className="max-w-[280px] truncate rounded-lg border-0 bg-transparent py-0.5 pr-8 pl-1 text-xs font-mono font-semibold text-emerald-400 transition focus:outline-none focus:ring-0 cursor-pointer"
            >
              {datasets.length === 0 ? (
                <option value="" className="bg-[#0b0f19] text-slate-400">Awaiting dataset upload (0)</option>
              ) : (
                <>
                  {!selectedId && <option value="" className="bg-[#0b0f19] text-slate-400">Select active dataset ({datasets.length})...</option>}
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id} className="bg-[#0b0f19] text-slate-200">
                      {d.scenario_id ? `${d.scenario_id} • ` : ""}{d.dataset_id}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Right Live Connectivity HUD & Actions */}
          <div className="flex items-center gap-3">
            {/* Live Telemetry Ping */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
              </span>
              <span className="text-[11px] font-mono font-medium text-slate-300">CLOUD v1.0.1</span>
            </div>

            {/* Quick Ingest Button */}
            <button
              type="button"
              onClick={() => setActiveTab("datasets")}
              className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_0_20px_-3px_rgba(16,185,129,0.4)] transition hover:brightness-110 active:scale-95"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Ingest Dataset</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. FLOATING SEGMENTED NAVIGATION BAR                                      */}
        {/* ========================================================================= */}
        <div className="border-t border-white/[0.06] bg-[#070a12]/60 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between overflow-x-auto py-1.5">
            <nav className="flex space-x-1.5" aria-label="Workspaces">
              {[
                { key: "overview", label: "Mission Control", icon: "⚡" },
                { key: "analytics", label: "Historical Trends", icon: "📊" },
                { key: "detectors", label: "Anomaly Radar", icon: "🛡️" },
                { key: "forecast", label: "Predictive ML", icon: "🔮" },
                { key: "report", label: "Executive Audit", icon: "📑" },
                { key: "datasets", label: "Data Vault", icon: "💾", badge: datasets.length > 0 ? datasets.length : undefined },
                { key: "all", label: "Full Studio", icon: "🗂️" },
              ].map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] border border-white/[0.15]"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    <span className="text-xs transition-transform group-hover:scale-110">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                          isActive
                            ? "bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            : "bg-white/10 text-slate-300"
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span>ENGINE: READY</span>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 3. HERO EXECUTIVE BENTO KPI ARRAY                                          */}
      {/* ========================================================================= */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <section aria-label="Executive Health & Metrics Bento Grid" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Target Identity */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c101c]/80 p-5 shadow-xl backdrop-blur-xl transition hover:border-white/[0.18]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                Facility & Target
              </span>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-400 uppercase">
                {selectedDataset?.scenario_id ?? "Default"}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="font-mono text-xl font-black tracking-tight text-white sm:text-2xl">
                {selectedId ? `${selectedId.slice(0, 16)}…` : "No Target Active"}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {selectedSummary?.coverage
                ? `${selectedSummary.coverage.device_intervals} devices • ${selectedSummary.coverage.room_intervals} rooms monitored`
                : "Select or upload an audit dataset"}
            </p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-[0_0_8px_#06b6d4]"></div>
            </div>
          </div>

          {/* Card 2: Cumulative Energy Volume */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c101c]/80 p-5 shadow-xl backdrop-blur-xl transition hover:border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                Energy Consumption
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                </svg>
                <span>Live Feed</span>
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-black tracking-tight text-white sm:text-3xl">
                {selectedSummary?.energy_kwh != null
                  ? selectedSummary.energy_kwh.toLocaleString("en-IN", { maximumFractionDigits: 1 })
                  : "0.0"}
              </p>
              <span className="font-mono text-sm font-bold text-emerald-400">kWh</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {selectedSummary?.synthetic ? "Synthetically Generated Horizon" : "Full Duration Metered Interval"}
            </p>
            {/* Sparkline wave effect */}
            <div className="mt-3 flex h-1.5 items-end gap-1">
              {[40, 65, 45, 90, 75, 100, 85, 70, 95, 60, 80, 100].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="flex-1 rounded-xs bg-emerald-500/40 transition group-hover:bg-emerald-400"
                ></div>
              ))}
            </div>
          </div>

          {/* Card 3: Fiscal Yield & Economics */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c101c]/80 p-5 shadow-xl backdrop-blur-xl transition hover:border-teal-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                Fiscal Economics
              </span>
              <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-teal-400 uppercase">
                INR
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-mono text-xl font-bold text-slate-400">₹</span>
              <p className="font-mono text-2xl font-black tracking-tight text-white sm:text-3xl">
                {selectedSummary?.cost_inr != null
                  ? selectedSummary.cost_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                  : "—"}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {selectedSummary?.tariff_inr_per_kwh != null
                ? `Tariff rate: ₹${selectedSummary.tariff_inr_per_kwh.toFixed(2)}/kWh`
                : "Tariff unconfigured"}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] font-mono text-slate-400">
              <span>SAVINGS POTENTIAL</span>
              <span className="text-emerald-400 font-bold">ANALYSIS READY</span>
            </div>
          </div>

          {/* Card 4: Intelligence Array Status */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c101c]/80 p-5 shadow-xl backdrop-blur-xl transition hover:border-emerald-500/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                Diagnostic Array
              </span>
              <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>P028 READY</span>
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="font-mono text-xl font-black tracking-tight text-white sm:text-2xl">
                5 Anomaly Detectors
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Baseload • Vacancy • Peak • Drift • Off-Hours
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  title={`Detector Node ${idx} Online`}
                  className="h-2 flex-1 rounded-full bg-emerald-500/60 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                ></div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. WORKSPACE PANELS (ZERO RELOAD / INSTANT SWITCHING)                     */}
        {/* ========================================================================= */}

        {/* Tab 1: Mission Control (Overview) */}
        <div className={activeTab === "overview" ? "block" : "hidden"}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-6">
              <SummaryPanel
                backendUrl={backendUrl}
                datasetId={selectedId}
                dataset={selectedDataset}
                onSummaryChange={handleSummaryChange}
                onTariffMutationStart={handleTariffMutationStart}
                onTariffCommitted={handleTariffCommitted}
                refreshToken={tariffToken}
                suppressPrintSummary={auditReportActive}
              />
              <HistoricalAnalytics
                backendUrl={backendUrl}
                datasetId={selectedId}
                dataset={selectedDataset}
                summary={selectedSummary}
                tariffToken={tariffToken}
              />
            </div>
            <div className="flex flex-col gap-6">
              <ConnectionPanel backendUrl={backendUrl} kind="auditor" />
              <ConfigCard backendUrl={backendUrl} />
            </div>
          </div>
        </div>

        {/* Tab 2: Historical Analytics */}
        <div className={activeTab === "analytics" ? "block" : "hidden"}>
          <HistoricalAnalytics
            backendUrl={backendUrl}
            datasetId={selectedId}
            dataset={selectedDataset}
            summary={selectedSummary}
            tariffToken={tariffToken}
          />
        </div>

        {/* Tab 3: Anomaly Detectors & Findings */}
        <div className={activeTab === "detectors" ? "block" : "hidden"}>
          <div className="flex flex-col gap-6">
            <DetectorPanel
              backendUrl={backendUrl}
              datasetId={selectedId}
              dataset={selectedDataset}
              summary={selectedSummary}
              onJobChange={handleDetectorJobChange}
            />
            <FindingsPanel
              backendUrl={backendUrl}
              datasetId={selectedId}
              tariffToken={tariffToken}
              onJobChange={handleVacancyJobChange}
            />
          </div>
        </div>

        {/* Tab 4: AI & ML Forecasting */}
        <div className={activeTab === "forecast" ? "block" : "hidden"}>
          <ForecastDashboard
            backendUrl={backendUrl}
            datasetId={selectedId}
            dataset={selectedDataset}
            tariffToken={tariffToken}
            onJobChange={handleForecastJobChange}
          />
        </div>

        {/* Tab 5: Executive Audit Report */}
        <div className={activeTab === "report" ? "block" : "hidden"}>
          <AuditReportPanel
            backendUrl={backendUrl}
            datasetId={selectedId}
            dataset={selectedDataset}
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

        {/* Tab 6: Data Vault & Ingestion */}
        <div className={activeTab === "datasets" ? "block" : "hidden"}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
            </div>
            <div className="flex flex-col gap-6">
              <ConnectionPanel backendUrl={backendUrl} kind="auditor" />
              <ConfigCard backendUrl={backendUrl} />
            </div>
          </div>
        </div>

        {/* Tab 7: Unified Full Studio (All Panels in Stack) */}
        <div className={activeTab === "all" ? "block" : "hidden"}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
                dataset={selectedDataset}
                onSummaryChange={handleSummaryChange}
                onTariffMutationStart={handleTariffMutationStart}
                onTariffCommitted={handleTariffCommitted}
                refreshToken={tariffToken}
                suppressPrintSummary={auditReportActive}
              />
              <HistoricalAnalytics
                backendUrl={backendUrl}
                datasetId={selectedId}
                dataset={selectedDataset}
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
                dataset={selectedDataset}
                summary={selectedSummary}
                onJobChange={handleDetectorJobChange}
              />
              <ForecastDashboard
                backendUrl={backendUrl}
                datasetId={selectedId}
                dataset={selectedDataset}
                tariffToken={tariffToken}
                onJobChange={handleForecastJobChange}
              />
              <AuditReportPanel
                backendUrl={backendUrl}
                datasetId={selectedId}
                dataset={selectedDataset}
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
            <div className="flex flex-col gap-6">
              <ConnectionPanel backendUrl={backendUrl} kind="auditor" />
              <ConfigCard backendUrl={backendUrl} />
            </div>
          </div>
        </div>

        {/* Connection check and configuration: collapsed by default, out of the way. */}
        <details className="group mt-8 rounded-2xl border border-white/[0.08] bg-[#0c101c]/80 shadow-xl backdrop-blur-xl transition hover:border-white/[0.15]">
          <summary className="cursor-pointer select-none px-5 py-3 text-xs font-mono font-medium text-slate-400 hover:text-white transition flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>Settings — backend connection &amp; configuration</span>
            </div>
            <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-white/[0.06] p-5">
            <ConnectionPanel backendUrl={backendUrl} kind="auditor" />
            <dl className="space-y-1.5 font-mono text-xs text-slate-300">
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-500">
                  Backend API =
                </dt>
                <dd className="break-all text-emerald-400">{backendUrl}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-500">
                  Contract version =
                </dt>
                <dd className="text-slate-300">v1.0.1 (read-only this layer)</dd>
              </div>
            </dl>
          </div>
        </details>
      </main>
    </div>
  );
}

function ConfigCard({ backendUrl }: { backendUrl: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0c101c]/80 p-6 shadow-xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
            Runtime Topology
          </h2>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] font-mono text-slate-400">
          PROD-MIRROR
        </span>
      </div>

      <dl className="mt-4 space-y-3 font-mono text-xs text-slate-300">
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Authority Gateway
          </dt>
          <dd className="mt-1 break-all rounded-lg border border-white/[0.06] bg-black/40 p-2 font-mono text-[11px] text-emerald-400">
            {backendUrl}
          </dd>
        </div>

        <div className="flex justify-between border-t border-white/[0.06] pt-2.5">
          <dt className="text-slate-400">Contract Standard</dt>
          <dd className="font-bold text-emerald-400">v1.0.1 (Strict)</dd>
        </div>

        <div className="flex justify-between border-t border-white/[0.06] pt-2.5">
          <dt className="text-slate-400">ML Inference Node</dt>
          <dd className="text-slate-200">127.0.0.1:19003</dd>
        </div>

        <div className="flex justify-between border-t border-white/[0.06] pt-2.5">
          <dt className="text-slate-400">Auditor Port</dt>
          <dd className="text-slate-200">19002 (Active)</dd>
        </div>
      </dl>
    </section>
  );
}
