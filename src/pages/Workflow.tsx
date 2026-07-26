import { BentoCard } from "@/components/BentoCard";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import { corcMetrics, withMeasuredCorcInputs, CUSTODY_STAGES, OPERATIONS_STAGE_COUNT } from "@/lib/feedstock";
import { fmt } from "@/lib/format";
import { Truck, Settings2, Flame, FlaskConical, Warehouse, Sprout, Trees, Loader2, ChevronRight, ChevronDown, Search, X, Scale, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  phases, stageByKey, entryTitle, entrySubtitle, formatEntryTimestamp, WORKFLOW_CATALOG,
  type WorkflowStageDef, type WorkProcessEntry,
} from "@/lib/workProcess";
import { massBalance, balanceSummary, isError, NO_BATCH, type BatchBalance } from "@/lib/massBalance";
import { NewBatchDialog } from "@/components/NewBatchDialog";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission, UserRole } from "@/lib/rbac";
import { WorkProcessStageDialog } from "@/components/WorkProcessStageDialog";
import { ManageZonesDialog } from "@/components/ManageZonesDialog";
import { ReadinessBoard } from "@/components/ReadinessBoard";
import { MonthPicker } from "@/components/MonthPicker";
import { InfoTip } from "@/components/InfoTip";

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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "work-process";
  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 -right-20 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflow</h1>
        <p className="text-sm text-muted-foreground mt-1">Custody lifecycle, work-process data collection & production readiness</p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="work-process" className="gap-1.5">
            Work Process
            <InfoTip text="Where field data gets logged. Each card is one work-process stage with its own form; the number is how many entries have been recorded against it." />
          </TabsTrigger>
          <TabsTrigger value="custody" className="gap-1.5">
            Custody
            <InfoTip text="Chain of custody by batch: how many batches sit at each stage from Collection to Carbon Sink, and the CORC tonnage held there." />
          </TabsTrigger>
          <TabsTrigger value="readiness" className="gap-1.5">
            Readiness
            <InfoTip text="The production-readiness checklist. Tracks which operational activities are done, in progress or not started before the site goes live." />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="work-process" className="space-y-6 pt-2">
          <WorkProcessHub />
        </TabsContent>
        <TabsContent value="readiness" className="space-y-6 pt-2">
          <ReadinessBoard />
        </TabsContent>
        <TabsContent value="custody" className="space-y-6 pt-2">
          <CustodyOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Work Process hub: Phase → Group → Stage forms (mirrors the .NET Workflow tab) ──
/**
 * Biochar mass balance per batch. Clicking a flagged batch drops its ID into the
 * search box so the offending entries are one click away.
 */
/** Why a batch is flagged, phrased for whoever has to go fix the record. */
function balanceMessage(r: BatchBalance): string {
  const n = (c: number, one: string) => `${c} ${c === 1 ? one : one + "s"}`;
  switch (r.Status) {
    case "unsourced": return `${fmt(r.Consumed)} kg with no production record`;
    case "over": return `${fmt(-r.Remaining)} kg over (made ${fmt(r.Produced)}, shipped ${fmt(r.Consumed)})`;
    case "incomplete":
      if (r.BatchId === NO_BATCH) return `${n(r.MissingBatchId, "record")} with no batch id`;
      if (r.MissingAmount > 0) return `${n(r.MissingAmount, "record")} missing a weight`;
      return `${n(r.ZeroUnverified, "record")} recorded 0 kg — confirm it's correct`;
    default: return "";
  }
}

