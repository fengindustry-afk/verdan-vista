import * as XLSX from "xlsx";
import type {
  Tree, TreeReading, SoilSample, PlotObservation, PlotApplication, PlotComparison,
  GeotaggedPhoto,
} from "./types";
import {
  GROWTH_COLUMNS, HEALTH_COLUMNS, YIELD_COLUMNS, PLOT_SECTIONS,
  buildSectionRows, groupReadingsByTree, type PairColumn,
} from "./testingPlotSections";
import { summarizeTestingPlot, summarizeSoil, SUMMARY_PARAMS } from "./testingPlotSummary";

/**
 * Testing Plot → .xlsx, one sheet per workbook section (A…H) plus a summary,
 * so the export lands in the same shape as the ESTERRA_PLOT5 spreadsheet it
 * was ported from. Anyone who knows the paper workbook can read this file.
 *
 * Uses SheetJS, already a dependency for the feedstock report (exportFiles.ts).
 */

export interface TestingPlotData {
  trees: Tree[];
  readings: TreeReading[];
  soilSamples: SoilSample[];
  observations: PlotObservation[];
  applications: PlotApplication[];
  comparisons: PlotComparison[];
  /** Photo evidence — included so the coordinates and hashes travel with it. */
  photos?: GeotaggedPhoto[];
}

/** Round for display without turning a real 0 into a blank. */
const round2 = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(2)) : "";

/**
 * Coordinates are stored as strings but belong in the sheet as numbers, so they
 * sort and feed straight into a mapping tool. Blank stays blank: `Number("")`
 * is 0, which is a real place in the Gulf of Guinea.
 */
const coord = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : "";
};

/**
 * Stamp a 6-decimal format on the given columns. Without it Excel shows a
 * coordinate under its default format as 2.82, which reads as lost precision
 * even though the stored value is intact.
 */
function formatCoordColumns(sheet: XLSX.WorkSheet, columns: string[]) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (const col of columns) {
    for (let row = 2; row <= range.e.r + 1; row++) {
      const cell = sheet[`${col}${row}`];
      if (cell?.t === "n") cell.z = "0.000000";
    }
  }
}

/** Section title as the tab label, e.g. "A · Maklumat Pokok" (31 char limit). */
function sheetName(letter: string): string {
  const def = PLOT_SECTIONS.find((s) => s.letter === letter);
  return `${letter} · ${def?.titleBm ?? ""}`.slice(0, 31);
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: object[], widths: number[]) {
  // json_to_sheet on an empty array yields a sheet with no header row at all,
  // which reads as a broken export rather than an empty section. Excel is fine
  // with a header-only sheet, so keep the columns and drop the data.
  const sheet = rows.length
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([["(tiada data)"]]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, sheet, name);
  return sheet;
}

/** Sections B/C/D share the LAMA → BARU → % layout, so they share a builder. */
function pairRows(
  trees: Tree[],
  readingsByTree: Map<string, TreeReading[]>,
  columns: PairColumn[]
) {
  return buildSectionRows(trees, readingsByTree, columns).map(({ tree, pairs }) => {
    const row: Record<string, string | number> = {
      "ID Pokok": tree.TreeCode,
      Kumpulan: tree.TreatmentGroup ?? "",
    };
    for (const c of columns) {
      const p = pairs[c.key as string];
      const unit = c.unit ? ` (${c.unit})` : "";
      row[`${c.label} LAMA${unit}`] = round2(p.oldVal);
      row[`${c.label} BARU${unit}`] = round2(p.newVal);
      row[`${c.label} %`] = round2(p.pct);
    }
    return row;
  });
}

