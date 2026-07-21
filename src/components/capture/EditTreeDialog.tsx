import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crosshair, Loader2, MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { Tree } from "@/lib/types";
import { getCurrentPosition } from "@/lib/capture";
import { toast } from "sonner";

/** Add a new tree, or edit an existing one, in the Testing Plot. */
export function EditTreeDialog({ tree }: { tree?: Tree }) {
  const upsert = useUpsert<Tree>(Collections.trees);
  const del = useDelete(Collections.trees);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Tree>>(tree ?? {});
  const [locating, setLocating] = useState(false);
  const editing = !!tree;

  /** Stand at the tree and tag it — this is what the plot plan is drawn from. */
  const tagGps = async () => {
    setLocating(true);
    try {
      const fix = await getCurrentPosition();
      setForm((f) => ({ ...f, Latitude: fix.Latitude, Longitude: fix.Longitude }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Location failed");
    } finally {
      setLocating(false);
    }
  };

  const set = (k: keyof Tree) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.TreeCode?.trim()) return toast.error("Tree code is required.");
    const id = tree?.id ?? `TREE-${Date.now().toString(36).toUpperCase()}`;
    const doc: Tree = {
      ...tree,
      ...form,
      id,
      TreeCode: form.TreeCode.trim(),
      CreatedAt: tree?.CreatedAt ?? new Date().toISOString(),
    };
    await upsert.mutateAsync(doc);
    toast.success(editing ? `Tree "${doc.TreeCode}" updated` : `Tree "${doc.TreeCode}" added`);
    setOpen(false);
    if (!editing) setForm({});
  };

  /** Remove a tree. Recoverable from the audit trail — useDelete logs the
   *  record's prior state before it goes. */
  const remove = async () => {
    if (!tree) return;
    if (!confirm(`Delete tree "${tree.TreeCode}"? Its readings stay in the database.`)) return;
    await del.mutateAsync(tree.id);
    toast.success(`Tree "${tree.TreeCode}" deleted`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(tree ?? {}); }}>
      {editing ? (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm(tree ?? {}); setOpen(true); }}
          className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label="Edit tree"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <DialogTrigger asChild>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Add Tree
          </button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${tree?.TreeCode}` : "Add Tree"}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 py-2">
          <Field label="Tree code *" value={form.TreeCode ?? ""} onChange={set("TreeCode")} placeholder="e.g. T-014" />
          <Field label="Species" value={form.Species ?? ""} onChange={set("Species")} placeholder="e.g. Acacia mangium" />
          <Field label="Treatment group" value={form.TreatmentGroup ?? ""} onChange={set("TreatmentGroup")} placeholder="e.g. Biochar A" />
          <Field label="Treatment" value={form.Treatment ?? ""} onChange={set("Treatment")} placeholder="e.g. 5 t/ha" />
          <Field label="Plot name" value={form.PlotName ?? ""} onChange={set("PlotName")} placeholder="e.g. Plot 7" />
          <Field label="Crop age" value={form.CropAge ?? ""} onChange={set("CropAge")} placeholder="e.g. 18 months" />
          <Field label="Treatment date" value={form.TreatmentDate ?? ""} onChange={set("TreatmentDate")} placeholder="YYYY-MM-DD" />
          <Field label="Plot location" value={form.PlotLocation ?? ""} onChange={set("PlotLocation")} placeholder="e.g. NE corner" />
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-muted/50 border border-border p-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground font-mono">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {form.Latitude && form.Longitude ? `${form.Latitude}, ${form.Longitude}` : "Tiada koordinat"}
            </div>
            <button onClick={tagGps} disabled={locating} className="inline-flex items-center gap-1 text-primary disabled:opacity-60">
              {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
              {form.Latitude ? "Re-tag GPS" : "Tag GPS"}
            </button>
          </div>
          {/* Typed entry for the times GPS isn't an option: correcting a bad
              fix, or transcribing a surveyed coordinate from paper. */}
          <Field label="Latitude" value={form.Latitude ?? ""} onChange={set("Latitude")} placeholder="e.g. 2.824703" />
          <Field label="Longitude" value={form.Longitude ?? ""} onChange={set("Longitude")} placeholder="e.g. 101.769411" />
          <div className="sm:col-span-2">
            <Field label="Notes" value={form.Notes ?? ""} onChange={set("Notes")} placeholder="Any detail…" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {editing ? (
            <button
              onClick={remove}
              disabled={del.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10 disabled:opacity-60"
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Add tree"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={onChange} placeholder={placeholder} className="mt-1" />
    </div>
  );
}
