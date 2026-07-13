import { useState } from "react";
import { Undo2, Loader2, AlertCircle } from "lucide-react";
import { restoreField } from "@/lib/history";
import type { HistoryEntry } from "@/lib/history";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Props = {
  entry: HistoryEntry;
  onRestored?: () => void;
};

/** Button to restore a document to a previous state from history. */
export function HistoryRestoreButton({ entry, onRestored }: Props) {
  const [restoring, setRestoring] = useState(false);
  const hasChanges = entry.Changes.length > 0;
  if (!hasChanges) return null; // Can't restore creates or empty updates

  const restore = async () => {
    setRestoring(true);
    try {
      // Restore the first changed field; if multiple fields changed, restore all.
      const changes = entry.Changes;
      for (const change of changes) {
        await restoreField({
          collection: entry.Collection,
          documentId: entry.DocumentId,
          field: change.Field,
          restoredValue: change.Before,
        });
      }
      toast.success(`Restored ${changes.length} field(s)`);
      onRestored?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  const fieldsText = entry.Changes.length === 1
    ? `${entry.Changes[0].Field}`
    : `${entry.Changes.length} fields`;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          disabled={restoring}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/10 disabled:opacity-60 transition-colors"
        >
          {restoring ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Undo2 className="h-3 w-3" />
          )}
          Restore
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Restore from history?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 pt-2">
            <p>
              This will restore <strong>{fieldsText}</strong> to the values from{" "}
              <strong>{entry.Actor}</strong>'s edit on{" "}
              <strong>{new Date(entry.Timestamp).toLocaleString()}</strong>.
            </p>
            <p className="text-xs">A new history entry will be created to track this restore.</p>
            {entry.Changes.map((change) => (
              <div key={change.Field} className="rounded-lg bg-muted/60 p-2 text-[11px] font-mono">
                <div className="font-semibold text-foreground">{change.Field}</div>
                <div className="text-red-400">← {change.Before || "(empty)"}</div>
                <div className="text-muted-foreground">from current: {change.After || "(empty)"}</div>
              </div>
            ))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3 justify-end pt-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={restore}
            disabled={restoring}
            className="bg-primary hover:bg-primary/90"
          >
            {restoring ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Undo2 className="h-4 w-4 mr-1" />}
            Restore
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