function BalanceRow({ r, onOpenBatch }: { r: BatchBalance; onOpenBatch: (q: string) => void }) {
  const err = isError(r.Status);
  // Untraceable rows have no batch id to search on, so they aren't a link.
  const orphan = r.BatchId === NO_BATCH;
  const tone = err
    ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
    : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10";
  const body = (
    <>
      <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${err ? "text-destructive" : "text-amber-500"}`} />
      <span className="text-xs font-medium text-foreground truncate">{r.BatchId}</span>
      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{balanceMessage(r)}</span>
    </>
  );
  const cls = `flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${tone}`;
  return orphan
    ? <div className={cls.replace("hover:bg-amber-500/10", "").replace("hover:bg-destructive/10", "")}>{body}</div>
    : <button onClick={() => onOpenBatch(r.BatchId)} className={cls}>{body}</button>;
}

function MassBalanceCard({ rows, onOpenBatch }: { rows: ReturnType<typeof massBalance>; onOpenBatch: (q: string) => void }) {
  const summary = balanceSummary(rows);
  if (rows.length === 0) return null;
  const errors = rows.filter((r) => isError(r.Status));
  const warnings = rows.filter((r) => r.Status === "incomplete");

  return (
    <BentoCard className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Scale className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Biochar Mass Balance
            <InfoTip text="Checks that biochar shipped or applied never exceeds what was produced, per batch. Errors disqualify a batch from issuance; incomplete rows just need a missing weight or batch ID filled in. Click a flagged row to jump to its entries." />
          </p>
          <p className="text-[11px] text-muted-foreground">
            {fmt(summary.Produced)} kg produced · {fmt(summary.Consumed)} kg applied or sunk · {rows.length} batches
          </p>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {summary.Errors > 0 && (
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
              {summary.Errors} error{summary.Errors === 1 ? "" : "s"}
            </span>
          )}
          {summary.Warnings > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
              {summary.Warnings} incomplete
            </span>
          )}
          {summary.Errors === 0 && summary.Warnings === 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">Balanced</span>
          )}
        </span>
      </div>

      {errors.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-destructive">Errors — disqualifying</p>
          {errors.slice(0, 8).map((r) => <BalanceRow key={r.BatchId} r={r} onOpenBatch={onOpenBatch} />)}
          {errors.length > 8 && (
            <p className="text-[11px] text-muted-foreground">+{errors.length - 8} more with errors</p>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
            Incomplete — fix before audit
          </p>
          {warnings.slice(0, 8).map((r) => <BalanceRow key={r.BatchId} r={r} onOpenBatch={onOpenBatch} />)}
          {warnings.length > 8 && (
            <p className="text-[11px] text-muted-foreground">+{warnings.length - 8} more incomplete</p>
          )}
        </div>
      )}
    </BentoCard>
  );
}

/**
 * The month an entry belongs to, as "yyyy-mm". Prefers the stage's own date
 * field over the capture timestamp, so a row logged today about last November
 * still filters into November.
 */
function entryMonth(e: WorkProcessEntry): string {
  for (const [k, v] of Object.entries(e.Values ?? {})) {
    if (k.endsWith("_date") && /^\d{4}-\d{2}/.test(v ?? "")) return v!;
  }
  return e.Timestamp ?? "";
}

function WorkProcessHub() {
  const { data: entries = [], isLoading } = useWorkProcessEntries();
  const { role } = useAuth();
  const [openStage, setOpenStage] = useState<WorkflowStageDef | null>(null);
  const [openEntry, setOpenEntry] = useState<WorkProcessEntry | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");      // "yyyy-mm" from <input type="month">
  const [stageKey, setStageKey] = useState(""); // "" = every stage
  const filtering = !!(query.trim() || month || stageKey);

  const countByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) m[e.StageKey] = (m[e.StageKey] ?? 0) + 1;
    return m;
  }, [entries]);

  // Text (stage title + any field value), month, and stage filters, all ANDed.
  const results = useMemo(() => {
    if (!filtering) return [];
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (stageKey && e.StageKey !== stageKey) return false;
        if (month && !entryMonth(e).startsWith(month)) return false;
        if (!q) return true;
        if (e.StageTitle?.toLowerCase().includes(q)) return true;
        return Object.values(e.Values ?? {}).some((v) => v?.toLowerCase().includes(q));
      })
      .sort((a, b) => (a.Timestamp < b.Timestamp ? 1 : -1));
  }, [entries, query, month, stageKey, filtering]);

  const balance = useMemo(() => massBalance(entries), [entries]);

  const openResult = (entry: WorkProcessEntry) => {
    const stage = stageByKey(entry.StageKey);
    if (!stage) return;
    setOpenEntry(entry);
    setOpenStage(stage);
  };

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
      {role === UserRole.Admin && (
        <div className="flex justify-end">
          <ManageZonesDialog />
        </div>
      )}
      <MassBalanceCard rows={balance} onOpenBatch={setQuery} />

      {/* Filter every logged work-process entry by text, month and stage. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[16rem] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries by batch ID, value, or stage…"
            className="pl-9"
          />
        </div>
        <MonthPicker value={month} onChange={setMonth} />
        <select
          value={stageKey}
          onChange={(e) => setStageKey(e.target.value)}
          aria-label="Filter by work process"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="">All work processes</option>
          {WORKFLOW_CATALOG.map((s) => (
            <option key={s.Key} value={s.Key}>{s.Title}</option>
          ))}
        </select>
        {filtering && (
          <button
            onClick={() => { setQuery(""); setMonth(""); setStageKey(""); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <InfoTip
          className="ml-auto"
          text="Search across every logged entry by batch ID, stage name or any recorded value. The month and work-process filters narrow it further, and all three apply together."
        />
      </div>

      {filtering ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length} match{results.length === 1 ? "" : "es"}
          </p>
          {results.map((e) => {
            const stage = stageByKey(e.StageKey);
            return (
              <button
                key={e.id}
                onClick={() => openResult(e)}
                className="w-full text-left rounded-xl border border-border/50 bg-card/40 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{entryTitle(e)}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatEntryTimestamp(e.Timestamp)}</span>
                </div>
                <p className="text-[11px] text-primary mt-0.5">{stage?.Title ?? e.StageTitle}</p>
                <p className="text-[11px] text-muted-foreground truncate">{entrySubtitle(e)}</p>
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No entries match these filters.</p>
          )}
        </div>
      ) : (
        phases().map((phase) => (
        <div key={phase.Name} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {phase.Name} Phase
            <InfoTip text={`Work-process stages belonging to the ${phase.Name} phase. Open a card to log a new entry against that stage.`} />
          </h2>
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
        ))
      )}

      <WorkProcessStageDialog
        stage={openStage}
        open={!!openStage}
        initialEntry={openEntry}
        onOpenChange={(o) => {
          if (!o) {
            setOpenStage(null);
            setOpenEntry(null);
          }
        }}
      />
    </>
  );
}

// ── Custody overview: batches per custody stage (the original Workflow content) ──
function CustodyOverview() {
  const { data: rawFeedstock = [], isLoading } = useFeedstock();
  const { data: wpAll = [] } = useWorkProcessEntries();
  // Measured yield/carbon and haulage baked in, so the per-stage CORC totals here
  // match the Dashboard, Reports and each batch's own detail page.
  const feedstock = useMemo(() => withMeasuredCorcInputs(rawFeedstock, wpAll), [rawFeedstock, wpAll]);
  const { role } = useAuth();
  const canAdd = hasPermission(role, Permission.AddFeedstock);
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
      {canAdd && (
        <div className="flex justify-end">
          <NewBatchDialog />
        </div>
      )}
      {(["Operations", "Storage"] as const).map((phase) => (
        <div key={phase} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {phase} Phase
            <InfoTip
              text={phase === "Operations"
                ? "Stages where the biomass is still being handled: collected, prepped, converted and sampled. Click a card to see the batches sitting there."
                : "Stages after conversion: cured biochar in storage, applied to soil, then credited as a durable carbon sink."}
            />
          </h2>
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
