/**
 * The contract + cleaning layer for exporting CarbonTracker data to CULA
 * (biochar MRV / carbon-removal registry).
 *
 * Framework-neutral (no React/Supabase imports here) so it is unit-testable and
 * mirrorable into the serverless bundle, exactly as sensors.ts is mirrored into
 * api/ingest/sensor.js.
 *
 * The system records mass in kg across every custody quantity field; the ONE
 * exception is `certified_corc` (Carbon Certification) which is tCO2e / MTe and
 * must NEVER be divided by 1000. That trap is handled explicitly here.
 *
 * CULA's exact column contract is not yet documented in the repo, so this
 * module emits a stable, self-describing `CulaRecord`; the concrete field
 * labels live in the (injectable) mapper/adapter layer, not here.
 */

import {
  corcMetrics,
  parseLeadingNumber,
  wpEntriesForBatch,
  withMeasuredCorcInputs,
} from "./feedstock";
import {
  dispatchIndex,
  doNumber,
  type BatchAllocation,
  type WorkProcessEntry,
} from "./workProcess";
import {
  CORC_WIDGET_STAGES,
  STAGE_QUANTITY,
  STAGE_RM_PER_TONNE,
  stageCorcMultiplier,
  type CorcWidgetStage,
  type ValueChainBasis,
} from "./valueChain";
import { PARAMETER_BY_KEY, type SensorReading } from "./sensors";
import {
  averageMetric,
  coveragePct,
  countAnomalies,
  dryBiocharBasis,
  estimateCarbonRemoved,
  sumMetric,
} from "./sensorAggregate";
import type { Feedstock } from "./types";

export const MASS_KG_FACTOR = 1000; // MT / t -> kg
const MTE_NOTE = "certified_corc is tCO2e (MTe), not kg — never divided by 1000";

/** One clean, CULA-bound record for a single batch at a single custody stage. */
export interface CulaRecord {
  /** Stable export id: `CT-<hash>_<batchId>_<stage>_<window>`. */
  culaId: string;
  batchId: string;
  feedstockType?: string;
  /** CULA custody layer (collection/delivery/pre_processing/conversion/...). */
  custodyStage: string;
  stageKey?: string;
  recordTimestamp?: string;
  /** Mass in kg (all stages except Certification). */
  quantityKg?: number;
  /** CORC in tCO2e (Carbon Certification only — the MTe trap). */
  quantityTco2e?: number;
  moisturePct?: number;
  carbonContentPct?: number;
  hcorgRatio?: number;
  sourceBatchId?: string;
  doNumber?: string;
  /** The batch's credit figures (same for every stage record of a batch). */
  netCorc?: number;
  grossRemovalTco2e?: number;
  durableRemovalTco2e?: number;
  durabilityClass?: string;
  transportTco2e?: number;
  processEmissionTco2e?: number;
  lcaTco2e?: number;
  /** Potential tCO2e at this stage (workbook model), when a basis is supplied. */
  corcTco2e?: number;
  /** Potential RM value at this stage (workbook model), when a basis is supplied. */
  rm?: number;
  provenance: { capturedBy?: string; capturedByEmail?: string; source: string };
  warnings: string[];
  missing: string[];
  assumptions: { key: string; value: string; source: string }[];
  /** True when the registry certified CORC for a batch the model marks ineligible. */
  certifiedEligibleMismatch?: boolean;
}

export interface CulaRecordsResult {
  records: CulaRecord[];
  /** Batches with no linked work-process record at all. */
  batchesWithoutRecords: number;
}

