import { BentoCard } from "@/components/BentoCard";
import { InfoTip } from "@/components/InfoTip";
import { Leaf, Loader2, Package, Sprout, ShieldCheck, ClipboardCheck, BadgeCheck, CircleDollarSign, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import { corcMetrics, withMeasuredCorcInputs, evidencedStageIndex, CUSTODY_STAGES, FINAL_STAGE, APPLICATION_STAGE, parseLeadingNumber, wpEntriesForBatch } from "@/lib/feedstock";
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

    // Mass + registry figures for the merged pipeline cards. Summed per batch
    // over the same entry fields actualByStage reads (kg everywhere except
    // certified_corc, which is tCO2e at face value — never /1000).
    let producedKg = 0;
    let appliedKg = 0;
    let sinkedKg = 0;
    let certifiedTco2e = 0;
    for (const f of scopedBatches) {
      for (const e of wpEntriesForBatch(f.Title ?? "", wpAll, dispatch)) {
        const v = e.Values ?? {};
        if (e.StageKey === "production_05" || e.StageKey === "production_10") {
          producedKg += parseLeadingNumber(v.final_biochar_amount);
        } else if (e.StageKey === "application") {
          appliedKg += parseLeadingNumber(v.quantity_applied);
        } else if (e.StageKey === "carbon_sink") {
          sinkedKg += parseLeadingNumber(v.quantity);
        } else if (e.StageKey === "certification") {
          certifiedTco2e += parseLeadingNumber(v.certified_corc);
        }
      }
    }
    // In the MRV queue: measured, eligible, sitting at Application or Carbon
    // Sink — sink-confirmed but not yet registry-certified. Sink-Confirmed is
    // a subset of this number, not a separate bucket.
    const preAssess = metrics
      .filter((x) => x.stage === APPLICATION_STAGE || x.stage === FINAL_STAGE)
      .reduce((s, x) => s + x.m.netCorc, 0);

    return {
      netCorc,
      credited,
      eligible,
      biocharProducedT: producedKg / 1000,
      biocharAppliedT: appliedKg / 1000,
      biocharSinkedT: sinkedKg / 1000,
      biocharAvailableT: Math.max(0, (producedKg - sinkedKg) / 1000),
      certifiedTco2e,
      preAssess,
    };
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


  const timeNote =
    view === "Timeline"
      ? ""
      : "These views use measured records only — the workbook model is a single daily row with no timestamps to window by.";

  const chartTitle = `Custody Stage · ${mode}${view === "Timeline" ? "" : ` — ${view}`}`;

  // Full custody-stage chain: feedstock stages (Collection, Delivery,
  // Pre-Processing) and biochar stages (Conversion, Application, Sink,
  // Certification) shown together, in material tonnes.
  const chartPoints = chart ? chart.points : [];

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
          {/* Merged value-chain pipeline: biochar mass side + CORC credit side */}
          <BentoCard className="w-full" delay={0.15}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Value-Chain Pipeline
                <span className="text-[10px] font-normal text-muted-foreground">
                  biochar mass (t) → CORC credits (tCO₂e) · scoped to {feedstockName}
                </span>
              </h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Lane 1 — Biochar side: mass (tonnes) */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Biochar side · mass (t)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: "Available",
                      value: fmt(agg.biocharAvailableT, 2),
                      unit: "t in stock",
                      icon: Package,
                      tip: `Biochar produced via Material Conversion minus what has reached Carbon Sink. Biochar applied to soil stays counted as Available until it is recorded as a durable sink, across the ${feedstockName} batches.`,
                    },
                    {
                      label: "Applied",
                      value: fmt(agg.biocharAppliedT, 2),
                      unit: "t applied",
                      icon: Sprout,
                      tip: `Feedstock tonnes recorded at the Application stage (quantity_applied) for ${feedstockName} batches.`,
                    },
                    {
                      label: "Sinked",
                      value: fmt(agg.biocharSinkedT, 2),
                      unit: "t durably sunk",
                      icon: ShieldCheck,
                      tip: `Feedstock tonnes recorded at the Carbon Sink stage — durably removed. The mass behind the Sink-Confirmed credit figure.`,
                    },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-border/70 bg-card/40 p-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 mb-2">
                        <c.icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="text-lg font-bold text-foreground leading-none">{c.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">{c.label} <InfoTip text={c.tip} /></p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{c.unit}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lane 2 — CORC credit side: tCO₂e */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> CORC credit side · tCO₂e
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      label: "Potential",
                      value: fmt(agg.netCorc, 2),
                      unit: "tCO₂e",
                      icon: Leaf,
                      tip: `Total tCO₂e across the ${feedstockName} batches: gross carbon stored minus the emissions from haulage and pyrolysis.`,
                    },
                    {
                      label: "Pre-assess (MRV)",
                      value: fmt(agg.preAssess, 2),
                      unit: "tCO₂e in MRV queue",
                      icon: ClipboardCheck,
                      tip: `Net CORC from ${feedstockName} batches evidenced at Application or Carbon Sink — measured and eligible, awaiting registry verification. Sink-Confirmed is part of this queue, not a separate bucket.`,
                    },
                    {
                      label: "Certified (Puro)",
                      value: fmt(agg.certifiedTco2e, 2),
                      unit: "tCO₂e registry-issued",
                      icon: BadgeCheck,
                      tip: `The registry's own certified figure from Carbon Certification records (certified_corc), taken at face value, summed across ${feedstockName} batches.`,
                    },
                    {
                      label: "Sold",
                      value: fmt(1000, 2),
                      unit: "tCO₂e placeholder",
                      icon: CircleDollarSign,
                      tip: `Hard-coded at 1000 until a sales ledger is wired up — the placeholder value to be replaced by real offtake / sales records when that data lands.`,
                    },
                    {
                      label: "Available",
                      value: fmt(agg.certifiedTco2e - 1000, 2),
                      unit: "tCO₂e unsold",
                      icon: Layers,
                      tip: `Certified (Puro) minus Sold. Computed as certified_corc − 1000 (Sold is currently a hard-coded placeholder) until a sales ledger is wired up.`,
                    },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-border/70 bg-card/40 p-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 mb-2">
                        <c.icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="text-lg font-bold text-foreground leading-none">{c.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">{c.label} <InfoTip text={c.tip} /></p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{c.unit}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </BentoCard>

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
                  <BarChart data={chartPoints}>
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
        </>
      )}
    </div>
  );
}
