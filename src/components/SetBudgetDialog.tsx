import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Loader2 } from "lucide-react";
import { useUpsert, useCostBudgets, useCategoryNames } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { CostBudget } from "@/lib/types";
import { costBudgetSchema } from "@/lib/validation";
import { toast } from "sonner";

export function SetBudgetDialog() {
  const { data: budgets = [] } = useCostBudgets();
  const categoryNames = useCategoryNames();
  const upsert = useUpsert<CostBudget>(Collections.costBudgets);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const seeded: Record<string, string> = {};
      for (const c of categoryNames) {
        const existing = budgets.find((b) => b.Category === c);
        seeded[c] = existing ? String(existing.MonthlyLimit) : "";
      }
      setValues(seeded);
    }
  };

  const submit = async () => {
    for (const category of categoryNames) {
      const raw = values[category] ?? "";
      if (raw === "") continue;
      const parsed = costBudgetSchema.safeParse({ category, monthlyLimit: raw });
      if (!parsed.success) {
        toast.error(`${category}: ${parsed.error.issues[0]?.message ?? "Invalid budget"}`);
        return;
      }
    }
    for (const category of categoryNames) {
      const raw = values[category] ?? "";
      if (raw === "") continue;
      const existing = budgets.find((b) => b.Category === category);
      await upsert.mutateAsync({
        id: existing?.id ?? crypto.randomUUID(),
        Category: category,
        MonthlyLimit: Number(raw),
      });
    }
    toast.success("Budgets updated");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-muted text-foreground px-4 py-2 text-sm font-semibold hover:bg-muted/70 transition-colors border border-border">
          <Settings2 className="h-4 w-4" /> Set Budgets
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly Budgets by Category (MYR)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {categoryNames.map((c) => (
            <div key={c} className="grid grid-cols-2 items-center gap-3">
              <Label className="text-xs">{c}</Label>
              <Input
                type="number" min="0" step="0.01"
                value={values[c] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
                placeholder="No limit"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={upsert.isPending}
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
