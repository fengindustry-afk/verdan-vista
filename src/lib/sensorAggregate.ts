/**
 * Aggregation helpers for the B1/B2 dMRV production dashboard.
 *
 * Reads the stored {@link SensorReading} document store (see src/lib/sensors.ts)
 * and rolls it up into the shapes the dashboard renders: per-stage/per-metric
 * time-series, throughput totals, anomaly counts, dMRV coverage, and the
 * carbon-removed KPI.
 *
 * ── corcMetrics adapter boundary ──────────────────────────────────────────────
 * The carbon-removed figure is NOT hand-rolled here. It is produced by feeding an
 * aggregated dry-biochar mass into the project's single CORC engine,
 * {@link corcMetrics} (src/lib/feedstock.ts), through the ONE call site in
 * {@link estimateCarbonRemoved}. A separate session (backlog A4) is migrating
 * corcMetrics to the Puro Edition 2025 model, adding a soil-temperature `Ts`
 * input. `estimateCarbonRemoved` already carries `soilTempC` (default 7 °C) in its
 * input, so when A4 lands the change is a one-line edit at the marked call site —
 * the dashboard and the rest of this module are untouched.
 */

import { corcMetrics } from "./feedstock";
import type { Feedstock } from "./types";
import {
  PARAMETERS,
  PARAMETER_BY_KEY,
  type SensorReading,
  type SensorStage,
  type QualityFlag,
} from "./sensors";

/** A reading is anomalous if flagged non-OK, or its HMAC signature didn't verify. */
export function isAnomalous(r: SensorReading): boolean {
  return r.Quality !== "OK" || r.SigValid === false;
}

/** Parse a reading's authoritative device time to an epoch millis (NaN → dropped). */
function readingTime(r: SensorReading): number {
  return Date.parse(r.ReadingAt);
}

export interface MetricSeriesPoint {
  /** Epoch millis of the reading (device time). */
  t: number;
  iso: string;
  value: number;
  quality: QualityFlag;
  sigValid: boolean;
  anomalous: boolean;
}

export interface MetricSeries {
  key: string;
  label: string;
  unit: string;
  stage: SensorStage;
  points: MetricSeriesPoint[];
  /** Most-recent value (by device time), if any. */
  latest?: number;
  anomalies: number;
}

export interface StageGroup {
  stage: SensorStage;
  metrics: MetricSeries[];
  /** Total anomalous readings across every metric in the stage. */
  anomalies: number;
}

/** Fixed display order for stages (feedstock → pyrolysis → output → energy → env). */
const STAGE_ORDER: SensorStage[] = [
  "feedstock",
  "pyrolysis",
  "output",
  "energy",
  "environment",
];

export const STAGE_LABELS: Record<SensorStage, string> = {
  feedstock: "Feedstock intake",
  pyrolysis: "Pyrolysis reactor",
  output: "Biochar output",
  energy: "Energy",
  environment: "Environment & safety",
};

/**
 * Group readings by Stage then Metric, each metric a time-ordered series. Only
 * readings whose metric is in the catalog and whose ReadingAt parses are kept.
 */
export function buildStageGroups(readings: SensorReading[]): StageGroup[] {
  // metric key -> readings
  const byMetric = new Map<string, SensorReading[]>();
  for (const r of readings) {
    if (!PARAMETER_BY_KEY[r.Metric]) continue;
    if (Number.isNaN(readingTime(r))) continue;
    const list = byMetric.get(r.Metric) ?? [];
    list.push(r);
    byMetric.set(r.Metric, list);
  }

  const seriesByStage = new Map<SensorStage, MetricSeries[]>();
  for (const spec of PARAMETERS) {
    const rows = byMetric.get(spec.key);
    if (!rows || rows.length === 0) continue;
    const points: MetricSeriesPoint[] = rows
      .map((r) => ({
        t: readingTime(r),
        iso: r.ReadingAt,
        value: r.Value,
        quality: r.Quality,
        sigValid: r.SigValid,
        anomalous: isAnomalous(r),
      }))
      .sort((a, b) => a.t - b.t);
    const anomalies = points.filter((p) => p.anomalous).length;
    const series: MetricSeries = {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      stage: spec.stage,
      points,
      latest: points.length ? points[points.length - 1].value : undefined,
      anomalies,
    };
    const arr = seriesByStage.get(spec.stage) ?? [];
    arr.push(series);
    seriesByStage.set(spec.stage, arr);
  }

  return STAGE_ORDER.filter((s) => seriesByStage.has(s)).map((stage) => {
    const metrics = seriesByStage.get(stage)!;
    return {
      stage,
      metrics,
      anomalies: metrics.reduce((s, m) => s + m.anomalies, 0),
    };
  });
}

