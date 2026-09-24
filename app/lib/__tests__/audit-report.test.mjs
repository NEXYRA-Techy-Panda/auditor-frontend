import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuditReportSnapshot,
  canPrintAuditReport,
  fetchReportHistorical,
  makeReportPage,
  mergeReportPages,
  sameReportContext,
} from '../audit-report.ts';

const DATASET = {
  dataset_id: 'ds-report',
  run_id: 'run-report',
  scenario_id: 'scenario-report',
  interval_seconds: 60,
  imported_utc: '2026-09-21T03:30:00Z',
};

const SUMMARY = {
  dataset_id: 'ds-report',
  energy_kwh: null,
  cost_inr: null,
  tariff_inr_per_kwh: 0,
  coverage: {
    start_utc: '2026-09-21T03:30:00Z',
    end_utc: '2026-09-21T03:32:00Z',
    device_intervals: 4,
    room_intervals: 4,
  },
  gaps: [],
  synthetic: false,
  synthetic_label: 'Server supplied provenance.',
  gap_assessment: { status: 'not_performed', message: 'No gap scan was performed.' },
};

const HISTORICAL = {
  dataset_id: 'ds-report',
  status: 'available',
  window: { from_utc: '2026-09-21T03:30:00Z', to_utc: '2026-09-21T03:32:00Z' },
  timezone: 'Asia/Kolkata',
  bucket_seconds: 3600,
  full_period_observed_energy_kwh: 0.03,
  full_period_observed_cost_inr: 0,
  timeseries: makeReportPage([
    { start_utc: '2026-09-21T03:30:00Z', end_utc: '2026-09-21T04:00:00Z', energy_kwh: 0.03, cost_inr: 0, coverage: {} },
  ], 1, 1),
  rooms: makeReportPage([], 0, 0),
  devices: makeReportPage([], 0, 0),
  weekdays: null,
  errors: [],
  retrieved_at: '2026-09-25T00:00:00.000Z',
  query: { scope: 'office', from_utc: null, to_utc: null, timeseries_bucket_seconds: 3600, timeseries_page_size: 500, breakdown_page_size: 200, max_pages: 20 },
};

const VACANCY_JOB = {
  job_id: 'vacancy-job',
  dataset_id: 'ds-report',
  status: 'completed',
  result: {
    dataset_id: 'ds-report',
    method: 'rule',
    method_version: 'vacant-beyond-grace-v1',
    warnings: [],
    excluded_devices: [],
    totals: {
      dataset_energy_kwh: 0.03,
      avoidable_energy_kwh: 0.01,
      unknown_avoidable_findings: 0,
      tariff_inr_per_kwh: 0,
      dataset_cost_inr: 0,
      avoidable_cost_inr: 0,
    },
    findings: [],
    findings_pagination: { page: 1, page_size: 100, total: 0 },
  },
};

const FAILED_DETECTOR_JOB = {
  job_id: 'detector-job',
  dataset_id: 'ds-report',
  status: 'failed',
  error: { code: 'PYTHON_UNAVAILABLE', message: 'Detector service unavailable.' },
};

const CONTEXT = {
  dataset_id: 'ds-report',
  tariff_token: 4,
  revision: 9,
  vacancy_job_id: 'vacancy-job',
  detector_job_id: 'detector-job',
  forecast_job_id: null,
};

