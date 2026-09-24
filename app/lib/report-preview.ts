// P028 backend report-preview adapter.
// The browser sends stable persisted vacancy finding IDs only. All economics,
// overlap handling and ranking values are parsed from the backend response;
// this module performs no financial calculations.

import { ApiError, type FetchLike } from './auditor-api.ts';

export const REPORT_PREVIEW_MAX_FINDING_IDS = 50;

export interface ReportPreviewEconomicsInput {
  implementation_cost_inr?: number;
  recurring_cost_inr?: number;
  recurring_cost_period_months?: number;
  supported_gross_recurring_savings_inr_per_month?: number;
  projection_period_days?: number;
  projection_period_months?: number;
  extrapolation?: {
    source_period_days: number;
    multiplier: number;
    assumption: string;
  };
}

export interface ReportPreviewRequest {
  dataset_id: string;
  job_id: string;
  finding_ids: string[];
  economics?: ReportPreviewEconomicsInput;
}

export interface ReportPreviewTariff {
  inr_per_kwh: number | null;
  currency: string | null;
  provenance: string;
}

export interface ReportPreviewReference {
  dataset_id: string;
  run_id: string;
  job_id: string;
  finding_id: string;
  device_id: string;
  room_id: string;
  start_utc: string;
  end_utc: string;
}

export interface ReportPreviewEvidence {
  reference: ReportPreviewReference;
  finding_assumptions: string[];
  coverage_limitations: string[];
  synthetic: boolean | null;
  avoidable_energy_kwh: number | null;
  source_period_days: number | null;
  savings_basis: string;
  energy_provenance: string;
}

export interface ReportPreviewEconomics {
  status: 'available' | 'unavailable';
  unavailable_reason: string | null;
  projection_label: string | null;
  projection_assumption: string | null;
  projected_energy_reduction_kwh: number | null;
  gross_savings_inr: number | null;
  recurring_cost_inr: number | null;
  net_period_savings_inr: number | null;
  implementation_cost_inr: number | null;
  upfront_classification: string | null;
  period_roi_percent: number | null;
  simple_payback_months: number | null;
  supported_net_recurring_savings_inr_per_month: number | null;
  payback_status: string | null;
  currency: string | null;
  tariff_inr_per_kwh: number | null;
  calculation_input: Record<string, unknown>;
  assumptions_provenance: string | null;
}

export interface ReportPreviewRecommendation {
  recommendation_id: string;
  suggested_action: string;
  evidence_type: string;
  method: string;
  evidence: ReportPreviewEvidence;
  economics: ReportPreviewEconomics;
  overlap_excluded_from_ranking: boolean;
}

export interface ReportPreviewRanking {
  ranking_basis: string;
  ranked_ids: string[];
  unranked_ids: string[];
  overlap_conflicts: string[][];
  meaning: string;
}

export interface ReportPreviewOverlapConflict {
  recommendation_ids: string[];
  handling: string;
}

export interface ReportPreviewScenarioComparison {
  status: 'unverified' | 'unavailable';
  reason: string;
  matched_run_evidence: false;
}

export interface ReportPreviewResponse {
  dataset_id: string;
  run_id: string;
  job_id: string;
  evidence: {
    source: string;
    synthetic: boolean | null;
    synthetic_label: string | null;
    coverage: { start_utc: string; end_utc: string };
    finding_count: number;
  };
  tariff: ReportPreviewTariff;
  generated_utc: string;
  recommendations: ReportPreviewRecommendation[];
  ranking: ReportPreviewRanking;
  overlap_conflicts: ReportPreviewOverlapConflict[];
  scenario_comparison: ReportPreviewScenarioComparison;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reqString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === 'string' && item.length > 0 ? item : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function integer(value: unknown, min = 0): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function parseStringArrayArray(value: unknown): string[][] | null {
  return Array.isArray(value) && value.every((item) => parseStringArray(item) !== null) ? value as string[][] : null;
}

function parseReference(value: unknown): ReportPreviewReference | null {
  if (!isRecord(value)) return null;
  const datasetId = reqString(value, 'dataset_id');
  const runId = reqString(value, 'run_id');
  const jobId = reqString(value, 'job_id');
  const findingId = reqString(value, 'finding_id');
  const deviceId = reqString(value, 'device_id');
  const roomId = reqString(value, 'room_id');
  const start = reqString(value, 'start_utc');
  const end = reqString(value, 'end_utc');
  if (!datasetId || !runId || !jobId || !findingId || !deviceId || !roomId || !start || !end) return null;
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) return null;
  return { dataset_id: datasetId, run_id: runId, job_id: jobId, finding_id: findingId, device_id: deviceId, room_id: roomId, start_utc: start, end_utc: end };
}

