import { BentoCard } from "@/components/BentoCard";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { useCostEntries, useCostBudgets, useCostCategories, useGroups } from "@/hooks/useCollection";
import {
  groupSpendForMonth, groupTotals, isSpend, GROUP_DIMENSIONS,
  type GroupDimension, type GroupSpend,
} from "@/lib/costTracker";
import { money } from "@/lib/format";

const barClass: Record<GroupSpend["status"], string> = {
  ok: "bg-primary",
  warning: "bg-amber-400",
  over: "bg-destructive",
};

const dotClass: Record<GroupSpend["status"], string> = {
  ok: "bg-primary",
  warning: "bg-amber-400",
  over: "bg-destructive",
};

interface Props {
  dimension: GroupDimension;
  onDimensionChange: (d: GroupDimension) => void;
  onSelectGroup: (key: string) => void;
  /** Slot for the "Set group budgets" action, rendered next to the switch. */
  action?: React.ReactNode;
}

/**
 * Overview of monthly spend rolled up by group along one dimension. A quiet
 * column of horizontal budget meters, each drilling into its own detail — the
 * antidote to the old everything-on-one-screen layout.
 */
export function GroupBudgetOverview({ dimension, onDimensionChange, onSelectGroup, action }: Props) {
  const { data: entries = [] } = useCostEntries();
  const { data: budgets = [] } = useCostBudgets();
  const { data: categories = [] } = useCostCategories();
  const { data: groups = [] } = useGroups();

  const spend = entries.filter(isSpend);
  const rows = groupSpendForMonth(spend, budgets, categories, groups, dimension);
  const totals = groupTotals(rows);

  return (
    <div className="space-y-5">
      {/* Group-by switch + action */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-xl bg-muted p-0.5 border border-border">
          {GROUP_DIMENSIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => onDimensionChange(d.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                dimension === d.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={dimension === d.id}
            >
              {d.label}
            </button>
          ))}
        </div>
        {action}
      </div>

      {/* Roll-up: one slim card, three stats — not eight tiles */}
      <BentoCard className="flex flex-wrap items-center gap-x-10 gap-y-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Spent this month</p>
          <p className="text-xl font-bold text-foreground">{money(totals.spent)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Budgeted</p>
          <p className="text-xl font-bold text-foreground">
            {totals.budget > 0 ? money(totals.budget) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Remaining</p>
          <p className={`text-xl font-bold ${totals.remaining < 0 ? "text-destructive" : "text-foreground"}`}>
            {totals.budget > 0 ? money(totals.remaining) : "—"}
          </p>
        </div>
        {totals.overCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {totals.overCount} over budget
          </span>
        )}
      </BentoCard>

      {/* The meters */}
      {rows.length === 0 ? (
        <BentoCard>
          <p className="text-sm text-muted-foreground">
            No spending in any {dimensionNoun(dimension)} this month.
          </p>
        </BentoCard>
      ) : (
        <BentoCard className="p-0 overflow-hidden divide-y divide-border/40">
          {rows.map((r) => (
            <button
              key={r.key}
              onClick={() => onSelectGroup(r.key)}
              className="w-full text-left px-4 py-3.5 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass[r.status]}`} />
                <span className="text-sm font-medium text-foreground truncate">{r.label}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {r.txCount} {r.txCount === 1 ? "tx" : "txns"}
                </span>
                <span className="ml-auto text-sm text-foreground whitespace-nowrap tabular-nums">
                  {money(r.spent)}
                  <span className="text-muted-foreground">
                    {r.budget > 0 ? ` / ${money(r.budget)}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
              </div>
              <div className="mt-2 ml-5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barClass[r.status]}`}
                  style={{ width: `${r.budget > 0 ? Math.min(100, r.pctUsed) : 100}%`, opacity: r.budget > 0 ? 1 : 0.25 }}
                />
              </div>
            </button>
          ))}
        </BentoCard>
      )}
    </div>
  );
}

function dimensionNoun(d: GroupDimension): string {
  return d === "ledger" ? "ledger" : d === "accessGroup" ? "access group" : "category group";
}
