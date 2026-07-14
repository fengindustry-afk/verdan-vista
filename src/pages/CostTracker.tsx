import { BentoCard } from "@/components/BentoCard";
import { Wallet, TrendingUp, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { useCostEntries, useCostBudgets, useCategoryNames, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { categorySpendForMonth, projectMonthSummary } from "@/lib/costTracker";
import { money } from "@/lib/format";
import { NewCostEntryDialog } from "@/components/NewCostEntryDialog";
import { SetBudgetDialog } from "@/components/SetBudgetDialog";
import { ManageCategoriesDialog } from "@/components/ManageCategoriesDialog";
import { ReceiptsPanel } from "@/components/ReceiptsPanel";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

const statusClass: Record<string, string> = {
  ok: "bg-primary/15 text-primary border-primary/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  over: "bg-destructive/15 text-destructive border-destructive/30",
};

const barClass: Record<string, string> = {
  ok: "bg-primary",
  warning: "bg-amber-400",
  over: "bg-destructive",
};

const TABS = ["overview", "expenses", "receipts"] as const;
type TabValue = (typeof TABS)[number];

export default function CostTracker() {
  const { data: entries = [], isLoading } = useCostEntries();
  const { data: budgets = [] } = useCostBudgets();
  const categoryNames = useCategoryNames();
  const del = useDelete(Collections.costEntries);
  const { role } = useAuth();
  const canAdd = hasPermission(role, Permission.AddCosts);
  const canDelete = hasPermission(role, Permission.DeleteCosts);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabValue = TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : "overview";
  const setTab = (v: string) => setSearchParams((p) => { p.set("tab", v); return p; }, { replace: true });

  const spend = categorySpendForMonth(entries, budgets, categoryNames);
  const summary = projectMonthSummary(entries, budgets);
  const overBudgetCount = spend.filter((s) => s.status === "over").length;
  const recent = [...entries].sort((a, b) => (a.Date < b.Date ? 1 : -1));

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cost Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${entries.length} expenses logged this period`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && <ManageCategoriesDialog />}
          {canAdd && <SetBudgetDialog />}
          {canAdd && <NewCostEntryDialog />}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading live data…
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="space-y-6 pt-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <BentoCard>
                  <p className="text-xs text-muted-foreground mb-1">Spent this month</p>
                  <p className="text-2xl font-bold text-foreground">{money(summary.totalSpent)}</p>
                </BentoCard>
                <BentoCard delay={0.05}>
                  <p className="text-xs text-muted-foreground mb-1">Budget this month</p>
                  <p className="text-2xl font-bold text-foreground">{money(summary.totalBudget)}</p>
                </BentoCard>
                <BentoCard delay={0.1}>
                  <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                  <p className={`text-2xl font-bold ${summary.remaining < 0 ? "text-destructive" : "text-foreground"}`}>
                    {money(summary.remaining)}
                  </p>
                </BentoCard>
                <BentoCard delay={0.15}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Projected month-end</p>
                  </div>
                  <p className={`text-2xl font-bold ${
                    summary.totalBudget > 0 && summary.projectedTotal > summary.totalBudget
                      ? "text-amber-400" : "text-foreground"
                  }`}>
                    {money(summary.projectedTotal)}
                  </p>
                </BentoCard>
              </div>

              {overBudgetCount > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {overBudgetCount} {overBudgetCount === 1 ? "category is" : "categories are"} over budget this month.
                </div>
              )}

              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Spend by category</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {spend.map((s, i) => (
                    <BentoCard key={s.category} delay={i * 0.05}>
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 text-primary shrink-0" />
                          {s.category}
                        </h3>
                        <Badge variant="outline" className={`text-[10px] font-medium border ${statusClass[s.status]}`}>
                          {s.status === "ok" ? "On track" : s.status === "warning" ? "Near limit" : "Over budget"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {money(s.spent)} {s.budget > 0 ? `of ${money(s.budget)}` : "· no budget set"}
                      </p>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barClass[s.status]}`}
                          style={{ width: `${Math.min(100, s.pctUsed)}%` }}
                        />
                      </div>
                    </BentoCard>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="expenses" className="pt-4">
              <BentoCard className="p-0 overflow-hidden">
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">No expenses logged yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Title</th>
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
            </TabsContent>

            <TabsContent value="receipts" className="pt-4">
              <ReceiptsPanel />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
