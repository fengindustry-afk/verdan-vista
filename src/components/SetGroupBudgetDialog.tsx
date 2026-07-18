import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Loader2 } from "lucide-react";
import {
  useUpsert, useCostEntries, useCostBudgets, useCostCategories, useGroups,
} from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { CostBudget } from "@/lib/types";
import {
  groupSpendForMonth, isSpend, GROUP_DIMENSIONS, type GroupDimension,
} from "@/lib/costTracker";
import { groupBudgetSchema } from "@/lib/validation";
import { toast } from "sonner";

interface Props {
  dimension: GroupDimension;
}

/** Set monthly limits for every group along the active dimension. Writes
 * scoped budgets (ScopeType/ScopeKey), leaving legacy per-category budgets untouched. */
export function SetGroupBudgetDialog({ dimension }: Props) {
  const { data: entries = [] } = useCostEntries();
  const { data: budgets = [] } = useCostBudgets();
  const { data: categories = [] } = useCostCategories();
  const { data: groups = [] } = useGroups();
  const upsert = useUpsert<CostBudget>(Collections.costBudgets);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const dimLabel = GROUP_DIMENSIONS.find((d) => d.id === dimension)?.label ?? "Group";
  const rows = groupSpendForMonth(entries.filter(isSpend), budgets, categories, groups, dimension);

  const findBudget = (key: string) =>
    budgets.find((b) => (b.ScopeType ?? "category") === dimension && (b.ScopeKey ?? b.Category) === key);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const seeded: Record<string, string> = {};
      for (const r of rows) {
        const existing = findBudget(r.key);
        seeded[r.key] = existing ? String(existing.MonthlyLimit) : "";
      }
      setValues(seeded);
    }
  };

  const submit = async () => {
    for (const r of rows) {
      const raw = values[r.key] ?? "";
      if (raw === "") continue;
      const parsed = groupBudgetSchema.safeParse({ scopeKey: r.key, monthlyLimit: raw });
      if (!parsed.success) {
        toast.error(`${r.label}: ${parsed.error.issues[0]?.message ?? "Invalid budget"}`);
        return;
      }
    }
    for (const r of rows) {
      const raw = values[r.key] ?? "";
      if (raw === "") continue;
      const existing = findBudget(r.key);
      await upsert.mutateAsync({
        id: existing?.id ?? crypto.randomUUID(),
        ScopeType: dimension,
        ScopeKey: r.key,
        MonthlyLimit: Number(raw),
      });
    }
    toast.success("Group budgets updated");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-muted text-foreground px-3 py-1.5 text-xs font-semibold hover:bg-muted/70 transition-colors border border-border">
          <Wallet className="h-3.5 w-3.5" /> Set budgets
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly budget by {dimLabel} (MYR)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-96 overflow-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups to budget yet. {dimension === "categoryGroup"
                ? "Assign categories to a group in Manage Categories first."
                : "Log some transactions in this dimension first."}
            </p>
          ) : (
            rows.map((r) => (
              <div key={r.key} className="grid grid-cols-2 items-center gap-3">
                <Label className="text-xs truncate">{r.label}</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={values[r.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
                  placeholder="No limit"
                />
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={upsert.isPending || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save budgets
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
