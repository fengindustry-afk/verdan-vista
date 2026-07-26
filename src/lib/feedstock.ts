import type { Feedstock } from "./types";
import { TRAIL, type WorkProcessEntry } from "./workProcess";
import { legEmissionsTco2e } from "./transport";

/**
 * Chain-of-custody + CORC (CO₂ Removal Certificate) business logic, ported
 * verbatim from the .NET `FeedstockItem`. Keeping these formulas identical means
 * the website computes the same credits the mobile/desktop app does.
 */

export const CUSTODY_STAGES = [
  "Feedstock Collection",
  "Feedstock Pre-Processing",
  "Material Conversion",
  "Sampling",
  "Storage",
  "Application",
  "Carbon Sink",
  "Carbon Certification",
] as const;

export type CustodyStage = (typeof CUSTODY_STAGES)[number];

export const OPERATIONS_STAGE_COUNT = 4;
/** Durably stored — the dashboard's "Sink-Confirmed" bucket. Not the end of the chain: see LAST_CUSTODY_STAGE. */
export const FINAL_STAGE = "Carbon Sink";
export const APPLICATION_STAGE = "Application";
/** The true end of custody (registry-certified). Drives advanceStage's terminal cap and auto-verify. */
export const LAST_CUSTODY_STAGE = CUSTODY_STAGES[CUSTODY_STAGES.length - 1];

export function phaseOf(stage: string): "Operations" | "Storage" {
  const i = CUSTODY_STAGES.indexOf(stage as CustodyStage);
  return i >= 0 && i < OPERATIONS_STAGE_COUNT ? "Operations" : "Storage";
}

const ELIGIBLE_BIOMASS = new Set(
  [
    "Empty Fruit Bunches",
    "POME",
    "Palm Kernel Shells",
    "Palm Fronds",
    "Palm Fiber",
    "Mesocarp Fiber",
    "Bio-waste",
    "Woodchip",
  ].map((s) => s.toLowerCase())
);

// 0.325 (Ecosfera 0.5) and 0.333 (Ecosfera 1.0) averaged, per the raw-woodchip
// production runs in "Pengiraan Keperluan Bahan Mentah Dan Tempoh Pengeluaran
// Biochar" — replaces the earlier round 0.30 guess with a measured figure.
const DEFAULT_YIELD_FRACTION = 0.33;
const DEFAULT_CARBON_PCT = 80.0;
const DEFAULT_HCORG = 0.5;
const CO2_PER_CARBON = 44.0 / 12.0;

/**
 * Reactor throughput, from the same report: batch size/cycle time for the
 * Ecosfera 0.5 (batch process) and steady-state rate for the Ecosfera 1.0
 * (continuous process). Grade-A yield only — off-spec biochar doesn't count.
 */
export const REACTOR_MODELS = ["Ecosfera 0.5", "Ecosfera 1.0"] as const;
export type ReactorModel = (typeof REACTOR_MODELS)[number];

interface ReactorProfile {
  /** Grade-A biochar out per kg of raw woodchip in. */
  yieldFraction: number;
  /** Batch process: kg of raw material per batch and hours per batch. */
  batch?: { feedstockKg: number; cycleHours: number };
  /** Continuous process: kg of Grade-A biochar produced per hour. */
  ratePerHour?: number;
}

const REACTOR_PROFILE: Record<ReactorModel, ReactorProfile> = {
  "Ecosfera 0.5": { yieldFraction: 0.325, batch: { feedstockKg: 200, cycleHours: 12 } },
  "Ecosfera 1.0": { yieldFraction: 0.333, ratePerHour: 90 / 5.37 },
};

export interface ProductionPlan {
  feedstockKg: number;
  feedstockTan: number;
  hours: number;
  days: number;
  /** Only set for a batch reactor (Ecosfera 0.5). */
  batches?: number;
}

/** Expected Grade-A biochar out of a given raw-woodchip input, at this reactor's measured yield. */
export function expectedGradeAYieldKg(inputKg: number, reactor: ReactorModel): number {
  return inputKg * REACTOR_PROFILE[reactor].yieldFraction;
}

/** Raw-woodchip feedstock and production time needed to hit a Grade-A biochar target. */
export function planProduction(targetBiocharKg: number, reactor: ReactorModel): ProductionPlan {
  const p = REACTOR_PROFILE[reactor];
  const feedstockKg = targetBiocharKg / p.yieldFraction;
  if (p.batch) {
    const batches = Math.ceil(feedstockKg / p.batch.feedstockKg);
    const hours = batches * p.batch.cycleHours;
    return { feedstockKg, feedstockTan: feedstockKg / 1000, hours, days: hours / 24, batches };
  }
  const hours = targetBiocharKg / (p.ratePerHour as number);
  return { feedstockKg, feedstockTan: feedstockKg / 1000, hours, days: hours / 24 };
}

