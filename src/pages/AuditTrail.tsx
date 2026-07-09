import { BentoCard } from "@/components/BentoCard";
import { CheckCircle2, Loader2, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { useFeedstock, useHistory } from "@/hooks/useCollection";
import { parseAuditLog } from "@/lib/feedstock";
import { Collections } from "@/lib/collections";
import { formatHistoryTimestamp, type HistoryAction, type HistoryEntry } from "@/lib/history";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

/** Parse the app's "dd MMM yyyy HH:mm" timestamps for sorting; falls back to 0. */
function ts(raw: string): number {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

export default function AuditTrail() {
  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-80 h-80 top-20 -right-40 animate-pulse-glow" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Immutable history of every change across the platform
        </p>
      </div>

      <Tabs defaultValue="edits">
        <TabsList>
          <TabsTrigger value="edits">Edit History</TabsTrigger>
          <TabsTrigger value="custody">Custody</TabsTrigger>
        </TabsList>
        <TabsContent value="edits" className="pt-2">
          <EditHistoryFeed />
        </TabsContent>
        <TabsContent value="custody" className="pt-2">
          <CustodyFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Custody feed: the original feedstock AuditLog timeline ────────────────────
function CustodyFeed() {
  const { data: feedstock = [], isLoading } = useFeedstock();

  const entries = useMemo(() => {
    const all = feedstock.flatMap((f) =>
      parseAuditLog(f).map((e) => ({ ...e, batch: f.Title, batchId: f.id }))
    );
    return all.sort((a, b) => ts(b.Timestamp) - ts(a.Timestamp));
  }, [feedstock]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="text-xs text-muted-foreground mb-4">{entries.length} custody events across all batches</p>
      <div className="absolute left-[19px] top-8 bottom-0 w-px bg-border/50" />
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
          <p className="text-sm text-muted-foreground py-10 text-center ml-10">No custody events recorded.</p>
        )}
      </div>
    </div>
  );
}

// ── Edit-history feed: the app-wide immutable edit log across all collections ──
const ACTION_META: Record<HistoryAction, { label: string; icon: typeof Plus; tone: string; dot: string }> = {
  create: { label: "Created", icon: Plus, tone: "text-emerald-400", dot: "text-emerald-400" },
  update: { label: "Edited", icon: Pencil, tone: "text-cyan-400", dot: "text-cyan-400" },
  delete: { label: "Deleted", icon: Trash2, tone: "text-red-400", dot: "text-red-400" },
};

/** Friendly names for the document-store table behind each collection. */
const COLLECTION_LABELS: Record<string, string> = {
  [Collections.feedstock]: "Feedstock",
  [Collections.locations]: "Asset location",
  [Collections.photos]: "Geotagged photo",
  [Collections.users]: "User",
  [Collections.trees]: "Tree",
  [Collections.readings]: "Reading",
  [Collections.scans]: "Scan",
  [Collections.labels]: "Label",
  [Collections.costEntries]: "Cost entry",
  [Collections.costBudgets]: "Budget",
  [Collections.costCategories]: "Cost category",
  [Collections.workProcess]: "Work-process entry",
};

function collectionLabel(name: string): string {
  return COLLECTION_LABELS[name] ?? name;
}

function EditHistoryFeed() {
  const { data: entries = [], isLoading } = useHistory();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.Label, e.Actor, e.Role, collectionLabel(e.Collection), ...e.Changes.flatMap((c) => [c.Field, c.Before ?? "", c.After ?? ""])]
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [entries, query]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search changes by record, field, value, or user…"
          className="pl-9 pr-9"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} change{filtered.length === 1 ? "" : "s"} recorded{query.trim() ? ` matching “${query.trim()}”` : ""}
      </p>

      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/50" />
        <div className="space-y-3">
          {filtered.map((entry, i) => (
            <EditHistoryCard key={entry.id} entry={entry} index={i} />
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-10 text-center ml-10">
              {entries.length === 0 ? "No edits recorded yet." : "No changes match your search."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EditHistoryCard({ entry, index }: { entry: HistoryEntry; index: number }) {
  const meta = ACTION_META[entry.Action];
  const Icon = meta.icon;
  return (
    <BentoCard delay={Math.min(index * 0.04, 0.4)} className="relative ml-10">
      <div className={`absolute -left-[29px] top-5 h-3 w-3 rounded-full border-2 border-background bg-current ${meta.dot}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
            <h3 className="text-sm font-semibold text-foreground truncate">
              {meta.label} <span className="text-muted-foreground font-normal">{collectionLabel(entry.Collection)}</span> · {entry.Label}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{entry.Actor}</span>
            <span>·</span>
            <span>{entry.Role}</span>
          </div>
          {entry.Changes.length > 0 && (
            <div className="mt-2 space-y-1">
              {entry.Changes.map((c) => (
                <div key={c.Field} className="text-[11px] flex flex-wrap items-baseline gap-1.5">
                  <span className="text-muted-foreground">{c.Field}:</span>
                  {c.Before != null && <span className="line-through text-red-400/80 break-all">{c.Before}</span>}
                  {c.Before != null && c.After != null && <span className="text-muted-foreground">→</span>}
                  {c.After != null && <span className="text-emerald-400/90 break-all">{c.After}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{formatHistoryTimestamp(entry.Timestamp)}</p>
      </div>
    </BentoCard>
  );
}
