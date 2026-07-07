import { BentoCard } from "@/components/BentoCard";
import { useFeedstock } from "@/hooks/useCollection";
import { corcMetrics, CUSTODY_STAGES, OPERATIONS_STAGE_COUNT } from "@/lib/feedstock";
import { fmt } from "@/lib/format";
import { Truck, Settings2, Flame, FlaskConical, Warehouse, Sprout, Trees, Loader2 } from "lucide-react";
import { useMemo } from "react";

const STAGE_META: Record<string, { icon: typeof Truck; desc: string }> = {
  "Feedstock Collection": { icon: Truck, desc: "Biomass gathered from source" },
  "Feedstock Pre-Processing": { icon: Settings2, desc: "Drying, sizing and prep" },
  "Material Conversion": { icon: Flame, desc: "Pyrolysis into biochar" },
  "Sampling": { icon: FlaskConical, desc: "Lab QA and measurement" },
  "Storage": { icon: Warehouse, desc: "Cured biochar in storage" },
  "Application": { icon: Sprout, desc: "Field / soil application" },
  "Carbon Sink": { icon: Trees, desc: "Durable removal, credited" },
};

export default function Workflow() {
  const { data: feedstock = [], isLoading } = useFeedstock();

  const stages = useMemo(
    () =>
      CUSTODY_STAGES.map((stage) => {
        const batches = feedstock.filter((f) => f.CurrentStage === stage);
        const corc = batches.reduce((s, f) => s + corcMetrics(f).netCorc, 0);
        return { stage, count: batches.length, corc, phase: CUSTODY_STAGES.indexOf(stage) < OPERATIONS_STAGE_COUNT ? "Operations" : "Storage" };
      }),
    [feedstock]
  );

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 -right-20 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custody Workflow</h1>
        <p className="text-sm text-muted-foreground mt-1">Seven-stage biomass-to-carbon-sink lifecycle</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {(["Operations", "Storage"] as const).map((phase) => (
            <div key={phase} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{phase} Phase</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stages
                  .filter((s) => s.phase === phase)
                  .map((s, i) => {
                    const Icon = STAGE_META[s.stage].icon;
                    return (
                      <BentoCard key={s.stage} delay={i * 0.05}>
                        <div className="flex items-start justify-between">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-2xl font-bold text-foreground">{s.count}</span>
                        </div>
                        <p className="text-sm font-semibold text-foreground mt-3">{s.stage}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{STAGE_META[s.stage].desc}</p>
                        <p className="text-[11px] text-primary mt-2">{fmt(s.corc, 2)} CORC in stage</p>
                      </BentoCard>
                    );
                  })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
