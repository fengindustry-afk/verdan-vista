/**
 * The business planning model behind "Potential CORC by Custody Stage", ported
 * from `Value Chain Evaluation.xlsx` (Sheet1, basis B5:B19, per-source rows
 * 24:26). The workbook is not in the repo and this is a static SPA, so the
 * numbers are transcribed here rather than parsed at runtime — when the
 * workbook changes, this file is what has to change with it.
 *
 * The chain, per tonne of delivered feedstock:
 *
 *   COLLECTION --x1 delivery--> DELIVERY --x0.5 preproc--> PRE-PROCESSING
 *     --x0.2 conversion--> CONVERSION --x1 app/storage--> APPLICATION
 *     --x1--> CARBON SINK --x2--> CARBON CERTIFICATION (tCO2e)
 *
 * Sampling and Warehouse (Storage) were removed from the widget on the owner's
 * instruction: they are still custody stages on the batch chain (see
 * CUSTODY_STAGES in feedstock.ts) but no longer get a bar here. Delivery was
 * split out after Collection — it carries the same material, so it uses
 * Collection's multiplier and the workbook's DELIVERY column rate.
 *
 * Not to be confused with `corcMetrics` in feedstock.ts, which is the
 * Puro-aligned lab measurement (yield x carbon% x 44/12, permanence, minus
 * emissions). That is what a batch actually earns; this is what the model says
 * it should. Both are valid and they are not expected to agree.
 */

import {
  parseLeadingNumber,
  wpEntriesForBatch,
} from "./feedstock";
import { dispatchIndex, type BatchAllocation, type WorkProcessEntry } from "./workProcess";
import type { Feedstock } from "./types";

/**
 * The widget's stage chain — the workbook's value columns minus Sampling and
 * Warehouse, with Delivery split out after Collection. Deliberately separate
 * from CUSTODY_STAGES: the batch custody chain still tracks all eight stages,
 * the dashboard widget shows these seven.
 */
export const CORC_WIDGET_STAGES = [
  "Feedstock Collection",
  "Feedstock Delivery",
  "Feedstock Pre-Processing",
  "Material Conversion",
  "Application",
  "Carbon Sink",
  "Carbon Certification",
] as const;

export type CorcWidgetStage = (typeof CORC_WIDGET_STAGES)[number];

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
 * Written per stage rather than as a running product over the chain on
 * purpose: the workbook runs APPLICATION before STORAGE and the app runs
 * Storage before Application. Under this basis both ratios are 1 so the two
 * orderings give the same number, but a cumulative product would silently swap
 * them the day a ratio stops being 1. Delivery transforms no mass, so it
 * carries Collection's multiplier.
 */
export function stageCorcMultiplier(stage: CorcWidgetStage, b: ValueChainBasis): number {
  switch (stage) {
    case "Feedstock Collection":
    case "Feedstock Delivery":
      return b.preProcessingEfficiency * b.conversionEfficiency * b.biocharCorcConversion;
    case "Feedstock Pre-Processing":
      return b.conversionEfficiency * b.biocharCorcConversion;
    case "Application":
      return b.applicationStorageRatio * b.biocharCorcConversion;
    case "Material Conversion":
    case "Carbon Sink":
    case "Carbon Certification":
      return b.biocharCorcConversion;
  }
}

/**
 * RM value per tonne (or per MTe of certified CORC for Carbon Certification) at
 * each custody stage. Collection and Pre-Processing keep the workbook rates
 * (Value Chain Evaluation.xlsx Sheet1: row 36 ÷ row 29). Delivery is the
 * workbook's DELIVERY column (900 / 30 delivered). Material Conversion,
 * Application, Carbon Sink and Carbon Certification use the rates set by the
 * owner (RM2500/MT and RM600/MT respectively), which supersede the workbook.
 */
export const STAGE_RM_PER_TONNE: Partial<Record<CorcWidgetStage, number>> = {
  "Feedstock Collection": 60, // VALUE 1800 / 30 delivered
  "Feedstock Delivery": 30, // VALUE 900 / 30 delivered
  "Feedstock Pre-Processing": 60, // VALUE 900 / 15
  "Material Conversion": 2500, // owner rate: RM2500/MT
  Application: 2500, // owner rate: RM2500/MT
  "Carbon Sink": 600, // owner rate: RM600/MT
  "Carbon Certification": 600, // owner rate: RM600 per certified MTe
};

/** RM value at a stage: tonnes × per-tonne rate, or certified MTe × rate for Certification. */
function rmForStage(stage: CorcWidgetStage, tonnes: number, corcTco2e: number): number {
  const rate = STAGE_RM_PER_TONNE[stage];
  if (!rate) return 0;
  return stage === "Carbon Certification" ? corcTco2e * rate : tonnes * rate;
}

/** One bar on the chart. */
export interface StagePoint {
  stage: CorcWidgetStage;
  /** Axis label — the stage name with the redundant "Feedstock " prefix dropped. */
  label: string;
  /** Tonnes of material observed (or modelled) at this stage. 0 where the stage records CORC directly. */
  tonnes: number;
  /** Those tonnes carried through the remaining chain, in tCO2e. */
  corc: number;
  /** Value in RM: tonnes × the stage rate (or certified CORC × rate). */
  rm: number;
  /** Batches contributing. Always 0 for the modelled series — it has no batches. */
  batches: number;
}

