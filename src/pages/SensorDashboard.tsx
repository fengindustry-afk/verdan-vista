import { BentoCard } from "@/components/BentoCard";
import {
  Factory,
  Leaf,
  Zap,
  Gauge,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Info,
} from "lucide-react";
import {
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Scatter,
  ComposedChart,
} from "recharts";
import { useMemo } from "react";
import { useSensorReadings, useFeedstock } from "@/hooks/useCollection";
import { fmt } from "@/lib/format";
import {
  buildStageGroups,
  sumMetric,
  countAnomalies,
  coveragePct,
  dryBiocharBasis,
  labParamsFromFeedstock,
  estimateCarbonRemoved,
  STAGE_LABELS,
  type MetricSeries,
} from "@/lib/sensorAggregate";

// Project baseline (backlog B2): 150 TPD EFB feedstock → 38 TPD biochar.
const BASELINE_BIOMASS_TPD = 150;
const BASELINE_BIOCHAR_TPD = 38;

const chartTooltip = {
  background: "hsl(225, 15%, 8%)",
  border: "1px solid hsl(225, 10%, 16%)",
  borderRadius: "12px",
  color: "hsl(210, 20%, 92%)",
  fontSize: 12,
};

const axisTick = { fill: "hsl(215, 10%, 55%)", fontSize: 10 };

