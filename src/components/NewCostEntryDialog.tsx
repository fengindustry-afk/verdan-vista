import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { useUpsert, useCategoryNames } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { CostEntry, CostCategory } from "@/lib/types";
import { createCostEntry } from "@/lib/costTracker";
import { useAuth } from "@/lib/auth";
import { newCostEntrySchema, categoryNameSchema } from "@/lib/validation";
import { toast } from "sonner";

const ADD_NEW = "__add_new__";

export function NewCostEntryDialog() {
  const { user } = useAuth();
  const upsert = useUpsert<CostEntry>(Collections.costEntries);
  const upsertCategory = useUpsert<CostCategory>(Collections.costCategories);
  const categoryNames = useCategoryNames();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(categoryNames[0]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const addingCategory = category === ADD_NEW;

  const reset = () => {
    setTitle(""); setAmount(""); setNote(""); setCategory(categoryNames[0]); setNewCategoryName("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    let resolvedCategory = category;

    if (addingCategory) {
      const parsedName = categoryNameSchema.safeParse(newCategoryName);
      if (!parsedName.success) {
        toast.error(parsedName.error.issues[0]?.message ?? "Enter a category name.");
        return;
      }
      resolvedCategory = parsedName.data;
      if (categoryNames.some((c) => c.toLowerCase() === resolvedCategory.toLowerCase())) {
        toast.error(`"${resolvedCategory}" already exists.`);
        return;
      }
    }

    const parsed = newCostEntrySchema.safeParse({ title, category: resolvedCategory, amount, date, note });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }

    if (addingCategory) {
      await upsertCategory.mutateAsync({ id: crypto.randomUUID(), Name: resolvedCategory });
    }
    const entry = createCostEntry(parsed.data, user?.FullName || user?.Email || "User");
    await upsert.mutateAsync(entry);
    toast.success(`Expense "${title}" logged`);
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Log Expense
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fertilizer restock" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground">
                {categoryNames.map((c) => <option key={c}>{c}</option>)}
                <option value={ADD_NEW}>+ Add new category…</option>
              </select>
              {addingCategory && (
                <Input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Additional context" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save expense
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
