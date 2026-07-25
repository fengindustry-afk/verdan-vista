import { useEffect, useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * App-wide styled confirmation, matching the delete dialog art used in
 * WorkProcessStageDialog. Imperative like sonner's toast: call `confirmDelete(...)`
 * from anywhere and await the boolean. Mount <ConfirmHost /> once at the root.
 */
type ConfirmOptions = {
  title?: string;
  /** Body text. Keep it to what's being deleted and whether it's recoverable. */
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive (red) confirm button. Default true. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let emit: ((p: Pending) => void) | null = null;

/** Opens the styled confirm dialog. Resolves true if confirmed. */
export function confirmDelete(opts: ConfirmOptions): Promise<boolean> {
  if (!emit) return Promise.resolve(window.confirm(String(opts.description))); // host not mounted yet
  return new Promise((resolve) => emit!({ ...opts, resolve }));
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    emit = setPending;
    return () => { emit = null; };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const destructive = pending?.destructive !== false;

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {destructive
              ? <Trash2 className="h-5 w-5 text-destructive" />
              : <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {pending?.title ?? "Delete this item?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2">
            {pending?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-end gap-3 pt-2">
          <AlertDialogCancel>{pending?.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {pending?.confirmLabel ?? "Delete"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
