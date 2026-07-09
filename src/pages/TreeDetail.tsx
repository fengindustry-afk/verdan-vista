import { BentoCard } from "@/components/BentoCard";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, TreePine, Loader2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTrees, useReadings, useScans } from "@/hooks/useCollection";
import { StoredImage } from "@/components/StoredImage";
import { CaptureScanDialog } from "@/components/capture/CaptureScanDialog";
import { EditReadingDialog } from "@/components/capture/EditReadingDialog";
import { EditScanDialog } from "@/components/capture/EditScanDialog";
import { Buckets } from "@/lib/storage";
import { healthTone } from "@/lib/health";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { TreeReading, TreeScan } from "@/lib/types";

export default function TreeDetail() {
  const { id } = useParams();
  const { data: trees = [], isLoading } = useTrees();
  const { data: readings = [] } = useReadings();
  const { data: scans = [] } = useScans();
  const { role } = useAuth();
  const canCapture = hasPermission(role, Permission.AddLocations);
  const canEdit = canCapture;

  const [editingReading, setEditingReading] = useState<TreeReading | null>(null);
  const [addingReading, setAddingReading] = useState(false);
  const [editingScan, setEditingScan] = useState<TreeScan | null>(null);

  const tree = trees.find((t) => t.id === decodeURIComponent(id ?? ""));
  const treeReadings = useMemo(
    () => readings.filter((r) => r.TreeId === tree?.id).sort((a, b) => (a.Date ?? "").localeCompare(b.Date ?? "")),
    [readings, tree]
  );
  const treeScans = useMemo(
    () => scans.filter((s) => s.TreeId === tree?.id).reverse(),
    [scans, tree]
  );
  const chartData = treeReadings
    .filter((r) => r.HeightCm != null)
    .map((r) => ({ date: r.Date, height: r.HeightCm, canopy: r.CanopyCm }));

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!tree) {
    return <div className="p-8"><p className="text-muted-foreground">Tree not found.</p><Link to="/testing-plot" className="text-primary text-sm">← Back</Link></div>;
  }

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <Link to="/testing-plot" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to plot
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><TreePine className="h-6 w-6 text-primary" /> {tree.TreeCode}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tree.Species} · {tree.PlotName}</p>
        </div>
        {canCapture && <CaptureScanDialog treeId={tree.id} />}
      </div>

      <div className="flex flex-wrap gap-2">
        {tree.TreatmentGroup && <Badge variant="outline">{tree.TreatmentGroup}</Badge>}
        {tree.Treatment && tree.Treatment !== "None" && <Badge variant="outline" className="text-cyan-400">Treatment: {tree.Treatment}</Badge>}
        {tree.CropAge && <Badge variant="outline">{tree.CropAge}</Badge>}
      </div>

      {chartData.length > 1 && (
        <BentoCard>
          <h3 className="text-sm font-semibold text-foreground mb-4">Growth (height / canopy, cm)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: "hsl(215,10%,55%)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215,10%,55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(225,15%,8%)", border: "1px solid hsl(225,10%,16%)", borderRadius: 12, color: "hsl(210,20%,92%)", fontSize: 12 }} />
                <Line type="monotone" dataKey="height" stroke="hsl(160,64%,40%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="canopy" stroke="hsl(190,80%,55%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <BentoCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Readings ({treeReadings.length})</h3>
            {canEdit && (
              <button
                onClick={() => setAddingReading(true)}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/10 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-72 overflow-auto">
            {treeReadings.length === 0 && <p className="text-xs text-muted-foreground">No readings recorded.{canEdit && " Tap Add to record one."}</p>}
            {treeReadings.slice().reverse().map((r) => (
              <button
                key={r.id}
                onClick={() => canEdit && setEditingReading(r)}
                disabled={!canEdit}
                className={`w-full flex items-center justify-between text-xs border-b border-border/40 pb-2 text-left ${canEdit ? "hover:text-primary transition-colors cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-muted-foreground">{r.Date}</span>
                <span className="text-foreground">
                  {r.HeightCm != null && `H ${r.HeightCm}cm`}{r.CanopyCm != null && ` · C ${r.CanopyCm}cm`}
                  {r.Spad != null && ` · SPAD ${r.Spad}`}
                </span>
              </button>
            ))}
          </div>
        </BentoCard>

        <BentoCard>
          <h3 className="text-sm font-semibold text-foreground mb-3">Scans ({treeScans.length})</h3>
          {treeScans.length === 0 ? (
            <p className="text-xs text-muted-foreground">No scans yet.{canCapture && " Use Capture Scan above."}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {treeScans.map((s) => (
                <button
                  key={s.id}
                  onClick={() => canEdit && setEditingScan(s)}
                  disabled={!canEdit}
                  className={`space-y-1 text-left ${canEdit ? "cursor-pointer group" : "cursor-default"}`}
                >
                  <div className="relative">
                    <StoredImage bucket={Buckets.scans} stored={s.ImageUrl || (s.ImageBase64 ? `data:image/jpeg;base64,${s.ImageBase64}` : undefined)} alt="scan" className="w-full h-20 object-cover rounded-lg" />
                    {s.HealthStatus && (
                      <span className={`absolute top-1 left-1 rounded-full border bg-background/80 backdrop-blur px-1.5 py-0.5 text-[9px] font-semibold ${healthTone(s.HealthStatus)}`}>
                        {s.HealthStatus}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                    {s.Latitude ? <MapPin className="h-2.5 w-2.5" /> : null}{s.Timestamp?.slice(0, 10)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </BentoCard>
      </div>

      {canEdit && (
        <>
          <EditReadingDialog
            treeId={tree.id}
            open={addingReading}
            onOpenChange={setAddingReading}
          />
          <EditReadingDialog
            key={editingReading?.id ?? "none"}
            treeId={tree.id}
            reading={editingReading ?? undefined}
            open={!!editingReading}
            onOpenChange={(o) => !o && setEditingReading(null)}
          />
          {editingScan && (
            <EditScanDialog
              key={editingScan.id}
              scan={editingScan}
              open={!!editingScan}
              onOpenChange={(o) => !o && setEditingScan(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
