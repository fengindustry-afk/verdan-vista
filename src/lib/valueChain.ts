/**
 * The business planning model behind "Potential CORC by Custody Stage", ported
 * from `Value Chain Evaluation.xlsx` (Sheet1, basis B5:B19, per-source rows
 * 24:26). The workbook is not in the repo and this is a static SPA, so the
 * numbers are transcribed here rather than parsed at runtime — when the
 * workbook changes, this file is what has to change with it.
 *
 * The chain, per tonne of delivered feedstock:
 *
 *   DELIVERY --x0.5 preproc--> PRE-PROCESSING --x0.2 conversion--> CONVERSION
 *     --x1 CDR--> APPLICATION --x1 app/storage--> STORAGE --x2--> ACCOUNTING (tCO2e)
 *
 * Not to be confused with `corcMetrics` in feedstock.ts, which is the
 * Puro-aligned lab measurement (yield x carbon% x 44/12, permanence, minus
 * emissions). That is what a batch actually earns; this is what the model says
 * it should. Both are valid and they are not expected to agree.
 */

import {
  CUSTODY_STAGES,
  parseLeadingNumber,
  wpEntriesForBatch,
  type CustodyStage,
} from "./feedstock";
import { dispatchIndex, type BatchAllocation, type WorkProcessEntry } from "./workProcess";
import type { Feedstock } from "./types";

/** One row of the workbook's per-source table: tonnes ex-source and tonnes delivered. */
export interface WorkbookSource {
  name: string;
  sourceTonnes: number;
  deliveredTonnes: number;
}

/** The basis block (rows 5-19) for one feedstock. */
export interface ValueChainBasis {
  preProcessingEfficiency: number;
  conversionEfficiency: number;
  cdrRatio: number;
  applicationStorageRatio: number;
  biocharCorcConversion: number;
  sources: WorkbookSource[];
}

export interface WorkbookFeedstock {
  /** The workbook's own name, shown in the dropdown. */
  name: string;
  /**
   * Feedstock.Type / biomass_type values that mean this feedstock. The app and
   * the workbook were named independently ("Wood Chip" vs "Woodchip"), and the
   * app carries both the abbreviation and the full name for EFB.
   */
  appTypes: string[];
  /** null = the workbook lists the feedstock but has no numbers for it yet. */
  basis: ValueChainBasis | null;
}

const WOOD_CHIP_BASIS: ValueChainBasis = {
  preProcessingEfficiency: 0.5,
  conversionEfficiency: 0.2,
  cdrRatio: 1,
  applicationStorageRatio: 1,
  biocharCorcConversion: 2,
  sources: [
    { name: "MP Sepang Green Waste", sourceTonnes: 20, deliveredTonnes: 10 },
    { name: "PJ Greenwaste", sourceTonnes: 20, deliveredTonnes: 20 },
    { name: "Sustainable Feedstock", sourceTonnes: 20, deliveredTonnes: 0 },
  ],
};

/**
 * All five feedstocks the workbook lists. Only Wood Chip is parameterised: the
 * other four basis columns hold the literal strings "X"/"Y"/"Z"/"A" and their
 * block formulas are copy-downs pointing at header rows. They are placeholders,
 * so their basis is null — a zero basis would draw a real "produces nothing"
 * line, which is a different and wrong claim.
 */
export const WORKBOOK_FEEDSTOCKS: WorkbookFeedstock[] = [
  { name: "Wood Chip", appTypes: ["Woodchip", "Wood Chip", "Woodchips"], basis: WOOD_CHIP_BASIS },
  { name: "Bamboo", appTypes: ["Bamboo"], basis: null },
  { name: "Vetiver", appTypes: ["Vetiver"], basis: null },
  { name: "EFB", appTypes: ["EFB", "Empty Fruit Bunches"], basis: null },
  { name: "FIBRECORP", appTypes: ["Fibrecorp"], basis: null },
];

export function workbookFeedstock(name: string): WorkbookFeedstock | undefined {
  return WORKBOOK_FEEDSTOCKS.find((f) => f.name === name);
}

/**
 * tCO2e of CORC per tonne of material sitting at a custody stage — the product
 * of every factor still downstream of it.
 *
 * Written per stage rather than as a running product over CUSTODY_STAGES on
 * purpose: the workbook runs APPLICATION before STORAGE and the app runs
 * Storage before Application. Under this basis both ratios are 1 so the two
 * orderings give the same number, but a cumulative product would silently swap
 * them the day a ratio stops being 1. Sampling has no workbook column — it
 * doesn't transform mass, so it carries Conversion's multiplier.
 */
export function stageCorcMultiplier(stage: CustodyStage, b: ValueChainBasis): number {
  switch (stage) {
    case "Feedstock Collection":
      return b.preProcessingEfficiency * b.conversionEfficiency * b.biocharCorcConversion;
    case "Feedstock Pre-Processing":
      return b.conversionEfficiency * b.biocharCorcConversion;
    case "Application":
      return b.applicationStorageRatio * b.biocharCorcConversion;
    case "Material Conversion":
    case "Sampling":
    case "Storage":
    case "Carbon Sink":
    case "Carbon Certification":
      return b.biocharCorcConversion;
  }
}

/** One bar on the chart. */
export interface StagePoint {
  stage: CustodyStage;
  /** Axis label — CUSTODY_STAGES with the redundant "Feedstock " prefix dropped. */
  label: string;
  /** Tonnes of material observed (or modelled) at this stage. 0 where the stage records CORC directly. */
  tonnes: number;
  /** Those tonnes carried through the remaining chain, in tCO2e. */
  corc: number;
  /** Batches contributing. Always 0 for the modelled series — it has no batches. */
  batches: number;
}

