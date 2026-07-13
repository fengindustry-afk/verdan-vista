import {
  MapPin, Sprout, HeartPulse, Flower2, FlaskConical, Eye, GitCompare, PackageCheck,
  type LucideIcon,
} from "lucide-react";
import type { Tree, TreeReading } from "./types";
import { treePercentChange } from "./testingPlotSummary";

/**
 * Section catalog for the Testing Plot, mirroring the ESTERRA_PLOT5 workbook
 * one-to-one (Section A … H, each Excel sheet → one tab). Sections A–E are views
 * over data the app already stores (trees, per-tree readings, soil samples);
 * F and H are their own collections; G is a computed Control-vs-ESTERRA compare.
 */
export interface PlotSectionDef {
  /** Letter as printed in the workbook (A…H). */
  letter: string;
  /** Tab value / stable key. */
  key: string;
  /** English title. */
  title: string;
  /** Bahasa Malaysia title as it appears on the sheet. */
  titleBm: string;
  icon: LucideIcon;
}

export const PLOT_SECTIONS: PlotSectionDef[] = [
  { letter: "A", key: "A", title: "Plot Information", titleBm: "Maklumat Pokok", icon: MapPin },
  { letter: "B", key: "B", title: "Vegetative Growth", titleBm: "Pertumbuhan Vegetatif", icon: Sprout },
  { letter: "C", key: "C", title: "Tree Health", titleBm: "Kesihatan Pokok", icon: HeartPulse },
  { letter: "D", key: "D", title: "Flowering & Yield", titleBm: "Pembungaan & Penghasilan", icon: Flower2 },
  { letter: "E", key: "E", title: "Soil Analysis", titleBm: "Analisis Tanah", icon: FlaskConical },
  { letter: "F", key: "F", title: "Visual Observation", titleBm: "Pemerhatian Visual", icon: Eye },
  { letter: "G", key: "G", title: "Control vs ESTERRA", titleBm: "Control vs ESTERRA", icon: GitCompare },
  { letter: "H", key: "H", title: "Product Application", titleBm: "Rekod Aplikasi Produk", icon: PackageCheck },
];

/** A measurable reading field rendered as an old→new pair (Excel LAMA/BARU). */
export interface PairColumn {
  key: keyof TreeReading;
  label: string;
  unit?: string;
}

/** Column groups for the growth/health/yield sections (B, C, D). */
export const GROWTH_COLUMNS: PairColumn[] = [
  { key: "HeightCm", label: "Ketinggian", unit: "cm" },
  { key: "CanopyCm", label: "Saiz Kanopi", unit: "cm" },
  { key: "StemDiameterMm", label: "Diameter Batang", unit: "mm" },
];
export const HEALTH_COLUMNS: PairColumn[] = [
  { key: "LeafCount", label: "Bilangan Daun" },
  { key: "Spad", label: "SPAD" },
];
export const YIELD_COLUMNS: PairColumn[] = [
  { key: "Flowers", label: "Bilangan Bunga" },
  { key: "Fruit", label: "Bilangan Buah" },
  { key: "YieldKg", label: "Berat Hasil", unit: "kg" },
];

function numeric(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface PairValue {
  oldVal: number | null;
  newVal: number | null;
  oldDate?: string;
  newDate?: string;
  pct: number | null;
}

/** Earliest (LAMA) and latest (BARU) value + % change for one reading field. */
export function readingPair(readings: TreeReading[], key: keyof TreeReading): PairValue {
  const chrono = [...readings].sort((a, b) => (a.Date ?? "").localeCompare(b.Date ?? ""));
  const withValue = chrono.filter((r) => numeric(r[key] as number) !== null);
  const first = withValue[0];
  const last = withValue[withValue.length - 1];
  return {
    oldVal: first ? numeric(first[key] as number) : null,
    newVal: last && last !== first ? numeric(last[key] as number) : null,
    oldDate: first?.Date,
    newDate: last && last !== first ? last.Date : undefined,
    pct: treePercentChange(readings, key),
  };
}

/** One table row: a tree and its old→new pairs for a set of columns. */
export interface SectionRow {
  tree: Tree;
  pairs: Record<string, PairValue>;
}

export function buildSectionRows(
  trees: Tree[],
  readingsByTree: Map<string, TreeReading[]>,
  columns: PairColumn[]
): SectionRow[] {
  return trees.map((tree) => {
    const rs = readingsByTree.get(tree.id) ?? [];
    const pairs: Record<string, PairValue> = {};
    for (const c of columns) pairs[c.key as string] = readingPair(rs, c.key);
    return { tree, pairs };
  });
}

/** Group readings by their TreeId once, for reuse across sections. */
export function groupReadingsByTree(readings: TreeReading[]): Map<string, TreeReading[]> {
  const map = new Map<string, TreeReading[]>();
  for (const r of readings) {
    const list = map.get(r.TreeId) ?? [];
    list.push(r);
    map.set(r.TreeId, list);
  }
  return map;
}
