"use client";

// P027 historical analytics dashboard. All values come from the committed
// auditor-backend P023 routes; this component never recomputes energy from
// device metadata, interpolates missing buckets, or infers provenance.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  HISTORICAL_BUCKETS,
  fetchHistoricalDevices,
  fetchHistoricalRooms,
  fetchHistoricalTimeseries,
  fetchHistoricalWeekdays,
  historicalChartSegments,
  scopeKey,
  scopeLabel,
  scopeToQuery,
  validateHistoricalWindow,
  type CoverageStatus,
  type HistoricalBucket,
  type HistoricalDevices,
  type HistoricalProvenance,
  type HistoricalRooms,
  type HistoricalScope,
  type HistoricalTimeseries,
  type HistoricalWeekdays,
  type TimeseriesItem,
} from "../lib/historical";
import {
  ApiError,
  createRequestTracker,
  type DatasetItem,
  type DatasetSummary,
} from "../lib/auditor-api";
import { sanitizeOrigin } from "../lib/health";

type Tab = "overview" | "breakdown" | "weekdays";
type ResourceKey = "overview" | "rooms" | "devices" | "weekdays";
type ResourceErrors = Record<ResourceKey, string | null>;

const NO_ERRORS: ResourceErrors = {
  overview: null,
  rooms: null,
  devices: null,
  weekdays: null,
};

function formatKwh(value: number | null): string {
  return value === null
    ? "Unavailable"
    : `${value.toLocaleString("en-IN", { maximumFractionDigits: 6 })} kWh`;
}

