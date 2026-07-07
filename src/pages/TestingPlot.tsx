import { BentoCard } from "@/components/BentoCard";
import { useTrees, useReadings } from "@/hooks/useCollection";
import { TreePine, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export default function TestingPlot() {
  const { data: trees = [], isLoading } = useTrees();
  const { data: readings = [] } = useReadings();

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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Testing Plot</h1>
        <p className="text-sm text-muted-foreground mt-1">Biochar field trial — tree health &amp; growth readings</p>
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <>
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
                  <Link key={t.id} to={`/testing-plot/${encodeURIComponent(t.id)}`}>
                    <BentoCard delay={i * 0.03} className="h-full cursor-pointer group">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 group-hover:text-primary transition-colors">
                          <TreePine className="h-3.5 w-3.5 text-primary" /> {t.TreeCode}
                        </h3>
                        <Badge variant="outline" className="text-[10px]">{readingsByTree.get(t.id) ?? 0} readings</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t.Species}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{t.PlotName} · {t.CropAge}</p>
                      {t.Treatment && t.Treatment !== "None" && (
                        <p className="text-[11px] text-cyan-400 mt-1">Treatment: {t.Treatment}</p>
                      )}
                    </BentoCard>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {trees.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center">No trees recorded.</p>}
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
