import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Activity, MapPin } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { TreeScan } from "@/lib/types";
import { resolveImageUrl, Buckets } from "@/lib/storage";
import { healthTone, type HealthResult } from "@/lib/health";
import { analyzeTreeScan, scanEngineLabel, type ScanAnalysisEngine } from "@/lib/treeScanAI";
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

/** Edit a scan's notes and run the tree-health analysis on its image. */
export function EditScanDialog({ scan, open, onOpenChange }: Props) {
  const upsert = useUpsert<TreeScan>(Collections.scans);
  const del = useDelete(Collections.scans);
  const [notes, setNotes] = useState(scan.Notes ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [triedFallback, setTriedFallback] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [zoom, setZoom] = useState(false);
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
    // Prefer the storage-signed URL; fall back to the inline base64 when a signed
    // URL can't be produced, so the image and health analysis still work.
    resolveImageUrl(Buckets.scans, storedRef(scan))
      .then((u) => setUrl(u ?? base64Ref(scan) ?? null))
      .catch(() => setUrl(base64Ref(scan) ?? null));
  }, [open, scan]);

  // A signed URL can be produced yet still 404 (object missing / not viewable in
  // this environment). Without this the <img> would blank out on the detail view
  // even though the thumbnail (StoredImage) recovers via the same fallback.
  const onImgError = () => {
    const fallback = base64Ref(scan);
    if (!triedFallback && fallback && url !== fallback) {
      setTriedFallback(true);
      setUrl(fallback);
    } else {
      setUrl(null);
    }
  };

  const analyze = async () => {
    if (!url) return toast.error("No image available to analyze.");
    setAnalyzing(true);
    try {
      const result = await analyzeTreeScan(url);
      setHealth(result);
      setEngine(result.engine);
      if (result.status === "Unknown") toast.error(result.note);
      else toast.success(`Assessed: ${result.status} · ${scanEngineLabel(result.engine)}`);
    } finally {
      setAnalyzing(false);
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
          {url && (
            <img
              src={url}
              alt="scan"
              className="w-full rounded-lg max-h-56 object-cover cursor-zoom-in"
              onClick={() => setZoom(true)}
              onError={onImgError}
            />
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
