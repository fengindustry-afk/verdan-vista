import { BentoCard } from "@/components/BentoCard";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import { corcMetrics, CUSTODY_STAGES, OPERATIONS_STAGE_COUNT } from "@/lib/feedstock";
import { fmt } from "@/lib/format";
import { Truck, Settings2, Flame, FlaskConical, Warehouse, Sprout, Trees, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { phases, type WorkflowStageDef } from "@/lib/workProcess";
import { WorkProcessStageDialog } from "@/components/WorkProcessStageDialog";

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
  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 -right-20 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflow</h1>
        <p className="text-sm text-muted-foreground mt-1">Custody lifecycle overview & work-process data collection</p>
      </div>

      <Tabs defaultValue="work-process">
        <TabsList>
          <TabsTrigger value="work-process">Work Process</TabsTrigger>
          <TabsTrigger value="custody">Custody</TabsTrigger>
        </TabsList>
        <TabsContent value="work-process" className="space-y-6 pt-2">
          <WorkProcessHub />
        </TabsContent>
        <TabsContent value="custody" className="space-y-6 pt-2">
          <CustodyOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Work Process hub: Phase → Group → Stage forms (mirrors the .NET Workflow tab) ──
function WorkProcessHub() {
  const { data: entries = [], isLoading } = useWorkProcessEntries();
  const [openStage, setOpenStage] = useState<WorkflowStageDef | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const countByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) m[e.StageKey] = (m[e.StageKey] ?? 0) + 1;
    return m;
  }, [entries]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const renderStageCard = (stage: WorkflowStageDef, i: number) => {
    const Icon = stage.Icon;
    const count = countByStage[stage.Key] ?? 0;
    return (
      <button key={stage.Key} onClick={() => setOpenStage(stage)} className="text-left">
        <BentoCard delay={i * 0.04} className="h-full group cursor-pointer">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-2xl font-bold text-foreground">{count}</span>
          </div>
          <p className="text-sm font-semibold text-foreground mt-3 flex items-center gap-1 group-hover:text-primary transition-colors">
            {stage.Title}
            <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{stage.Description}</p>
          <p className="text-[11px] text-primary mt-2">{count} {count === 1 ? "entry" : "entries"} logged</p>
        </BentoCard>
      </button>
    );
  };

  return (
    <>
      {phases().map((phase) => (
        <div key={phase.Name} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{phase.Name} Phase</h2>
          {phase.Groups.map((group, gi) => {
            if (!group.Title) {
              // Ungrouped stages render directly.
              return (
                <div key={`ungrouped-${gi}`} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {group.Stages.map((s, i) => renderStageCard(s, i))}
                </div>
              );
            }
            const key = `${phase.Name}:${group.Title}`;
            const isOpen = expanded[key] ?? false;
            const GroupIcon = group.Icon;
            const totalEntries = group.Stages.reduce((sum, s) => sum + (countByStage[s.Key] ?? 0), 0);
            return (
              <div key={key} className="space-y-3">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [key]: !isOpen }))}
                  className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-card/40 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  {GroupIcon && <GroupIcon className="h-4 w-4 text-primary shrink-0" />}
                  <span className="text-sm font-semibold text-foreground">{group.Title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {group.Stages.length} stages · {totalEntries} entries
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pl-1">
                    {group.Stages.map((s, i) => renderStageCard(s, i))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <WorkProcessStageDialog stage={openStage} open={!!openStage} onOpenChange={(o) => !o && setOpenStage(null)} />
    </>
  );
}

// ── Custody overview: batches per custody stage (the original Workflow content) ──
function CustodyOverview() {
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
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
    </>
  );
}
