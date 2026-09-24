'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  buildAuditReportSnapshot,
  canPrintAuditReport,
  fetchReportHistorical,
  reportJobResult,
  sameReportContext,
  reportStatusText,
  type AuditReportContext,
  type AuditReportSnapshot,
  type ReportHistoricalData,
  type ReportJobSnapshot,
  type ReportPage,
} from '../lib/audit-report';
import type { HistoricalWindow } from '../lib/historical';
import { FINDINGS_PAGE_SIZE, getAnalysisJob, type AnalysisJob, type JobResult } from '../lib/analysis';
import { DETECTOR_PAGE_SIZE, getDetectorJob, type DetectorJob, type DetectorResult } from '../lib/detectors';
import { REPORT_PREVIEW_MAX_FINDING_IDS, submitReportPreview, type ReportPreviewResponse } from '../lib/report-preview';
import type { ForecastJob, ForecastResult } from '../lib/forecast';
import { ApiError, type DatasetItem, type DatasetSummary } from '../lib/auditor-api';
import { sanitizeOrigin } from '../lib/health';

function formatNumber(value: number | null | undefined, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { maximumFractionDigits: digits })
    : 'Unavailable';
}

function formatKwh(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : `${formatNumber(value, 6)} kWh`;
}

function formatInr(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : `₹${formatNumber(value, 2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
}

type ReportWindowLike = HistoricalWindow | { start_utc: string; end_utc: string };

function windowLabel(value: ReportWindowLike | null): string {
  if (!value) return 'Unavailable';
  const start = 'from_utc' in value ? value.from_utc : value.start_utc;
  const end = 'to_utc' in value ? value.to_utc : value.end_utc;
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function recordValue(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'string' && item.length > 0 ? item : null;
}

function pageNote<T>(page: ReportPage<T> | null, noun: string): string {
  if (!page) return `${noun}: unavailable`;
  const excerpt = page.excerpt ? `; excerpt (${page.included_count} included, ${page.omitted_count} omitted)` : `; ${page.included_count} of ${page.total} included`;
  return `${noun}: ${page.included_count} of ${page.total} included; ${page.fetched_pages}/${page.total_pages} pages${excerpt}`;
}

function displayUnknown(value: unknown): string {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'Supplied structured value';
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className='mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800'><h3 className='text-base font-semibold'>{title}</h3>{children}</section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className='rounded-lg border border-zinc-200 p-3 dark:border-zinc-800'><p className='text-xs uppercase tracking-wide text-zinc-500'>{label}</p><p className='mt-1 font-mono text-sm'>{value}</p>{detail && <p className='mt-1 text-xs text-zinc-500'>{detail}</p>}</div>;
}

function JobState({ job }: { job: ReportJobSnapshot }) {
  return <div className='rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800'><p className='font-medium'>{job.kind}: {reportStatusText(job.status)}</p><p className='mt-1 break-all font-mono text-xs text-zinc-500'>{job.job_id ?? 'No job ID'}{job.secondary_id ? ` · ${job.secondary_id}` : ''}</p>{job.message && <p className='mt-1 text-xs text-zinc-600 dark:text-zinc-300'>{job.message}</p>}</div>;
}

function HistoricalSection({ historical }: { historical: ReportHistoricalData }) {
  const rooms = historical.rooms?.items ?? [];
  const devices = historical.devices?.items ?? [];
  return <Section title='B. Historical consumption'><p className='text-sm'>Window: {windowLabel(historical.window)} · timezone: {historical.timezone ?? 'Unavailable'} · bucket: {historical.bucket_seconds ?? 'Unavailable'} seconds</p><p className='mt-1 text-xs text-zinc-500'>Canonical report scope: office/full export; no room/device drill-down is mixed into these totals. Page caps: timeseries {historical.query.timeseries_page_size}, breakdown {historical.query.breakdown_page_size}, maximum {historical.query.max_pages} pages per resource.</p><div className='mt-3 grid gap-3 sm:grid-cols-3'><Metric label='Observed energy' value={formatKwh(historical.full_period_observed_energy_kwh)} /><Metric label='Confirmed cost' value={formatInr(historical.full_period_observed_cost_inr)} /><Metric label='Coverage' value={reportStatusText(historical.status)} /></div>{historical.errors.length > 0 && <ul className='mt-3 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200'>{historical.errors.map((error) => <li key={error}>{error}</li>)}</ul>}<p className='mt-3 text-xs text-zinc-500'>{pageNote(historical.timeseries, 'Timeseries buckets')} · {pageNote(historical.rooms, 'Rooms')} · {pageNote(historical.devices, 'Devices')}</p>{rooms.length > 0 && <><h4 className='mt-4 text-sm font-semibold'>Room breakdown</h4><div className='mt-2 overflow-x-auto'><table className='w-full min-w-[620px] text-left text-xs'><thead><tr className='border-b border-zinc-300 dark:border-zinc-700'><th className='py-1.5 pr-3'>Room</th><th className='py-1.5 pr-3'>Energy</th><th className='py-1.5 pr-3'>Cost</th><th className='py-1.5'>Coverage</th></tr></thead><tbody>{rooms.map((room) => <tr key={room.room_id} className='border-b border-zinc-100 dark:border-zinc-900'><td className='py-1.5 pr-3'>{room.name} ({room.room_id})</td><td className='py-1.5 pr-3 font-mono'>{formatKwh(room.observed_energy_kwh)}</td><td className='py-1.5 pr-3 font-mono'>{formatInr(room.observed_cost_inr)}</td><td className='py-1.5'>{room.coverage.status}</td></tr>)}</tbody></table></div></>}{devices.length > 0 && <><h4 className='mt-4 text-sm font-semibold'>Device breakdown</h4><div className='mt-2 overflow-x-auto'><table className='w-full min-w-[720px] text-left text-xs'><thead><tr className='border-b border-zinc-300 dark:border-zinc-700'><th className='py-1.5 pr-3'>Device</th><th className='py-1.5 pr-3'>Energy</th><th className='py-1.5 pr-3'>Observed power</th><th className='py-1.5'>Coverage</th></tr></thead><tbody>{devices.map((device) => <tr key={device.device_id} className='border-b border-zinc-100 dark:border-zinc-900'><td className='py-1.5 pr-3'>{device.name} ({device.device_id})</td><td className='py-1.5 pr-3 font-mono'>{formatKwh(device.observed_energy_kwh)}</td><td className='py-1.5 pr-3 font-mono'>avg {formatNumber(device.observed_average_power_w)} W</td><td className='py-1.5'>{device.coverage.status}</td></tr>)}</tbody></table></div></>}{historical.weekdays && <><h4 className='mt-4 text-sm font-semibold'>Weekday comparison</h4><div className='mt-2 overflow-x-auto'><table className='w-full min-w-[620px] text-left text-xs'><thead><tr className='border-b border-zinc-300 dark:border-zinc-700'><th className='py-1.5 pr-3'>Weekday</th><th className='py-1.5 pr-3'>Total</th><th className='py-1.5 pr-3'>Mean / complete day</th><th className='py-1.5'>Coverage</th></tr></thead><tbody>{historical.weekdays.weekdays.map((day) => <tr key={day.weekday} className='border-b border-zinc-100 dark:border-zinc-900'><td className='py-1.5 pr-3'>{day.weekday}</td><td className='py-1.5 pr-3 font-mono'>{formatKwh(day.observed_energy_total_kwh)}</td><td className='py-1.5 pr-3 font-mono'>{formatKwh(day.mean_energy_per_complete_day_kwh)}</td><td className='py-1.5'>{day.complete_day_count} complete · {day.partial_day_count} partial</td></tr>)}</tbody></table></div></>}</Section>;
}

function vacancyResult(job: ReportJobSnapshot): JobResult | null {
  return reportJobResult(job, (value): value is JobResult => 'totals' in value && 'findings' in value || 'totals' in value);
}

function detectorResult(job: ReportJobSnapshot): DetectorResult | null {
  return reportJobResult(job, (value): value is DetectorResult => 'detector' in value && 'devices' in value && 'detector_coverage' in value);
}

function forecastResult(job: ReportJobSnapshot): ForecastResult | null {
  return reportJobResult(job, (value): value is ForecastResult => 'horizon' in value && 'total_energy_kwh' in value);
}

function VacancySection({ job }: { job: ReportJobSnapshot }) {
  const result = vacancyResult(job);
  const findings = result?.findings ?? [];
  return <Section title='C. Operational findings'><JobState job={job} />{result && <><div className='mt-3 grid gap-3 sm:grid-cols-2'><Metric label='Dataset energy' value={formatKwh(result.totals.dataset_energy_kwh)} /><Metric label='Avoidable energy' value={formatKwh(result.totals.avoidable_energy_kwh)} detail='Vacancy analysis only; not detector energy' /></div>{result.excluded_devices.length > 0 && <p className='mt-3 text-xs text-zinc-600'>Excluded devices: {result.excluded_devices.map((item) => `${item.device_id} (${item.reason})`).join('; ')}</p>}<p className='mt-3 text-xs text-zinc-500'>{job.findings_included_count ?? findings.length} findings included; {job.findings_total ?? 'unknown'} total backend findings{job.findings_excerpt ? ' (explicit excerpt)' : ''}.</p>{findings.length > 0 && <ul className='mt-3 space-y-2'>{findings.slice(0, 20).map((finding) => <li key={finding.finding_id} className='rounded border border-zinc-200 p-3 text-xs dark:border-zinc-800'><p className='font-medium'>{finding.finding_type} · {finding.device_id ?? 'device not supplied'}</p><p className='mt-1'>{windowLabel(finding.window_start_utc && finding.window_end_utc ? { start_utc: finding.window_start_utc, end_utc: finding.window_end_utc } : null)}</p>{finding.avoidable_energy_kwh !== undefined && <p className='mt-1 font-mono'>Avoidable: {formatKwh(finding.avoidable_energy_kwh)} · cost {formatInr(finding.avoidable_cost_inr)}</p>}{finding.suggested_action && <p className='mt-1'>Suggested action: {finding.suggested_action}</p>}{finding.assumptions && <p className='mt-1'>Assumptions: {finding.assumptions}</p>}{finding.resolution_limit && <p className='mt-1'>Resolution limit: {finding.resolution_limit}</p>}</li>)}</ul>}</>}</Section>;
}

function DetectorSection({ job }: { job: ReportJobSnapshot }) {
  const result = detectorResult(job);
  const findings = result?.findings ?? [];
  return <Section title='D. Device observations'><JobState job={job} />{result && <><p className='mt-3 text-sm'>Result status: {result.status}</p><p className='mt-1 text-xs text-zinc-500'>Coverage: {result.coverage.devices} devices; {result.coverage.unsupported_devices} not assessed; {result.coverage.detector_calls} detector calls.</p><p className='mt-1 text-xs text-zinc-500'>{job.findings_included_count ?? findings.length} findings included; {job.findings_total ?? 'unknown'} total findings{job.findings_excerpt ? ' (explicit excerpt)' : ''}. Detector observations are not priced savings.</p>{result.exclusions.length > 0 && <p className='mt-2 text-xs text-zinc-600'>Exclusions: {result.exclusions.map((item) => displayUnknown(item)).join('; ')}</p>}{Object.keys(result.aggregation.excluded_device_bins).length > 0 && <p className='mt-1 text-xs text-zinc-600'>Excluded device bins are retained as counts; no zero-filled observations are added.</p>}{findings.length > 0 && <ul className='mt-3 space-y-2'>{findings.slice(0, 20).map((finding) => <li key={finding.finding_id} className='rounded border border-zinc-200 p-3 text-xs dark:border-zinc-800'><p className='font-medium'>{finding.finding_type} · {finding.device_id ?? 'device not supplied'}</p>{finding.energy_above_baseline_kwh !== undefined && <p className='mt-1 font-mono'>Energy above reference baseline: {formatKwh(finding.energy_above_baseline_kwh)} (not guaranteed avoidable)</p>}{finding.trend?.watts_per_day !== undefined && <p className='mt-1 font-mono'>Trend: {formatNumber(finding.trend.watts_per_day)} W/day</p>}{recordValue(finding.raw, 'suggested_action') && <p className='mt-1'>Suggested check: {recordValue(finding.raw, 'suggested_action')}</p>}</li>)}</ul>}{result.other_changes && result.other_changes.length > 0 && <div className='mt-3 text-xs text-zinc-600'><p>Other descriptive changes: {result.other_changes.length} returned; these are observations, not confirmed faults.</p><ul className='mt-1 list-disc pl-5'>{result.other_changes.slice(0, 20).map((change, index) => { const record = typeof change === 'object' && change !== null ? change as Record<string, unknown> : {}; return <li key={index}>{recordValue(record, 'classification') ?? 'Unclassified change'}: {displayUnknown(change)}</li>; })}</ul></div>}</>}</Section>;
}

function ForecastSection({ job }: { job: ReportJobSnapshot }) {
  const result = forecastResult(job);
  return <Section title='E. Forecast'><JobState job={job} />{result && <><div className='mt-3 grid gap-3 sm:grid-cols-3'><Metric label='Horizon' value={result.horizon} /><Metric label='Forecast energy' value={formatKwh(result.total_energy_kwh)} /><Metric label='Confirmed cost' value={formatInr(result.forecast_cost_inr)} /></div><p className='mt-3 text-xs text-zinc-600'>Origin {formatDate(result.origin_utc)} · {result.timezone} · baseline {result.baseline_version}</p><p className='mt-1 text-xs text-zinc-600'>Forecast is separate from historical consumption and is not an avoidable-savings claim.</p><p className='mt-1 text-xs text-zinc-500'>{result.points.length} hourly points returned; concise report includes summary only. First {result.points[0] ? formatDate(result.points[0].start_utc) : 'unavailable'} · last {result.points[result.points.length - 1] ? formatDate(result.points[result.points.length - 1].start_utc) : 'unavailable'}.</p>{result.assumptions.length > 0 && <p className='mt-2 text-xs'>Assumptions: {result.assumptions.join('; ')}</p>}</>}</Section>;
}

function ServerEconomicsSection({ snapshot }: { snapshot: AuditReportSnapshot }) {
  const preview = snapshot.economics.preview;
  return <Section title='D.1 Server economics, assumptions and ranking'><p className='text-xs text-zinc-500'>All values below are returned by POST /api/v1/reports/preview; the browser does not calculate ROI, payback, overlap or ranking.</p>{!preview ? <p className='mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200'>{snapshot.economics.reason ?? 'Server economics preview unavailable.'}</p> : <><div className='mt-3 grid gap-3 sm:grid-cols-3'><Metric label='Server tariff' value={formatNumber(preview.tariff.inr_per_kwh)} detail={`${preview.tariff.currency ?? 'Currency unavailable'} · ${preview.tariff.provenance}`} /><Metric label='Recommendations' value={String(preview.recommendations.length)} detail={`${preview.evidence.finding_count} persisted findings selected`} /><Metric label='Comparison' value={preview.scenario_comparison.status} detail={preview.scenario_comparison.reason} /></div><ul className='mt-3 space-y-3'>{preview.recommendations.map((recommendation) => <li key={recommendation.recommendation_id} className='rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800'><p className='font-medium'>{recommendation.suggested_action}</p><p className='mt-1 break-all font-mono text-[11px] text-zinc-500'>{recommendation.recommendation_id}</p><p className='mt-1'>Evidence: {recommendation.evidence.reference.device_id} · {windowLabel({ start_utc: recommendation.evidence.reference.start_utc, end_utc: recommendation.evidence.reference.end_utc })} · {formatKwh(recommendation.evidence.avoidable_energy_kwh)}</p><p className='mt-1'>Economics: gross {formatInr(recommendation.economics.gross_savings_inr)} · net period {formatInr(recommendation.economics.net_period_savings_inr)} · ROI {recommendation.economics.period_roi_percent === null ? 'unavailable' : `${formatNumber(recommendation.economics.period_roi_percent)}%`} · payback {recommendation.economics.simple_payback_months === null ? 'unavailable' : `${formatNumber(recommendation.economics.simple_payback_months)} months`}</p><p className='mt-1'>Status: {recommendation.economics.status}{recommendation.economics.unavailable_reason ? ` — ${recommendation.economics.unavailable_reason}` : ''}; projection {recommendation.economics.projection_label ?? 'unavailable'}; assumptions {recommendation.economics.assumptions_provenance ?? 'unavailable'}.</p>{recommendation.evidence.finding_assumptions.length > 0 && <p className='mt-1'>Finding assumptions: {recommendation.evidence.finding_assumptions.join('; ')}</p>}{recommendation.evidence.coverage_limitations.length > 0 && <p className='mt-1'>Coverage limits: {recommendation.evidence.coverage_limitations.join('; ')}</p>}{recommendation.overlap_excluded_from_ranking && <p className='mt-1 text-amber-800'>Excluded from ranking because of overlapping claims; evidence remains separate.</p>}</li>)}</ul>{preview.overlap_conflicts.length > 0 && <div className='mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200'><p>Overlap exclusions:</p>{preview.overlap_conflicts.map((conflict) => <p key={conflict.recommendation_ids.join('|')} className='mt-1'>{conflict.recommendation_ids.join(', ')} — {conflict.handling}</p>)}</div>}<p className='mt-3 text-xs text-zinc-500'>Ranking: {preview.ranking.ranked_ids.length} ranked; {preview.ranking.unranked_ids.length} unranked. {preview.ranking.meaning}</p></>}</Section>;
}

function recommendedActions(snapshot: AuditReportSnapshot): string[] {
  const actions: string[] = (snapshot.economics.preview?.recommendations ?? []).map((recommendation) => recommendation.suggested_action);
  const vacancy = vacancyResult(snapshot.vacancy);
  if (!snapshot.economics.preview) {
    for (const finding of vacancy?.findings ?? []) if (finding.suggested_action) actions.push(`Finding suggestion: ${finding.suggested_action}`);
  }
  const detector = detectorResult(snapshot.detector);
  for (const finding of detector?.findings ?? []) {
    const action = recordValue(finding.raw, 'suggested_action');
    if (action) actions.push(action);
    else if (finding.device_id) actions.push(`Investigation guidance: investigate ${finding.device_id} using the returned observation and check schedule, operating context and meter coverage.`);
  }
  return [...new Set(actions)];
}

function RecommendationsSection({ snapshot }: { snapshot: AuditReportSnapshot }) {
  const actions = recommendedActions(snapshot);
  return <Section title='F. Recommended actions'>{actions.length > 0 ? <ol className='list-decimal space-y-2 pl-5 text-sm'>{actions.map((action) => <li key={action}>{action}</li>)}</ol> : <p className='text-sm text-zinc-600'>No returned recommended actions are available for this snapshot.</p>}<p className='mt-3 text-xs text-zinc-500'>Recommendations are evidence checks, not equipment replacement or savings promises.</p></Section>;
}

function AuditReportContent({ snapshot }: { snapshot: AuditReportSnapshot }) {
  const summary = snapshot.summary;
  return <article className='space-y-2 text-sm'><header><h2 className='text-xl font-semibold'>EnerSave audit report</h2><p className='mt-1 font-mono text-xs break-all'>Report {snapshot.report_id}</p><p className='text-xs text-zinc-500'>Generated {formatDate(snapshot.generated_at)}</p></header><Section title='A. Dataset and scope'><div className='grid gap-3 sm:grid-cols-2'><Metric label='Dataset' value={snapshot.dataset.dataset_id} detail={snapshot.dataset.run_id ? `Run ${snapshot.dataset.run_id}` : undefined} /><Metric label='Building' value={snapshot.dataset.building_name ?? 'Not supplied by dataset API'} /><Metric label='Scope window' value={windowLabel(snapshot.scope.window)} detail={snapshot.scope.timezone ? `Timezone ${snapshot.scope.timezone}` : 'Timezone unavailable'} /><Metric label='Tariff' value={formatInr(summary?.tariff_inr_per_kwh)} detail='Current confirmed server tariff' /><Metric label='Summary energy' value={formatKwh(summary?.energy_kwh)} /><Metric label='Summary cost' value={formatInr(summary?.cost_inr)} /><Metric label='Provenance' value={snapshot.provenance.synthetic === true ? 'Synthetic' : snapshot.provenance.synthetic === false ? 'Server marked non-synthetic' : 'Not specified'} detail={snapshot.provenance.synthetic_label ?? undefined} /></div><p className='mt-3 text-xs text-zinc-600'>Coverage: {summary?.coverage ? `${formatDate(summary.coverage.start_utc)} → ${formatDate(summary.coverage.end_utc)}` : 'Unavailable'}. {summary?.gap_assessment?.status === 'not_performed' ? 'Gap assessment not performed.' : 'Gap assessment status not supplied.'}</p><p className='mt-1 break-all text-xs text-zinc-500'>Source retrieval timestamps — summary {formatDate(snapshot.retrieved_at.summary)}; historical {formatDate(snapshot.retrieved_at.historical)}; vacancy {formatDate(snapshot.retrieved_at.vacancy)}; detector {formatDate(snapshot.retrieved_at.detector)}; forecast {formatDate(snapshot.retrieved_at.forecast)}; preview {formatDate(snapshot.retrieved_at.preview)}.</p></Section><HistoricalSection historical={snapshot.historical} /><VacancySection job={snapshot.vacancy} /><DetectorSection job={snapshot.detector} /><ServerEconomicsSection snapshot={snapshot} /><ForecastSection job={snapshot.forecast} /><Section title='Report boundaries'><div className='grid gap-3 sm:grid-cols-2'><Metric label='ROI / payback' value={snapshot.economics.preview ? 'Per-finding server status' : 'Unavailable'} detail={snapshot.economics.reason ?? 'ROI/payback values are shown only when returned by the server.'} /><Metric label='Original / improved comparison' value={snapshot.comparison.status} detail={snapshot.comparison.reason} /></div></Section><RecommendationsSection snapshot={snapshot} /><Section title='Limitations'><ul className='list-disc space-y-1 pl-5 text-xs text-zinc-600'>{snapshot.limitations.length > 0 ? snapshot.limitations.map((item) => <li key={item}>{item}</li>) : <li>No additional limitations were returned.</li>}</ul></Section></article>;
}

export function AuditReportPrintView({ snapshot }: { snapshot: AuditReportSnapshot | null }) {
  if (!snapshot) return null;
  return <div className='report-print hidden print:block'><AuditReportContent snapshot={snapshot} /></div>;
}

async function collectAnalysisJobPages(origin: string, job: AnalysisJob | null, signal: AbortSignal): Promise<{ job: AnalysisJob | null; note: string | null }> {
  if (!job || job.status !== 'completed' || !job.result) return { job, note: null };
  const total = job.result.findings_pagination?.total ?? (job.result.findings ?? []).length;
  const pageCount = Math.max(1, Math.ceil(total / FINDINGS_PAGE_SIZE));
  const pages: AnalysisJob[] = [];
  let first: AnalysisJob | null = null;
  try {
    for (let page = 1; page <= Math.min(pageCount, 20); page += 1) {
      const next = await getAnalysisJob(origin, job.job_id, fetch, page, FINDINGS_PAGE_SIZE, undefined, signal);
      pages.push(next);
      first ??= next;
    }
    if (!first?.result) return { job, note: 'Completed findings page 1 was unavailable.' };
    const merged = JSON.parse(JSON.stringify(first)) as AnalysisJob;
    if (merged.result) {
      merged.result.findings = pages.flatMap((item) => item.result?.findings ?? []);
      merged.result.findings_pagination = { page: 1, page_size: FINDINGS_PAGE_SIZE, total };
    }
    return { job: merged, note: pageCount > 20 ? `Findings report is an excerpt: ${20} of ${pageCount} pages retrieved.` : null };
  } catch (error) {
    return { job: first ?? job, note: `Vacancy findings pagination incomplete: ${error instanceof Error ? error.message : 'request failed'}` };
  }
}

async function collectDetectorJobPages(origin: string, job: DetectorJob | null, signal: AbortSignal): Promise<{ job: DetectorJob | null; note: string | null }> {
  if (!job || job.status !== 'completed' || !job.result) return { job, note: null };
  const total = job.result.findings_pagination.total;
  const pageCount = Math.max(1, Math.ceil(total / DETECTOR_PAGE_SIZE));
  const pages: DetectorJob[] = [];
  let first: DetectorJob | null = null;
  try {
    for (let page = 1; page <= Math.min(pageCount, 20); page += 1) {
      const next = await getDetectorJob(origin, job.job_id, fetch, page, DETECTOR_PAGE_SIZE, undefined, signal);
      pages.push(next);
      first ??= next;
    }
    if (!first?.result) return { job, note: 'Completed detector findings page 1 was unavailable.' };
    const merged = JSON.parse(JSON.stringify(first)) as DetectorJob;
    if (merged.result) {
      merged.result.findings = pages.flatMap((item) => item.result?.findings ?? []);
      merged.result.findings_pagination = { page: 1, page_size: DETECTOR_PAGE_SIZE, total };
    }
    return { job: merged, note: pageCount > 20 ? `Detector findings report is an excerpt: ${20} of ${pageCount} pages retrieved.` : null };
  } catch (error) {
    return { job: first ?? job, note: `Detector findings pagination incomplete: ${error instanceof Error ? error.message : 'request failed'}` };
  }
}

async function collectReportPreview(origin: string, datasetId: string, job: AnalysisJob | null, signal: AbortSignal): Promise<{ preview: ReportPreviewResponse | null; note: string | null }> {
  if (!job || job.status !== 'completed' || !job.result?.findings?.length) return { preview: null, note: 'No completed vacancy findings were available for server economics preview.' };
  const findingIds = [...new Set(job.result.findings.map((finding) => finding.finding_id))].slice(0, REPORT_PREVIEW_MAX_FINDING_IDS);
  const note = findingIds.length < job.result.findings.length ? `Report preview is an excerpt: ${findingIds.length} of ${job.result.findings.length} stable finding IDs sent.` : null;
  try {
    const preview = await submitReportPreview(origin, { dataset_id: datasetId, job_id: job.job_id, finding_ids: findingIds }, fetch, undefined, signal);
    return { preview, note };
  } catch (error) {
    return { preview: null, note: `Report preview unavailable: ${error instanceof Error ? error.message : 'request failed'}` };
  }
}

export default function AuditReportPanel({ backendUrl, datasetId, dataset, summary, tariffToken, revision, summaryRetrievedAt, vacancyRetrievedAt, detectorRetrievedAt, forecastRetrievedAt, vacancyJob, detectorJob, forecastJob, onSnapshotChange }: { backendUrl: string; datasetId: string | null; dataset: DatasetItem | null; summary: DatasetSummary | null; tariffToken: number; revision: number; summaryRetrievedAt: string | null; vacancyRetrievedAt: string | null; detectorRetrievedAt: string | null; forecastRetrievedAt: string | null; vacancyJob: AnalysisJob | null; detectorJob: DetectorJob | null; forecastJob: ForecastJob | null; onSnapshotChange?: (snapshot: AuditReportSnapshot | null) => void }) {
  const [snapshot, setSnapshot] = useState<AuditReportSnapshot | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);
  const context = useMemo<AuditReportContext>(() => ({ dataset_id: datasetId ?? '', tariff_token: tariffToken, revision, vacancy_job_id: vacancyJob?.job_id ?? null, detector_job_id: detectorJob?.job_id ?? null, forecast_job_id: forecastJob?.job_id ?? null, summary_retrieved_at: summaryRetrievedAt, vacancy_retrieved_at: vacancyRetrievedAt, detector_retrieved_at: detectorRetrievedAt, forecast_retrieved_at: forecastRetrievedAt }), [datasetId, tariffToken, revision, vacancyJob?.job_id, detectorJob?.job_id, forecastJob?.job_id, summaryRetrievedAt, vacancyRetrievedAt, detectorRetrievedAt, forecastRetrievedAt]);
  const contextRef = useRef(context);
  useLayoutEffect(() => { contextRef.current = context; }, [context]);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => { setSnapshot(null); setError(null); onSnapshotChange?.(null); }, 0);
    return () => { mounted.current = false; clearTimeout(timer); inFlight.current?.abort(); inFlight.current = null; };
  }, [datasetId, onSnapshotChange]);

  const build = useCallback(async () => {
    if (!datasetId || building) return;
    if (!summary) { setError('Summary is unavailable; select a dataset and wait for its confirmed summary before building the report.'); return; }
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) { setError('Backend URL is missing or invalid.'); return; }
    const capturedContext = { ...contextRef.current };
    const capturedVacancy = vacancyJob;
    const capturedDetector = detectorJob;
    const capturedForecast = forecastJob;
    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    setBuilding(true);
    setError(null);
    try {
      const historical = await fetchReportHistorical(origin, datasetId, fetch, controller.signal);
      const [vacancyPages, detectorPages] = await Promise.all([
        collectAnalysisJobPages(origin, capturedVacancy, controller.signal),
        collectDetectorJobPages(origin, capturedDetector, controller.signal),
      ]);
      if (!mounted.current || !sameReportContext(capturedContext, contextRef.current)) {
        setError('Report build was invalidated because the dataset, tariff or a source job changed. Rebuild explicitly.');
        return;
      }
      const previewResult = await collectReportPreview(origin, datasetId, vacancyPages.job, controller.signal);
      if (!mounted.current || !sameReportContext(capturedContext, contextRef.current)) {
        setError('Report build was invalidated while finalizing. Rebuild explicitly.');
        return;
      }
      const sourceNotes = [vacancyPages.note, detectorPages.note, previewResult.note].filter((note): note is string => note !== null);
      const previewRetrievedAt = previewResult.preview ? new Date().toISOString() : null;
      const next = buildAuditReportSnapshot({ context: capturedContext, dataset, summary, historical, vacancyJob: vacancyPages.job, detectorJob: detectorPages.job, forecastJob: capturedForecast, reportPreview: previewResult.preview, source_notes: sourceNotes, retrieved_at: { summary: summaryRetrievedAt, historical: historical.retrieved_at, vacancy: vacancyRetrievedAt, detector: detectorRetrievedAt, forecast: forecastRetrievedAt, preview: previewRetrievedAt } });
      if (!mounted.current || !sameReportContext(capturedContext, contextRef.current)) {
        setError('Report build was invalidated while finalizing. Rebuild explicitly.');
        return;
      }
      setSnapshot(next);
      onSnapshotChange?.(next);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : 'Audit report build failed.');
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (mounted.current) setBuilding(false);
    }
  }, [backendUrl, building, dataset, datasetId, detectorJob, detectorRetrievedAt, forecastJob, forecastRetrievedAt, onSnapshotChange, summary, summaryRetrievedAt, vacancyJob, vacancyRetrievedAt]);

  const stale = snapshot ? !canPrintAuditReport(snapshot, context) : false;
  if (!datasetId) return <section className='rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950'><h2 className='text-sm font-medium uppercase tracking-wide text-zinc-500'>Audit report</h2><p className='mt-3 text-sm text-zinc-600'>Select a dataset to build an actionable report.</p></section>;
  return <section aria-label={`Audit report for dataset ${datasetId}`} className='rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950'><div className='flex flex-wrap items-start justify-between gap-3 print:hidden'><div><h2 className='text-sm font-medium uppercase tracking-wide text-zinc-500'>Actionable audit report</h2><p className='mt-1 text-sm text-zinc-600'>Build a fixed evidence snapshot from confirmed data. No new analysis or forecast jobs are created.</p></div><div className='flex gap-2'><button type='button' onClick={() => void build()} disabled={building} className='rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900'>{building ? 'Building…' : snapshot ? 'Rebuild audit report' : 'Build audit report'}</button>{snapshot && <button type='button' disabled={stale} onClick={() => window.print()} className='rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700'>{stale ? 'Rebuild before printing' : 'Print / Save PDF'}</button>}</div></div>{building && <p aria-live='polite' className='mt-4 text-sm text-zinc-600 print:hidden'>Collecting bounded historical pages and checking current job identities…</p>}{error && <p role='alert' className='mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 print:hidden dark:bg-red-950 dark:text-red-300'>{error}</p>}{snapshot && <div className='mt-4'><p className={`rounded-lg p-3 text-sm print:hidden ${stale ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>{stale ? 'The report snapshot is fixed but source data changed. Rebuild before printing or relying on it as current.' : `Snapshot fixed at ${formatDate(snapshot.generated_at)}. Rebuild required for later source changes.`}</p><div className='mt-4 rounded-lg border border-zinc-200 p-4 print:hidden dark:border-zinc-800'><AuditReportContent snapshot={snapshot} /></div></div>}<AuditReportPrintView snapshot={stale ? null : snapshot} /></section>;
}
