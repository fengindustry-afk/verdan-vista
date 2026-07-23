import type { Feedstock } from "./types";
import type { WorkProcessEntry } from "./workProcess";

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
] as const;

export type CustodyStage = (typeof CUSTODY_STAGES)[number];

export const OPERATIONS_STAGE_COUNT = 4;
export const FINAL_STAGE = "Carbon Sink";
export const APPLICATION_STAGE = "Application";

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

const DEFAULT_YIELD_FRACTION = 0.3;
const DEFAULT_CARBON_PCT = 80.0;
const DEFAULT_HCORG = 0.5;
const CO2_PER_CARBON = 44.0 / 12.0;

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
    const m = wpMeasured(wpEntriesForBatch(f.Title ?? "", wpAll));
    const out = { ...rec };
    if (!(Number(rec.BiocharYieldKg ?? 0) > 0) && m.yieldKg > 0) out.BiocharYieldKg = m.yieldKg;
    if (!(Number(rec.CarbonContentPct ?? 0) > 0) && m.carbonPct > 0) out.CarbonContentPct = m.carbonPct;
    if (!(Number(rec.HCorgRatio ?? 0) > 0) && m.hcorg > 0) out.HCorgRatio = m.hcorg;
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
  const effectiveLca = lca > 0 ? lca : durableRemovalTco2e * 0.08;
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