/** Build the workbook. Split from the download so it can be tested headless. */
export function buildTestingPlotWorkbook(data: TestingPlotData): XLSX.WorkBook {
  const { trees, readings, soilSamples, observations, applications, comparisons } = data;
  const readingsByTree = groupReadingsByTree(readings);
  const wb = XLSX.utils.book_new();

  // ── Ringkasan — the guarded per-group averages, growth then soil ──────────
  const summary: (string | number)[][] = [
    ["ESTERRA Plot 5 — Testing Plot"],
    ["Dijana", new Date().toISOString().slice(0, 19).replace("T", " ")],
    ["Jumlah pokok", trees.length],
    ["Jumlah bacaan", readings.length],
    [],
    ["Kumpulan", "Parameter", "Purata % perubahan", "Bilangan pokok"],
  ];
  for (const g of summarizeTestingPlot(trees, readings)) {
    for (const r of g.results) {
      // treeCount 0 means no tree had both a baseline and a latest reading —
      // write it as a blank percentage rather than a 0% that looks measured.
      summary.push([g.group, r.param.label, round2(r.percent), r.treeCount]);
    }
  }
  summary.push([], ["Kumpulan", "Parameter tanah", "Purata % perubahan", "Bilangan sampel"]);
  for (const g of summarizeSoil(soilSamples)) {
    for (const r of g.results) {
      summary.push([g.group, r.parameter, round2(r.percent), r.sampleCount]);
    }
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 16 }, { wch: 32 }, { wch: 20 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Ringkasan");

  // ── A · Maklumat Pokok ────────────────────────────────────────────────────
  const sheetA = addSheet(wb, sheetName("A"), trees.map((t) => ({
    "ID Pokok": t.TreeCode,
    Spesies: t.Species ?? "",
    Kumpulan: t.TreatmentGroup ?? "",
    Rawatan: t.Treatment ?? "",
    Plot: t.PlotName ?? "",
    "Umur Tanaman": t.CropAge ?? "",
    "Tarikh Rawatan": t.TreatmentDate ?? "",
    Lokasi: t.PlotLocation ?? "",
    Latitude: coord(t.Latitude),
    Longitude: coord(t.Longitude),
    "Bilangan Bacaan": readingsByTree.get(t.id)?.length ?? 0,
    Catatan: t.Notes ?? "",
  })), [12, 24, 12, 20, 16, 14, 14, 20, 12, 12, 16, 30]);
  formatCoordColumns(sheetA, ["I", "J"]); // Latitude, Longitude

  // ── B/C/D · the paired measurement sections ───────────────────────────────
  addSheet(wb, sheetName("B"), pairRows(trees, readingsByTree, GROWTH_COLUMNS),
    [12, 12, ...GROWTH_COLUMNS.flatMap(() => [16, 16, 10])]);
  addSheet(wb, sheetName("C"), pairRows(trees, readingsByTree, HEALTH_COLUMNS),
    [12, 12, ...HEALTH_COLUMNS.flatMap(() => [16, 16, 10])]);
  addSheet(wb, sheetName("D"), pairRows(trees, readingsByTree, YIELD_COLUMNS),
    [12, 12, ...YIELD_COLUMNS.flatMap(() => [16, 16, 10])]);

  // ── E · Analisis Tanah ────────────────────────────────────────────────────
  addSheet(wb, sheetName("E"), soilSamples.map((s) => ({
    "Bil Pokok": s.TreeNo ?? "",
    "ID Pokok": s.TreeId ?? "",
    Kumpulan: s.TreatmentGroup ?? "",
    Parameter: s.Parameter,
    Awal: round2(s.InitialReading),
    Akhir: round2(s.FinalReading),
    Tarikh: s.Date ?? "",
    Catatan: s.Note ?? "",
  })), [10, 10, 12, 26, 12, 12, 12, 30]);

  // ── F · Pemerhatian Visual ────────────────────────────────────────────────
  addSheet(wb, sheetName("F"), observations.map((o) => ({
    Tarikh: o.Date ?? "",
    Kumpulan: o.TreatmentGroup ?? "",
    "Keadaan Daun": o.LeafCondition ?? "",
    "Keadaan Batang": o.StemCondition ?? "",
    "Keadaan Tanah": o.SoilCondition ?? "",
    Catatan: o.Notes ?? "",
    "Direkod Oleh": o.RecordedBy ?? "",
  })), [12, 12, 22, 22, 22, 34, 18]);

  // ── G · Control vs ESTERRA ────────────────────────────────────────────────
  const byParam = new Map(comparisons.map((c) => [c.Parameter, c]));
  addSheet(wb, sheetName("G"), SUMMARY_PARAMS.map((p) => {
    const c = byParam.get(p.key as string);
    return {
      Parameter: p.label,
      Tarikh: c?.Date ?? "",
      Tanaman: c?.CropType ?? "",
      "Tanpa Biochar %": round2(c?.NonBiocharPct),
      "Dengan Biochar %": round2(c?.BiocharPct),
      Catatan: c?.Notes ?? "",
    };
  }), [30, 12, 16, 18, 18, 30]);

  // ── H · Rekod Aplikasi Produk ─────────────────────────────────────────────
  addSheet(wb, sheetName("H"), applications.map((a) => ({
    Tarikh: a.Date ?? "",
    Produk: a.Product ?? "",
    "Kadar (kg/pokok)": round2(a.RatePerTreeKg),
    "Bilangan Pokok": a.TreeCount ?? "",
    "Biochar (kg)": round2(a.BiocharKg),
    "Harga Seunit (RM)": round2(a.UnitPrice),
    "Jumlah Kos (RM)": round2(
      a.BiocharKg != null && a.UnitPrice != null ? a.BiocharKg * a.UnitPrice : null
    ),
    Kaedah: a.Method ?? "",
    Pegawai: a.Officer ?? "",
    Supervisor: a.Supervisor ?? "",
    Catatan: a.Notes ?? "",
  })), [12, 22, 16, 14, 14, 18, 16, 14, 18, 18, 30]);

  // ── Bukti Foto — evidence provenance, so an auditor can verify offline ────
  if (data.photos?.length) {
    const photoSheet = addSheet(wb, "Bukti Foto", data.photos.map((p) => ({
      ID: p.id,
      Keterangan: p.Description ?? "",
      Tujuan: p.CarbonCreditPurpose ?? "",
      Latitude: coord(p.Latitude),
      Longitude: coord(p.Longitude),
      Ketepatan: p.Accuracy ?? "",
      Masa: p.Timestamp ?? "",
      "Sumber Masa": p.TimestampSource ?? "",
      "SHA-256": p.Sha256 ?? "",
      "Diambil Oleh": p.CapturedBy ?? "",
    })), [22, 30, 22, 12, 12, 10, 20, 12, 66, 18]);
    formatCoordColumns(photoSheet, ["D", "E"]); // Latitude, Longitude
  }

  return wb;
}

export function exportTestingPlotXlsx(data: TestingPlotData, filename: string) {
  XLSX.writeFile(buildTestingPlotWorkbook(data), filename);
}
