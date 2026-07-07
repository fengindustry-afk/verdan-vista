import { BentoCard } from "@/components/BentoCard";
import { Package, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFeedstock } from "@/hooks/useCollection";
import { corcMetrics, currentStageIndex, CUSTODY_STAGES } from "@/lib/feedstock";
import { badgeForStatus, fmt } from "@/lib/format";
import { Link } from "react-router-dom";
import { NewBatchDialog } from "@/components/NewBatchDialog";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

export default function Feedstock() {
  const { data: feedstock = [], isLoading } = useFeedstock();
  const { role } = useAuth();
  const canAdd = hasPermission(role, Permission.AddFeedstock);

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedstock Batches</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${feedstock.length} batches in the custody chain`}
          </p>
        </div>
        {canAdd && <NewBatchDialog />}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading live data…
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {feedstock.map((f, i) => {
            const m = corcMetrics(f);
            const stageIdx = currentStageIndex(f);
            const progress = ((stageIdx + 1) / CUSTODY_STAGES.length) * 100;
            return (
              <Link key={f.id} to={`/feedstock/${encodeURIComponent(f.id)}`}>
                <BentoCard delay={i * 0.05} className="group cursor-pointer h-full">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant="outline" className={`text-[10px] font-medium border ${badgeForStatus(f.Status)}`}>
                      {f.Status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{f.Type}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                    {f.Title}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">{f.Supplier} · {f.Amount}</p>

                  {/* Custody progress */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{f.CurrentStage ?? CUSTODY_STAGES[0]}</span>
                      <span>{stageIdx + 1}/{CUSTODY_STAGES.length}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <div>
                      <p className="text-lg font-bold text-foreground">{fmt(m.netCorc, 2)}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {m.isCorcEligible ? (
                          <><CheckCircle2 className="h-3 w-3 text-primary" /> {m.durabilityClass}</>
                        ) : (
                          <><AlertTriangle className="h-3 w-3 text-amber-400" /> Not eligible</>
                        )}
                      </p>
                    </div>
                    <div className="h-8 w-8 flex items-center justify-center rounded-full bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </BentoCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
