import { useState } from "react";
import { BentoCard } from "@/components/BentoCard";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  useCostEntries, useCostCategories, useGroups, useDelete,
} from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import {
  entriesInGroup, groupLabel, moneySummary, expenseByCategory, entryType,
  inCurrentMonth, type GroupDimension,
} from "@/lib/costTracker";
import { money } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

type Period = "month" | "all";

interface Props {
  dimension: GroupDimension;
  groupKey: string;
  onBack: () => void;
}

/** Focused breakdown for a single group: the dense view from the old Overview,
 * but scoped to one group's transactions so it reads clearly. */
export function GroupDetail({ dimension, groupKey, onBack }: Props) {
  const { data: entries = [] } = useCostEntries();
  const { data: categories = [] } = useCostCategories();
  const { data: groups = [] } = useGroups();
  const del = useDelete(Collections.costEntries);
  const { role } = useAuth();
  const canDelete = hasPermission(role, Permission.DeleteCosts);
  const [period, setPeriod] = useState<Period>("month");

  const label = groupLabel(groupKey, dimension, groups);
  const allGroupEntries = entriesInGroup(entries, dimension, groupKey, categories);
  const groupEntries = period === "month"
    ? allGroupEntries.filter((e) => inCurrentMonth(e.Date))
    : allGroupEntries;
  const money$ = moneySummary(groupEntries);
  const byCategory = expenseByCategory(groupEntries);
  const maxTotal = Math.max(...byCategory.map((c) => c.total), 1);
  const recent = [...groupEntries].sort((a, b) => (a.Date < b.Date ? 1 : -1));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg bg-muted border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All groups
        </button>
        <div>
          <h2 className="text-lg font-bold text-foreground leading-tight">{label}</h2>
          <p className="text-[11px] text-muted-foreground">
            {groupEntries.length} {groupEntries.length === 1 ? "transaction" : "transactions"}
            {" · "}{period === "month" ? "this month" : "all time"}
          </p>
        </div>
        <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 border border-border">
          {(["month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={period === p}
            >
              {p === "month" ? "This month" : "All time"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <BentoCard>
          <p className="text-xs text-muted-foreground mb-1">Expenses</p>
          <p className="text-2xl font-bold text-foreground">{money(money$.expenses)}</p>
        </BentoCard>
        <BentoCard delay={0.05}>
          <p className="text-xs text-muted-foreground mb-1">Income</p>
          <p className="text-2xl font-bold text-foreground">{money(money$.income)}</p>
        </BentoCard>
        <BentoCard delay={0.1}>
          <p className="text-xs text-muted-foreground mb-1">Balance</p>
          <p className={`text-2xl font-bold ${money$.balance < 0 ? "text-destructive" : "text-foreground"}`}>
            {money(money$.balance)}
          </p>
        </BentoCard>
      </div>

      {byCategory.length > 0 && (
        <BentoCard>
          <h3 className="text-sm font-semibold text-foreground mb-3">Expenses by category</h3>
          <div className="space-y-2.5">
            {byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs text-foreground truncate">{c.category}</span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{money(c.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(2, (c.total / maxTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </BentoCard>
      )}

      <BentoCard className="p-0 overflow-hidden">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground p-5">No transactions in this group yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                {canDelete && <th className="px-4 py-3 font-medium text-right"></th>}
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-foreground">{e.Title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entryType(e)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.Category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.Date}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{money(e.Amount)}</td>
                  {canDelete && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => del.mutate(e.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Delete ${e.Title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </BentoCard>
    </div>
  );
}
