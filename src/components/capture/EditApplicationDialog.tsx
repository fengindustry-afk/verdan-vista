import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { PlotApplication } from "@/lib/types";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

type Props = {
  application?: PlotApplication;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NUM: { key: keyof PlotApplication; label: string }[] = [
  { key: "RatePerTreeKg", label: "Kadar (kg/pokok)" },
  { key: "TreeCount", label: "Bilangan pokok" },
  { key: "BiocharKg", label: "Total kadar aplikasi biochar (kg)" },
  { key: "UnitPrice", label: "Harga seunit (RM/kg)" },
];

const TEXT: { key: keyof PlotApplication; label: string; placeholder?: string }[] = [
  { key: "Product", label: "Produk", placeholder: "e.g. Woodchips Biochar - Grade C" },
  { key: "Method", label: "Kaedah aplikasi", placeholder: "e.g. Menabur" },
  { key: "Officer", label: "Pegawai bertugas", placeholder: "e.g. Babu" },
  { key: "Supervisor", label: "Supervisor", placeholder: "e.g. Danial" },
];

/** Section H – add or edit a product application record. */
export function EditApplicationDialog({ application, open, onOpenChange }: Props) {
  const upsert = useUpsert<PlotApplication>(Collections.plotApplications, { surfaceErrors: true });
  const del = useDelete(Collections.plotApplications);
  const editing = !!application;
  const [form, setForm] = useState<Partial<PlotApplication>>({});

  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setForm(application ?? { Date: new Date().toISOString().slice(0, 10) });
    setSeenOpen(true);
  } else if (!open && seenOpen) {
    setSeenOpen(false);
  }

  const setText = (k: keyof PlotApplication) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNum = (k: keyof PlotApplication) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v === "" ? null : Number(v) }));
  };

  // Cost is charged on the biochar content, not the total fertiliser applied.
  const price = typeof form.UnitPrice === "number" ? form.UnitPrice : null;
  const biocharKg = typeof form.BiocharKg === "number" ? form.BiocharKg : null;
  const totalCost = biocharKg != null && price != null ? biocharKg * price : null;

  const save = async () => {
    if (!form.Date?.trim()) return toast.error("Tarikh wajib diisi.");
    const id = application?.id ?? `app_${Date.now().toString(36)}`;
    const doc: PlotApplication = { ...application, ...form, id };
    const saved = await upsert.mutateAsync(doc).catch(() => null);
    if (!saved) return; // useUpsert already toasted why it wasn't saved
    toast.success(editing ? "Aplikasi dikemas kini" : "Aplikasi ditambah");
    onOpenChange(false);
  };

  const remove = async () => {
    if (!application) return;
    await del.mutateAsync(application.id);
    toast.success("Aplikasi dipadam");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Kemas kini aplikasi" : "Tambah aplikasi"} · Seksyen H</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 py-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Tarikh (date)</Label>
            <Input type="date" value={form.Date ?? ""} onChange={setText("Date")} className="mt-1" />
          </div>
          {TEXT.map(({ key, label, placeholder }) => (
            <div key={key} className={key === "Product" ? "sm:col-span-2" : ""}>
              <Label className="text-xs">{label}</Label>
              <Input value={(form[key] as string) ?? ""} onChange={setText(key)} placeholder={placeholder} className="mt-1" />
            </div>
          ))}
          {NUM.map(({ key, label }) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input type="number" inputMode="decimal" value={form[key] == null ? "" : String(form[key])} onChange={setNum(key)} className="mt-1" />
            </div>
          ))}
          <div className="sm:col-span-2 rounded-lg bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>Biochar: <span className="text-foreground font-medium">{biocharKg != null ? `${fmt(biocharKg, 1)} kg` : "—"}</span></span>
            <span>Total cost: <span className="text-foreground font-medium">{totalCost != null ? `RM ${fmt(totalCost, 2)}` : "—"}</span></span>
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
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Simpan" : "Tambah aplikasi"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