function formatCost(value: number | null): string {
  return value === null
    ? "Not set"
    : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatPower(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} W`;
}

function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  })} IST`;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function coverageLabel(status: CoverageStatus): string {
  if (status === "complete") return "Complete coverage";
  if (status === "partial") return "Partial coverage";
  return "Missing coverage";
}

function coverageClass(status: CoverageStatus): string {
  if (status === "complete") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  if (status === "partial") return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function provenanceText(provenance: HistoricalProvenance | null | undefined): string {
  if (!provenance || provenance.synthetic === null) {
    return "Source provenance was not specified by the backend.";
  }
  if (provenance.synthetic) {
    return provenance.synthetic_label
      ? `Synthetic source: ${provenance.synthetic_label}`
      : "Synthetic source; no measured-data claim.";
  }
  return "The backend supplied non-synthetic provenance; no independent measurement claim is made.";
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-50">{value}</p>
      {detail && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>}
    </div>
  );
}

function PageControls({
  page,
  totalPages,
  onChange,
  label,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-3 flex items-center justify-between gap-3" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        Previous page
      </button>
      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        Next page
      </button>
    </nav>
  );
}

function HistoricalChart({
  items,
  bucketSeconds,
  scope,
}: {
  items: TimeseriesItem[];
  bucketSeconds: HistoricalBucket;
  scope: HistoricalScope;
}) {
  const segments = historicalChartSegments(items);
  const values = items.flatMap((item) => (item.energy_kwh === null ? [] : [item.energy_kwh]));
  if (values.length === 0) {
    return (
      <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
        No observed energy values are available for this page. Missing buckets remain unavailable; they are not plotted as zero.
      </p>
    );
  }
  const width = 720;
  const height = 240;
  const left = 48;
  const right = 16;
  const top = 16;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...values, 0);
  const scaleMax = max > 0 ? max : 1;
  const x = (index: number) =>
    left + (items.length <= 1 ? plotWidth / 2 : (index / (items.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / scaleMax) * plotHeight;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Observed energy by ${bucketSeconds}-second bucket for ${scopeLabel(scope)}; missing buckets break the line`}
        className="h-auto w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      >
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" />
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" />
        <text x={left} y={height - 12} className="fill-zinc-500 text-[10px]">Start</text>
        <text x={width - right} y={height - 12} textAnchor="end" className="fill-zinc-500 text-[10px]">End</text>
        <text x={12} y={top + 4} className="fill-zinc-500 text-[10px]">{scaleMax.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</text>
        <text x={12} y={top + plotHeight} className="fill-zinc-500 text-[10px]">0</text>
        {segments.map((segment, segmentIndex) => (
          <polyline
            key={segmentIndex}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-blue-600 dark:text-blue-300"
            points={segment
              .map((item) => `${x(items.indexOf(item))},${y(item.energy_kwh as number)}`)
              .join(" ")}
          />
        ))}
        {items.map((item, index) =>
          item.energy_kwh === null ? null : (
            <circle
              key={item.start_utc}
              cx={x(index)}
              cy={y(item.energy_kwh)}
              r="3"
              className="fill-blue-600 dark:fill-blue-300"
            >
              <title>{`${formatUtc(item.start_utc)}: ${formatKwh(item.energy_kwh)}`}</title>
            </circle>
          ),
        )}
      </svg>
      <figcaption className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Observed kWh per {bucketSeconds}-second bucket in {scopeLabel(scope)}. Lines stop at missing buckets; the table below is the textual alternative.
      </figcaption>
    </figure>
  );
}

function TimeseriesTable({ items }: { items: TimeseriesItem[] }) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No buckets were returned for this page.</p>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <caption className="sr-only">Observed energy buckets and coverage</caption>
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <tr>
            <th scope="col" className="py-2 pr-3">Bucket (IST)</th>
            <th scope="col" className="py-2 pr-3">Energy</th>
            <th scope="col" className="py-2 pr-3">Cost</th>
            <th scope="col" className="py-2">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.start_utc} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-3 font-mono text-xs">{formatUtc(item.start_utc)}</td>
              <td className="py-2 pr-3 font-mono">{formatKwh(item.energy_kwh)}</td>
              <td className="py-2 pr-3 font-mono">{formatCost(item.cost_inr)}</td>
              <td className="py-2">
                <span className={`rounded-full px-2 py-1 text-xs ${coverageClass(item.coverage.status)}`}>
                  {coverageLabel(item.coverage.status)}
                </span>
                <span className="ml-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {item.coverage.covered_seconds}/{item.coverage.expected_seconds} device-seconds
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageNotice({
  provenance,
  summary,
}: {
  provenance: HistoricalProvenance | null | undefined;
  summary: DatasetSummary | null;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
      <p>{provenanceText(provenance)}</p>
      {summary?.gap_assessment?.status === "not_performed" && (
        <p className="text-amber-700 dark:text-amber-300">
          Gap assessment not performed. The backend&apos;s empty compatibility gaps array is not a no-gaps claim.
        </p>
      )}
      <p className="text-zinc-500 dark:text-zinc-400">
        Historical windows are half-open [from, to) and use Asia/Kolkata calendar boundaries. Coverage durations are device-seconds.
      </p>
    </div>
  );
}

function OverviewTab({
  data,
  error,
  loading,
  scope,
  bucketSeconds,
  onPage,
}: {
  data: HistoricalTimeseries | null;
  error: string | null;
  loading: boolean;
  scope: HistoricalScope;
  bucketSeconds: HistoricalBucket;
  onPage: (page: number) => void;
}) {
  return (
    <div>
      {loading && <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">Loading historical consumption…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error} {data ? "Showing the last successful page for this scope." : ""}
        </p>
      )}
      {data && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Full filtered period" value={formatKwh(data.full_period_observed_energy_kwh)} detail="All matching buckets, not only this page" />
            <Metric label="Visible page" value={formatKwh(data.page_observed_energy_kwh)} detail={`Page ${data.pagination.page} of ${data.pagination.total_pages}`} />
            <Metric label="Bucket resolution" value={`${bucketSeconds} seconds`} detail={bucketSeconds === 86400 ? "Local calendar day" : "Observed energy per bucket"} />
            <Metric label="Coverage" value={data.full_period_complete ? "Complete" : "Partial or missing"} detail="Server classification" />
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Window: {formatUtc(data.window.from_utc)} → {formatUtc(data.window.to_utc)} · scope {scopeLabel(scope)} · timezone {data.timezone}
          </p>
          <div className="mt-4"><HistoricalChart items={data.items} bucketSeconds={data.bucket_seconds} scope={data.scope} /></div>
          <TimeseriesTable items={data.items} />
          <PageControls page={data.pagination.page} totalPages={data.pagination.total_pages} onChange={onPage} label="Historical timeseries pages" />
        </>
      )}
      {!data && !loading && !error && <p className="text-sm text-zinc-600 dark:text-zinc-400">No historical timeseries loaded.</p>}
    </div>
  );
}

function RoomTable({
  data,
  onSelect,
}: {
  data: HistoricalRooms | null;
  onSelect: (roomId: string) => void;
}) {
  if (!data || data.items.length === 0) return <p className="text-sm text-zinc-600 dark:text-zinc-400">No room rows were returned.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Room energy breakdown</caption>
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <tr><th scope="col" className="py-2 pr-3">Room</th><th scope="col" className="py-2 pr-3">Energy</th><th scope="col" className="py-2 pr-3">Cost</th><th scope="col" className="py-2 pr-3">Power</th><th scope="col" className="py-2">Coverage</th></tr>
        </thead>
        <tbody>
          {data.items.map((room) => (
            <tr key={room.room_id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-3"><button type="button" onClick={() => onSelect(room.room_id)} className="text-left font-medium text-blue-700 underline dark:text-blue-300">{room.name}</button><p className="font-mono text-xs text-zinc-500">{room.room_id}</p></td>
              <td className="py-2 pr-3 font-mono">{formatKwh(room.observed_energy_kwh)}</td>
              <td className="py-2 pr-3 font-mono">{formatCost(room.observed_cost_inr)}</td>
              <td className="py-2 pr-3 font-mono text-xs">avg {formatPower(room.observed_average_power_w)}<br />peak {formatPower(room.observed_peak_power_w)}</td>
              <td className="py-2"><span className={`rounded-full px-2 py-1 text-xs ${coverageClass(room.coverage.status)}`}>{coverageLabel(room.coverage.status)}</span><p className="mt-1 font-mono text-xs text-zinc-500">{room.coverage.covered_seconds}/{room.coverage.expected_seconds} device-seconds</p></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeviceTable({
  data,
  onSelect,
}: {
  data: HistoricalDevices | null;
  onSelect: (deviceId: string) => void;
}) {
  if (!data || data.items.length === 0) return <p className="text-sm text-zinc-600 dark:text-zinc-400">No device rows were returned.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <caption className="sr-only">Device energy breakdown</caption>
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <tr><th scope="col" className="py-2 pr-3">Device</th><th scope="col" className="py-2 pr-3">Energy</th><th scope="col" className="py-2 pr-3">Cost</th><th scope="col" className="py-2 pr-3">Observed power</th><th scope="col" className="py-2 pr-3">Nominal</th><th scope="col" className="py-2">Coverage</th></tr>
        </thead>
        <tbody>
          {data.items.map((device) => (
            <tr key={device.device_id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-3"><button type="button" onClick={() => onSelect(device.device_id)} className="text-left font-medium text-blue-700 underline dark:text-blue-300">{device.name}</button><p className="font-mono text-xs text-zinc-500">{device.device_id} · room {device.room_id} · quantity {device.quantity}</p></td>
              <td className="py-2 pr-3 font-mono">{formatKwh(device.observed_energy_kwh)}</td>
              <td className="py-2 pr-3 font-mono">{formatCost(device.observed_cost_inr)}</td>
              <td className="py-2 pr-3 font-mono text-xs">avg {formatPower(device.observed_average_power_w)}<br />peak {formatPower(device.observed_peak_power_w)}</td>
              <td className="py-2 pr-3 font-mono text-xs">{formatPower(device.nominal_rated_power_w)}<br /><span className="text-zinc-500">not multiplied by quantity</span></td>
              <td className="py-2"><span className={`rounded-full px-2 py-1 text-xs ${coverageClass(device.coverage.status)}`}>{coverageLabel(device.coverage.status)}</span><p className="mt-1 font-mono text-xs text-zinc-500">{device.coverage.covered_seconds}/{device.coverage.expected_seconds}s</p></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTab({
  rooms,
  devices,
  roomError,
  deviceError,
  loading,
  scope,
  onRoom,
  onDevice,
  onRoomPage,
  onDevicePage,
}: {
  rooms: HistoricalRooms | null;
  devices: HistoricalDevices | null;
  roomError: string | null;
  deviceError: string | null;
  loading: boolean;
  scope: HistoricalScope;
  onRoom: (roomId: string) => void;
  onDevice: (deviceId: string) => void;
  onRoomPage: (page: number) => void;
  onDevicePage: (page: number) => void;
}) {
  return (
    <div>
      {loading && <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">Loading room and device breakdowns…</p>}
      {roomError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{roomError} {rooms ? "Showing the last successful room page." : ""}</p>}
      {deviceError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{deviceError} {devices ? "Showing the last successful device page." : ""}</p>}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Current selection: {scopeLabel(scope)}. Select a room or device to drill into its overview and weekday views.</p>
      <section className="mt-5"><h3 className="text-sm font-semibold">Rooms</h3><p className="mt-1 text-xs text-zinc-500">Room energy is the sum of its persisted device interval energy; occupancy and quantity are not energy inputs.</p><RoomTable data={rooms} onSelect={onRoom} />{rooms && <><p className="mt-2 text-xs text-zinc-500">Full filtered: {formatKwh(rooms.full_filtered_observed_energy_kwh)} · visible page: {formatKwh(rooms.page_observed_energy_kwh)}</p><PageControls page={rooms.pagination.page} totalPages={rooms.pagination.total_pages} onChange={onRoomPage} label="Room breakdown pages" /></>}</section>
      <section className="mt-6"><h3 className="text-sm font-semibold">Devices</h3><p className="mt-1 text-xs text-zinc-500">Nominal rated power is metadata; observed average/peak power and energy come from persisted readings.</p><DeviceTable data={devices} onSelect={onDevice} />{devices && <><p className="mt-2 text-xs text-zinc-500">Full filtered: {formatKwh(devices.full_filtered_observed_energy_kwh)} · visible page: {formatKwh(devices.page_observed_energy_kwh)}</p><PageControls page={devices.pagination.page} totalPages={devices.pagination.total_pages} onChange={onDevicePage} label="Device breakdown pages" /></>}</section>
    </div>
  );
}

function WeekdayTab({ data, error, loading }: { data: HistoricalWeekdays | null; error: string | null; loading: boolean }) {
  if (loading) return <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">Loading weekday patterns…</p>;
  if (error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error} {data ? "Showing the last successful weekday result." : ""}</p>;
  if (!data) return <p className="text-sm text-zinc-600 dark:text-zinc-400">No weekday analytics loaded.</p>;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Complete days" value={String(data.coverage.complete_day_count)} /><Metric label="Partial days" value={String(data.coverage.partial_day_count)} /><Metric label="Missing days" value={String(data.coverage.missing_day_count)} /></div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{data.coverage.note} Calendar weekday labels are not working-day inference.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Weekday energy comparison</caption><thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"><tr><th scope="col" className="py-2 pr-3">Local weekday</th><th scope="col" className="py-2 pr-3">Observed total</th><th scope="col" className="py-2 pr-3">Mean / complete day</th><th scope="col" className="py-2 pr-3">Cost</th><th scope="col" className="py-2">Coverage</th></tr></thead><tbody>{data.weekdays.map((day) => <tr key={day.weekday} className="border-b border-zinc-100 dark:border-zinc-900"><td className="py-2 pr-3 font-medium">{day.weekday}<p className="font-mono text-xs text-zinc-500">ISO {day.weekday_number_iso}</p></td><td className="py-2 pr-3 font-mono">{formatKwh(day.observed_energy_total_kwh)}</td><td className="py-2 pr-3 font-mono">{formatKwh(day.mean_energy_per_complete_day_kwh)}</td><td className="py-2 pr-3 font-mono">{formatCost(day.observed_cost_inr)}</td><td className="py-2 text-xs">{day.complete_day_count} complete · {day.partial_day_count} partial<p className="mt-1 text-zinc-500">{day.coverage_note}</p></td></tr>)}</tbody></table></div>
    </div>
  );
}

export default function HistoricalAnalytics({
  backendUrl,
  datasetId,
  dataset,
  summary,
  tariffToken,
}: {
  backendUrl: string;
  datasetId: string | null;
  dataset: DatasetItem | null;
  summary: DatasetSummary | null;
  tariffToken: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [bucketSeconds, setBucketSeconds] = useState<HistoricalBucket>(3600);
  const [scope, setScope] = useState<HistoricalScope>({ type: "office" });
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [windowDirty, setWindowDirty] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [timeseries, setTimeseries] = useState<HistoricalTimeseries | null>(null);
  const [rooms, setRooms] = useState<HistoricalRooms | null>(null);
  const [devices, setDevices] = useState<HistoricalDevices | null>(null);
  const [weekdays, setWeekdays] = useState<HistoricalWeekdays | null>(null);
  const [overviewPage, setOverviewPage] = useState(1);
  const [roomPage, setRoomPage] = useState(1);
  const [devicePage, setDevicePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ResourceErrors>(NO_ERRORS);
  const mounted = useRef(true);
  const tracker = useRef(createRequestTracker());
  const inFlight = useRef<AbortController | null>(null);

  const currentSummary = summary?.dataset_id === datasetId ? summary : null;
  const load = useCallback(async () => {
    if (!datasetId) return;
    const origin = sanitizeOrigin(backendUrl);
    if (!origin) {
      setErrors({ overview: "Backend URL is missing or invalid.", rooms: "Backend URL is missing or invalid.", devices: "Backend URL is missing or invalid.", weekdays: "Backend URL is missing or invalid." });
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const requestId = tracker.current.issue();
    setLoading(true);
    setErrors(NO_ERRORS);
    const base = { fromUtc: appliedFrom || undefined, toUtc: appliedTo || undefined };
    const scopeQuery = scopeToQuery(scope);
    try {
      const results = await Promise.allSettled([
        fetchHistoricalTimeseries(origin, datasetId, { ...base, ...scopeQuery, bucketSeconds, page: overviewPage, pageSize: 500 }, fetch, undefined, controller.signal),
        fetchHistoricalRooms(origin, datasetId, { ...base, page: roomPage, pageSize: 50 }, fetch, undefined, controller.signal),
        fetchHistoricalDevices(origin, datasetId, { ...base, ...(scope.type === "room" ? { roomId: scope.room_id } : {}), page: devicePage, pageSize: 50 }, fetch, undefined, controller.signal),
        fetchHistoricalWeekdays(origin, datasetId, { ...base, ...scopeQuery }, fetch, undefined, controller.signal),
      ]);
      if (!mounted.current || !tracker.current.isCurrent(requestId)) return;
      const nextErrors: ResourceErrors = { ...NO_ERRORS };
      const timeseriesResult = results[0];
      const roomsResult = results[1];
      const devicesResult = results[2];
      const weekdaysResult = results[3];
      if (timeseriesResult.status === "fulfilled") setTimeseries(timeseriesResult.value);
      else nextErrors.overview = messageFor(timeseriesResult.reason, "Historical timeseries request failed.");
      if (roomsResult.status === "fulfilled") setRooms(roomsResult.value);
      else nextErrors.rooms = messageFor(roomsResult.reason, "Room breakdown request failed.");
      if (devicesResult.status === "fulfilled") setDevices(devicesResult.value);
      else nextErrors.devices = messageFor(devicesResult.reason, "Device breakdown request failed.");
      if (weekdaysResult.status === "fulfilled") setWeekdays(weekdaysResult.value);
      else nextErrors.weekdays = messageFor(weekdaysResult.reason, "Weekday analytics request failed.");
      setErrors(nextErrors);
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (mounted.current && tracker.current.isCurrent(requestId)) setLoading(false);
    }
  }, [appliedFrom, appliedTo, backendUrl, bucketSeconds, datasetId, devicePage, overviewPage, roomPage, scope]);

  useEffect(() => {
    mounted.current = true;
    const requestTracker = tracker.current;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      inFlight.current?.abort();
      inFlight.current = null;
      requestTracker.issue();
    };
  }, [load, tariffToken]);

  useEffect(() => {
    if (windowDirty || !currentSummary?.coverage) return;
    const from = currentSummary.coverage.start_utc;
    const to = currentSummary.coverage.end_utc;
    const timer = setTimeout(() => {
      setFromInput(from);
      setToInput(to);
      setAppliedFrom(from);
      setAppliedTo(to);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentSummary, windowDirty]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTab("overview");
      setScope({ type: "office" });
      setFromInput("");
      setToInput("");
      setAppliedFrom("");
      setAppliedTo("");
      setWindowDirty(false);
      setWindowError(null);
      setTimeseries(null);
      setRooms(null);
      setDevices(null);
      setWeekdays(null);
      setOverviewPage(1);
      setRoomPage(1);
      setDevicePage(1);
      setErrors(NO_ERRORS);
    }, 0);
    return () => clearTimeout(timer);
  }, [datasetId]);

  const applyWindow = () => {
    const result = validateHistoricalWindow(fromInput, toInput);
    if (!result.ok) {
      setWindowError(result.error);
      return;
    }
    setWindowError(null);
    setAppliedFrom(result.fromUtc ?? "");
    setAppliedTo(result.toUtc ?? "");
    setWindowDirty(Boolean(result.fromUtc || result.toUtc));
    setOverviewPage(1);
    setRoomPage(1);
    setDevicePage(1);
  };

  const useBackendRange = () => {
    setFromInput("");
    setToInput("");
    setAppliedFrom("");
    setAppliedTo("");
    setWindowDirty(false);
    setWindowError(null);
    setOverviewPage(1);
    setRoomPage(1);
    setDevicePage(1);
  };

  const selectScope = (next: HistoricalScope) => {
    setScope(next);
    setOverviewPage(1);
    setRoomPage(1);
    setDevicePage(1);
    setTab("overview");
  };

  if (!datasetId) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Historical analytics</h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Select a dataset to inspect office, room, device and weekday history.</p>
      </section>
    );
  }

  const scopeOptions = [
    { key: "office", label: "Office" },
    ...(rooms?.items ?? []).map((room) => ({ key: `room:${room.room_id}`, label: `Room · ${room.name}` })),
    ...(devices?.items ?? []).map((device) => ({ key: `device:${device.device_id}`, label: `Device · ${device.name}` })),
  ];

  return (
    <section aria-label={`Historical analytics for dataset ${datasetId}`} className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Historical analytics</h2><p className="mt-1 break-all font-mono text-sm text-zinc-700 dark:text-zinc-300">{datasetId}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{dataset?.run_id ? `Run ${dataset.run_id}` : "Run identity supplied by the selected dataset record."}</p></div>
        <CoverageNotice provenance={timeseries?.provenance ?? rooms?.provenance ?? devices?.provenance ?? weekdays?.provenance} summary={currentSummary} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Historical analytics views">
        {([ ["overview", "Overview"], ["breakdown", "Rooms & devices"], ["weekdays", "Weekday patterns"] ] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === value ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900" : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"}`}>{label}</button>)}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 md:grid-cols-4">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Scope<select value={scopeKey(scope)} onChange={(event) => { const value = event.target.value; if (value === "office") selectScope({ type: "office" }); else if (value.startsWith("room:")) selectScope({ type: "room", room_id: value.slice(5) }); else selectScope({ type: "device", device_id: value.slice(7) }); }} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><option value="office">Office</option>{scopeOptions.filter((option) => option.key !== "office").map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Timeseries bucket<select value={bucketSeconds} onChange={(event) => { setBucketSeconds(Number(event.target.value) as HistoricalBucket); setOverviewPage(1); }} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">{HISTORICAL_BUCKETS.map((bucket) => <option key={bucket} value={bucket}>{bucket === 86400 ? "1 day · local midnight" : `${bucket} seconds`}</option>)}</select></label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">From UTC (optional)<input value={fromInput} onChange={(event) => setFromInput(event.target.value)} placeholder="YYYY-MM-DDTHH:MM:SSZ" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">To UTC, exclusive<input value={toInput} onChange={(event) => setToInput(event.target.value)} placeholder="YYYY-MM-DDTHH:MM:SSZ" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={applyWindow} className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">Apply window</button><button type="button" onClick={useBackendRange} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700 dark:text-zinc-300">Use full imported range</button><span className="text-xs text-zinc-500 dark:text-zinc-400">Blank bounds use the backend export range; supplied bounds are half-open [from, to).</span></div>
      {windowError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{windowError}</p>}

      <div className="mt-5">
        {tab === "overview" && <OverviewTab data={timeseries} error={errors.overview} loading={loading} scope={scope} bucketSeconds={bucketSeconds} onPage={setOverviewPage} />}
        {tab === "breakdown" && <BreakdownTab rooms={rooms} devices={devices} roomError={errors.rooms} deviceError={errors.devices} loading={loading} scope={scope} onRoom={(roomId) => selectScope({ type: "room", room_id: roomId })} onDevice={(deviceId) => selectScope({ type: "device", device_id: deviceId })} onRoomPage={setRoomPage} onDevicePage={setDevicePage} />}
        {tab === "weekdays" && <WeekdayTab data={weekdays} error={errors.weekdays} loading={loading} />}
      </div>
    </section>
  );
}
