import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { useAuth } from "@/lib/auth";
import type { PlotObservation } from "@/lib/types";
import { toast } from "sonner";

type Props = {
  observation?: PlotObservation;
  groups: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Section F – add or edit a dated visual observation of the plot. */
export function EditObservationDialog({ observation, groups, open, onOpenChange }: Props) {
  const upsert = useUpsert<PlotObservation>(Collections.plotObservations);
  const del = useDelete(Collections.plotObservations);
  const { user } = useAuth();
  const editing = !!observation;
  const [form, setForm] = useState<Partial<PlotObservation>>({});

  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setForm(observation ?? { Date: new Date().toISOString().slice(0, 10) });
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const set = (k: keyof PlotObservation) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.Date?.trim()) return toast.error("Date is required.");
    const id = observation?.id ?? `obs_${Date.now().toString(36)}`;
    const doc: PlotObservation = {
      ...observation,
      ...form,
      id,
      RecordedBy: observation?.RecordedBy ?? user?.FullName ?? user?.Email ?? "Operator",
    };
    await upsert.mutateAsync(doc);
    toast.success(editing ? "Observation updated" : "Observation added");
    onOpenChange(false);
  };

  const remove = async () => {
    if (!observation) return;
    await del.mutateAsync(observation.id);
    toast.success("Observation deleted");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit observation" : "Add observation"} · Section F</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 py-2">
          <div>
            <Label className="text-xs">Tarikh (date)</Label>
            <Input type="date" value={form.Date ?? ""} onChange={set("Date")} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Treatment group</Label>
            <Input
              list="obs-groups"
              value={form.TreatmentGroup ?? ""}
              onChange={set("TreatmentGroup")}
              placeholder="ESTERRA / Control"
              className="mt-1"
            />
            <datalist id="obs-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Keadaan daun (leaf condition)</Label>
            <Input value={form.LeafCondition ?? ""} onChange={set("LeafCondition")} placeholder="e.g. Daun berwarna hijau gelap" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Keadaan batang (stem condition)</Label>
            <Input value={form.StemCondition ?? ""} onChange={set("StemCondition")} placeholder="e.g. Batang tiada penyakit" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Keadaan tanah (soil condition)</Label>
            <Input value={form.SoilCondition ?? ""} onChange={set("SoilCondition")} placeholder="e.g. 70% berbatu, 30% berpasir" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Catatan (notes)</Label>
            <Input value={form.Notes ?? ""} onChange={set("Notes")} placeholder="Any remarks…" className="mt-1" />
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
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Add observation"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
