import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Activity, MapPin, ImageOff, Upload } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { TreeScan } from "@/lib/types";
import { resolveImageUrl, Buckets } from "@/lib/storage";
import { reuploadStoredImage } from "@/lib/capture";
import { healthTone, type HealthResult } from "@/lib/health";
import {
  analyzeTreeScan, scanEngineLabel, SCAN_PHASE_LABEL,
  type ScanAnalysisEngine, type ScanPhase,
} from "@/lib/treeScanAI";
import { Progress } from "@/components/ui/progress";
import { ImageLightbox } from "@/components/ImageLightbox";
import { toast } from "sonner";

type Props = {
  scan: TreeScan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const base64Ref = (s: TreeScan) =>
  s.ImageBase64 ? `data:image/jpeg;base64,${s.ImageBase64}` : undefined;
const storedRef = (s: TreeScan) => s.ImageUrl || base64Ref(s);

/** Where the bar starts and how far it may creep while a phase is running. */
const PHASE_RANGE: Record<ScanPhase, [number, number]> = {
  loading: [8, 30],
  preparing: [32, 45],
  analyzing: [48, 92],
  fallback: [92, 97],
};

/** Edit a scan's notes and run the tree-health analysis on its image. */
export function EditScanDialog({ scan, open, onOpenChange }: Props) {
  const upsert = useUpsert<TreeScan>(Collections.scans);
  const del = useDelete(Collections.scans);
  const [notes, setNotes] = useState(scan.Notes ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [triedFallback, setTriedFallback] = useState(false);
  // The image keeps a placeholder until its bytes land — a blank box while a
  // signed URL downloads reads as a missing image, not a slow one.
  const [painted, setPainted] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [phase, setPhase] = useState<ScanPhase | null>(null);
  const [pct, setPct] = useState(0);
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [engine, setEngine] = useState<ScanAnalysisEngine | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(
    scan.HealthStatus
      ? { status: scan.HealthStatus as HealthResult["status"], score: scan.HealthScore ?? 0, note: scan.HealthNote ?? "" }
      : null
  );

  useEffect(() => {
    if (!open) return;
    setNotes(scan.Notes ?? "");
    setTriedFallback(false);
    setPainted(false);
    // Prefer the storage-signed URL; fall back to the inline base64 when a signed
    // URL can't be produced, so the image and health analysis still work.
    resolveImageUrl(Buckets.scans, storedRef(scan))
      .then((u) => setUrl(u ?? base64Ref(scan) ?? null))
      .catch(() => setUrl(base64Ref(scan) ?? null));
  }, [open, scan]);

  // Real progress isn't knowable (the model gives no byte count), so the bar
  // creeps toward the current phase's ceiling. Analysis can take 45s; a bar
  // frozen at one number for that long reads as "hung" rather than "working".
  useEffect(() => {
    if (!phase) return setPct(0);
    const [floor, ceil] = PHASE_RANGE[phase];
    setPct((p) => Math.max(p, floor));
    const t = setInterval(() => setPct((p) => (p < ceil ? p + 1 : p)), 400);
    return () => clearInterval(t);
  }, [phase]);

  // A signed URL can be produced yet still 404 (object missing / not viewable in
  // this environment). Without this the <img> would blank out on the detail view
  // even though the thumbnail (StoredImage) recovers via the same fallback.
  const onImgError = () => {
    const fallback = base64Ref(scan);
    if (!triedFallback && fallback && url !== fallback) {
      setTriedFallback(true);
      setPainted(false);
      setUrl(fallback);
    } else {
      setUrl(null);
    }
  };

  // Re-upload a fresh image for this scan: covers an upload that failed (no
  // image at all) and a stored object that's broken/unreadable. Same compress →
  // upload → hash pipeline as capture, so Sha256 keeps matching the stored bytes.
  const replaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    setReplacing(true);
    try {
      const up = await reuploadStoredImage(Buckets.scans, `${scan.TreeId}/${scan.id}.jpg`, file);
      const saved = await upsert.mutateAsync({
        ...scan,
        ImageUrl: up.path,
        ImageBase64: up.base64,
        Sha256: up.sha256,
      }).catch(() => null);
      if (!saved) return; // useUpsert already toasted why
      // Show the new bytes immediately — the signed-URL cache may still point
      // at the old object under the same key.
      setPainted(false);
      setTriedFallback(false);
      setUrl(URL.createObjectURL(up.blob));
      toast.success("Image replaced");
    } catch (err) {
      toast.error(`Upload failed — ${err instanceof Error ? err.message : "try again"}`);
    } finally {
      setReplacing(false);
    }
  };

  const analyze = async () => {
    if (!url) return toast.error("No image available to analyze.");
    setAnalyzing(true);
    setPhase("loading");
    try {
      const result = await analyzeTreeScan(url, {
        // The inline copy needs no network, so a signed URL that CORS-blocks or
        // times out on a weak link no longer kills the analysis.
        fallbackSrc: base64Ref(scan),
        onProgress: setPhase,
      });
      setHealth(result);
      setEngine(result.engine);
      if (result.status === "Unknown") toast.error(result.note);
      else toast.success(`Assessed: ${result.status} · ${scanEngineLabel(result.engine)}`);
      // Say why the AI was skipped, otherwise an ExG result looks like an AI one.
      if (result.fallbackReason) {
        toast.warning(result.fallbackReason, { duration: 10_000 });
      }
    } finally {
      setAnalyzing(false);
      setPhase(null);
    }
  };

  const save = async () => {
    const doc: TreeScan = {
      ...scan,
      Notes: notes.trim(),
      ...(health
        ? {
            HealthStatus: health.status,
            HealthScore: health.score,
            HealthNote: health.note,
            AnalyzedAt: new Date().toISOString(),
          }
        : {}),
    };
    await upsert.mutateAsync(doc);
    toast.success("Scan updated");
    onOpenChange(false);
  };

  const remove = async () => {
    await del.mutateAsync(scan.id);
    toast.success("Scan deleted");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit scan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <input ref={fileRef} type="file" accept="image/*" onChange={replaceImage} className="hidden" />
          {url ? (
            <div className="relative">
              <img
                src={url}
                alt="scan"
                className={`w-full rounded-lg max-h-56 object-cover cursor-zoom-in min-h-[6rem] ${
                  painted ? "" : "bg-muted animate-pulse"
                }`}
                onClick={() => setZoom(true)}
                onLoad={() => setPainted(true)}
                onError={onImgError}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={replacing}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border disabled:opacity-60"
              >
                {replacing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Replace
              </button>
            </div>
          ) : (
            // The image failed to upload originally (or its stored object is
            // gone) — offer the re-upload path instead of a dead end.
            <button
              onClick={() => fileRef.current?.click()}
              disabled={replacing}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-60"
            >
              {replacing ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ImageOff className="h-6 w-6 text-primary" />}
              {replacing ? "Uploading…" : "No image — tap to re-upload"}
            </button>
          )}
          <ImageLightbox src={url} alt="scan" open={zoom} onClose={() => setZoom(false)} />


          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" /> Tree health
              </span>
              <button
                onClick={analyze}
                disabled={analyzing || !url}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/10 disabled:opacity-60"
              >
                {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                {health ? "Re-analyze" : "Analyze image"}
              </button>
            </div>
            {phase && (
              <div className="space-y-1.5">
                <Progress value={pct} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">{SCAN_PHASE_LABEL[phase]}</p>
              </div>
            )}

            {health ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${healthTone(health.status)}`}>
                    {health.status}
                  </span>
                  <span className="text-xs text-muted-foreground">Vigor {health.score}/100</span>
                  {engine && (
                    <span className="ml-auto text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                      {scanEngineLabel(engine)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{health.note}</p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Run the AI vision assessment of canopy health. Falls back to an on-device
                greenness estimate when offline.
              </p>
            )}
          </div>

          {(scan.Latitude || scan.Timestamp) && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
              {scan.Latitude && <MapPin className="h-3 w-3 text-primary" />}
              {scan.Latitude ? `${scan.Latitude}, ${scan.Longitude} · ` : ""}{scan.Timestamp}
            </p>
          )}

          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations…" className="mt-1" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <button
            onClick={remove}
            disabled={del.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 text-red-400 px-3 py-2 text-sm font-medium hover:bg-red-500/10 disabled:opacity-60"
          >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </button>
          <button
            onClick={save}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
