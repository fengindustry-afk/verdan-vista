import { BentoCard } from "@/components/BentoCard";
import { useFeedstock } from "@/hooks/useCollection";
import { corcMetrics, CUSTODY_STAGES, OPERATIONS_STAGE_COUNT } from "@/lib/feedstock";
import { fmt } from "@/lib/format";
import { Truck, Settings2, Flame, FlaskConical, Warehouse, Sprout, Trees, Loader2, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

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
  const [openStage, setOpenStage] = useState<string | null>(null);

  const stageBatches = useMemo(
    () => (openStage ? feedstock.filter((f) => f.CurrentStage === openStage) : []),
    [openStage, feedstock]
  );

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
                      <button key={s.stage} onClick={() => s.count > 0 && setOpenStage(s.stage)} className="text-left" disabled={s.count === 0}>
                        <BentoCard delay={i * 0.05} className={`h-full group ${s.count > 0 ? "cursor-pointer" : "opacity-70"}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-2xl font-bold text-foreground">{s.count}</span>
                          </div>
                          <p className="text-sm font-semibold text-foreground mt-3 flex items-center gap-1 group-hover:text-primary transition-colors">
                            {s.stage} {s.count > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{STAGE_META[s.stage].desc}</p>
                          <p className="text-[11px] text-primary mt-2">{fmt(s.corc, 2)} CORC in stage</p>
                        </BentoCard>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Stage drill-down: batches currently in the stage */}
      <Dialog open={!!openStage} onOpenChange={(o) => !o && setOpenStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openStage} · {stageBatches.length} batch{stageBatches.length === 1 ? "" : "es"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-auto">
            {stageBatches.map((f) => {
              const m = corcMetrics(f);
              return (
                <Link
                  key={f.id}
                  to={`/feedstock/${encodeURIComponent(f.id)}`}
                  onClick={() => setOpenStage(null)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{f.Title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{f.Type} · {f.Supplier} · {f.Amount}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-primary">{fmt(m.netCorc, 2)}</p>
                    <p className="text-[10px] text-muted-foreground">CORC</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
