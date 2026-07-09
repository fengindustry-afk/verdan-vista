import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { History, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useHistory } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { formatHistoryTimestamp, type HistoryAction, type HistoryEntry } from "@/lib/history";

type Filter = {
  collection?: (typeof Collections)[keyof typeof Collections];
  documentId?: string;
  documentIds?: string[];
};

const ACTION_META: Record<HistoryAction, { label: string; icon: typeof Plus; tone: string }> = {
  create: { label: "Created", icon: Plus, tone: "text-emerald-400" },
  update: { label: "Edited", icon: Pencil, tone: "text-cyan-400" },
  delete: { label: "Deleted", icon: Trash2, tone: "text-red-400" },
};

/** Read-only timeline of the immutable edit history for a scope. */
function HistoryTimeline({ filter }: { filter: Filter }) {
  const { data: entries = [], isLoading } = useHistory(filter);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
      </div>
    );
  }
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No changes recorded yet.</p>;
  }

  return (
    <div className="space-y-2 max-h-[60vh] overflow-auto py-1">
      {entries.map((e) => (
        <HistoryRow key={e.id} entry={e} />
      ))}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const meta = ACTION_META[entry.Action];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.tone}`} />
          <span className="text-sm font-medium text-foreground truncate">
            {meta.label} <span className="text-muted-foreground font-normal">{entry.Label}</span>
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
          {formatHistoryTimestamp(entry.Timestamp)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
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
  );
}

/** A compact "History" button that opens the immutable change log for a scope. */
export function HistoryButton({
  filter,
  title = "Edit history",
  label = "History",
  trigger,
}: {
  filter: Filter;
  title?: string;
  label?: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 text-muted-foreground px-2 py-1 text-xs font-medium hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <History className="h-3 w-3" /> {label}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> {title}
          </DialogTitle>
        </DialogHeader>
        {/* Only mount (and fetch) when open. */}
        {open && <HistoryTimeline filter={filter} />}
      </DialogContent>
    </Dialog>
  );
}