export function parseLeadingNumber(text?: string): number {
  if (!text) return 0;
  const m = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

/** Batch-ID normalization shared with the work-process side: trim, uppercase, collapse spaces. */
function normBatch(s?: string): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Work-process entries belonging to a feedstock batch. The join key is the
 * feedstock Title matching the entry's hand-typed `batch_id` (or
 * `source_batch_id`) — there is no foreign key, only the naming convention.
 */
export function wpEntriesForBatch(title: string, entries: WorkProcessEntry[]): WorkProcessEntry[] {
  const t = normBatch(title);
  if (!t) return [];
  return entries.filter(
    (e) => normBatch(e.Values?.batch_id) === t || normBatch(e.Values?.source_batch_id) === t
  );
}

/**
 * The feedstock batch a work-process entry belongs to: its `batch_id` (or
 * `source_batch_id`) matching a feedstock Title. Inverse of wpEntriesForBatch —
 * used to jump from a work-process entry to its custody/CORC detail.
 */
export function feedstockForEntry(
  values: Record<string, string> | undefined,
  feedstock: Feedstock[]
): Feedstock | undefined {
  for (const key of ["batch_id", "source_batch_id"] as const) {
    const id = normBatch(values?.[key]);
    if (!id) continue;
    const hit = feedstock.find((f) => normBatch(f.Title) === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Measured values pulled from a batch's work-process entries (0 = not recorded). */
export function wpMeasured(entries: WorkProcessEntry[]): {
  yieldKg: number;
  carbonPct: number;
  hcorg: number;
} {
  let yieldKg = 0;
  let carbonPct = 0;
  let hcorg = 0;
  // Newest first so sampling reads take the latest lab result.
  const sorted = [...entries].sort((a, b) => (b.Timestamp ?? "").localeCompare(a.Timestamp ?? ""));
  for (const e of sorted) {
    if (e.StageKey === "production_05" || e.StageKey === "production_10") {
      yieldKg += parseLeadingNumber(e.Values?.final_biochar_amount);
      if (!hcorg) hcorg = parseLeadingNumber(e.Values?.h_c_ratio_sampling);
    }
  }
  for (const e of sorted) {
    if (e.StageKey !== "sampling") continue;
    if (!carbonPct) carbonPct = parseLeadingNumber(e.Values?.carbon_content);
    // Lab sampling beats the production-line spot reading.
    const hc = parseLeadingNumber(e.Values?.h_c_ratio);
    if (hc) {
      hcorg = hc;
      break;
    }
  }
  return { yieldKg, carbonPct, hcorg };
}

/**
 * Transport emissions for a batch, summed over every custody leg recorded
 * against it: Feedstock Collection plus every downstream haul (Warehouse,
 * Application, Carbon Sink) that shares the same Distance/Transport Fuel field
 * pair. Several legs means several hauls feeding or moving one batch, so they
 * add up. Returns 0 when no leg carries a distance — an unrecorded haul is
 * charged nothing, which is why the Distance field matters: a blank one quietly
 * issues more credits than the batch earned.
 */
export function wpTransportTco2e(entries: WorkProcessEntry[]): number {
  let total = 0;
  for (const e of entries) {
    total += legEmissionsTco2e(e.Values?.[TRAIL.distanceKey], e.Values?.[TRAIL.fuelKey]);
  }
  return total;
}

// kg CO2e per kg diesel burned (combustion only, no upstream extraction/refining).
// ROUND PLACEHOLDER like FUEL_KGCO2E_PER_KM in transport.ts — swap for an audited
// factor before this touches an issued credit.
const DIESEL_KGCO2E_PER_KG = 2.68;
// production_10 records energy in MJ using the reactor's own "36 MJ/L" rating;
// diesel density ~0.832 kg/L converts that back to kg burned.
const DIESEL_MJ_PER_KG = 36 / 0.832;

/**
 * Pyrolysis fuel emissions for a batch: diesel burned running the reactor
 * (production_05's Weight of Fuel, production_10's Diesel Energy), converted to
 * tCO2e. This is a project emission the 8% LCA proxy is meant to stand in for,
 * same reasoning as wpTransportTco2e — see corcMetrics.
 */
export function wpProcessEmissionTco2e(entries: WorkProcessEntry[]): number {
  let kg = 0;
  for (const e of entries) {
    if (e.StageKey === "production_05") {
      kg += parseLeadingNumber(e.Values?.weight_of_fuel);
    } else if (e.StageKey === "production_10") {
      kg += parseLeadingNumber(e.Values?.diesel_energy_36_mj_l) / DIESEL_MJ_PER_KG;
    }
  }
  return (kg * DIESEL_KGCO2E_PER_KG) / 1000;
}

/** Mass-balance ratios along the value chain, derived from recorded work-process weights. */
export interface MassBalance {
  rawBiomassKg: number;
  feedstockKg: number;
  rejectKg: number;
  biocharKg: number;
  /** (Feedstock / raw biomass) * 100 — how much of what was collected became usable feedstock. */
  conversionRatePct: number;
  /** Reject (powder) share of isolation output. */
  rejectPct: number;
  /** 1 - reject share, i.e. how much of the isolation output was usable. */
  usageEfficiencyPct: number;
  /** (Raw biochar / feedstock) * 100. */
  biocharConversionRatePct: number;
}

export function massBalance(entries: WorkProcessEntry[]): MassBalance {
  let rawBiomassKg = 0;
  let feedstockKg = 0;
  let rejectKg = 0;
  let biocharKg = 0;
  for (const e of entries) {
    if (e.StageKey === "receiving") rawBiomassKg += parseLeadingNumber(e.Values?.weight);
    if (e.StageKey === "isolation") {
      feedstockKg += parseLeadingNumber(e.Values?.good_feedstock_quantity);
      rejectKg += parseLeadingNumber(e.Values?.reject_quantity);
    }
    if (e.StageKey === "production_05" || e.StageKey === "production_10") {
      biocharKg += parseLeadingNumber(e.Values?.final_biochar_amount);
    }
  }
  const isolationOutputKg = feedstockKg + rejectKg;
  return {
    rawBiomassKg,
    feedstockKg,
    rejectKg,
    biocharKg,
    conversionRatePct: rawBiomassKg > 0 ? (feedstockKg / rawBiomassKg) * 100 : 0,
    rejectPct: isolationOutputKg > 0 ? (rejectKg / isolationOutputKg) * 100 : 0,
    usageEfficiencyPct: isolationOutputKg > 0 ? (feedstockKg / isolationOutputKg) * 100 : 0,
    biocharConversionRatePct: feedstockKg > 0 ? (biocharKg / feedstockKg) * 100 : 0,
  };
}

/**
 * Copies of each batch with measured work-process values filled into blank
 * CORC input fields (BiocharYieldKg / CarbonContentPct / HCorgRatio), which
 * corcMetrics already prefers over defaults — so aggregates and exports pick
 * up real production data without any signature changes. Display/export only;
 * never write these copies back to the store.
 */
export function withMeasuredCorcInputs(feedstock: Feedstock[], wpAll: WorkProcessEntry[]): Feedstock[] {
  if (!wpAll.length) return feedstock;
  return feedstock.map((f) => {
    const rec = f as unknown as Record<string, unknown>;
    const entries = wpEntriesForBatch(f.Title ?? "", wpAll);
    const m = wpMeasured(entries);
    const out = { ...rec };
    if (!(Number(rec.BiocharYieldKg ?? 0) > 0) && m.yieldKg > 0) out.BiocharYieldKg = m.yieldKg;
    if (!(Number(rec.CarbonContentPct ?? 0) > 0) && m.carbonPct > 0) out.CarbonContentPct = m.carbonPct;
    if (!(Number(rec.HCorgRatio ?? 0) > 0) && m.hcorg > 0) out.HCorgRatio = m.hcorg;
    const transport = wpTransportTco2e(entries);
    if (transport > 0) out.TransportTco2e = transport;
    return out as unknown as Feedstock;
  });
}

/** Derived CORC metrics for one feedstock batch. */
export interface CorcMetrics {
  effectiveYieldKg: number;
  effectiveCarbonPct: number;
  effectiveHCorg: number;
  sourcingEligible: boolean;
  durabilityEligible: boolean;
  isCorcEligible: boolean;
  permanenceFactor: number;
  durabilityClass: string;
  grossRemovalTco2e: number;
  durableRemovalTco2e: number;
  /** Measured haulage for the batch. 0 = no leg recorded a distance, not "no emissions". */
  transportTco2e: number;
  /** Measured pyrolysis fuel burn for the batch. 0 = no fuel amount recorded. */
  processEmissionTco2e: number;
  effectiveLca: number;
  netCorc: number;
}

export function corcMetrics(f: Feedstock, wp?: WorkProcessEntry[]): CorcMetrics {
  const rec = f as unknown as Record<string, unknown>;
  const yieldKg = Number(rec.BiocharYieldKg ?? 0);
  const carbonPct = Number(rec.CarbonContentPct ?? 0);
  const hcorg = Number(rec.HCorgRatio ?? 0);
  const lca = Number(rec.LcaEmissionsTco2e ?? 0);

  // Explicit record fields win; then measured work-process values; then defaults.
  const m = wp?.length ? wpMeasured(wp) : { yieldKg: 0, carbonPct: 0, hcorg: 0 };
  const effectiveYieldKg =
    yieldKg > 0 ? yieldKg
    : m.yieldKg > 0 ? m.yieldKg
    : parseLeadingNumber(f.Amount) * DEFAULT_YIELD_FRACTION;
  const effectiveCarbonPct = carbonPct > 0 ? carbonPct : m.carbonPct > 0 ? m.carbonPct : DEFAULT_CARBON_PCT;
  const effectiveHCorg = hcorg > 0 ? hcorg : m.hcorg > 0 ? m.hcorg : DEFAULT_HCORG;

  const sourcingEligible = ELIGIBLE_BIOMASS.has((f.Type ?? "").toLowerCase());
  const durabilityEligible = effectiveHCorg < 0.7 && effectiveYieldKg > 0;
  const isCorcEligible = durabilityEligible && sourcingEligible;

  const permanenceFactor = !durabilityEligible
    ? 0.0
    : effectiveHCorg < 0.4
    ? 0.9
    : 0.8;

  const durabilityClass = !durabilityEligible
    ? "Not eligible"
    : effectiveHCorg < 0.4
    ? "CORC1000+"
    : "CORC200+";

  const grossRemovalTco2e =
    (effectiveYieldKg * (effectiveCarbonPct / 100.0) * CO2_PER_CARBON) / 1000.0;
  const durableRemovalTco2e = grossRemovalTco2e * permanenceFactor;
  // Measured haulage for this batch: from the work-process entries when we have
  // them, else the value withMeasuredCorcInputs baked onto the record (so callers
  // that don't hold the entries still charge for transport).
  const transportTco2e = wp?.length ? wpTransportTco2e(wp) : Number(rec.TransportTco2e ?? 0);
  const processEmissionTco2e = wp?.length ? wpProcessEmissionTco2e(wp) : 0;

  // An explicit LCA figure is the operator's own full-scope number, so it wins
  // outright. Otherwise take the WORSE of the blanket 8% proxy and measured
  // transport + pyrolysis fuel: the proxy is meant to cover all project
  // emissions, so adding them on top would double-count, but measured emissions
  // that alone exceed the proxy prove the proxy is too low. Never issues more
  // CORCs than the 8% rule alone would have.
  const effectiveLca = lca > 0 ? lca : Math.max(durableRemovalTco2e * 0.08, transportTco2e + processEmissionTco2e);
  const netCorc = isCorcEligible
    ? Math.max(0, durableRemovalTco2e - effectiveLca)
    : 0;

  return {
    effectiveYieldKg,
    effectiveCarbonPct,
    effectiveHCorg,
    sourcingEligible,
    durabilityEligible,
    isCorcEligible,
    permanenceFactor,
    durabilityClass,
    grossRemovalTco2e,
    durableRemovalTco2e,
    transportTco2e,
    processEmissionTco2e,
    effectiveLca,
    netCorc,
  };
}

export function currentStageIndex(f: Feedstock): number {
  const stage = (f as unknown as Record<string, unknown>).CurrentStage as string | undefined;
  const i = CUSTODY_STAGES.indexOf((stage ?? "") as CustodyStage);
  return i < 0 ? 0 : i;
}

export interface AuditEntry {
  Action: string;
  Actor: string;
  Role: string;
  Timestamp: string;
}

export function parseAuditLog(f: Feedstock): AuditEntry[] {
  const raw = (f as unknown as Record<string, unknown>).AuditLog;
  if (!raw || typeof raw !== "string") return [];
  try {
    return JSON.parse(raw) as AuditEntry[];
  } catch {
    return [];
  }
}

export interface CustodyLeg {
  Location: string;
  Date: string;
  Coords: string;
}

export function parseCustodyLog(f: Feedstock): Record<string, CustodyLeg> {
  const raw = (f as unknown as Record<string, unknown>).CustodyLog;
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, CustodyLeg>;
  } catch {
    return {};
  }
}
