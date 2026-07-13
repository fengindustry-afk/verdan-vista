import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { useUpsert } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { Feedstock } from "@/lib/types";
import { createBatch, type NewBatchInput } from "@/lib/feedstockActions";
import { useAuth } from "@/lib/auth";
import { roleDisplayName } from "@/lib/rbac";
import { newBatchSchema } from "@/lib/validation";
import { toast } from "sonner";

const TYPES = [
  "Empty Fruit Bunches", "POME", "Palm Kernel Shells", "Palm Fronds",
  "Palm Fiber", "Mesocarp Fiber", "Bio-waste", "Other",
];

export function NewBatchDialog() {
  const { user, role } = useAuth();
  const upsert = useUpsert<Feedstock>(Collections.feedstock);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState(TYPES[0]);
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");

  const submit = async () => {
    const parsed = newBatchSchema.safeParse({ title, type, supplier, amount });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    const batch = createBatch(
      // safeParse success guarantees the full shape at runtime; the cast works
      // around zod resolving `.data` to its input (all-optional) flavor here.
      parsed.data as NewBatchInput,
      user?.FullName || user?.Email || "User",
      roleDisplayName[role]
    );
    await upsert.mutateAsync(batch);
    toast.success(`Batch "${title}" created`);
    setOpen(false);
    setTitle(""); setSupplier(""); setAmount(""); setType(TYPES[0]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> New Batch
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Feedstock Batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Batch title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Batch Zeta-4" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Feedstock type</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Lestari Plantation" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1500 kg" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create batch
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