function timeLabel(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** One metric's time-series, with anomalous points overlaid in red. */
function MetricChart({ series }: { series: MetricSeries }) {
  const data = series.points.map((p) => ({
    t: p.t,
    value: p.value,
    anomaly: p.anomalous ? p.value : null,
  }));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-medium text-foreground">{series.label}</p>
        <p className="text-[11px] text-muted-foreground">
          {series.latest !== undefined ? `${fmt(series.latest, 1)} ${series.unit}` : "—"}
          {series.anomalies > 0 && (
            <span className="ml-2 text-amber-400">⚠ {series.anomalies}</span>
          )}
        </p>
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={timeLabel}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              contentStyle={chartTooltip}
              labelFormatter={(t) => timeLabel(Number(t))}
              formatter={(v: number | null) =>
                v == null ? ["—", ""] : [`${fmt(Number(v), 2)} ${series.unit}`, series.label]
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(160, 64%, 45%)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {/* Anomalous readings surfaced as red markers so they can't hide. */}
            <Scatter dataKey="anomaly" fill="hsl(0, 80%, 60%)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function SensorDashboard() {
  const { data: readings = [], isLoading } = useSensorReadings();
  const { data: feedstock = [] } = useFeedstock();

  const model = useMemo(() => {
    const stageGroups = buildStageGroups(readings);
    const anomalies = countAnomalies(readings);
    const coverage = coveragePct(readings);

    // B2 throughput totals (anomalous readings excluded — see sumMetric).
    const biomassKg = sumMetric(readings, "feedstock_intake_mass_kg");
    const biocharWetKg = sumMetric(readings, "biochar_output_mass_kg");
    const energyConsumed = sumMetric(readings, "energy_consumed_kwh");
    const energyExported = sumMetric(readings, "energy_exported_kwh");

    // Carbon removed — routed through the single corcMetrics adapter.
    const basis = dryBiocharBasis(readings);
    const lab = labParamsFromFeedstock(feedstock);
    const carbon = estimateCarbonRemoved({
      dryBiocharKg: basis.dryKg,
      carbonContentPct: lab.carbonContentPct,
      hCorgRatio: lab.hCorgRatio,
    });

    return {
      stageGroups,
      anomalies,
      coverage,
      biomassT: biomassKg / 1000,
      biocharWetT: biocharWetKg / 1000,
      energyConsumed,
      energyExported,
      basis,
      lab,
      carbon,
    };
  }, [readings, feedstock]);

  const kpis = [
    {
      label: "Biomass processed",
      value: `${fmt(model.biomassT, 1)} t`,
      sub: `Baseline ${BASELINE_BIOMASS_TPD} TPD EFB`,
      icon: Factory,
    },
    {
      label: "Biochar produced (wet)",
      value: `${fmt(model.biocharWetT, 1)} t`,
      sub: `Baseline ${BASELINE_BIOCHAR_TPD} TPD · dry ${fmt(model.basis.dryKg / 1000, 1)} t`,
      icon: Leaf,
    },
    {
      label: "Carbon removed (est.)",
      value: `${fmt(model.carbon.tco2e, 2)} tCO₂e`,
      sub: `${model.carbon.durabilityClass} · PF ${fmt(model.carbon.permanenceFactor, 2)}`,
      icon: Gauge,
    },
    {
      label: "dMRV coverage",
      value: `${fmt(model.coverage, 0)}%`,
      sub: "of monitored parameters reporting",
      icon: Zap,
    },
  ];

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-96 h-96 -top-48 -right-48 animate-pulse-glow" />
      <div className="glow-orb w-64 h-64 top-1/2 -left-32 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <div>
        <h1 className="text-2xl font-bold text-foreground">dMRV Production Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live sensor telemetry — Sarawak Biomass Decarbonization (150 TPD EFB → 38 TPD biochar)
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sensor readings…
        </div>
      ) : readings.length === 0 ? (
        <BentoCard>
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="text-foreground font-medium">No sensor readings yet.</p>
              <p>
                Start the mock stream to populate the <code>sensor_readings</code> store:
              </p>
              <pre className="mt-2 rounded-lg bg-muted/40 p-3 text-xs overflow-x-auto">
                node scripts/mock-sensor-stream.mjs --secret &lt;device-secret&gt; --count 60
              </pre>
            </div>
          </div>
        </BentoCard>
      ) : (
        <>
          {/* B2 — KPI tracker */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, i) => (
              <BentoCard key={kpi.label} delay={i * 0.08}>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <kpi.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-2xl font-bold text-foreground mt-3">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>
              </BentoCard>
            ))}
          </div>

          {/* Anomaly visibility — the priority dMRV attack is inflated data. */}
          {model.anomalies.total > 0 && (
            <BentoCard delay={0.3} className="border border-amber-500/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {model.anomalies.total} reading{model.anomalies.total === 1 ? "" : "s"} flagged — excluded from totals
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span className="text-amber-400">SUSPECT (out of range): {model.anomalies.suspect}</span>
                    <span className="text-cyan-400">CALIBRATION: {model.anomalies.calibration}</span>
                    <span className="flex items-center gap-1 text-destructive">
                      <ShieldAlert className="h-3.5 w-3.5" /> Invalid signature: {model.anomalies.invalidSig}
                    </span>
                  </div>
                </div>
              </div>
            </BentoCard>
          )}

          {/* Carbon-removed derivation — auditable input assumptions (methodology req). */}
          <BentoCard delay={0.35}>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Carbon-removed derivation (traceable)
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
              {[
                ["Dry biochar basis", `${fmt(model.basis.dryKg, 0)} kg (wet ${fmt(model.basis.wetKg, 0)} kg × 1 − ${fmt(model.basis.moisturePct, 1)}%)`],
                ["Corg / H:Corg source", model.lab.source],
                ["Corg (%)", fmt(model.lab.carbonContentPct, 1)],
                ["H/Corg ratio", fmt(model.lab.hCorgRatio, 2)],
                ["Soil temperature Ts", `${fmt(model.carbon.assumptions.soilTempC, 0)} °C (Puro 2025 default)`],
                ["CO₂/C stoichiometry", "44/12"],
                ["Gross removal", `${fmt(model.carbon.grossTco2e, 2)} tCO₂e`],
                ["Permanence factor", `${fmt(model.carbon.permanenceFactor, 2)} (${model.carbon.durabilityClass})`],
                ["Durable removal", `${fmt(model.carbon.tco2e, 2)} tCO₂e`],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              Estimate pending lab confirmation of Corg / H:Corg. Computed via the project CORC engine
              (corcMetrics) — the same figures the CORC Calculator produces.
            </p>
          </BentoCard>

          {/* B1 — Production time-series grouped by Stage and Metric. */}
          {model.stageGroups.map((group, gi) => (
            <BentoCard key={group.stage} delay={0.4 + gi * 0.05}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">{STAGE_LABELS[group.stage]}</h3>
                {group.anomalies > 0 && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> {group.anomalies} flagged
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {group.metrics.map((series) => (
                  <MetricChart key={series.key} series={series} />
                ))}
              </div>
            </BentoCard>
          ))}
        </>
      )}
    </div>
  );
}