/** Deterministic stable hash (FNV-1a) for building culaId. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Normalize a batch id: trim → uppercase → collapse internal whitespace. */
export function normBatch(s?: string): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** Parse any accepted timestamp to ISO-8601 UTC, or null + the caller warns. */
export function toIsoUtc(ts?: string): string | null {
  if (!ts) return null;
  const d = new Date(ts.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Leading numeric magnitude, or null when absent. */
export function parseNumber(s?: string): number | null {
  const n = parseLeadingNumber(s);
  return Number.isFinite(n) ? n : null;
}

/** Dry biochar mass from wet kg and moisture %. */
export function dryMassKg(wetKg: number, moisturePct: number): number {
  return wetKg * (1 - moisturePct / 100);
}

/** Map each widget stage to the CULA custody-layer name. */
export const STAGE_TO_CULA_LAYER: Record<CorcWidgetStage, string> = {
  "Feedstock Collection": "collection",
  "Feedstock Delivery": "delivery",
  "Feedstock Pre-Processing": "pre_processing",
  "Material Conversion": "conversion",
  "Application": "application",
  "Carbon Sink": "carbon_sink",
  "Carbon Certification": "certification",
};

/**
 * Flag-don't-block validation. Returns a list of warnings; only structurally
 * malformed records (no quantity and no CORC) fail outright.
 */
export function culaLint(r: CulaRecord): { pass: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if ((r.quantityKg ?? 0) < 0 || (r.quantityTco2e ?? 0) < 0) warnings.push("NEGATIVE_MASS");
  if (r.quantityTco2e != null && r.quantityKg != null) warnings.push("DUAL_QUANTITY_UNITS");
  if (r.recordTimestamp == null) warnings.push("TIMESTAMP_UNPARSEABLE");
  if (r.netCorc != null && r.netCorc < 0) warnings.push("NEGATIVE_NET_CORC");
  if (r.certifiedEligibleMismatch) warnings.push("CERTIFIED_NOT_ELIGIBLE");
  const pass = !warnings.includes("DUAL_QUANTITY_UNITS");
  return { pass, warnings };
}

/**
 * Build CULA records: one per batch per widget stage that has a recorded
 * quantity, at that stage's recorded amount/timestamp, plus the batch's credit
 * metrics (same figures the CORC Calculator shows). When `basis` is supplied,
 * each record also carries the potential tCO2e and RM value from the workbook
 * model.
 */
export function buildCulaRecords(
  feedstock: Feedstock[],
  wpAll: WorkProcessEntry[],
  basis?: ValueChainBasis,
  dispatch: Map<string, BatchAllocation[]> = dispatchIndex(wpAll)
): CulaRecordsResult {
  const measured = withMeasuredCorcInputs(feedstock, wpAll);
  const records: CulaRecord[] = [];
  let batchesWithoutRecords = 0;

  for (const f of measured) {
    const title = f.Title ?? "";
    const entries = wpEntriesForBatch(title, wpAll, dispatch);
    if (!entries.length) {
      batchesWithoutRecords++;
      continue;
    }
    const m = corcMetrics(f, entries);
    const batchId = normBatch(title);
    const h = fnv1a(batchId);

    for (const stage of CORC_WIDGET_STAGES) {
      const spec = STAGE_QUANTITY[stage];
      if (!spec) continue;
      let amount = 0;
      let ts = "";
      for (const e of entries) {
        if (!spec.stageKeys.includes(e.StageKey)) continue;
        amount += parseLeadingNumber(e.Values?.[spec.field]);
        if ((e.Timestamp ?? "") > ts) ts = e.Timestamp ?? "";
      }
      if (amount <= 0) continue;

      const tonnes = spec.unit === "kg" ? amount / 1000 : 0;
      const quantityTco2e = spec.unit === "tco2e" ? amount : undefined;
      const record: CulaRecord = {
        culaId: `CT-${h}_${batchId}_${STAGE_TO_CULA_LAYER[stage]}`,
        batchId,
        feedstockType: f.Type,
        custodyStage: STAGE_TO_CULA_LAYER[stage],
        stageKey: spec.stageKeys[0],
        recordTimestamp: toIsoUtc(ts) ?? undefined,
        quantityKg: spec.unit === "kg" ? amount : undefined,
        quantityTco2e,
        carbonContentPct: parseNumber(f.CarbonContentPct?.toString()) ?? undefined,
        hcorgRatio: parseNumber(f.HCorgRatio?.toString()) ?? undefined,
        sourceBatchId: normBatch(entries.find((e) => e.Values?.source_batch_id)?.Values?.source_batch_id) || undefined,
        doNumber: doNumber(entries[entries.length - 1]?.Values) || undefined,
        netCorc: m.netCorc,
        grossRemovalTco2e: m.grossRemovalTco2e,
        durableRemovalTco2e: m.durableRemovalTco2e,
        durabilityClass: m.durabilityClass,
        transportTco2e: m.transportTco2e,
        processEmissionTco2e: m.processEmissionTco2e,
        lcaTco2e: m.effectiveLca,
        provenance: {
          capturedBy: entries[0]?.CapturedBy,
          capturedByEmail: entries[0]?.CapturedByEmail,
          source: "carbon_tracker",
        },
        warnings: [],
        missing: [],
        assumptions: [],
      };
      if (basis) {
        record.corcTco2e = quantityTco2e ?? tonnes * stageCorcMultiplier(stage, basis);
        const rate = STAGE_RM_PER_TONNE[stage];
        if (rate) record.rm = quantityTco2e ? quantityTco2e * rate : tonnes * rate;
      }
      if (!m.isCorcEligible && quantityTco2e && quantityTco2e > 0) {
        record.certifiedEligibleMismatch = true;
      }
      if (record.certifiedEligibleMismatch) record.warnings.push("CERTIFIED_NOT_ELIGIBLE");
      if (record.recordTimestamp == null) record.warnings.push("TIMESTAMP_UNPARSEABLE");
      if (m.transportTco2e === 0) record.warnings.push("DISTANCE_MISSING");
      record.assumptions.push({ key: "effectiveCarbonPct", value: String(m.effectiveCarbonPct), source: m.effectiveCarbonPct === 80 ? "default" : "measured" });
      record.assumptions.push({ key: "effectiveHCorg", value: String(m.effectiveHCorg), source: m.effectiveHCorg === 0.5 ? "default" : "measured" });
      records.push(record);
    }
  }

  return { records, batchesWithoutRecords };
}

/** One sensor roll-up record per metric over a window (non-anomalous only). */
export interface SensorRollupRecord {
  culaId: string;
  deviceId?: string;
  metricKey: string;
  value: number;
  unit: string;
  quantityKg?: number;
  carbonRemovedTco2e?: number;
  anomalousReadings: number;
  coveragePct: number;
  bucketStart?: string;
  bucketEnd?: string;
}

export function buildSensorRollup(
  readings: SensorReading[],
  bucketStart?: string,
  bucketEnd?: string
): SensorRollupRecord[] {
  const out: SensorRollupRecord[] = [];
  const keys = new Set(readings.map((r) => r.Metric));
  for (const key of keys) {
    const spec = PARAMETER_BY_KEY[key];
    if (!spec) continue;
    const matching = readings.filter((r) => r.Metric === key);
    const clean = matching.filter((r) => r.Quality !== "SUSPECT");
    out.push({
      culaId: `CT-SNS-${key}-${bucketStart ?? "window"}`,
      deviceId: clean[0]?.DeviceId,
      metricKey: key,
      value: spec.continuous ? averageMetric(matching, key) : sumMetric(matching, key),
      unit: spec.unit,
      anomalousReadings: matching.length - clean.length,
      coveragePct: coveragePct(readings),
      bucketStart,
      bucketEnd,
    });
  }
  const db = dryBiocharBasis(readings);
  if (db.dryKg > 0) {
    const est = estimateCarbonRemoved({ dryBiocharKg: db.dryKg, carbonContentPct: 80, hCorgRatio: 0.5 });
    out.push({
      culaId: `CT-SNS-dry-biochar-${bucketStart ?? "window"}`,
      metricKey: "dry_biochar_mass_kg",
      value: db.dryKg,
      unit: "kg",
      quantityKg: db.dryKg,
      carbonRemovedTco2e: est.tco2e,
      anomalousReadings: countAnomalies(readings).total,
      coveragePct: coveragePct(readings),
      bucketStart,
      bucketEnd,
    });
  }
  return out;
}

/** Serialize CulaRecords to a flat CSV (quoted, header row). */
export function toCsv(records: CulaRecord[]): string {
  const cols = [
    "culaId", "batchId", "feedstockType", "custodyStage", "stageKey",
    "recordTimestamp", "quantityKg", "quantityTco2e", "moisturePct",
    "carbonContentPct", "hcorgRatio", "sourceBatchId", "doNumber",
    "netCorc", "grossRemovalTco2e", "durableRemovalTco2e", "durabilityClass",
    "transportTco2e", "processEmissionTco2e", "lcaTco2e", "corcTco2e", "rm",
    "warnings",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of records) {
    lines.push(
      [
        r.culaId, r.batchId, r.feedstockType, r.custodyStage, r.stageKey,
        r.recordTimestamp, r.quantityKg, r.quantityTco2e, r.moisturePct,
        r.carbonContentPct, r.hcorgRatio, r.sourceBatchId, r.doNumber,
        r.netCorc, r.grossRemovalTco2e, r.durableRemovalTco2e, r.durabilityClass,
        r.transportTco2e, r.processEmissionTco2e, r.lcaTco2e, r.corcTco2e, r.rm,
        r.warnings.join(";"),
      ].map(esc).join(",")
    );
  }
  return lines.join("\n");
}
