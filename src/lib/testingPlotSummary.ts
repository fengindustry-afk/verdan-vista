import type { Tree, TreeReading, SoilSample } from "./types";

/**
 * Testing-plot summary logic — the web-app counterpart of the ESTERRA
 * "TESTING SITE SUMMARY" spreadsheet. For each growth/health parameter we take
 * a tree's *baseline* (earliest) and *latest* reading, compute the percentage
 * change, and average across every tree that has both — mirroring the guarded
 * `AVERAGEIF` in the workbook, where a tree with no follow-up measurement is
 * excluded rather than counted as a false −100%.
 *
 * Results are grouped by `TreatmentGroup` so the biochar (ESTERRA) plot can be
 * compared against the control plot.
 */

/** A measurable field on a reading, with the label shown in the summary. */
export interface SummaryParam {
  key: keyof TreeReading;
  label: string;
  /** Unit suffix for the underlying measurement (not the %), e.g. "cm". */
  unit?: string;
}

export const SUMMARY_PARAMS: SummaryParam[] = [
  { key: "HeightCm", label: "Purata Pertumbuhan Tinggi", unit: "cm" },
  { key: "CanopyCm", label: "Purata Pertumbuhan Kanopi", unit: "cm" },
  { key: "StemDiameterMm", label: "Purata Diameter Batang", unit: "mm" },
  { key: "LeafCount", label: "Purata Pertambahan Daun" },
  { key: "Spad", label: "Purata Peningkatan SPAD" },
  { key: "Flowers", label: "Purata Pertambahan Bunga" },
  { key: "Fruit", label: "Purata Pertambahan Buah" },
  { key: "YieldKg", label: "Purata Peningkatan Hasil", unit: "kg" },
];

type Num = number | null | undefined;

function numeric(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Readings for one tree, oldest first. */
function chronological(readings: TreeReading[]): TreeReading[] {
  return [...readings].sort((a, b) => (a.Date ?? "").localeCompare(b.Date ?? ""));
}

/**
 * Percentage change from baseline→latest for one parameter on one tree.
 * Returns null when the tree lacks two datapoints for the parameter, or the
 * baseline is 0 (division guard) — such trees drop out of the average.
 */
export function treePercentChange(readings: TreeReading[], key: keyof TreeReading): number | null {
  const withValue = chronological(readings)
    .map((r) => numeric(r[key] as Num))
    .filter((v): v is number => v !== null);
  if (withValue.length < 2) return null;
  const baseline = withValue[0];
  const latest = withValue[withValue.length - 1];
  if (baseline === 0) return null;
  return ((latest - baseline) / Math.abs(baseline)) * 100;
}

export interface ParamResult {
  param: SummaryParam;
  /** Average % change across contributing trees, or null when none qualify. */
  percent: number | null;
  /** How many trees had both a baseline and a latest reading. */
  treeCount: number;
}

export interface GroupSummary {
  group: string;
  treeCount: number;
  results: ParamResult[];
}

/**
 * Build one summary per treatment group. `readingsByTree` maps a tree id to its
 * readings; trees with no group fall under "Ungrouped".
 */
export function summarizeTestingPlot(
  trees: Tree[],
  readings: TreeReading[]
): GroupSummary[] {
  const readingsByTree = new Map<string, TreeReading[]>();
  for (const r of readings) {
    const list = readingsByTree.get(r.TreeId) ?? [];
    list.push(r);
    readingsByTree.set(r.TreeId, list);
  }

  const groups = new Map<string, Tree[]>();
  for (const t of trees) {
    const g = t.TreatmentGroup?.trim() || "Ungrouped";
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }

  return Array.from(groups.entries()).map(([group, groupTrees]) => {
    const results: ParamResult[] = SUMMARY_PARAMS.map((param) => {
      const changes = groupTrees
        .map((t) => treePercentChange(readingsByTree.get(t.id) ?? [], param.key))
        .filter((v): v is number => v !== null);
      const percent =
        changes.length > 0
          ? changes.reduce((s, v) => s + v, 0) / changes.length
          : null;
      return { param, percent, treeCount: changes.length };
    });
    return { group, treeCount: groupTrees.length, results };
  });
}

/* ── Soil analysis (spreadsheet "Section E · Analisis Tanah") ─────────────── */

/** The soil parameters tracked, in the order shown in the summary. */
export const SOIL_PARAMS = [
  "pH Tanah",
  "EC (mS/cm)",
  "Organic Carbon (%)",
  "Organic Matter (%)",
  "Moisture Content (%)",
  "CEC (cmol/kg)",
  "Available Nitrogen (%)",
] as const;

export interface SoilResult {
  parameter: string;
  /** Average % change (initial → final) across matching samples, or null. */
  percent: number | null;
  /** How many samples had both an initial and final reading. */
  sampleCount: number;
}

export interface SoilGroupSummary {
  group: string;
  results: SoilResult[];
}

/** Percentage change for one soil sample; null when incomplete or baseline 0. */
export function soilPercentChange(sample: SoilSample): number | null {
  const initial = numeric(sample.InitialReading as Num);
  const final = numeric(sample.FinalReading as Num);
  if (initial === null || final === null || initial === 0) return null;
  return ((final - initial) / Math.abs(initial)) * 100;
}

/**
 * Summarize soil samples per treatment group. For each known parameter, average
 * the percentage change across every complete sample in that group — the same
 * guarded average used for growth parameters.
 */
export function summarizeSoil(samples: SoilSample[]): SoilGroupSummary[] {
  const groups = new Map<string, SoilSample[]>();
  for (const s of samples) {
    const g = s.TreatmentGroup?.trim() || "Ungrouped";
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }

  return Array.from(groups.entries()).map(([group, groupSamples]) => {
    const results: SoilResult[] = SOIL_PARAMS.map((parameter) => {
      const changes = groupSamples
        .filter((s) => s.Parameter === parameter)
        .map(soilPercentChange)
        .filter((v): v is number => v !== null);
      const percent =
        changes.length > 0
          ? changes.reduce((s, v) => s + v, 0) / changes.length
          : null;
      return { parameter, percent, sampleCount: changes.length };
    });
    return { group, results };
  });
}
