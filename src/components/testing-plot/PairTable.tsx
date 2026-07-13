import { Link } from "react-router-dom";
import { TreePine } from "lucide-react";
import { fmt } from "@/lib/format";
import type { PairColumn, SectionRow } from "@/lib/testingPlotSections";

/**
 * Old→new (LAMA/BARU) reading table for the growth/health/yield sections
 * (B, C, D), one row per tree. Each field shows the earliest value, the latest
 * value and the % change — mirroring the workbook's paired columns. Values are
 * entered per tree on the tree-detail page, so each row links there.
 */
export function PairTable({ rows, columns }: { rows: SectionRow[]; columns: PairColumn[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No trees recorded.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/50">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground">
            <th className="text-left font-medium px-3 py-2 sticky left-0 bg-muted/40">ID Pokok</th>
            {columns.map((c) => (
              <th key={c.key as string} className="text-right font-medium px-3 py-2 whitespace-nowrap">
                {c.label}{c.unit ? ` (${c.unit})` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tree, pairs }) => (
            <tr key={tree.id} className="border-b border-border/30 hover:bg-muted/20">
              <td className="px-3 py-2 sticky left-0 bg-background">
                <Link to={`/testing-plot/${encodeURIComponent(tree.id)}`} className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors">
                  <TreePine className="h-3 w-3 text-primary" /> {tree.TreeCode}
                </Link>
              </td>
              {columns.map((c) => {
                const p = pairs[c.key as string];
                return (
                  <td key={c.key as string} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <span className="text-muted-foreground">{p?.oldVal ?? "—"}</span>
                    <span className="text-muted-foreground/50"> → </span>
                    <span className="text-foreground">{p?.newVal ?? "—"}</span>
                    {p?.pct != null && (
                      <span className={p.pct >= 0 ? " text-primary" : " text-destructive"}>
                        {" "}({p.pct > 0 ? "+" : ""}{fmt(p.pct, 1)}%)
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
