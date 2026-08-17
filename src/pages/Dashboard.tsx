import { BentoCard } from "@/components/BentoCard";
import { InfoTip } from "@/components/InfoTip";
import { Leaf, Zap, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import { corcMetrics, withMeasuredCorcInputs, evidencedStageIndex, CUSTODY_STAGES, FINAL_STAGE } from "@/lib/feedstock";
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
import { CulaExportPanel } from "./CulaAdmin";

const CHART_MODES = ["Actual", "Potential"] as const;
type ChartMode = (typeof CHART_MODES)[number];

/**
 * "Timeline" is the title of this dropdown — the default per-stage view —
 * not one of its options. The options window the data feeding the stage bars:
 * Accumulative = everything since the first record, Yearly/Monthly = records
 * within the latest year / month on record. The X axis is always custody stage.
 */
const VIEW_OPTIONS = ["Accumulative", "Yearly", "Monthly"] as const;
type ViewOption = (typeof VIEW_OPTIONS)[number];
type View = ViewOption | "Timeline";

/**
 * The timestamp range a view option scopes the stage bars to. Accumulative =
 * all records since the first (no window); Yearly/Monthly = the latest year or
 * month that has any record at all, so the bars are never empty for a quiet
 * period. Returns a set of timestamps to keep, or null for "everything".
 */
function timeWindow(
  wpAll: { Timestamp?: string }[],
  view: ViewOption
): Set<string> | null {
  if (view === "Accumulative") return null;
  const stamps = wpAll
    .map((e) => e.Timestamp ?? "")
    .filter((t) => t && !Number.isNaN(new Date(t).getTime()))
    .sort();
  if (!stamps.length) return null;
  const latest = stamps[stamps.length - 1];
  const d = new Date(latest);
  const keep = new Set<string>();
  for (const t of stamps) {
    const dd = new Date(t);
    if (view === "Yearly" && dd.getFullYear() === d.getFullYear()) keep.add(t);
    if (view === "Monthly" && dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth()) keep.add(t);
  }
  return keep;
}

export default function Dashboard() {
  const { data: feedstock = [], isLoading } = useFeedstock();
  const { data: wpAll = [] } = useWorkProcessEntries();

  const [mode, setMode] = useState<ChartMode>("Actual");
  const [view, setView] = useState<View>("Accumulative");
  const [feedstockName, setFeedstockName] = useState(WORKBOOK_FEEDSTOCKS[0].name);

  const wf = workbookFeedstock(feedstockName);
  // The graph's feedstock dropdown drives the cards too: every stat and credit
  // card below is scoped to the selected feedstock's batches, so switching the
  // graph changes the whole dashboard with it.
  const scopedBatches = useMemo(
    () => (wf ? batchesOfFeedstock(wf, feedstock) : feedstock),
    [wf, feedstock]
  );

  const agg = useMemo(() => {
    // A batch counts at the furthest stage a linked record proves, not at the
    // stage its row claims — same rule as the Custody tab and the Chain of
    // Custody on the batch page, so the three agree. Under the old claim-based
    // split, batches marked forward with no form behind them inflated the
    // Sink-Confirmed and In-Submission buckets.
    const dispatch = dispatchIndex(wpAll);
    const metrics = withMeasuredCorcInputs(scopedBatches, wpAll).map((f) => {
      const i = evidencedStageIndex(f.Title ?? "", wpAll, dispatch);
      return { f, m: corcMetrics(f), stage: i >= 0 ? CUSTODY_STAGES[i] : null };
    });
    const netCorc = metrics.reduce((s, x) => s + x.m.netCorc, 0);
    const credited = metrics
      .filter((x) => x.stage === FINAL_STAGE)
      .reduce((s, x) => s + x.m.netCorc, 0);
    const eligible = metrics.filter((x) => x.m.isCorcEligible).length;

    return { netCorc, credited, eligible };
  }, [scopedBatches, wpAll]);

  /**
   * The CORC graph, always in tonnes of feedstock, always with custody stages
   * on the X axis. "Timeline" (the dropdown's title) is the default view:
   * recorded mass at each stage, or the workbook's modelled throughput. The
   * options window the records that feed the stage bars — Accumulative =
   * everything since the first record, Yearly/Monthly = the latest year /
   * month on record. The model itself has no timestamps, so Potential is the
   * same full series in every view.
   */
  const chart = useMemo(() => {
    if (!wf?.basis) return null;
    const batches = batchesOfFeedstock(wf, feedstock);
    if (view === "Timeline") {
      return mode === "Potential"
        ? { points: potentialByStage(wf) ?? [], batchesWithoutRecords: 0 }
        : actualByStage(wf, batches, wpAll) ?? { points: [], batchesWithoutRecords: 0 };
    }
    // Windowed views: keep the custody-stage X axis, feed it only the records
    // inside the window. Potential is the full workbook model — a single daily
    // row with no timestamps to window by — while Actual windows the measured
    // records. batchesWithoutRecords is suppressed here — a batch with no
    // record inside the window is not "unrecorded", it is out of scope.
    if (mode === "Potential") {
      return { points: potentialByStage(wf) ?? [], batchesWithoutRecords: 0 };
    }
    const window = timeWindow(wpAll, view);
    const scoped = window ? wpAll.filter((e) => window.has(e.Timestamp ?? "")) : wpAll;
    const series = actualByStage(wf, batches, scoped) ?? { points: [], batchesWithoutRecords: 0 };
    return { points: series.points, batchesWithoutRecords: 0 };
  }, [mode, view, wf, feedstock, wpAll]);


  const stats = [
    {
      label: "Potential CORC",
      value: fmt(agg.netCorc, 2),
      icon: Leaf,
      tip: `Total tCO₂e across the ${feedstockName} batches: gross carbon stored minus the emissions from haulage and pyrolysis. Not yet issued — see Sink-Confirmed for that. Scoped to the feedstock selected on the CORC graph.`,
    },
    {
      label: "CORC-Eligible",
      value: fmt(agg.eligible),
      icon: Zap,
      tip: `${feedstockName} batches that pass the eligibility rules (measured yield, carbon content and permanence) and can be put forward for issuance.`,
    },
  ];

  const timeNote =
    view === "Timeline"
      ? ""
      : "These views use measured records only — the workbook model is a single daily row with no timestamps to window by.";

  const chartTitle =
    view === "Timeline"
      ? `${mode} Feedstock Tonnes by Custody Stage`
      : view === "Accumulative"
        ? `${mode} Feedstock Tonnes by Custody Stage — Accumulative`
        : `${mode} Feedstock Tonnes by Custody Stage — ${view}`;

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
              <BentoCard key={stat.label} delay={i * 0.08} className="col-span-1 sm:col-span-1 lg:col-span-2">
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {[
              { label: "Sink-Confirmed", value: agg.credited, color: "text-primary", tip: `Potential CORC from ${feedstockName} batches with a Carbon Sink record behind them — durably removed, but still not issued until a registry verifies and certifies it (Carbon Certification stage).` },
            ].map((c, i) => (
              <BentoCard key={c.label} delay={0.2 + i * 0.06}>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">{c.label} <InfoTip text={c.tip} /></p>
                <p className={`text-2xl font-bold mt-2 ${c.color}`}>{fmt(Math.max(0, c.value), 2)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">tCO₂e CORC</p>
              </BentoCard>
            ))}
          </div>

          <div className="grid lg:grid-cols-4 gap-4">
            <BentoCard className="lg:col-span-4" delay={0.3}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {chartTitle}
                  <InfoTip
                    text={
                      mode === "Potential"
                        ? view === "Timeline"
                          ? "The planning model from Value Chain Evaluation.xlsx: the workbook's own daily throughput carried down the chain (delivery ×1, pre-processing ×0.5, conversion ×0.2) — the tonnes of feedstock the model expects at each stage. Nothing here comes from live records."
                          : "The planning model from Value Chain Evaluation.xlsx shown in full — the workbook is a single daily row with no timestamps to window by, so the model's stage bars are the same in every view."
                        : view === "Accumulative"
                          ? `Feedstock tonnes recorded for every ${feedstockName} batch at its furthest recorded stage, from all records since the first one was added — the stage bars cover the whole pipeline to date.${timeNote ? ` ${timeNote}` : ""}`
                          : view === "Yearly" || view === "Monthly"
                            ? `Feedstock tonnes recorded for every ${feedstockName} batch at its furthest recorded stage, from records captured in the latest ${view.toLowerCase().slice(0, -2)} on file.${timeNote ? ` ${timeNote}` : ""}`
                            : `Recorded feedstock mass at each stage — receiving weight, good feedstock, biochar produced, applied and sunk — in tonnes, read against the same chain as Potential. These are flows, not stock: the bars are not meant to sum. Carbon Certification shows the registry's certified figure as-is, in tCO₂e — it records no mass.${chart && chart.batchesWithoutRecords > 0 ? ` ${chart.batchesWithoutRecords} batch(es) of this feedstock have no linked record and appear nowhere below, though they still count in Potential above.` : ""}`
                    }
                  />
                </h3>
                <div className="flex items-center gap-2">
                  {/* "Timeline" is the dropdown's title; the options are the time views. */}
                  <Select value={view} onValueChange={(v) => setView(v as View)}>
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Timeline" /></SelectTrigger>
                    <SelectContent>
                      {VIEW_OPTIONS.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                  config={{ tonnes: { label: "Feedstock (t)", color: "hsl(160, 64%, 40%)" } }}
                  className="h-56 w-full aspect-auto"
                >
                  <BarChart data={chart.points}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit=" t" />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => {
                            const p = item.payload as { corc: number; batches: number };
                            return (
                              <span className="text-foreground">
                                {fmt(Number(value), 2)} t feedstock
                                {p.corc > 0 && ` · ${fmt(p.corc, 2)} tCO₂e`}
                                {p.batches > 0 && ` · ${p.batches} batch${p.batches === 1 ? "" : "es"}`}
                              </span>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey="tonnes" name="Feedstock (t)" fill="var(--color-tonnes)" radius={[4, 4, 0, 0]} />
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

          </div>

          {/* CULA Export sub-page */}
          <div>
            <h2 className="text-xl font-bold text-foreground mb-4">CULA Export</h2>
            <CulaExportPanel />
          </div>
        </>
      )}
    </div>
  );
}
