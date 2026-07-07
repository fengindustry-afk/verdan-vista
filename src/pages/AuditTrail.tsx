import { BentoCard } from "@/components/BentoCard";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useFeedstock } from "@/hooks/useCollection";
import { parseAuditLog } from "@/lib/feedstock";
import { useMemo } from "react";

/** Parse the app's "dd MMM yyyy HH:mm" timestamps for sorting; falls back to 0. */
function ts(raw: string): number {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

export default function AuditTrail() {
  const { data: feedstock = [], isLoading } = useFeedstock();

  const entries = useMemo(() => {
    const all = feedstock.flatMap((f) =>
      parseAuditLog(f).map((e) => ({ ...e, batch: f.Title, batchId: f.id }))
    );
    return all.sort((a, b) => ts(b.Timestamp) - ts(a.Timestamp));
  }, [feedstock]);

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-80 h-80 top-20 -right-40 animate-pulse-glow" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Immutable custody history · {entries.length} events across all batches
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/50" />
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <BentoCard key={i} delay={Math.min(i * 0.04, 0.4)} className="relative ml-10">
                <div className="absolute -left-[29px] top-5 h-3 w-3 rounded-full border-2 border-background text-primary bg-current" />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground truncate">{entry.Action}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.batch}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>{entry.Actor}</span>
                      <span>·</span>
                      <span>{entry.Role}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{entry.Timestamp}</p>
                </div>
              </BentoCard>
            ))}
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center ml-10">No audit events recorded.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