describe('P028 audit report snapshot', () => {
  it('builds an immutable, source-independent snapshot', () => {
    const sourceSummary = structuredClone(SUMMARY);
    const snapshot = buildAuditReportSnapshot({
      context: CONTEXT,
      dataset: structuredClone(DATASET),
      summary: sourceSummary,
      historical: structuredClone(HISTORICAL),
      vacancyJob: structuredClone(VACANCY_JOB),
      detectorJob: structuredClone(FAILED_DETECTOR_JOB),
      forecastJob: null,
      generated_at: '2026-09-25T00:00:00.000Z',
      report_id: 'report-test',
      retrieved_at: { summary: 'summary-time', historical: 'history-time', vacancy: 'vacancy-time', detector: 'detector-time', forecast: null },
    });
    assert.equal(snapshot.schema_version, '1.0.1');
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(snapshot.summary.energy_kwh, null);
    assert.equal(snapshot.summary.tariff_inr_per_kwh, 0);
    assert.equal(snapshot.historical.full_period_observed_cost_inr, 0);
    assert.equal(snapshot.vacancy.status, 'available');
    assert.equal(snapshot.detector.status, 'failed');
    assert.equal(snapshot.forecast.status, 'not_run');
    assert.equal(snapshot.economics.status, 'unavailable');
    assert.equal(snapshot.economics.roi_percent, null);
    assert.equal(snapshot.comparison.status, 'unavailable');
    assert.equal(snapshot.comparison.matched_run_evidence, false);
    assert.equal(snapshot.retrieved_at.summary, 'summary-time');
    assert.equal(snapshot.retrieved_at.historical, 'history-time');
    assert.equal(snapshot.retrieved_at.vacancy, 'vacancy-time');
    assert.equal(canPrintAuditReport(snapshot, CONTEXT), true);
    assert.equal(canPrintAuditReport(snapshot, { ...CONTEXT, tariff_token: 99 }), false);
    sourceSummary.energy_kwh = 99;
    assert.equal(snapshot.summary.energy_kwh, null);
    assert.throws(() => { 'use strict'; snapshot.summary.energy_kwh = 99; });
  });

  it('rejects mismatched dataset and job identities', () => {
    assert.throws(() => buildAuditReportSnapshot({
      context: { ...CONTEXT, dataset_id: 'other' },
      dataset: DATASET,
      summary: SUMMARY,
      historical: HISTORICAL,
      vacancyJob: VACANCY_JOB,
      detectorJob: null,
      forecastJob: null,
    }), /Dataset identity/);
    assert.throws(() => buildAuditReportSnapshot({
      context: CONTEXT,
      dataset: DATASET,
      summary: SUMMARY,
      historical: HISTORICAL,
      vacancyJob: { ...VACANCY_JOB, dataset_id: 'other' },
      detectorJob: null,
      forecastJob: null,
    }), /Vacancy job identity/);
    assert.throws(() => buildAuditReportSnapshot({
      context: { ...CONTEXT, vacancy_job_id: null, detector_job_id: null },
      dataset: DATASET,
      summary: SUMMARY,
      historical: { ...HISTORICAL, dataset_id: 'other' },
      vacancyJob: null,
      detectorJob: null,
      forecastJob: null,
    }), /Historical data identity/);
    assert.throws(() => buildAuditReportSnapshot({
      context: { ...CONTEXT, vacancy_job_id: 'different-job' },
      dataset: DATASET,
      summary: SUMMARY,
      historical: HISTORICAL,
      vacancyJob: VACANCY_JOB,
      detectorJob: null,
      forecastJob: null,
    }), /Vacancy job changed/);
  });

  it('invalidates a report context when selection, tariff or source job revision changes', () => {
    assert.equal(sameReportContext(CONTEXT, { ...CONTEXT }), true);
    assert.equal(sameReportContext(CONTEXT, { ...CONTEXT, dataset_id: 'other' }), false);
    assert.equal(sameReportContext(CONTEXT, { ...CONTEXT, tariff_token: 5 }), false);
    assert.equal(sameReportContext(CONTEXT, { ...CONTEXT, revision: 10 }), false);
    assert.equal(sameReportContext(CONTEXT, { ...CONTEXT, forecast_job_id: 'new-job' }), false);
    assert.equal(sameReportContext(CONTEXT, { ...CONTEXT, summary_retrieved_at: '2026-09-25T00:00:01Z' }), false);
  });

  it('marks bounded page retrieval as complete or explicit excerpt', () => {
    const complete = mergeReportPages([[1, 2], [3]], 3, 2, 2);
    assert.equal(complete.included_count, 3);
    assert.equal(complete.total, 3);
    assert.equal(complete.excerpt, false);
    assert.equal(complete.omitted_count, 0);
    const excerpt = mergeReportPages([[1], [2]], 9, 4, 2);
    assert.equal(excerpt.included_count, 2);
    assert.equal(excerpt.total, 9);
    assert.equal(excerpt.total_pages, 4);
    assert.equal(makeReportPage([1], 9, 1, 20).excerpt, true);
    assert.throws(() => makeReportPage([1], -1, 1, 20), /total/);
    assert.equal(excerpt.excerpt, true);
    assert.equal(excerpt.omitted_count, 7);
  });

  it('stores server preview economics without recalculating them', () => {
    const preview = {
      dataset_id: 'ds-report',
      run_id: 'run-report',
      job_id: 'vacancy-job',
      evidence: { source: 'persisted_completed_vacancy_findings', synthetic: false, synthetic_label: null, coverage: { start_utc: '2026-09-21T03:30:00Z', end_utc: '2026-09-21T03:32:00Z' }, finding_count: 1 },
      tariff: { inr_per_kwh: 10, currency: 'INR', provenance: 'current_saved_local_tariff' },
      generated_utc: '2026-09-25T00:00:00.000Z',
      recommendations: [{ recommendation_id: 'finding-1', suggested_action: 'Review schedule', evidence_type: 'vacancy_estimate', method: 'rule', evidence: { finding_assumptions: [], coverage_limitations: [] }, economics: { status: 'available', unavailable_reason: null, gross_savings_inr: 0.1, period_roi_percent: null, simple_payback_months: null }, overlap_excluded_from_ranking: false }],
      ranking: { ranking_basis: 'shortest_supported_simple_payback', ranked_ids: [], unranked_ids: ['finding-1'], overlap_conflicts: [], meaning: 'Not ranked.' },
      overlap_conflicts: [],
      scenario_comparison: { status: 'unverified', reason: 'Matched-run provenance unavailable.', matched_run_evidence: false },
    };
    const snapshot = buildAuditReportSnapshot({ context: { ...CONTEXT, detector_job_id: null }, dataset: DATASET, summary: SUMMARY, historical: HISTORICAL, vacancyJob: VACANCY_JOB, detectorJob: null, forecastJob: null, reportPreview: preview, report_id: 'preview-test' });
    assert.equal(snapshot.economics.status, 'available');
    assert.equal(snapshot.economics.preview.recommendations[0].economics.gross_savings_inr, 0.1);
    assert.equal(snapshot.economics.roi_percent, null);
    assert.equal(snapshot.comparison.status, 'unverified');
  });

  it('keeps missing and failed analyses distinct from zero findings', () => {
    const snapshot = buildAuditReportSnapshot({
      context: { ...CONTEXT, vacancy_job_id: null },
      dataset: DATASET,
      summary: SUMMARY,
      historical: HISTORICAL,
      vacancyJob: null,
      detectorJob: FAILED_DETECTOR_JOB,
      forecastJob: null,
      generated_at: '2026-09-25T00:00:00.000Z',
      report_id: 'report-status-test',
    });
    assert.equal(snapshot.vacancy.status, 'not_run');
    assert.equal(snapshot.vacancy.message, 'Not run');
    assert.equal(snapshot.detector.status, 'failed');
    assert.match(snapshot.detector.message, /unavailable/i);
    assert.equal(snapshot.forecast.status, 'not_run');
    assert.equal(snapshot.economics.annual_savings, null);
  });

  it('fetches bounded historical pages without creating jobs', async () => {
    const calls = [];
    const response = (body) => ({ ok: true, status: 200, json: async () => body });
    const emptyBreakdown = (kind) => ({
      data: {
        dataset_id: 'ds-report',
        provenance: { synthetic: false, synthetic_label: null },
        window: { from_utc: '2026-09-21T03:30:00Z', to_utc: '2026-09-21T03:32:00Z' },
        tariff_inr_per_kwh: 0,
        items: [],
        total: 0,
        pagination: { page: 1, page_size: 200, total: 0, total_pages: 0 },
        full_filtered_observed_energy_kwh: 0,
        full_filtered_observed_cost_inr: 0,
        full_filtered_complete: true,
        page_observed_energy_kwh: 0,
        page_observed_cost_inr: 0,
        aggregation: kind,
      },
    });
    const timeseriesPage = (page) => ({
      data: {
        dataset_id: 'ds-report',
        timezone: 'Asia/Kolkata',
        provenance: { synthetic: false, synthetic_label: null },
        window: { from_utc: '2026-09-21T03:30:00Z', to_utc: '2026-09-21T03:32:00Z' },
        bucket_seconds: 3600,
        scope: { type: 'office' },
        tariff_inr_per_kwh: 0,
        full_period_observed_energy_kwh: 0.03,
        full_period_observed_cost_inr: 0,
        full_period_complete: true,
        page_observed_energy_kwh: 0.03,
        page_observed_cost_inr: 0,
        items: [{ start_utc: `2026-09-21T03:3${page}:00Z`, end_utc: `2026-09-21T03:3${page + 1}:00Z`, energy_kwh: 0.015, cost_inr: 0, coverage: { status: 'complete', expected_seconds: 3600, covered_seconds: 3600, expected_device_count: 1, covered_device_count: 1, partial_source_intervals: 0 } }],
        pagination: { page, page_size: 500, total: 2, total_pages: 2 },
      },
    });
    const weekdays = { data: { dataset_id: 'ds-report', timezone: 'Asia/Kolkata', provenance: { synthetic: false, synthetic_label: null }, calendar: 'calendar_weekday_only', window: { from_utc: '2026-09-21T03:30:00Z', to_utc: '2026-09-21T03:32:00Z' }, tariff_inr_per_kwh: 0, weekdays: [], coverage: { complete_day_count: 0, partial_day_count: 0, missing_day_count: 0, note: 'Coverage note.' } } };
    const result = await fetchReportHistorical('http://x', 'ds-report', async (url) => {
      calls.push(url);
      if (url.includes('/timeseries')) return response(timeseriesPage(new URL(url).searchParams.get('page') === '2' ? 2 : 1));
      if (url.includes('/rooms')) return response(emptyBreakdown('rooms'));
      if (url.includes('/devices')) return response(emptyBreakdown('devices'));
      return response(weekdays);
    }, new AbortController().signal);
    assert.equal(result.status, 'available');
    assert.equal(result.timeseries.included_count, 2);
    assert.equal(result.timeseries.excerpt, false);
    assert.equal(calls.filter((url) => url.includes('/timeseries')).length, 2);
  });
});
