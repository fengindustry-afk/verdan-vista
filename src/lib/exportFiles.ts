import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Feedstock } from "./types";
import { corcMetrics, currentStageIndex, CUSTODY_STAGES } from "./feedstock";

/**
 * True .xlsx (SheetJS) and .pdf (jsPDF + autotable) generators — an upgrade over
 * the .NET text/CSV "Excel/PDF" exports, with the same report content: an
 * executive summary plus a detailed feedstock table including computed CORCs.
 */

function summaryRows(data: Feedstock[]) {
  const metrics = data.map((f) => corcMetrics(f));
  const verified = data.filter((f) => (f.Status ?? "").toLowerCase() === "verified").length;
  const eligible = metrics.filter((m) => m.isCorcEligible).length;
  const netCorc = metrics.reduce((s, m) => s + m.netCorc, 0);
  const suppliers = new Set(data.map((f) => f.Supplier)).size;
  return [
    ["Report", "Carbon Tracker — Feedstock & CORC Report"],
    ["Generated", new Date().toISOString().slice(0, 19).replace("T", " ")],
    ["Total Batches", data.length],
    ["Verified", verified],
    ["CORC-Eligible", eligible],
    ["Unique Suppliers", suppliers],
    ["Total Net CORCs (tCO2e)", Number(netCorc.toFixed(2))],
  ];
}

function detailRow(f: Feedstock) {
  const m = corcMetrics(f);
  const idx = currentStageIndex(f);
  return {
    ID: f.id,
    Title: f.Title,
    Type: f.Type,
    Supplier: f.Supplier,
    Amount: f.Amount,
    Status: f.Status,
    Stage: `${f.CurrentStage ?? CUSTODY_STAGES[0]} (${idx + 1}/${CUSTODY_STAGES.length})`,
    "Net CORC": Number(m.netCorc.toFixed(2)),
    Durability: m.durabilityClass,
    Eligible: m.isCorcEligible ? "Yes" : "No",
  };
}

export function exportFeedstockXlsx(data: Feedstock[], filename: string) {
  const wb = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet(summaryRows(data));
  summary["!cols"] = [{ wch: 26 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const details = data.map(detailRow);
  const detailSheet = XLSX.utils.json_to_sheet(
    details.length ? details : [{ ID: "", Title: "", Type: "", Supplier: "", Amount: "", Status: "", Stage: "", "Net CORC": "", Durability: "", Eligible: "" }]
  );
  detailSheet["!cols"] = [
    { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 12 },
    { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 9 },
  ];
  XLSX.utils.book_append_sheet(wb, detailSheet, "Feedstock");

  XLSX.writeFile(wb, filename);
}

export function exportFeedstockPdf(data: Feedstock[], filename: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  const green: [number, number, number] = [27, 67, 50];

  // Header
  doc.setFillColor(...green);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("Carbon Tracker — Feedstock & CORC Report", 14, 14);

  // Executive summary
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  let y = 30;
  summaryRows(data).forEach(([k, v]) => {
    doc.text(`${k}:`, 14, y);
    doc.text(String(v), 70, y);
    y += 6;
  });

  // Detail table
  const rows = data.map(detailRow);
  autoTable(doc, {
    startY: y + 4,
    head: [["ID", "Title", "Type", "Supplier", "Amount", "Status", "Stage", "Net CORC", "Durability", "Eligible"]],
    body: rows.map((r) => [
      r.ID, r.Title, r.Type, r.Supplier, r.Amount, r.Status, r.Stage, r["Net CORC"], r.Durability, r.Eligible,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: green, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 246] },
  });

  doc.save(filename);
}
