import { BentoCard } from "@/components/BentoCard";
import { useFeedstock } from "@/hooks/useCollection";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import { corcMetrics } from "@/lib/feedstock";
import { fmt } from "@/lib/format";
import {
  ncmpFeedstockReport, shariahReport, carbonTaxReport, downloadText,
} from "@/lib/exports";
import { exportFeedstockXlsx, exportFeedstockPdf } from "@/lib/exportFiles";
import { FileText, ShieldCheck, Landmark, Table2, FileSpreadsheet, FileDown, Download, Lock } from "lucide-react";
import { toast } from "sonner";
import { useMemo } from "react";

export default function Reports() {
  const { data: feedstock = [] } = useFeedstock();
  const { role } = useAuth();
  const canExport = hasPermission(role, Permission.ExportData);

  const totals = useMemo(() => {
    const netCorc = feedstock.reduce((s, f) => s + corcMetrics(f).netCorc, 0);
    const eligible = feedstock.filter((f) => corcMetrics(f).isCorcEligible).length;
    return { netCorc, eligible };
  }, [feedstock]);

  const stamp = new Date().toISOString().slice(0, 10);

  const reports = [
    {
      icon: FileText,
      title: "NCMP Compliance Report",
      desc: "Malaysia National Carbon Market Policy — feedstock traceability & CORC eligibility.",
      run: () => downloadText(ncmpFeedstockReport(feedstock), `ncmp-compliance-${stamp}.csv`, "text/csv"),
    },
    {
      icon: ShieldCheck,
      title: "Shariah Certification",
      desc: "Bursa Carbon Exchange Shariah screening of sourcing across all batches.",
      run: () => downloadText(shariahReport(feedstock), `shariah-certification-${stamp}.csv`, "text/csv"),
    },
    {
      icon: Landmark,
      title: "Carbon Tax Disclosure",
      desc: "LHDN National Carbon Tax disclosure with computed CORC value (MYR).",
      run: () => downloadText(carbonTaxReport(feedstock), `carbon-tax-${stamp}.csv`, "text/csv"),
    },
    {
      icon: FileSpreadsheet,
      title: "Excel Workbook (.xlsx)",
      desc: "Two-sheet workbook — executive summary + detailed feedstock with CORCs.",
      run: () => exportFeedstockXlsx(feedstock, `feedstock-report-${stamp}.xlsx`),
    },
    {
      icon: FileDown,
      title: "PDF Report (.pdf)",
      desc: "Formatted landscape report with summary and a styled batch table.",
      run: () => exportFeedstockPdf(feedstock, `feedstock-report-${stamp}.pdf`),
    },
    {
      icon: Table2,
      title: "Feedstock CSV Export",
      desc: "Raw batch data with computed net CORCs and durability class.",
      run: () => {
        const headers = ["Id", "Title", "Type", "Supplier", "Amount", "Status", "CurrentStage", "NetCORC", "DurabilityClass"];
        const rows = feedstock.map((f) => {
          const m = corcMetrics(f);
          return [f.id, f.Title, f.Type, f.Supplier, f.Amount, f.Status, f.CurrentStage ?? "", m.netCorc.toFixed(2), m.durabilityClass]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
        });
        downloadText([headers.join(","), ...rows].join("\n"), `feedstock-${stamp}.csv`, "text/csv");
      },
    },
  ];

  const download = (r: (typeof reports)[number]) => {
    if (!canExport) {
      toast.error("Your role does not have export permission.");
      return;
    }
    r.run();
    toast.success(`${r.title} downloaded`);
  };

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Compliance Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {fmt(totals.netCorc, 2)} net CORCs · {totals.eligible} eligible batches · export-ready
        </p>
      </div>

      {!canExport && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
          <Lock className="h-4 w-4" /> Your role is read-only. Reports require the Export Data permission (Manager or Admin).
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {reports.map((r, i) => (
          <BentoCard key={r.title} delay={i * 0.06}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <r.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                <button
                  onClick={() => download(r)}
                  disabled={!canExport}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/15 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            </div>
          </BentoCard>
        ))}
      </div>
    </div>
  );
}