/**
 * Sum a metric across readings. By default anomalous readings are EXCLUDED —
 * throughput totals must not be inflated by SUSPECT/tampered values (the priority
 * dMRV attack). Pass `{ includeAnomalous: true }` to get the raw total.
 */
export function sumMetric(
  readings: SensorReading[],
  key: string,
  opts: { includeAnomalous?: boolean } = {}
): number {
  return readings
    .filter((r) => r.Metric === key && (opts.includeAnomalous || !isAnomalous(r)))
    .reduce((s, r) => s + (Number.isFinite(r.Value) ? r.Value : 0), 0);
}

/** Mean of a metric's non-anomalous readings (0 if none). */
export function averageMetric(readings: SensorReading[], key: string): number {
  const vals = readings
    .filter((r) => r.Metric === key && !isAnomalous(r) && Number.isFinite(r.Value))
    .map((r) => r.Value);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

export interface AnomalyCounts {
  suspect: number;
  calibration: number;
  invalidSig: number;
  total: number;
}

export function countAnomalies(readings: SensorReading[]): AnomalyCounts {
  let suspect = 0;
  let calibration = 0;
  let invalidSig = 0;
  for (const r of readings) {
    if (r.Quality === "SUSPECT") suspect++;
    if (r.Quality === "CALIBRATION") calibration++;
    if (r.SigValid === false) invalidSig++;
  }
  return {
    suspect,
    calibration,
    invalidSig,
    total: readings.filter(isAnomalous).length,
  };
}

/**
 * dMRV parameter coverage: the share of the monitored-parameter catalog that has
 * at least one reading in the data set. A methodology completeness signal — a
 * low figure means required parameters (rule 3.5.38 etc.) aren't reporting.
 */
export function coveragePct(readings: SensorReading[]): number {
  const reporting = new Set(
    readings.filter((r) => PARAMETER_BY_KEY[r.Metric]).map((r) => r.Metric)
  );
  return PARAMETERS.length === 0
    ? 0
    : (reporting.size / PARAMETERS.length) * 100;
}

// ── Carbon-removed KPI (corcMetrics adapter) ─────────────────────────────────

const DEFAULT_SOIL_TEMP_C = 7; // A4 Puro Edition 2025 Ts default.
const DEFAULT_CARBON_PCT = 80; // Mirrors corcMetrics DEFAULT_CARBON_PCT.
const DEFAULT_HCORG = 0.5; // Mirrors corcMetrics DEFAULT_HCORG.

export interface LabParams {
  carbonContentPct: number;
  hCorgRatio: number;
  /** Human-readable provenance for the audit trail. */
  source: string;
}

/**
 * Source Corg (%) and H/Corg for the carbon calc. These are laboratory-only
 * parameters (not in the sensor stream), so we average whatever the feedstock/
 * batch records carry, and otherwise fall back to the same conservative defaults
 * corcMetrics uses — clearly labelled as pending lab confirmation.
 */
export function labParamsFromFeedstock(feedstock: Feedstock[]): LabParams {
  const corg = feedstock
    .map((f) => f.CarbonContentPct)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const hcorg = feedstock
    .map((f) => f.HCorgRatio)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (corg.length && hcorg.length) {
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    return {
      carbonContentPct: avg(corg),
      hCorgRatio: avg(hcorg),
      source: `Feedstock batch records (n=${Math.min(corg.length, hcorg.length)})`,
    };
  }
  return {
    carbonContentPct: DEFAULT_CARBON_PCT,
    hCorgRatio: DEFAULT_HCORG,
    source: "Conservative defaults — pending lab confirmation",
  };
}

export interface DryBiocharBasis {
  /** Summed wet biochar output (kg), anomalous readings excluded. */
  wetKg: number;
  /** Mean biochar moisture (%) over non-anomalous readings. */
  moisturePct: number;
  /** Dry mass (kg) = wet × (1 − moisture/100). */
  dryKg: number;
}

/** Derive the dry-biochar basis from the reading stream. */
export function dryBiocharBasis(readings: SensorReading[]): DryBiocharBasis {
  const wetKg = sumMetric(readings, "biochar_output_mass_kg");
  const moisturePct = averageMetric(readings, "biochar_moisture_pct");
  const dryKg = wetKg * (1 - moisturePct / 100);
  return { wetKg, moisturePct, dryKg };
}

export interface CarbonInput {
  /** Dry biochar mass (kg) fed to the CORC engine. */
  dryBiocharKg: number;
  carbonContentPct: number;
  hCorgRatio: number;
  /** A4 Puro 2025 soil-temperature Ts (°C); defaults to 7. */
  soilTempC?: number;
}

export interface CarbonEstimate {
  /** Durable carbon removal (tCO₂e) — the headline KPI. */
  tco2e: number;
  /** Gross removal before the permanence factor. */
  grossTco2e: number;
  permanenceFactor: number;
  durabilityClass: string;
  /** Every input assumption, surfaced so an auditor can trace the figure. */
  assumptions: {
    dryBiocharKg: number;
    carbonContentPct: number;
    hCorgRatio: number;
    soilTempC: number;
    co2PerCarbon: string;
  };
}

/**
 * The SINGLE corcMetrics call site. Wraps an aggregated dry-biochar mass in a
 * synthetic Feedstock and runs it through the project's CORC engine so the
 * dashboard reports the exact same carbon the CORC Calculator would.
 *
 * ⚠️ A4 boundary: when corcMetrics gains its `Ts` argument, change ONLY the
 * marked line below to `corcMetrics(synthetic, input.soilTempC ?? DEFAULT_SOIL_TEMP_C)`.
 * Nothing else in the dashboard needs to change.
 */
export function estimateCarbonRemoved(input: CarbonInput): CarbonEstimate {
  const soilTempC = input.soilTempC ?? DEFAULT_SOIL_TEMP_C;
  const synthetic = {
    id: "dmrv-aggregate",
    Title: "dMRV aggregate biochar output",
    // EFB is a Puro-eligible sourcing type, so sourcingEligible passes and the
    // engine returns a non-zero durable removal for the aggregated batch.
    Type: "Empty Fruit Bunches",
    Date: new Date().toISOString(),
    Amount: "",
    Status: "",
    Supplier: "",
    BiocharYieldKg: input.dryBiocharKg,
    CarbonContentPct: input.carbonContentPct,
    HCorgRatio: input.hCorgRatio,
  } as Feedstock;

  // ↓↓↓ A4 single call site — add the Ts argument here when corcMetrics changes.
  const m = corcMetrics(synthetic);
  // ↑↑↑

  return {
    tco2e: m.durableRemovalTco2e,
    grossTco2e: m.grossRemovalTco2e,
    permanenceFactor: m.permanenceFactor,
    durabilityClass: m.durabilityClass,
    assumptions: {
      dryBiocharKg: input.dryBiocharKg,
      carbonContentPct: input.carbonContentPct,
      hCorgRatio: input.hCorgRatio,
      soilTempC,
      co2PerCarbon: "44/12",
    },
  };
}
