import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseReportPreview, submitReportPreview } from '../report-preview.ts';

const FINDING_ID = 'vacant_but_on:light-1:2026-09-21T03:30:00Z';

function economics(overrides = {}) {
  return {
    status: 'available',
    unavailable_reason: null,
    projection_label: 'observed_period',
    projection_assumption: null,
    projected_energy_reduction_kwh: 0.01,
    gross_savings_inr: 0.1,
    recurring_cost_inr: 0,
    net_period_savings_inr: 0.1,
    implementation_cost_inr: null,
    upfront_classification: 'unknown',
    period_roi_percent: null,
    simple_payback_months: null,
    supported_net_recurring_savings_inr_per_month: null,
    payback_status: 'unknown_cost',
    currency: 'INR',
    tariff_inr_per_kwh: 10,
    calculation_input: { supported_energy_reduction_kwh: 0.01, tariff_inr_per_kwh: 10 },
    assumptions_provenance: 'no_user_economics_assumptions',
    ...overrides,
  };
}

const PREVIEW = {
  data: {
    dataset_id: 'ds-1',
    run_id: 'run-1',
    job_id: 'job-1',
    evidence: {
      source: 'persisted_completed_vacancy_findings',
      synthetic: true,
      synthetic_label: 'reference fixture',
      coverage: { start_utc: '2026-09-21T03:30:00Z', end_utc: '2026-09-21T03:32:00Z' },
      finding_count: 1,
    },
    tariff: { inr_per_kwh: 10, currency: 'INR', provenance: 'current_saved_local_tariff' },
    generated_utc: '2026-09-25T00:00:00.000Z',
    recommendations: [{
      recommendation_id: FINDING_ID,
      suggested_action: 'Review the lighting schedule',
      evidence_type: 'vacancy_estimate',
      method: 'rule',
      evidence: {
        reference: { dataset_id: 'ds-1', run_id: 'run-1', job_id: 'job-1', finding_id: FINDING_ID, device_id: 'light-1', room_id: 'room-1', start_utc: '2026-09-21T03:30:00Z', end_utc: '2026-09-21T03:31:00Z' },
        finding_assumptions: ['Vacancy beyond grace; standby draw applied'],
        coverage_limitations: ['60-second intervals'],
        synthetic: true,
        avoidable_energy_kwh: 0.01,
        source_period_days: 0.0006944444444444445,
        savings_basis: 'persisted avoidable_energy_kwh',
        energy_provenance: 'measured_and_derived_from_persisted_finding',
      },
      economics: economics(),
      overlap_excluded_from_ranking: false,
    }],
    ranking: { ranking_basis: 'shortest_supported_simple_payback', ranked_ids: [], unranked_ids: [FINDING_ID], overlap_conflicts: [], meaning: 'Only comparable recommendations with supported payback and known upfront cost are ranked.' },
    overlap_conflicts: [],
    scenario_comparison: { status: 'unverified', reason: 'Persisted external-input provenance does not establish matched scenarios' },
  },
  meta: { request_id: 'request-1' },
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('P028 backend report preview', () => {
  it('parses server economics, assumptions, ranking and unverified comparison', () => {
    const parsed = parseReportPreview(PREVIEW);
    assert.equal(parsed.dataset_id, 'ds-1');
    assert.equal(parsed.recommendations[0].economics.gross_savings_inr, 0.1);
    assert.equal(parsed.recommendations[0].economics.period_roi_percent, null);
    assert.equal(parsed.recommendations[0].economics.simple_payback_months, null);
    assert.equal(parsed.recommendations[0].economics.assumptions_provenance, 'no_user_economics_assumptions');
    assert.deepEqual(parsed.ranking.unranked_ids, [FINDING_ID]);
    assert.equal(parsed.scenario_comparison.status, 'unverified');
  });

  it('submits only stable IDs and the documented request fields', async () => {
    let captured;
    const result = await submitReportPreview('http://x', { dataset_id: 'ds-1', job_id: 'job-1', finding_ids: [FINDING_ID, FINDING_ID] }, async (url, init) => {
      captured = { url, init };
      return response(PREVIEW, 202);
    });
    assert.equal(result.recommendations.length, 1);
    assert.equal(captured.url, 'http://x/api/v1/reports/preview');
    assert.deepEqual(JSON.parse(captured.init.body), { dataset_id: 'ds-1', job_id: 'job-1', finding_ids: [FINDING_ID] });
  });

  it('preserves unset tariff as unavailable and zero tariff as numeric zero', async () => {
    const unset = structuredClone(PREVIEW);
    unset.data.tariff = { inr_per_kwh: null, currency: null, provenance: 'unset' };
    unset.data.recommendations[0].economics = economics({ status: 'unavailable', unavailable_reason: 'Tariff is required', gross_savings_inr: null, net_period_savings_inr: null, currency: null, tariff_inr_per_kwh: null });
    const unsetResult = parseReportPreview(unset);
    assert.equal(unsetResult.tariff.inr_per_kwh, null);
    assert.equal(unsetResult.recommendations[0].economics.status, 'unavailable');

    const zero = structuredClone(PREVIEW);
    zero.data.tariff = { inr_per_kwh: 0, currency: 'INR', provenance: 'current_saved_local_tariff' };
    zero.data.recommendations[0].economics = economics({ gross_savings_inr: 0, net_period_savings_inr: 0, tariff_inr_per_kwh: 0 });
    const zeroResult = parseReportPreview(zero);
    assert.equal(zeroResult.tariff.inr_per_kwh, 0);
    assert.equal(zeroResult.recommendations[0].economics.gross_savings_inr, 0);
  });

  it('keeps overlap conflicts separate and unranked', () => {
    const overlap = structuredClone(PREVIEW);
    overlap.data.ranking.overlap_conflicts = [[FINDING_ID]];
    overlap.data.ranking.unranked_ids = [FINDING_ID];
    overlap.data.overlap_conflicts = [{ recommendation_ids: [FINDING_ID], handling: 'Individual evidence is shown; conflicting recommendations are excluded from ranking and are not summed.' }];
    overlap.data.recommendations[0].overlap_excluded_from_ranking = true;
    const parsed = parseReportPreview(overlap);
    assert.equal(parsed.overlap_conflicts.length, 1);
    assert.equal(parsed.recommendations[0].overlap_excluded_from_ranking, true);
  });

  it('preserves server validation and identity errors', async () => {
    await assert.rejects(
      submitReportPreview('http://x', { dataset_id: 'ds-1', job_id: 'job-1', finding_ids: [FINDING_ID] }, async () => response({ error: { code: 'UNSUPPORTED_INPUT', message: 'Only completed vacancy analysis jobs support avoidable-energy reports', field: 'job_id' } }, 422)),
      (error) => error.code === 'UNSUPPORTED_INPUT' && error.field === 'job_id',
    );
    await assert.rejects(
      submitReportPreview('http://x', { dataset_id: 'other', job_id: 'job-1', finding_ids: [FINDING_ID] }, async () => response(PREVIEW, 202)),
      /identity/,
    );
  });
});
