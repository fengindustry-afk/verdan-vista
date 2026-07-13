import { BentoCard } from "@/components/BentoCard";
import { useTrees, useReadings, useSoilSamples } from "@/hooks/useCollection";
import { TreePine, Loader2, Plus, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { EditTreeDialog } from "@/components/capture/EditTreeDialog";
import { EditSoilSampleDialog } from "@/components/capture/EditSoilSampleDialog";
import { TestingPlotSummary } from "@/components/TestingPlotSummary";
import { soilPercentChange } from "@/lib/testingPlotSummary";
import type { SoilSample } from "@/lib/types";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

export default function TestingPlot() {
  const { data: trees = [], isLoading } = useTrees();
  const { data: readings = [] } = useReadings();
  const { data: soilSamples = [] } = useSoilSamples();
  const { role } = useAuth();
  const canEdit = hasPermission(role, Permission.AddLocations);

  const [editingSoil, setEditingSoil] = useState<SoilSample | null>(null);
  const [addingSoil, setAddingSoil] = useState(false);

  const treatmentGroups = useMemo(
    () => Array.from(new Set(trees.map((t) => t.TreatmentGroup?.trim()).filter((g): g is string => !!g))),
    [trees]
  );

  const readingsByTree = useMemo(() => {
    const map = new Map<string, number>();
    readings.forEach((r) => map.set(r.TreeId, (map.get(r.TreeId) ?? 0) + 1));
    return map;
  }, [readings]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof trees>();
    trees.forEach((t) => {
      const g = t.TreatmentGroup || "Ungrouped";
      byGroup.set(g, [...(byGroup.get(g) ?? []), t]);
    });
    return Array.from(byGroup.entries());
  }, [trees]);

  // Average latest height per treatment group (growth comparison)
  const growthData = useMemo(() => {
    return groups.map(([group, groupTrees]) => {
      const ids = new Set(groupTrees.map((t) => t.id));
      const groupReadings = readings.filter((r) => ids.has(r.TreeId) && r.HeightCm);
      const avgHeight =
        groupReadings.length > 0
          ? groupReadings.reduce((s, r) => s + (r.HeightCm ?? 0), 0) / groupReadings.length
          : 0;
      return { group, avgHeight: Math.round(avgHeight) };
    });
  }, [groups, readings]);

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Testing Plot</h1>
          <p className="text-sm text-muted-foreground mt-1">Biochar field trial — tree health &amp; growth readings</p>
        </div>
        {canEdit && <EditTreeDialog />}
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <>
          <TestingPlotSummary trees={trees} readings={readings} soilSamples={soilSamples} />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" /> Soil Analysis
              </h2>
              {canEdit && (
                <button
                  onClick={() => setAddingSoil(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/40 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/10 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add sample
                </button>
              )}
            </div>
            {soilSamples.length === 0 ? (
              <p className="text-xs text-muted-foreground">No soil samples recorded.{canEdit && " Add one to include soil metrics in the summary."}</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {soilSamples.map((s) => {
                  const pct = soilPercentChange(s);
                  return (
                    <BentoCard key={s.id} className="cursor-pointer" >
                      <button
                        onClick={() => canEdit && setEditingSoil(s)}
                        disabled={!canEdit}
                        className={`w-full text-left ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">{s.Parameter}</span>
                          {s.TreatmentGroup && <Badge variant="outline" className="text-[10px]">{s.TreatmentGroup}</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {s.InitialReading ?? "—"} → {s.FinalReading ?? "—"}
                          {pct !== null && (
                            <span className={pct >= 0 ? " text-primary" : " text-destructive"}>
                              {" "}({pct > 0 ? "+" : ""}{fmt(pct, 1)}%)
                            </span>
                          )}
                        </p>
                      </button>
                    </BentoCard>
                  );
                })}
              </div>
            )}
          </div>

          {growthData.some((g) => g.avgHeight > 0) && (
            <BentoCard>
              <h3 className="text-sm font-semibold text-foreground mb-4">Average Height by Treatment Group (cm)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={growthData}>
                    <XAxis dataKey="group" tick={{ fill: "hsl(215, 10%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(215, 10%, 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(225, 15%, 8%)", border: "1px solid hsl(225, 10%, 16%)", borderRadius: "12px", color: "hsl(210, 20%, 92%)", fontSize: 12 }}
                    />
                    <Bar dataKey="avgHeight" fill="hsl(160, 64%, 40%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoCard>
          )}

          {groups.map(([group, groupTrees]) => (
            <div key={group} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group} · {groupTrees.length} trees
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {groupTrees.map((t, i) => (
                  <BentoCard key={t.id} delay={i * 0.03} className="relative h-full cursor-pointer group">
                    {/* Stretched link sits behind the content so tapping the card
                        navigates, while the edit control (above it, not a descendant
                        of the anchor) never leaks its close-click into navigation. */}
                    <Link
                      to={`/testing-plot/${encodeURIComponent(t.id)}`}
                      aria-label={`View ${t.TreeCode}`}
                      className="absolute inset-0 z-0 rounded-[inherit]"
                    />
                    <div className="relative z-10 pointer-events-none">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 group-hover:text-primary transition-colors">
                          <TreePine className="h-3.5 w-3.5 text-primary" /> {t.TreeCode}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{readingsByTree.get(t.id) ?? 0} readings</Badge>
                          {canEdit && (
                            <span className="pointer-events-auto">
                              <EditTreeDialog tree={t} />
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t.Species}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{t.PlotName} · {t.CropAge}</p>
                      {t.Treatment && t.Treatment !== "None" && (
                        <p className="text-[11px] text-cyan-400 mt-1">Treatment: {t.Treatment}</p>
                      )}
                    </div>
                  </BentoCard>
                ))}
              </div>
            </div>
          ))}
          {trees.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center">No trees recorded.</p>}
        </>
      )}

      {canEdit && (
        <>
          <EditSoilSampleDialog
            groups={treatmentGroups}
            open={addingSoil}
            onOpenChange={setAddingSoil}
          />
          <EditSoilSampleDialog
            key={editingSoil?.id ?? "none"}
            sample={editingSoil ?? undefined}
            groups={treatmentGroups}
            open={!!editingSoil}
            onOpenChange={(o) => !o && setEditingSoil(null)}
          />
        </>
      )}
    </div>
  );
}

const Loading = () => (
  <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);
