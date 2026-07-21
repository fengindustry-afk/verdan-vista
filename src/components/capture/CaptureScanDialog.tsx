import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, CalendarClock, Crosshair, Loader2, MapPin, Upload } from "lucide-react";
import { useUpsert } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { TreeScan } from "@/lib/types";
import { getCurrentPosition, compressImage, type GeoFix } from "@/lib/capture";
import { uploadImage, Buckets } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { readCaptureTime, type CaptureTime } from "@/lib/exif";

/** Capture a tree-health scan image (camera + optional GPS) for a given tree. */
export function CaptureScanDialog({ treeId }: { treeId: string }) {
  const { user } = useAuth();
  const upsert = useUpsert<TreeScan>(Collections.scans);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [notes, setNotes] = useState("");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [captured, setCaptured] = useState<CaptureTime | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still fires onChange.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    // Read the capture time BEFORE compressing: compressImage re-encodes through
    // a canvas, which strips every EXIF tag including the date.
    setCaptured(await readCaptureTime(file));
    const compressed = await compressImage(file);
    setBlob(compressed);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(compressed);
    });
  };

  const captureGps = async () => {
    setLocating(true);
    try { setFix(await getCurrentPosition()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Location failed"); }
    finally { setLocating(false); }
  };

  const reset = () => { setBlob(null); setPreview(""); setNotes(""); setFix(null); setCaptured(null); };

  const save = async () => {
    if (!blob) return toast.error("Capture a scan image first.");
    setSaving(true);
    try {
      const id = `scan_${crypto.randomUUID()}`;
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
        // The photo's own capture time wins over the GPS fix (taken now, at
        // upload) so a scan shot in the field days ago is dated to the field.
        Timestamp: captured?.at ?? fix?.Timestamp ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        TimestampSource: captured?.source ?? "upload",
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
          <Camera className="h-4 w-4" /> Capture / Upload
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture Tree Scan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Two inputs: one forces the camera (capture), one is a plain file
              picker for choosing an existing image from the gallery / disk. */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          <input ref={uploadRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          {preview ? (
            <div className="relative">
              <img src={preview} alt="scan preview" className="w-full rounded-lg max-h-56 object-cover" />
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border">
                  <Camera className="h-3 w-3" /> Retake
                </button>
                <button onClick={() => uploadRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border">
                  <Upload className="h-3 w-3" /> Replace
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => cameraRef.current?.click()} className="inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                <Camera className="h-6 w-6 text-primary" /> Take photo
              </button>
              <button onClick={() => uploadRef.current?.click()} className="inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors">
                <Upload className="h-6 w-6 text-primary" /> Upload image
              </button>
            </div>
          )}

          {/* Show which date is going on the record, and how sure we are of it
              — an uploaded photo is dated to when it was shot, not uploaded. */}
          {captured && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border p-3 text-xs">
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="font-mono text-muted-foreground">{captured.at}</span>
              <span className={`ml-auto text-[10px] ${captured.source === "exif" ? "text-primary" : "text-amber-500"}`}>
                {captured.source === "exif"
                  ? "from photo metadata"
                  : captured.source === "file"
                    ? "from file date — no photo metadata"
                    : "upload time — no capture date found"}
              </span>
            </div>
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
