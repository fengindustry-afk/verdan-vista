import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Activity, MapPin } from "lucide-react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { TreeScan } from "@/lib/types";
import { resolveImageUrl, Buckets } from "@/lib/storage";
import { analyzeTreeHealth, healthTone, type HealthResult } from "@/lib/health";
import { toast } from "sonner";

type Props = {
  scan: TreeScan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const storedRef = (s: TreeScan) =>
  s.ImageUrl || (s.ImageBase64 ? `data:image/jpeg;base64,${s.ImageBase64}` : undefined);

/** Edit a scan's notes and run the tree-health analysis on its image. */
export function EditScanDialog({ scan, open, onOpenChange }: Props) {
  const upsert = useUpsert<TreeScan>(Collections.scans);
  const del = useDelete(Collections.scans);
  const [notes, setNotes] = useState(scan.Notes ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(
    scan.HealthStatus
      ? { status: scan.HealthStatus as HealthResult["status"], score: scan.HealthScore ?? 0, note: scan.HealthNote ?? "" }
      : null
  );

  useEffect(() => {
    if (!open) return;
    setNotes(scan.Notes ?? "");
    resolveImageUrl(Buckets.scans, storedRef(scan)).then(setUrl).catch(() => setUrl(null));
  }, [open, scan]);

  const analyze = async () => {
    if (!url) return toast.error("No image available to analyze.");
    setAnalyzing(true);
    try {
      const result = await analyzeTreeHealth(url);
      setHealth(result);
      if (result.status === "Unknown") toast.error(result.note);
      else toast.success(`Assessed: ${result.status}`);
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
          {url && <img src={url} alt="scan" className="w-full rounded-lg max-h-56 object-cover" />}

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
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{health.note}</p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Run the on-image assessment to estimate canopy health. Full ML detection ships in the mobile app.
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
