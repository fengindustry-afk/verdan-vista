import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tags, Plus, Trash2, Loader2 } from "lucide-react";
import { useCostCategories, useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { CostCategory } from "@/lib/types";
import { DefaultCostCategories, categoryNameSchema, categoryGroupNameSchema } from "@/lib/validation";
import { toast } from "sonner";

interface Row {
  id: string;
  name: string;
  /** Optional category-group this belongs to (drives the "Category group" budget view). */
  group: string;
  /** True once this row has been saved as a real document; false for defaults not yet persisted. */
  persisted: boolean;
}

export function ManageCategoriesDialog() {
  const { data: categories = [] } = useCostCategories();
  const upsert = useUpsert<CostCategory>(Collections.costCategories);
  const del = useDelete(Collections.costCategories);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setRows(
        categories.length > 0
          ? categories.map((c) => ({ id: c.id, name: c.Name, group: c.Group ?? "", persisted: true }))
          : DefaultCostCategories.map((name) => ({ id: crypto.randomUUID(), name, group: "", persisted: false }))
      );
    }
  };

  const updateName = (id: string, name: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, name } : r)));

  const updateGroup = (id: string, group: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, group } : r)));

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const addRow = () => setRows((rs) => [...rs, { id: crypto.randomUUID(), name: "", group: "", persisted: false }]);

  const submit = async () => {
    const named = rows.filter((r) => r.name.trim() !== "");
    for (const r of named) {
      const parsed = categoryNameSchema.safeParse(r.name);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? `Invalid category name "${r.name}"`);
        return;
      }
      if (!categoryGroupNameSchema.safeParse(r.group).success) {
        toast.error(`${r.name}: group name must be 40 characters or fewer`);
        return;
      }
    }
    const lower = named.map((r) => r.name.trim().toLowerCase());
    if (new Set(lower).size !== lower.length) {
      toast.error("Category names must be unique.");
      return;
    }

    setSaving(true);
    try {
      const removedIds = categories
        .filter((c) => !rows.some((r) => r.id === c.id))
        .map((c) => c.id);
      for (const id of removedIds) await del.mutateAsync(id);
      for (const r of named) {
        const group = r.group.trim();
        await upsert.mutateAsync({ id: r.id, Name: r.name.trim(), ...(group ? { Group: group } : {}) });
      }
      toast.success("Categories updated");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-muted text-foreground px-4 py-2 text-sm font-semibold hover:bg-muted/70 transition-colors border border-border">
          <Tags className="h-4 w-4" /> Categories
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2 max-h-80 overflow-auto">
          <div className="flex items-center gap-2 px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Category</span>
            <span className="flex-1">Group (optional)</span>
            <span className="w-4 shrink-0" />
          </div>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                value={r.name}
                onChange={(e) => updateName(r.id, e.target.value)}
                placeholder="Category name"
                className="flex-1"
              />
              <Input
                value={r.group}
                onChange={(e) => updateGroup(r.id, e.target.value)}
                placeholder="e.g. Operations"
                className="flex-1"
              />
              <button
                onClick={() => removeRow(r.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label={`Remove ${r.name || "category"}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add category
          </button>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save categories
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