function shortLabel(stage: CorcWidgetStage): string {
  const base = stage.replace("Feedstock ", "");
  // The chart shows the stage the owner calls it: "Material Conversion" reads
  // as "Conversion" on the axis.
  return base === "Material Conversion" ? "Conversion" : base;
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

  return CORC_WIDGET_STAGES.map((stage) => {
    const tonnes =
      stage === "Feedstock Collection" || stage === "Feedstock Delivery" ? delivered
      : stage === "Feedstock Pre-Processing" ? preProcessed
      : biochar;
    const corc = tonnes * stageCorcMultiplier(stage, b);
    return {
      stage,
      label: shortLabel(stage),
      tonnes,
      corc,
      rm: rmForStage(stage, tonnes, corc),
      batches: 0,
    };
  });
}

/**
 * Where each custody stage records what passed through it. The mass fields are
 * the ones massBalance() (feedstock.ts) and CONSUMED_FIELD (massBalance.ts)
 * already read, so a stage cannot mean one weight here and another there.
 *
 * Delivery records no separate quantity — the receiving form IS the delivery
 * document (DO number, route, transport), so it reads the same weight as
 * Collection. Certification is the one stage that records CORC rather than
 * mass: the registry's own certified tCO2e, which is a measured fact and not
 * something to re-derive from a model factor, so it is taken at face value.
 */
const STAGE_QUANTITY: Record<
  CorcWidgetStage,
  { stageKeys: string[]; field: string; unit: "kg" | "tco2e" } | null
> = {
  "Feedstock Collection": { stageKeys: ["receiving"], field: "weight", unit: "kg" },
  "Feedstock Delivery": { stageKeys: ["receiving"], field: "weight", unit: "kg" },
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
  Application: { stageKeys: ["application"], field: "quantity_applied", unit: "kg" },
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

  const totals = new Map<CorcWidgetStage, number>();
  const batchIds = new Map<CorcWidgetStage, Set<string>>();
  let batchesWithoutRecords = 0;

  for (const batch of batches) {
    const entries = wpEntriesForBatch(batch.Title ?? "", wpAll, dispatch);
    if (!entries.length) {
      batchesWithoutRecords++;
      continue;
    }
    for (const stage of CORC_WIDGET_STAGES) {
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

  const points = CORC_WIDGET_STAGES.map((stage) => {
    const spec = STAGE_QUANTITY[stage];
    const amount = totals.get(stage) ?? 0;
    const tonnes = spec?.unit === "kg" ? amount / 1000 : 0;
    const corc = spec?.unit === "tco2e" ? amount : tonnes * stageCorcMultiplier(stage, b);
    return {
      stage,
      label: shortLabel(stage),
      tonnes,
      corc,
      rm: rmForStage(stage, tonnes, corc),
      batches: batchIds.get(stage)?.size ?? 0,
    };
  });

  return { points, batchesWithoutRecords };
}

export type TimeBucketUnit = "year" | "month" | "day";

function bucketKey(ts: string, unit: TimeBucketUnit): string | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (unit === "year") return String(y);
  if (unit === "month") return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

/**
 * The measured series aggregated into time buckets (year / month / day) instead
 * of custody stages. Each batch is valued exactly as in actualByStage — same
 * stage, same factor chain, same RM rate — at its FURTHEST recorded stage (one
 * value per batch, no double counting), then dropped into the bucket of that
 * record's timestamp. With `cumulative`, the buckets become a running total
 * since the first record — the "Accumulative" view of the Timeline dropdown.
 */
export function actualByTimeBucket(
  feedstock: WorkbookFeedstock,
  batches: Feedstock[],
  wpAll: WorkProcessEntry[],
  unit: TimeBucketUnit,
  cumulative = false,
  dispatch: Map<string, BatchAllocation[]> = dispatchIndex(wpAll)
): StagePoint[] | null {
  const b = feedstock.basis;
  if (!b) return null;

  // bucket -> accumulated { tonnes, corc, rm } + distinct batch ids.
  const totals = new Map<
    string,
    { tonnes: number; corc: number; rm: number; ids: Set<string> }
  >();

  for (const batch of batches) {
    const entries = wpEntriesForBatch(batch.Title ?? "", wpAll, dispatch);
    if (!entries.length) continue;
    // The furthest stage with a record — the batch's value counts once, at the
    // stage its custody actually reached, same rule as the credit cards.
    let best: { stage: CorcWidgetStage; amount: number; ts: string } | null = null;
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
      if (amount > 0) best = { stage, amount, ts };
    }
    if (!best) continue;
    const key = bucketKey(best.ts, unit);
    if (!key) continue;
    const spec = STAGE_QUANTITY[best.stage];
    const tonnes = spec?.unit === "kg" ? best.amount / 1000 : 0;
    const corc =
      spec?.unit === "tco2e" ? best.amount : tonnes * stageCorcMultiplier(best.stage, b);
    const rm = rmForStage(best.stage, tonnes, corc);
    const hit = totals.get(key) ?? { tonnes: 0, corc: 0, rm: 0, ids: new Set<string>() };
    hit.tonnes += tonnes;
    hit.corc += corc;
    hit.rm += rm;
    hit.ids.add(batch.id);
    totals.set(key, hit);
  }

  const points = [...totals.entries()]
    .sort(([a], [c]) => a.localeCompare(c))
    .map(([key, hit]) => ({
      // The bucket is the axis label; `stage` is unused by the chart but part
      // of StagePoint's shape, so pin it to the first stage of the chain.
      stage: "Feedstock Collection" as CorcWidgetStage,
      label: key,
      tonnes: hit.tonnes,
      corc: hit.corc,
      rm: hit.rm,
      batches: hit.ids.size,
    }));

  if (cumulative) {
    let tonnes = 0;
    let corc = 0;
    let rm = 0;
    for (const p of points) {
      tonnes += p.tonnes;
      corc += p.corc;
      rm += p.rm;
      p.tonnes = tonnes;
      p.corc = corc;
      p.rm = rm;
    }
  }

  return points;
}