function parseEvidence(value: unknown): ReportPreviewEvidence | null {
  if (!isRecord(value)) return null;
  const reference = parseReference(value.reference);
  const findingAssumptions = parseStringArray(value.finding_assumptions);
  const coverageLimitations = parseStringArray(value.coverage_limitations);
  const synthetic = value.synthetic === undefined ? null : boolean(value.synthetic);
  const avoidable = nullableNumber(value.avoidable_energy_kwh);
  const sourcePeriod = nullableNumber(value.source_period_days);
  const savingsBasis = reqString(value, 'savings_basis');
  const energyProvenance = reqString(value, 'energy_provenance');
  if (!reference || !findingAssumptions || !coverageLimitations || (value.synthetic !== undefined && synthetic === null) || avoidable === undefined || sourcePeriod === undefined || !savingsBasis || !energyProvenance) return null;
  return { reference, finding_assumptions: findingAssumptions, coverage_limitations: coverageLimitations, synthetic, avoidable_energy_kwh: avoidable, source_period_days: sourcePeriod, savings_basis: savingsBasis, energy_provenance: energyProvenance };
}

function parseEconomics(value: unknown): ReportPreviewEconomics | null {
  if (!isRecord(value)) return null;
  const status = reqString(value, 'status');
  if (status !== 'available' && status !== 'unavailable') return null;
  const unavailableReason = value.unavailable_reason === null ? null : nullableString(value.unavailable_reason);
  const projectionLabel = value.projection_label === null ? null : nullableString(value.projection_label);
  const projectionAssumption = value.projection_assumption === null ? null : nullableString(value.projection_assumption);
  const numericKeys = ['projected_energy_reduction_kwh', 'gross_savings_inr', 'recurring_cost_inr', 'net_period_savings_inr', 'implementation_cost_inr', 'period_roi_percent', 'simple_payback_months', 'supported_net_recurring_savings_inr_per_month', 'tariff_inr_per_kwh'] as const;
  const numeric: Record<string, number | null> = {};
  for (const key of numericKeys) {
    const parsed = nullableNumber(value[key]);
    if (parsed === undefined) return null;
    numeric[key] = parsed;
  }
  const upfront = value.upfront_classification === null ? null : nullableString(value.upfront_classification);
  const payback = value.payback_status === null ? null : nullableString(value.payback_status);
  const currency = value.currency === null ? null : nullableString(value.currency);
  const assumptions = value.assumptions_provenance === null ? null : nullableString(value.assumptions_provenance);
  const calculationInput = isRecord(value.calculation_input) ? value.calculation_input : null;
  if (unavailableReason === undefined || projectionLabel === undefined || projectionAssumption === undefined || upfront === undefined || payback === undefined || currency === undefined || assumptions === undefined || !calculationInput) return null;
  return {
    status,
    unavailable_reason: unavailableReason,
    projection_label: projectionLabel,
    projection_assumption: projectionAssumption,
    projected_energy_reduction_kwh: numeric.projected_energy_reduction_kwh,
    gross_savings_inr: numeric.gross_savings_inr,
    recurring_cost_inr: numeric.recurring_cost_inr,
    net_period_savings_inr: numeric.net_period_savings_inr,
    implementation_cost_inr: numeric.implementation_cost_inr,
    upfront_classification: upfront,
    period_roi_percent: numeric.period_roi_percent,
    simple_payback_months: numeric.simple_payback_months,
    supported_net_recurring_savings_inr_per_month: numeric.supported_net_recurring_savings_inr_per_month,
    payback_status: payback,
    currency,
    tariff_inr_per_kwh: numeric.tariff_inr_per_kwh,
    calculation_input: calculationInput,
    assumptions_provenance: assumptions,
  };
}

