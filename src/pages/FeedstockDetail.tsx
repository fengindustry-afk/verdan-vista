import { BentoCard } from "@/components/BentoCard";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import {
  corcMetrics,
  currentStageIndex,
  CUSTODY_STAGES,
  parseAuditLog,
  parseCustodyLog,
  phaseOf,
  wpEntriesForBatch,
} from "@/lib/feedstock";
import { entrySubtitle, formatEntryTimestamp } from "@/lib/workProcess";
import { badgeForStatus, fmt } from "@/lib/format";
import { BatchActions } from "@/components/BatchActions";

export default function FeedstockDetail() {
  const { id } = useParams();
  const { data: feedstock = [], isLoading } = useFeedstock();
  const { data: wpAll = [] } = useWorkProcessEntries();
  const f = feedstock.find((x) => x.id === decodeURIComponent(id ?? ""));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!f) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Batch not found.</p>
        <Link to="/feedstock" className="text-primary text-sm">← Back to batches</Link>
      </div>
    );
  }

  const wpEntries = wpEntriesForBatch(f.Title ?? "", wpAll);
  const m = corcMetrics(f, wpEntries);
  const stageIdx = currentStageIndex(f);
  const audit = parseAuditLog(f);
  const custody = parseCustodyLog(f);

  const corcRows = [
    { label: "Effective biochar yield", value: `${fmt(m.effectiveYieldKg, 0)} kg` },
    { label: "Carbon content", value: `${fmt(m.effectiveCarbonPct, 0)} %` },
    { label: "H/C₍org₎ ratio", value: fmt(m.effectiveHCorg, 2) },
    { label: "Durability class", value: m.durabilityClass },
    { label: "Permanence factor", value: `× ${fmt(m.permanenceFactor * 100, 0)}%` },
    { label: "Gross removal", value: `${fmt(m.grossRemovalTco2e, 2)} tCO₂e` },
    { label: "Durable removal", value: `${fmt(m.durableRemovalTco2e, 2)} tCO₂e` },
    { label: "LCA emissions", value: `− ${fmt(m.effectiveLca, 2)} tCO₂e` },
  ];

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />

      <Link to="/feedstock" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to batches
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">{f.Title}</h1>
        <Badge variant="outline" className={`text-[10px] border ${badgeForStatus(f.Status)}`}>{f.Status}</Badge>
        {f.IsWaste && <Badge variant="outline" className="text-[10px]">Waste byproduct</Badge>}
      </div>
      <p className="text-sm text-muted-foreground -mt-3">{f.Type} · {f.Supplier} · {f.Amount} · {f.Date}</p>

      <BatchActions batch={f} />


      <div className="grid lg:grid-cols-5 gap-4">
        {/* Custody chain */}
        <BentoCard className="lg:col-span-3">
          <h3 className="text-sm font-semibold text-foreground mb-4">Chain of Custody</h3>
          <ol className="space-y-1">
            {CUSTODY_STAGES.map((stage, i) => {
              const done = i <= stageIdx;
              const leg = custody[stage];
              return (
                <li key={stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                    )}
                    {i < CUSTODY_STAGES.length - 1 && (
                      <div className={`w-px flex-1 my-1 ${i < stageIdx ? "bg-primary" : "bg-border"}`} style={{ minHeight: 24 }} />
                    )}
                  </div>
                  <div className="pb-3">
                    <p className={`text-sm ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {stage}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{phaseOf(stage)}</span>
                    </p>
                    {leg && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {leg.Location} · {leg.Date} · {leg.Coords}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </BentoCard>

        {/* CORC breakdown */}
        <div className="lg:col-span-2 space-y-4">
          <BentoCard>
            <p className="text-xs text-muted-foreground">Net CORC issued</p>
            <p className="text-3xl font-bold text-primary mt-1">{fmt(m.netCorc, 2)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {m.isCorcEligible ? "CORC-eligible" : "Not eligible — review sourcing / durability"}
            </p>
          </BentoCard>
          <BentoCard>
            <h3 className="text-sm font-semibold text-foreground mb-3">CORC Breakdown</h3>
            <dl className="space-y-2">
              {corcRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="text-foreground font-medium">{r.value}</dd>
                </div>
              ))}
            </dl>
          </BentoCard>
        </div>
      </div>

      {/* Work-process entries sharing this batch ID */}
      <BentoCard>
        <h3 className="text-sm font-semibold text-foreground mb-4">Work Process Entries</h3>
        {wpEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No work-process entries reference this batch ID.
          </p>
        ) : (
          <div className="space-y-3">
            {wpEntries.map((e) => (
              <Link
                key={e.id}
                to="/workflow?tab=work-process"
                className="flex items-start gap-3 group"
              >
                <div className="mt-1 h-2 w-2 rounded-full shrink-0 bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground group-hover:text-primary">
                    {e.StageTitle}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {formatEntryTimestamp(e.Timestamp)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{entrySubtitle(e)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </BentoCard>

      {/* Audit log */}
      <BentoCard>
        <h3 className="text-sm font-semibold text-foreground mb-4">Audit Trail</h3>
        <div className="space-y-3">
          {audit.length === 0 && <p className="text-xs text-muted-foreground">No audit entries.</p>}
          {audit.map((e, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-1 h-2 w-2 rounded-full shrink-0 bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{e.Action}</p>
                <p className="text-xs text-muted-foreground">{e.Actor} · {e.Role} · {e.Timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </BentoCard>
    </div>
  );
}
