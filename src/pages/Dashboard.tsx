import { BentoCard } from "@/components/BentoCard";
import { InfoTip } from "@/components/InfoTip";
import { Leaf, Zap, BarChart3, Activity, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import { corcMetrics, withMeasuredCorcInputs, evidencedStageIndex, CUSTODY_STAGES, FINAL_STAGE, APPLICATION_STAGE, parseAuditLog } from "@/lib/feedstock";
import { dispatchIndex } from "@/lib/workProcess";
import {
  WORKBOOK_FEEDSTOCKS,
  actualByStage,
  batchesOfFeedstock,
  potentialByStage,
  workbookFeedstock,
} from "@/lib/valueChain";
import { fmt } from "@/lib/format";
import { useMemo, useState } from "react";

const CHART_MODES = ["Actual", "Potential"] as const;
type ChartMode = (typeof CHART_MODES)[number];

export default function Dashboard() {
  const { data: feedstock = [], isLoading } = useFeedstock();
  const { data: wpAll = [] } = useWorkProcessEntries();

  const agg = useMemo(() => {
    // A batch counts at the furthest stage a linked record proves, not at the
    // stage its row claims — same rule as the Custody tab and the Chain of
    // Custody on the batch page, so the three agree. Under the old claim-based
    // split, batches marked forward with no form behind them inflated the
    // Sink-Confirmed and In-Submission buckets.
    const dispatch = dispatchIndex(wpAll);
    const metrics = withMeasuredCorcInputs(feedstock, wpAll).map((f) => {
      const i = evidencedStageIndex(f.Title ?? "", wpAll, dispatch);
      return { f, m: corcMetrics(f), stage: i >= 0 ? CUSTODY_STAGES[i] : null };
    });
    const netCorc = metrics.reduce((s, x) => s + x.m.netCorc, 0);
    const credited = metrics
      .filter((x) => x.stage === FINAL_STAGE)
      .reduce((s, x) => s + x.m.netCorc, 0);
    const inSubmission = metrics
      .filter((x) => x.stage === APPLICATION_STAGE)
      .reduce((s, x) => s + x.m.netCorc, 0);
    const pending = netCorc - credited - inSubmission;
    const eligible = metrics.filter((x) => x.m.isCorcEligible).length;
    const verified = feedstock.filter((f) => (f.Status ?? "").toLowerCase() === "verified").length;

    return { netCorc, credited, inSubmission, pending, eligible, verified };
  }, [feedstock, wpAll]);

  const [mode, setMode] = useState<ChartMode>("Actual");
  const [feedstockName, setFeedstockName] = useState(WORKBOOK_FEEDSTOCKS[0].name);

  /**
   * The value-chain view: recorded mass at each custody stage (Actual) or the
   * workbook's modelled throughput (Potential), both carried to CORC through
   * the same factors. Deliberately not the same number as the cards above —
   * those are the Puro lab measurement, this is the planning model.
   */
  const chart = useMemo(() => {
    const wf = workbookFeedstock(feedstockName);
    if (!wf?.basis) return null;
    if (mode === "Potential") return { points: potentialByStage(wf) ?? [], batchesWithoutRecords: 0 };
    return actualByStage(wf, batchesOfFeedstock(wf, feedstock), wpAll);
  }, [mode, feedstockName, feedstock, wpAll]);

  const recentActivity = useMemo(() => {
    const entries = feedstock.flatMap((f) =>
      parseAuditLog(f).map((e) => ({ ...e, batch: f.Title }))
    );
    return entries.slice(-6).reverse();
  }, [feedstock]);

  const stats = [
    {
      label: "Potential CORC",
      value: fmt(agg.netCorc, 2),
      icon: Leaf,
      tip: "Total tCO₂e across every batch, whatever custody stage it's at: gross carbon stored minus the emissions from haulage and pyrolysis. Not yet issued — see Sink-Confirmed for that.",
    },
    {
      label: "Batches Tracked",
      value: fmt(feedstock.length),
      icon: BarChart3,
      tip: "Every feedstock batch on record, whatever custody stage it sits in.",
    },
    {
      label: "CORC-Eligible",
      value: fmt(agg.eligible),
      icon: Zap,
      tip: "Batches that pass the eligibility rules (measured yield, carbon content and permanence) and can be put forward for issuance.",
    },
    {
      label: "Verified Batches",
      value: fmt(agg.verified),
      icon: Activity,
      tip: "Batches marked Verified after lab sampling and document checks.",
    },
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
                  <InfoTip text={stat.tip} />
                </div>
                <p className="text-2xl font-bold text-foreground mt-3">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </BentoCard>
            ))}
          </div>

          {/* CORC credit visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Sink-Confirmed", value: agg.credited, color: "text-primary", tip: "Potential CORC from batches with a Carbon Sink record behind them — durably removed, but still not issued until a registry verifies and certifies it (Carbon Certification stage)." },
              { label: "In Submission (Application)", value: agg.inSubmission, color: "text-cyan-400", tip: "Potential CORC from batches whose furthest linked record is an Application entry, applied to soil and awaiting registry sign-off." },
              { label: "Pending Pipeline", value: agg.pending, color: "text-amber-400", tip: "Everything whose records stop short of Application: collection, pre-processing, conversion, sampling and storage — plus batches with no linked record at all." },
            ].map((c, i) => (
              <BentoCard key={c.label} delay={0.2 + i * 0.06}>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">{c.label} <InfoTip text={c.tip} /></p>
                <p className={`text-2xl font-bold mt-2 ${c.color}`}>{fmt(Math.max(0, c.value), 2)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">tCO₂e CORC</p>
              </BentoCard>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-4">
            <BentoCard className="lg:col-span-3" delay={0.3}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {mode} CORC by Custody Stage
                  <InfoTip
                    text={
                      mode === "Potential"
                        ? "The planning model from Value Chain Evaluation.xlsx: the workbook's own daily throughput carried down the chain (pre-processing ×0.5, conversion ×0.2, biochar→CORC ×2). Flat by design — the same material is worth the same CORC whichever stage you look at it from. Nothing here comes from live records."
                        : `Recorded mass at each stage — receiving weight, good feedstock, biochar produced, quantity stored, applied and sunk — carried to CORC through the same workbook factors, so it can be read against Potential. These are flows, not stock: the bars are not meant to sum. Carbon Certification shows the registry's certified figure as-is.${chart && chart.batchesWithoutRecords > 0 ? ` ${chart.batchesWithoutRecords} batch(es) of this feedstock have no linked record and appear nowhere below, though they still count in Potential CORC above.` : ""}`
                    }
                  />
                </h3>
                <div className="flex items-center gap-2">
                  <Select value={mode} onValueChange={(v) => setMode(v as ChartMode)}>
                    <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHART_MODES.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={feedstockName} onValueChange={setFeedstockName}>
                    {/* Wide enough for the longest option, "Bamboo (no basis)". */}
                    <SelectTrigger className="h-8 w-[165px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORKBOOK_FEEDSTOCKS.map((f) => (
                        <SelectItem key={f.name} value={f.name} className="text-xs">
                          {f.name}{f.basis ? "" : " (no basis)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {chart ? (
                <ChartContainer
                  config={{ corc: { label: "CORC", color: "hsl(160, 64%, 40%)" } }}
                  className="h-56 w-full aspect-auto"
                >
                  <BarChart data={chart.points}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => {
                            const p = item.payload as { batches: number; tonnes: number };
                            return (
                              <span className="text-foreground">
                                {fmt(Number(value), 2)} tCO₂e
                                {p.tonnes > 0 && ` · ${fmt(p.tonnes, 2)} t`}
                                {p.batches > 0 && ` · ${p.batches} batch${p.batches === 1 ? "" : "es"}`}
                              </span>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey="corc" name="CORC" fill="var(--color-corc)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-center gap-1">
                  <p className="text-sm text-muted-foreground">{feedstockName} is not parameterised yet.</p>
                  <p className="text-xs text-muted-foreground/70 max-w-xs">
                    Value Chain Evaluation.xlsx lists it but its basis column is still a placeholder,
                    so there is no chain to project it down.
                  </p>
                </div>
              )}
            </BentoCard>

            <BentoCard className="lg:col-span-2" delay={0.4}>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                Recent Activity
                <InfoTip text="The last six entries from batch audit logs: what changed, on which batch, by whom and when." />
              </h3>
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