function parseRecommendation(value: unknown): ReportPreviewRecommendation | null {
  if (!isRecord(value)) return null;
  const recommendationId = reqString(value, 'recommendation_id');
  const suggestedAction = reqString(value, 'suggested_action');
  const evidenceType = reqString(value, 'evidence_type');
  const method = reqString(value, 'method');
  const evidence = parseEvidence(value.evidence);
  const economics = parseEconomics(value.economics);
  const overlap = boolean(value.overlap_excluded_from_ranking);
  if (!recommendationId || !suggestedAction || !evidenceType || !method || !evidence || !economics || overlap === null) return null;
  return { recommendation_id: recommendationId, suggested_action: suggestedAction, evidence_type: evidenceType, method, evidence, economics, overlap_excluded_from_ranking: overlap };
}

function parseRanking(value: unknown): ReportPreviewRanking | null {
  if (!isRecord(value)) return null;
  const basis = reqString(value, 'ranking_basis');
  const ranked = parseStringArray(value.ranked_ids);
  const unranked = parseStringArray(value.unranked_ids);
  const conflicts = parseStringArrayArray(value.overlap_conflicts);
  const meaning = reqString(value, 'meaning');
  if (!basis || !ranked || !unranked || !conflicts || !meaning) return null;
  return { ranking_basis: basis, ranked_ids: ranked, unranked_ids: unranked, overlap_conflicts: conflicts, meaning };
}

function parseOverlap(value: unknown): ReportPreviewOverlapConflict | null {
  if (!isRecord(value)) return null;
  const ids = parseStringArray(value.recommendation_ids);
  const handling = reqString(value, 'handling');
  return ids && handling ? { recommendation_ids: ids, handling } : null;
}

function parseScenarioComparison(value: unknown): ReportPreviewScenarioComparison | null {
  if (!isRecord(value)) return null;
  const status = reqString(value, 'status');
  const reason = reqString(value, 'reason');
  const matched = value.matched_run_evidence === undefined ? false : boolean(value.matched_run_evidence);
  if ((status !== 'unverified' && status !== 'unavailable') || !reason || matched !== false) return null;
  return { status, reason, matched_run_evidence: false };
}

