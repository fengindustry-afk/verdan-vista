import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Crosshair, Loader2, MapPin } from "lucide-react";
import { useUpsert } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { TreeScan } from "@/lib/types";
import { getCurrentPosition, compressImage, type GeoFix } from "@/lib/capture";
import { uploadImage, Buckets } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/** Capture a tree-health scan image (camera + optional GPS) for a given tree. */
export function CaptureScanDialog({ treeId }: { treeId: string }) {
  const { user } = useAuth();
  const upsert = useUpsert<TreeScan>(Collections.scans);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [notes, setNotes] = useState("");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setBlob(compressed);
    setPreview(URL.createObjectURL(compressed));
  };

  const captureGps = async () => {
    setLocating(true);
    try { setFix(await getCurrentPosition()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Location failed"); }
    finally { setLocating(false); }
  };

  const reset = () => { setBlob(null); setPreview(""); setNotes(""); setFix(null); };

  const save = async () => {
    if (!blob) return toast.error("Capture a scan image first.");
    setSaving(true);
    try {
      const id = `scan_${Date.now().toString(36)}`;
      // keepDataUrl: retain a compact base64 fallback alongside the storage path
      // so the scan thumbnail always renders, even if a signed URL can't be
      // produced in this environment (the "new scan shows empty" bug).
      const stored = await uploadImage(Buckets.scans, `${treeId}/${id}.jpg`, blob, { keepDataUrl: true });
      const doc: TreeScan = {
        id,
        TreeId: treeId,
        ImageUrl: stored.path ?? "",
        ImageBase64: stored.dataUrl ? stored.dataUrl.split(",")[1] ?? "" : "",
        Latitude: fix?.Latitude ?? "",
        Longitude: fix?.Longitude ?? "",
        Timestamp: fix?.Timestamp ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        CapturedBy: user?.FullName ?? "",
        Notes: notes.trim(),
      };
      await upsert.mutateAsync(doc);
      toast.success("Scan saved");
      setOpen(false);
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg border border-primary/40 text-primary px-3 py-2 text-sm font-medium hover:bg-primary/10 transition-colors">
          <Camera className="h-4 w-4" /> Capture Scan
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture Tree Scan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          {preview ? (
            <div className="relative">
              <img src={preview} alt="scan preview" className="w-full rounded-lg max-h-56 object-cover" />
              <button onClick={() => fileRef.current?.click()} className="absolute bottom-2 right-2 rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border">Retake</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="w-full inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
              <Camera className="h-6 w-6 text-primary" /> Tap to open camera / choose image
            </button>
          )}

          <div className="flex items-center justify-between rounded-lg bg-muted/50 border border-border p-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground font-mono">
              <MapPin className="h-3.5 w-3.5 text-primary" /> {fix ? `${fix.Latitude}, ${fix.Longitude}` : "No GPS"}
            </div>
            <button onClick={captureGps} disabled={locating} className="inline-flex items-center gap-1 text-primary disabled:opacity-60">
              {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />} {fix ? "Re-tag" : "Tag GPS"}
            </button>
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations…" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={save} disabled={saving || !blob} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save scan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
