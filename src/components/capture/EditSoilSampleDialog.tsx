import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { SOIL_PARAMS } from "@/lib/testingPlotSummary";
import type { SoilSample } from "@/lib/types";
import { useNumericField } from "@/hooks/useNumericField";
import { toast } from "sonner";

type Props = {
  sample?: SoilSample;
  /** Existing treatment-group names, offered as suggestions. */
  groups?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Add or edit a soil-analysis sample (Section E). Controlled via `open`. */
export function EditSoilSampleDialog({ sample, groups = [], open, onOpenChange }: Props) {
  const upsert = useUpsert<SoilSample>(Collections.soilSamples, { surfaceErrors: true });
  const del = useDelete(Collections.soilSamples);
  const editing = !!sample;
  const [form, setForm] = useState<Partial<SoilSample>>({});
  const num = useNumericField();

  // Reset local form each time the dialog opens.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setForm(sample ?? { Parameter: SOIL_PARAMS[0], Date: new Date().toISOString().slice(0, 10) });
    num.reset();
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const setNum = (k: keyof SoilSample) =>
    num.onChange(k, (v) => setForm((f) => ({ ...f, [k]: v })));

  const save = async () => {
    if (!form.Parameter?.trim()) return toast.error("Parameter wajib diisi.");
    if (!form.TreatmentGroup?.trim()) return toast.error("Kumpulan rawatan wajib diisi.");
    const id = sample?.id ?? `soil_${crypto.randomUUID()}`;
    const doc: SoilSample = { ...sample, ...form, id, Parameter: form.Parameter };
    const saved = await upsert.mutateAsync(doc).catch(() => null);
    if (!saved) return; // useUpsert already toasted why it wasn't saved
    toast.success(editing ? "Sampel tanah dikemas kini" : "Sampel tanah ditambah");
    onOpenChange(false);
  };

  const remove = async () => {
    if (!sample) return;
    await del.mutateAsync(sample.id);
    toast.success("Sampel tanah dipadam");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Kemas kini sampel tanah" : "Tambah sampel tanah"}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 py-2">
          <div>
            <Label className="text-xs">Bil pokok</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={num.display("TreeNo", form.TreeNo)}
              onChange={setNum("TreeNo")}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">ID pokok</Label>
            <Input
              value={form.TreeId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, TreeId: e.target.value }))}
              placeholder="P1"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Parameter</Label>
            <select
              value={form.Parameter ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, Parameter: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SOIL_PARAMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Kumpulan rawatan</Label>
            <Input
              list="soil-groups"
              value={form.TreatmentGroup ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, TreatmentGroup: e.target.value }))}
              placeholder="ESTERRA / Control"
              className="mt-1"
            />
            <datalist id="soil-groups">
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div>
            <Label className="text-xs">Bacaan awal</Label>
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={num.display("InitialReading", form.InitialReading)}
              onChange={setNum("InitialReading")}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Bacaan akhir</Label>
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={num.display("FinalReading", form.FinalReading)}
              onChange={setNum("FinalReading")}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Tarikh</Label>
            <Input
              type="date"
              value={form.Date ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, Date: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Catatan</Label>
            <Input
              value={form.Note ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, Note: e.target.value }))}
              placeholder="Makmal / pemerhatian…"
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
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Simpan" : "Tambah sampel"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