export function parseReportPreview(value: unknown): ReportPreviewResponse | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  const datasetId = reqString(data, 'dataset_id');
  const runId = reqString(data, 'run_id');
  const jobId = reqString(data, 'job_id');
  const evidence = isRecord(data.evidence) ? data.evidence : null;
  const source = evidence ? reqString(evidence, 'source') : null;
  const synthetic = evidence && evidence.synthetic !== undefined ? boolean(evidence.synthetic) : null;
  const syntheticLabel = evidence ? (evidence.synthetic_label === null ? null : nullableString(evidence.synthetic_label)) : null;
  const coverage = evidence && isRecord(evidence.coverage) ? { start_utc: reqString(evidence.coverage, 'start_utc'), end_utc: reqString(evidence.coverage, 'end_utc') } : null;
  const findingCount = evidence ? integer(evidence.finding_count) : null;
  const tariff = isRecord(data.tariff) ? { inr_per_kwh: nullableNumber(data.tariff.inr_per_kwh), currency: data.tariff.currency === null ? null : nullableString(data.tariff.currency), provenance: reqString(data.tariff, 'provenance') } : null;
  const generated = reqString(data, 'generated_utc');
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations.map(parseRecommendation) : null;
  const ranking = parseRanking(data.ranking);
  const conflicts = Array.isArray(data.overlap_conflicts) ? data.overlap_conflicts.map(parseOverlap) : null;
  const scenario = parseScenarioComparison(data.scenario_comparison);
  if (!datasetId || !runId || !jobId || !evidence || !source || (evidence.synthetic !== undefined && synthetic === null) || syntheticLabel === undefined || !coverage || !coverage.start_utc || !coverage.end_utc || findingCount === null || !tariff || tariff.inr_per_kwh === undefined || tariff.currency === undefined || !tariff.provenance || !generated || !recommendations || recommendations.some((item) => item === null) || !ranking || !conflicts || conflicts.some((item) => item === null) || !scenario) return null;
  return {
    dataset_id: datasetId,
    run_id: runId,
    job_id: jobId,
    evidence: { source, synthetic, synthetic_label: syntheticLabel, coverage: { start_utc: coverage.start_utc, end_utc: coverage.end_utc }, finding_count: findingCount },
    tariff: { inr_per_kwh: tariff.inr_per_kwh, currency: tariff.currency, provenance: tariff.provenance },
    generated_utc: generated,
    recommendations: recommendations as ReportPreviewRecommendation[],
    ranking,
    overlap_conflicts: conflicts as ReportPreviewOverlapConflict[],
    scenario_comparison: scenario,
  };
}

async function requestJson(url: string, fetchImpl: FetchLike, timeoutMs: number, fallback: string, init: { body: string; signal?: AbortSignal }): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init.body, signal });
    if (!response.ok) {
      let detail: { code?: string; message?: string; field?: string } = {};
      try {
        const body = await response.json();
        const error = isRecord(body) && isRecord(body.error) ? body.error : isRecord(body) ? body : {};
        detail = { ...(typeof error.code === 'string' ? { code: error.code } : {}), ...(typeof error.message === 'string' ? { message: error.message } : {}), ...(typeof error.field === 'string' ? { field: error.field } : {}) };
      } catch { /* status fallback */ }
      const error = new ApiError(detail.message ?? `${fallback} (HTTP ${response.status}).`, response.status, detail.code ?? null);
      if (detail.field !== undefined) error.field = detail.field;
      throw error;
    }
    try { return await response.json(); } catch { throw new ApiError(`${fallback}: response was not valid JSON.`, response.status, 'BAD_RESPONSE'); }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(aborted ? `${fallback}: timed out or aborted after ${timeoutMs} ms.` : error instanceof Error ? `${fallback}: ${error.message}` : `${fallback}: unknown error.`, null, aborted ? 'TIMEOUT' : 'UNREACHABLE');
  } finally { clearTimeout(timer); }
}

export async function submitReportPreview(origin: string, request: ReportPreviewRequest, fetchImpl: FetchLike, timeoutMs = 15_000, signal?: AbortSignal): Promise<ReportPreviewResponse> {
  const fallback = 'Report preview request failed';
  const uniqueIds = [...new Set(request.finding_ids)];
  if (uniqueIds.length === 0 || uniqueIds.length > REPORT_PREVIEW_MAX_FINDING_IDS) throw new ApiError('Report preview requires 1–50 stable finding IDs.', null, 'VALIDATION_ERROR');
  const body: Record<string, unknown> = { dataset_id: request.dataset_id, job_id: request.job_id, finding_ids: uniqueIds };
  if (request.economics !== undefined) body.economics = request.economics;
  const json = await requestJson(`${origin}/api/v1/reports/preview`, fetchImpl, timeoutMs, fallback, { body: JSON.stringify(body), signal });
  const parsed = parseReportPreview(json);
  if (!parsed || parsed.dataset_id !== request.dataset_id || parsed.job_id !== request.job_id) throw new ApiError(`${fallback}: response identity did not match the request.`, 200, 'BAD_RESPONSE');
  return parsed;
}
