import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { TreeReading } from "@/lib/types";
import { useNumericField } from "@/hooks/useNumericField";
import { toast } from "sonner";

type Props = {
  treeId: string;
  reading?: TreeReading;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NUM_FIELDS: { key: keyof TreeReading; label: string }[] = [
  { key: "HeightCm", label: "Height (cm)" },
  { key: "CanopyCm", label: "Canopy (cm)" },
  { key: "StemDiameterMm", label: "Stem Ø (mm)" },
  { key: "LeafCount", label: "Leaf count" },
  { key: "Spad", label: "SPAD" },
  { key: "Flowers", label: "Flowers" },
  { key: "Fruit", label: "Fruit" },
  { key: "YieldKg", label: "Yield (kg)" },
];

/** Add or edit a growth reading for a tree. Controlled via `open`. */
export function EditReadingDialog({ treeId, reading, open, onOpenChange }: Props) {
  const upsert = useUpsert<TreeReading>(Collections.readings);
  const del = useDelete(Collections.readings);
  const editing = !!reading;
  const [form, setForm] = useState<Partial<TreeReading>>({});
  const num = useNumericField();

  // Reset local form each time the dialog opens.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setForm(reading ?? { Date: new Date().toISOString().slice(0, 10) });
    num.reset();
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const setNum = (k: keyof TreeReading) =>
    num.onChange(k, (v) => setForm((f) => ({ ...f, [k]: v })));

  const save = async () => {
    if (!form.Date?.trim()) return toast.error("Date is required.");
    const id = reading?.id ?? `read_${crypto.randomUUID()}`;
    const doc: TreeReading = { ...reading, ...form, id, TreeId: treeId, Date: form.Date };
    await upsert.mutateAsync(doc);
    toast.success(editing ? "Reading updated" : "Reading added");
    onOpenChange(false);
  };

  const remove = async () => {
    if (!reading) return;
    await del.mutateAsync(reading.id);
    toast.success("Reading deleted");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit reading" : "Add reading"}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 py-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={form.Date ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, Date: e.target.value }))}
              className="mt-1"
            />
          </div>
          {NUM_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                value={num.display(key, form[key])}
                onChange={setNum(key)}
                className="mt-1"
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label className="text-xs">Note</Label>
            <Input
              value={form.Note ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, Note: e.target.value }))}
              placeholder="Observations…"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {editing ? (
            <button
              onClick={remove}
              disabled={del.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 text-red-400 px-3 py-2 text-sm font-medium hover:bg-red-500/10 disabled:opacity-60"
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Add reading"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
