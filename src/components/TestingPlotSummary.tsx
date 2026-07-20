import { useMemo } from "react";
import { BentoCard } from "@/components/BentoCard";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Tree, TreeReading, SoilSample, PlotApplication } from "@/lib/types";
import {
  summarizeTestingPlot,
  summarizeSoil,
  type ParamResult,
  type SoilResult,
} from "@/lib/testingPlotSummary";
import { fmt, fmtPrice } from "@/lib/format";

/**
 * ESTERRA "Testing Site Summary" — averages each growth/health parameter's
 * percentage change (baseline → latest) across every tree in a treatment group,
 * plus the soil-analysis parameters (initial → final). Mirrors the guarded-
 * average logic of the source spreadsheet.
 */
export function TestingPlotSummary({
  trees,
  readings,
  soilSamples = [],
  applications = [],
}: {
  trees: Tree[];
  readings: TreeReading[];
  soilSamples?: SoilSample[];
  applications?: PlotApplication[];
}) {
  const summaries = useMemo(() => summarizeTestingPlot(trees, readings), [trees, readings]);
  const soil = useMemo(() => summarizeSoil(soilSamples), [soilSamples]);

  // Merge growth + soil by treatment group, preserving growth order first.
  const cards = useMemo(() => {
    const soilByGroup = new Map(soil.map((s) => [s.group, s.results]));
    const merged = summaries.map((g) => ({
      group: g.group,
      treeCount: g.treeCount,
      growth: g.results,
      soil: soilByGroup.get(g.group) ?? [],
    }));
    // Include soil-only groups that have no matching tree group.
    for (const s of soil) {
      if (!merged.some((m) => m.group === s.group)) {
        merged.push({ group: s.group, treeCount: 0, growth: [], soil: s.results });
      }
    }
    return merged;
  }, [summaries, soil]);

  // Plot header + cost, rolled up from the same records the sections show.
  const overview = useMemo(() => {
    const nonBiochar = (g?: string) => /control|kawalan|tanpa|non[- ]?biochar|without/i.test(g ?? "");
    const dates = readings.map((r) => r.Date).filter((d): d is string => !!d).sort();
    const totalCost = applications.reduce(
      (sum, a) => sum + (a.BiocharKg != null && a.UnitPrice != null ? a.BiocharKg * a.UnitPrice : 0), 0);
    return {
      crop: trees.find((t) => t.Species)?.Species ?? "—",
      treated: trees.filter((t) => !nonBiochar(t.TreatmentGroup)).length,
      control: trees.filter((t) => nonBiochar(t.TreatmentGroup)).length,
      period: dates.length ? `${dates[0]} – ${dates[dates.length - 1]}` : "—",
      products: Array.from(new Set(applications.map((a) => a.Product).filter(Boolean))).join(", ") || "—",
      totalBiocharKg: applications.reduce((sum, a) => sum + (a.BiocharKg ?? 0), 0),
      totalCost,
    };
  }, [trees, readings, applications]);

  const hasData = cards.some(
    (c) => c.growth.some((r) => r.percent !== null) || c.soil.some((r) => r.percent !== null)
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ringkasan Tapak Ujian
      </h2>
      <BentoCard>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-xs">
          <InfoRow label="Jenis tanaman" value={overview.crop} />
          <InfoRow label="Bilangan pokok ujian" value={String(overview.treated)} />
          <InfoRow label="Bilangan pokok kawalan" value={String(overview.control)} />
          <InfoRow label="Tempoh ujian" value={overview.period} />
          <InfoRow label="Produk digunakan" value={overview.products} />
          <InfoRow label="Jumlah biochar digunakan" value={`${fmt(overview.totalBiocharKg, 1)} kg`} />
          <InfoRow label="Jumlah kos biochar" value={`RM ${fmtPrice(overview.totalCost)}`} />
        </dl>
      </BentoCard>
      {!hasData && (
        <p className="text-xs text-muted-foreground">Belum ada bacaan berpasangan untuk mengira peratus perubahan.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {cards
          .filter((c) => c.growth.some((r) => r.percent !== null) || c.soil.some((r) => r.percent !== null))
          .map((c, ci) => (
            <BentoCard key={c.group} delay={ci * 0.05}>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">{c.group}</h3>
                <span className="text-[11px] text-muted-foreground">{c.treeCount} pokok</span>
              </div>
              <dl className="space-y-2.5">
                {c.growth.map((r) => (
                  <MetricRow key={String(r.param.key)} label={r.param.label} percent={r.percent} count={r.treeCount} />
                ))}
              </dl>
              {c.soil.some((r) => r.percent !== null) && (
                <>
                  <p className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Analisis Tanah
                  </p>
                  <dl className="space-y-2.5">
                    {c.soil
                      .filter((r) => r.percent !== null)
                      .map((r) => (
                        <MetricRow key={r.parameter} label={r.parameter} percent={r.percent} count={r.sampleCount} />
                      ))}
                  </dl>
                </>
              )}
            </BentoCard>
          ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/30 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}

function MetricRow({ label, percent, count }: { label: string; percent: number | null; count: number }) {
  const measured = percent !== null;
  const positive = measured && percent > 0;
  const negative = measured && percent < 0;

  const Icon = !measured ? Minus : positive ? TrendingUp : negative ? TrendingDown : Minus;
  const tone = !measured
    ? "text-muted-foreground"
    : positive
      ? "text-primary"
      : negative
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`flex items-center gap-1.5 font-semibold tabular-nums ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        {measured ? (
          <>
            {percent > 0 ? "+" : ""}
            {fmt(percent, 1)}%
            <span className="text-[10px] font-normal text-muted-foreground">({count})</span>
          </>
        ) : (
          <span className="font-normal">—</span>
        )}
      </dd>
    </div>
  );
}

// Re-exported for callers that still import the row result types.
export type { ParamResult, SoilResult };
