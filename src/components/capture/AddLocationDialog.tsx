import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Crosshair, Loader2, Plus } from "lucide-react";
import { useUpsert } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { LocationData } from "@/lib/types";
import { getCurrentPosition, type GeoFix } from "@/lib/capture";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const SITE_TYPES = ["TreePlot", "Mill", "Storage", "Field", "Sink", "Other"];

export function AddLocationDialog({
  trigger,
  onSaved,
}: {
  /** Custom trigger; defaults to the standalone "Add Location" button. */
  trigger?: React.ReactNode;
  /** Fires with the saved site, so a caller can select it straight away. */
  onSaved?: (location: LocationData) => void;
} = {}) {
  const { user } = useAuth();
  const upsert = useUpsert<LocationData>(Collections.locations);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [siteType, setSiteType] = useState(SITE_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);

  const capture = async () => {
    setLocating(true);
    try {
      setFix(await getCurrentPosition());
      toast.success("Location captured");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Location failed");
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!fix) return toast.error("Capture GPS coordinates first.");
    if (!name.trim()) return toast.error("Give the site a name.");
    const id = `LOC-${Date.now().toString(36).toUpperCase()}`;
    const doc: LocationData = {
      id,
      Id: id,
      Name: name.trim(),
      SiteType: siteType,
      Notes: notes.trim(),
      Source: "Manual",
      Latitude: fix.Latitude,
      Longitude: fix.Longitude,
      Accuracy: fix.Accuracy,
      Altitude: fix.Altitude,
      Timestamp: fix.Timestamp,
      CapturedBy: user?.FullName ?? "",
      CapturedByEmail: user?.Email ?? "",
      BiomassDataSource: "NONE",
    };
    await upsert.mutateAsync(doc);
    onSaved?.(doc);
    toast.success(`Location "${name}" saved`);
    setOpen(false);
    setName(""); setNotes(""); setFix(null); setSiteType(SITE_TYPES[0]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Add Location
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture GPS Location</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <button
            onClick={capture}
            disabled={locating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 text-primary px-4 py-3 text-sm font-medium hover:bg-primary/10 transition-colors disabled:opacity-60"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            {locating ? "Locating…" : fix ? "Re-capture position" : "Capture current position"}
          </button>

          {fix && (
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-primary mt-0.5" />
              <div className="font-mono">
                {fix.Latitude}, {fix.Longitude}
                <div className="mt-0.5">Accuracy {fix.Accuracy}{fix.Altitude && ` · Alt ${fix.Altitude}`}</div>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Site name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Felda Plot 7" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Site type</Label>
            <select value={siteType} onChange={(e) => setSiteType(e.target.value)} className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground">
              {SITE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any detail…" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={save}
            disabled={upsert.isPending || !fix}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save location
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
