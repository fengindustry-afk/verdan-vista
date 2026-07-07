import type { Feedstock } from "./types";

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

export function corcMetrics(f: Feedstock): CorcMetrics {
  const yieldKg = Number((f as Record<string, unknown>).BiocharYieldKg ?? 0);
  const carbonPct = Number((f as Record<string, unknown>).CarbonContentPct ?? 0);
  const hcorg = Number((f as Record<string, unknown>).HCorgRatio ?? 0);
  const lca = Number((f as Record<string, unknown>).LcaEmissionsTco2e ?? 0);

  const effectiveYieldKg =
    yieldKg > 0 ? yieldKg : parseLeadingNumber(f.Amount) * DEFAULT_YIELD_FRACTION;
  const effectiveCarbonPct = carbonPct > 0 ? carbonPct : DEFAULT_CARBON_PCT;
  const effectiveHCorg = hcorg > 0 ? hcorg : DEFAULT_HCORG;

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
  const stage = (f as Record<string, unknown>).CurrentStage as string | undefined;
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
  const raw = (f as Record<string, unknown>).AuditLog;
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
  const raw = (f as Record<string, unknown>).CustodyLog;
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, CustodyLeg>;
  } catch {
    return {};
  }
}
