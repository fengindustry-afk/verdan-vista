import { BentoCard } from "@/components/BentoCard";
import { Leaf, Zap, BarChart3, Activity, Loader2 } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import { corcMetrics, withMeasuredCorcInputs, CUSTODY_STAGES, FINAL_STAGE, APPLICATION_STAGE, parseAuditLog } from "@/lib/feedstock";
import { fmt } from "@/lib/format";
import { useMemo } from "react";

export default function Dashboard() {
  const { data: feedstock = [], isLoading } = useFeedstock();
  const { data: wpAll = [] } = useWorkProcessEntries();

  const agg = useMemo(() => {
    const metrics = withMeasuredCorcInputs(feedstock, wpAll).map((f) => ({ f, m: corcMetrics(f) }));
    const netCorc = metrics.reduce((s, x) => s + x.m.netCorc, 0);
    const credited = metrics
      .filter((x) => x.f.CurrentStage === FINAL_STAGE)
      .reduce((s, x) => s + x.m.netCorc, 0);
    const inSubmission = metrics
      .filter((x) => x.f.CurrentStage === APPLICATION_STAGE)
      .reduce((s, x) => s + x.m.netCorc, 0);
    const pending = netCorc - credited - inSubmission;
    const eligible = metrics.filter((x) => x.m.isCorcEligible).length;
    const verified = feedstock.filter((f) => (f.Status ?? "").toLowerCase() === "verified").length;

    // Credits by stage (custody pipeline)
    const stageCounts = CUSTODY_STAGES.map((stage) => ({
      stage: stage.replace("Feedstock ", ""),
      count: feedstock.filter((f) => f.CurrentStage === stage).length,
      corc: metrics.filter((x) => x.f.CurrentStage === stage).reduce((s, x) => s + x.m.netCorc, 0),
    }));

    return { netCorc, credited, inSubmission, pending, eligible, verified, stageCounts };
  }, [feedstock, wpAll]);

  const recentActivity = useMemo(() => {
    const entries = feedstock.flatMap((f) =>
      parseAuditLog(f).map((e) => ({ ...e, batch: f.Title }))
    );
    return entries.slice(-6).reverse();
  }, [feedstock]);

  const stats = [
    { label: "Net CORCs", value: fmt(agg.netCorc, 2), icon: Leaf },
    { label: "Batches Tracked", value: fmt(feedstock.length), icon: BarChart3 },
    { label: "CORC-Eligible", value: fmt(agg.eligible), icon: Zap },
    { label: "Verified Batches", value: fmt(agg.verified), icon: Activity },
  ];

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-96 h-96 -top-48 -right-48 animate-pulse-glow" />
      <div className="glow-orb w-64 h-64 top-1/2 -left-32 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Carbon credit flow &amp; CORC issuance overview</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading live data…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <BentoCard key={stat.label} delay={i * 0.08}>
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground mt-3">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </BentoCard>
            ))}
          </div>

          {/* CORC credit visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Credited (Carbon Sink)", value: agg.credited, color: "text-primary" },
              { label: "In Submission (Application)", value: agg.inSubmission, color: "text-cyan-400" },
              { label: "Pending Pipeline", value: agg.pending, color: "text-amber-400" },
            ].map((c, i) => (
              <BentoCard key={c.label} delay={0.2 + i * 0.06}>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold mt-2 ${c.color}`}>{fmt(Math.max(0, c.value), 2)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">tCO₂e CORC</p>
              </BentoCard>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-4">
            <BentoCard className="lg:col-span-3" delay={0.3}>
              <h3 className="text-sm font-semibold text-foreground mb-4">CORCs by Custody Stage</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={agg.stageCounts}>
                    <defs>
                      <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(160, 64%, 40%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(160, 64%, 40%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="stage" tick={{ fill: "hsl(215, 10%, 55%)", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: "hsl(215, 10%, 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(225, 15%, 8%)",
                        border: "1px solid hsl(225, 10%, 16%)",
                        borderRadius: "12px",
                        color: "hsl(210, 20%, 92%)",
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="corc" name="Net CORC" stroke="hsl(160, 64%, 40%)" fill="url(#emeraldGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </BentoCard>

            <BentoCard className="lg:col-span-2" delay={0.4}>
              <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {recentActivity.length === 0 && (
                  <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                )}
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="mt-1 h-2 w-2 rounded-full shrink-0 bg-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.Action}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.batch} · {item.Actor} · {item.Timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </BentoCard>
          </div>
        </>
      )}
    </div>
  );
}
