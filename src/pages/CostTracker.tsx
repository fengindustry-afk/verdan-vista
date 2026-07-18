import { BentoCard } from "@/components/BentoCard";
import { Loader2, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { useCostEntries, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { entryType, GROUP_DIMENSIONS, type GroupDimension } from "@/lib/costTracker";
import { money } from "@/lib/format";
import { NewCostEntryDialog } from "@/components/NewCostEntryDialog";
import { ManageCategoriesDialog } from "@/components/ManageCategoriesDialog";
import { SetGroupBudgetDialog } from "@/components/SetGroupBudgetDialog";
import { GroupBudgetOverview } from "@/components/GroupBudgetOverview";
import { GroupDetail } from "@/components/GroupDetail";
import { ReceiptsPanel } from "@/components/ReceiptsPanel";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

const TABS = ["overview", "expenses", "receipts"] as const;
type TabValue = (typeof TABS)[number];

const DIMENSIONS = GROUP_DIMENSIONS.map((d) => d.id);
function parseDimension(v: string | null): GroupDimension {
  return (DIMENSIONS as string[]).includes(v ?? "") ? (v as GroupDimension) : "categoryGroup";
}

export default function CostTracker() {
  const { data: entries = [], isLoading } = useCostEntries();
  const del = useDelete(Collections.costEntries);
  const { role } = useAuth();
  const canAdd = hasPermission(role, Permission.AddCosts);
  const canDelete = hasPermission(role, Permission.DeleteCosts);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabValue = TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : "overview";
  const dimension = parseDimension(searchParams.get("by"));
  const selectedGroup = searchParams.get("g");

  const setTab = (v: string) =>
    setSearchParams((p) => { p.set("tab", v); p.delete("g"); return p; }, { replace: true });
  const setDimension = (d: GroupDimension) =>
    setSearchParams((p) => { p.set("by", d); p.delete("g"); return p; }, { replace: true });
  const selectGroup = (key: string) =>
    setSearchParams((p) => { p.set("g", key); return p; }, { replace: false });
  const clearGroup = () =>
    setSearchParams((p) => { p.delete("g"); return p; }, { replace: false });

  const recent = [...entries].sort((a, b) => (a.Date < b.Date ? 1 : -1));

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cost Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${entries.length} transactions logged`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && <ManageCategoriesDialog />}
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
            <TabsContent value="overview" className="pt-4">
              {selectedGroup ? (
                <GroupDetail dimension={dimension} groupKey={selectedGroup} onBack={clearGroup} />
              ) : (
                <GroupBudgetOverview
                  dimension={dimension}
                  onDimensionChange={setDimension}
                  onSelectGroup={selectGroup}
                  action={canAdd ? <SetGroupBudgetDialog dimension={dimension} /> : undefined}
                />
              )}
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
                        <th className="px-4 py-3 font-medium">Ledger</th>
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
                          <td className="px-4 py-3 text-muted-foreground">{e.Ledger ?? "Esterra"}</td>
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
