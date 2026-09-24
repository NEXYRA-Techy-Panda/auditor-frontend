// Printable dataset summary (P014 / A3, Agent A — OpenCode).
// Renders ONLY a fixed ReportSnapshot (built from one coherent fetched
// response). Screen-hidden; shown for browser print only. No buttons, inputs,
// navigation, charts, findings, forecasts, or recommendations.

import type { ReportSnapshot } from "../lib/auditor-api";

function value(v: string | number | null, unit = ""): string {
  if (v === null) return "Not supplied by the backend";
  return unit ? `${v} ${unit}` : String(v);
}

export default function ReportView({
  snapshot,
}: {
  snapshot: ReportSnapshot | null;
}) {
  if (!snapshot) return null;
  return (
    <section
      aria-label="Printable energy dataset summary"
      className="report-print hidden print:block"
    >
      <h1>Energy dataset summary</h1>

      <section>
        <h2>Dataset</h2>
        <dl>
          <div>
            <dt>Dataset</dt>
            <dd>{snapshot.datasetId}</dd>
          </div>
          <div>
            <dt>Run</dt>
            <dd>{value(snapshot.runId)}</dd>
          </div>
          <div>
            <dt>Scenario</dt>
            <dd>{value(snapshot.scenarioId)}</dd>
          </div>
          <div>
            <dt>Export interval</dt>
            <dd>
              {snapshot.intervalSeconds !== null
                ? `${snapshot.intervalSeconds} seconds`
                : "Not supplied by the backend"}
            </dd>
          </div>
          <div>
            <dt>Imported</dt>
            <dd>
              {snapshot.importedUtc !== null
                ? `${snapshot.importedUtc} (UTC; no building timezone supplied)`
                : "Not supplied by the backend"}
            </dd>
          </div>
        </dl>
        <p>
          Data period: not supplied by the backend — no calendar month is
          inferred and full coverage is not claimed.
        </p>
      </section>

      <section>
        <h2>Energy and cost</h2>
        <dl>
          <div>
            <dt>Energy consumed</dt>
            <dd>{snapshot.energyKwh} kWh</dd>
          </div>
          <div>
            <dt>Applied tariff</dt>
            <dd>
              {snapshot.tariffInrPerKwh !== null
                ? snapshot.tariffInrPerKwh === 0
                  ? "₹0/kWh (explicit zero rate)"
                  : `₹${snapshot.tariffInrPerKwh}/kWh`
                : "Unset (no tariff applied)"}
            </dd>
          </div>
          <div>
            <dt>Estimated cost</dt>
            <dd>
              {snapshot.costInr !== null
                ? `₹${snapshot.costInr}`
                : "Unset (no tariff applied)"}
            </dd>
          </div>
        </dl>
        <p>
          Cost uses a flat electricity rate and may differ from the utility
          bill.
        </p>
      </section>

      <section>
        <h2>Data quality</h2>
        {snapshot.gaps.length === 0 ? (
          <p>No coverage gaps reported by the backend.</p>
        ) : (
          <>
            <p>{snapshot.gaps.length} coverage gap(s) reported:</p>
            <ul>
              {snapshot.gaps.map((g, i) => (
                <li key={i}>{JSON.stringify(g)}</li>
              ))}
            </ul>
          </>
        )}
        {snapshot.synthetic === true && (
          <p>Synthetic data — simulated for evaluation, not measured.</p>
        )}
      </section>

      <section>
        <h2>Provenance and scope</h2>
        <dl>
          <div>
            <dt>Summary fetched</dt>
            <dd>{snapshot.fetchedAtIso} (UTC)</dd>
          </div>
          <div>
            <dt>Report generated</dt>
            <dd>{snapshot.generatedAtIso} (UTC)</dd>
          </div>
        </dl>
        <p>
          Anomaly analysis, savings recommendations and forecasts are not
          included in this summary.
        </p>
      </section>
    </section>
  );
}
