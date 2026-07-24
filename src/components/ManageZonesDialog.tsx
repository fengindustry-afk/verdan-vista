import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MapPinned, Plus, Trash2, Loader2 } from "lucide-react";
import { useZones, useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { DEFAULT_ZONES } from "@/lib/workProcess";
import type { Zone } from "@/lib/types";
import { toast } from "sonner";

interface Row { id: string; name: string }

/**
 * Manage the zone options offered by Work Process location fields. Admin-only.
 * Mirrors ManageCategoriesDialog: seeds from DEFAULT_ZONES until real zones are
 * saved, then those drive every zone dropdown across the work-process forms.
 */
export function ManageZonesDialog() {
  const { data: zones = [] } = useZones();
  const upsert = useUpsert<Zone>(Collections.zones, { surfaceErrors: true });
  const del = useDelete(Collections.zones);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setRows(
        zones.length > 0
          ? zones.map((z) => ({ id: z.id, name: z.Name }))
          : DEFAULT_ZONES.map((name) => ({ id: crypto.randomUUID(), name }))
      );
    }
  };

  const submit = async () => {
    const named = rows.filter((r) => r.name.trim() !== "");
    const lower = named.map((r) => r.name.trim().toLowerCase());
    if (new Set(lower).size !== lower.length) {
      toast.error("Zone names must be unique.");
      return;
    }
    setSaving(true);
    try {
      const removedIds = zones.filter((z) => !rows.some((r) => r.id === z.id)).map((z) => z.id);
      for (const id of removedIds) await del.mutateAsync(id);
      for (const r of named) await upsert.mutateAsync({ id: r.id, Name: r.name.trim() });
      toast.success("Zones updated");
      setOpen(false);
    } catch {
      /* useUpsert already toasts the RLS/table error */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-muted text-foreground px-3 py-2 text-sm font-semibold hover:bg-muted/70 transition-colors border border-border">
          <MapPinned className="h-4 w-4 text-primary" /> Manage zones
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage zones</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Zones are the coarse location tags in Work Process forms. Precise position comes from the coordinate on each entry.
        </p>
        <div className="space-y-2 py-2 max-h-80 overflow-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                value={r.name}
                onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                placeholder="Zone name (e.g. Zone A)"
                className="flex-1"
              />
              <button
                onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label={`Remove ${r.name || "zone"}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setRows((rs) => [...rs, { id: crypto.randomUUID(), name: "" }])}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add zone
          </button>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save zones
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