function shortLabel(stage: CustodyStage): string {
  return stage.replace("Feedstock ", "");
}

/**
 * The modelled series: the workbook's own throughput carried down the chain.
 * Flat by construction — the same material seen at each stage is worth the same
 * CORC at the end of it — which is the point of showing it behind the measured
 * series. Null when the feedstock has no basis.
 */
export function potentialByStage(feedstock: WorkbookFeedstock): StagePoint[] | null {
  const b = feedstock.basis;
  if (!b) return null;

  const delivered = b.sources.reduce((s, x) => s + x.deliveredTonnes, 0);
  const preProcessed = delivered * b.preProcessingEfficiency;
  const biochar = preProcessed * b.conversionEfficiency;

  return CUSTODY_STAGES.map((stage) => {
    const tonnes =
      stage === "Feedstock Collection" ? delivered
      : stage === "Feedstock Pre-Processing" ? preProcessed
      : biochar;
    return {
      stage,
      label: shortLabel(stage),
      tonnes,
      corc: tonnes * stageCorcMultiplier(stage, b),
      batches: 0,
    };
  });
}

/**
 * Where each custody stage records what passed through it. The mass fields are
 * the ones massBalance() (feedstock.ts) and CONSUMED_FIELD (massBalance.ts)
 * already read, so a stage cannot mean one weight here and another there.
 *
 * Sampling records no quantity — it inspects what Conversion produced.
 * Certification is the one stage that records CORC rather than mass: the
 * registry's own certified tCO2e, which is a measured fact and not something to
 * re-derive from a model factor, so it is taken at face value.
 */
const STAGE_QUANTITY: Record<
  CustodyStage,
  { stageKeys: string[]; field: string; unit: "kg" | "tco2e" } | null
> = {
  "Feedstock Collection": { stageKeys: ["receiving"], field: "weight", unit: "kg" },
  "Feedstock Pre-Processing": {
    stageKeys: ["isolation"],
    field: "good_feedstock_quantity",
    unit: "kg",
  },
  "Material Conversion": {
    stageKeys: ["production_05", "production_10"],
    field: "final_biochar_amount",
    unit: "kg",
  },
  "Sampling": null,
  "Storage": { stageKeys: ["warehouse"], field: "quantity", unit: "kg" },
  "Application": { stageKeys: ["application"], field: "quantity_applied", unit: "kg" },
  "Carbon Sink": { stageKeys: ["carbon_sink"], field: "quantity", unit: "kg" },
  "Carbon Certification": { stageKeys: ["certification"], field: "certified_corc", unit: "tco2e" },
};

/** Feedstock rows whose Type is one of the workbook feedstock's aliases. */
export function batchesOfFeedstock(feedstock: WorkbookFeedstock, all: Feedstock[]): Feedstock[] {
  const types = new Set(feedstock.appTypes.map((t) => t.toLowerCase()));
  return all.filter((f) => types.has((f.Type ?? "").toLowerCase()));
}

export interface ActualSeries {
  points: StagePoint[];
  /** Batches of this feedstock with no linked work-process record anywhere. */
  batchesWithoutRecords: number;
}

/**
 * The measured series: real recorded quantities at each stage, carried through
 * the same factor chain as the model.
 *
 * These are flows, not inventory — material weighed at Collection is weighed
 * again at Pre-Processing after it moves — so the stages are read independently
 * from their own records, exactly as the workbook's columns are. Nothing here
 * is a running balance and the bars are not meant to sum.
 */
export function actualByStage(
  feedstock: WorkbookFeedstock,
  batches: Feedstock[],
  wpAll: WorkProcessEntry[],
  dispatch: Map<string, BatchAllocation[]> = dispatchIndex(wpAll)
): ActualSeries | null {
  const b = feedstock.basis;
  if (!b) return null;

  const totals = new Map<CustodyStage, number>();
  const batchIds = new Map<CustodyStage, Set<string>>();
  let batchesWithoutRecords = 0;

  for (const batch of batches) {
    const entries = wpEntriesForBatch(batch.Title ?? "", wpAll, dispatch);
    if (!entries.length) {
      batchesWithoutRecords++;
      continue;
    }
    for (const stage of CUSTODY_STAGES) {
      const spec = STAGE_QUANTITY[stage];
      if (!spec) continue;
      let amount = 0;
      for (const e of entries) {
        if (!spec.stageKeys.includes(e.StageKey)) continue;
        amount += parseLeadingNumber(e.Values?.[spec.field]);
      }
      if (amount <= 0) continue;
      totals.set(stage, (totals.get(stage) ?? 0) + amount);
      // A batch with five production entries is still one batch at Conversion.
      const ids = batchIds.get(stage) ?? new Set<string>();
      ids.add(batch.id);
      batchIds.set(stage, ids);
    }
  }

  const points = CUSTODY_STAGES.map((stage) => {
    const spec = STAGE_QUANTITY[stage];
    const amount = totals.get(stage) ?? 0;
    const tonnes = spec?.unit === "kg" ? amount / 1000 : 0;
    return {
      stage,
      label: shortLabel(stage),
      tonnes,
      corc: spec?.unit === "tco2e" ? amount : tonnes * stageCorcMultiplier(stage, b),
      batches: batchIds.get(stage)?.size ?? 0,
    };
  });

  return { points, batchesWithoutRecords };
}
