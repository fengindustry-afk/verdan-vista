import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, CalendarClock, Crosshair, Loader2, MapPin } from "lucide-react";
import { useUpsert, useLocations, useTrees } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { GeotaggedPhoto } from "@/lib/types";
import {
  getCurrentPosition, compressImage, geofenceCheck, GEOFENCE_RADIUS_M, type GeoFix,
} from "@/lib/capture";
import { uploadImage, Buckets } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { readCaptureTime, type CaptureTime } from "@/lib/exif";
import { hashStoredImage } from "@/lib/hash";

/**
 * Photo evidence: an image plus where and when it was taken. No AI scan, no
 * analysis — the picture is the record.
 *
 * `label` retitles the dialog for a caller like Testing Plot section A, where
 * the same capture is used as carbon-sink evidence.
 */
export function CapturePhotoDialog({ label, title }: { label?: string; title?: string } = {}) {
  const { user } = useAuth();
  const upsert = useUpsert<GeotaggedPhoto>(Collections.photos, { surfaceErrors: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [captured, setCaptured] = useState<CaptureTime | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reference points for the geofence: recorded sites plus any tree that has
  // coordinates. Whichever is nearest wins.
  const { data: locations = [] } = useLocations();
  const { data: trees = [] } = useTrees();
  const fence = useMemo(
    () => (fix ? geofenceCheck(fix, [...locations, ...trees]) : null),
    [fix, locations, trees]
  );
  const offBy = fence?.distance ?? null;
  const outOfRange = fence?.outside ?? false;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so re-picking the same file still fires onChange
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    // Read capture time BEFORE compressing — compressImage re-encodes through a
    // canvas and strips every EXIF tag, the date included.
    setCaptured(await readCaptureTime(file));
    const compressed = await compressImage(file);
    setBlob(compressed);
    setPreview(URL.createObjectURL(compressed));
    // Auto-capture GPS alongside the photo.
    if (!fix) captureGps();
  };

  const captureGps = async () => {
    setLocating(true);
    try {
      setFix(await getCurrentPosition());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Location failed");
    } finally {
      setLocating(false);
    }
  };

  const reset = () => {
    setBlob(null); setPreview(""); setDescription(""); setPurpose(""); setFix(null); setCaptured(null);
  };

  const save = async () => {
    if (!blob) return toast.error("Capture a photo first.");
    // Evidence without coordinates can't be tied to the plot, so it isn't
    // evidence. Refuse rather than save a record that fails at audit.
    if (!fix) return toast.error("Tag GPS before saving — evidence needs coordinates.");
    if (outOfRange) return toast.error("This location is outside the site. Re-tag GPS at the plot.");
    setSaving(true);
    try {
      const id = `PHOTO-${Date.now().toString(36).toUpperCase()}`;
      const stored = await uploadImage(Buckets.photos, `${id}.jpg`, blob);
      // Hash the bytes that were stored — that is what an auditor re-hashes.
      const sha256 = await hashStoredImage(blob);
      const doc: GeotaggedPhoto = {
        id,
        PhotoUrl: stored.path ?? stored.dataUrl ?? "",
        Sha256: sha256,
        TimestampSource: captured?.source ?? "upload",
        Description: description.trim(),
        CarbonCreditPurpose: purpose.trim(),
        Latitude: fix?.Latitude ?? "",
        Longitude: fix?.Longitude ?? "",
        Accuracy: fix?.Accuracy ?? "",
        Altitude: fix?.Altitude ?? "",
        // The photo's own capture time wins over the GPS fix (taken now, at
        // upload) so an image shot in the field days ago is dated to the field.
        Timestamp: captured?.at ?? fix?.Timestamp ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        CapturedBy: user?.FullName ?? "",
        FileName: `${id}.jpg`,
        FileSize: blob.size,
      };
      const saved = await upsert.mutateAsync(doc).catch(() => null);
      if (!saved) return; // useUpsert already toasted why (e.g. duplicate image)
      toast.success("Geotagged photo saved");
      setOpen(false);
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg border border-primary/40 text-primary px-3 py-2 text-sm font-semibold hover:bg-primary/10 transition-colors">
          <Camera className="h-4 w-4" /> {label ?? "Capture Photo"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? "Capture Geotagged Photo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            className="hidden"
          />
          {preview ? (
            <div className="relative">
              <img src={preview} alt="capture preview" className="w-full rounded-lg max-h-56 object-cover" />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-2 right-2 rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border"
              >
                Retake
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              <Camera className="h-6 w-6 text-primary" />
              Tap to open camera / choose image
            </button>
          )}

          {/* Which date goes on the record, and how sure we are of it. */}
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
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {fix ? `${fix.Latitude}, ${fix.Longitude}` : "No GPS yet — required"}
            </div>
            <button onClick={captureGps} disabled={locating} className="inline-flex items-center gap-1 text-primary text-xs disabled:opacity-60">
              {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />} {fix ? "Re-tag" : "Tag GPS"}
            </button>
          </div>

          {offBy !== null && (
            <p className={`text-[11px] ${outOfRange ? "text-destructive" : "text-muted-foreground"}`}>
              {outOfRange
                ? `${offBy.toFixed(0)} m from the nearest recorded site (±${fence?.accuracy.toFixed(0)} m) — beyond the ${GEOFENCE_RADIUS_M} m limit.`
                : `${offBy.toFixed(0)} m from the nearest recorded site, ±${fence?.accuracy.toFixed(0)} m GPS accuracy.`}
            </p>
          )}

          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Biochar applied to Plot 7" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Carbon credit purpose (optional)</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Application evidence" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={save}
            disabled={saving || !blob || !fix || outOfRange}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save photo
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
