import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Image as ImageIcon, Receipt, Wallet, Inbox, ChevronRight, Loader2, X } from "lucide-react";
import { BentoCard } from "@/components/BentoCard";
import { CaptureReceiptDialog } from "@/components/CaptureReceiptDialog";
import { NewCostEntryDialog } from "@/components/NewCostEntryDialog";
import { readPendingShare, clearPendingShare, toFile, type SharedItem } from "@/lib/shareInbox";
import { formatBytes } from "@/lib/receiptImage";

type Destination = "receipt" | "cost";

/**
 * Landing screen for files shared into Esterra via the OS share sheet (Web Share
 * Target API). The service worker stashes the shared file; this page reads it and
 * lets the user route it to a destination — currently Scan Receipt or Log Expense.
 * Each destination is a controlled instance of the existing capture dialog, driven
 * here with the shared file pre-loaded so the flow is identical to a manual upload.
 */
export default function ShareTarget() {
  const navigate = useNavigate();
  const [item, setItem] = useState<SharedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [dest, setDest] = useState<Destination | null>(null);

  useEffect(() => {
    let active = true;
    readPendingShare()
      .then((r) => active && setItem(r))
      .catch(() => active && setItem(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const file = useMemo(() => (item ? toFile(item) : null), [item]);
  const isPdf = item?.type === "application/pdf";
  const isImage = item?.type?.startsWith("image/") ?? false;

  // Discard the shared file and leave the chooser.
  const discard = async () => {
    await clearPendingShare();
    setItem(null);
    navigate("/", { replace: true });
  };

  // When a destination dialog closes (saved or cancelled), the shared file has
  // been consumed — clear it so a reload doesn't re-offer it, and return home.
  const onDialogOpenChange = (open: boolean) => {
    if (!open) {
      setDest(null);
      void clearPendingShare();
      navigate("/", { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-24">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking for a shared file…
      </div>
    );
  }

  if (!item || !file) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Inbox className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Nothing shared yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Share a receipt image or PDF from another app (like your bank) and choose
          <span className="font-medium text-foreground"> Esterra</span> to send it here.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const destinations: {
    id: Destination;
    show: boolean;
    icon: typeof Receipt;
    title: string;
    desc: string;
  }[] = [
    {
      id: "receipt",
      show: isPdf || isImage,
      icon: Receipt,
      title: "Scan Receipt",
      desc: isPdf
        ? "Attach this PDF as a retained receipt and add its details."
        : "Read the receipt text and file it under Receipts.",
    },
    {
      id: "cost",
      show: isImage,
      icon: Wallet,
      title: "Log Expense",
      desc: "Scan the receipt to auto-fill a new cost-tracker entry.",
    },
  ];

  return (
    <div className="relative mx-auto max-w-lg px-6 py-8 lg:py-12">
      <div className="glow-orb w-64 h-64 -top-32 right-0 animate-pulse-glow" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Where should this file go?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a destination for the shared file.</p>
        </div>
        <button
          onClick={discard}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Discard
        </button>
      </div>

      {/* Shared file summary. */}
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-background/60 shrink-0">
          {isPdf ? <FileText className="h-5 w-5 text-primary" /> : <ImageIcon className="h-5 w-5 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {isPdf ? "PDF" : "Image"} · {formatBytes(item.file.size)}
          </p>
        </div>
      </div>

      {/* Destination cards. */}
      <div className="mt-5 space-y-3">
        {destinations.filter((d) => d.show).map((d) => (
          <button key={d.id} onClick={() => setDest(d.id)} className="block w-full text-left">
            <BentoCard className="flex items-center gap-4 transition-colors hover:border-primary/50">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 shrink-0">
                <d.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">{d.title}</h3>
                <p className="text-xs text-muted-foreground">{d.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </BentoCard>
          </button>
        ))}
      </div>

      {/* Controlled destination dialogs, pre-loaded with the shared file. */}
      <CaptureReceiptDialog
        hideTrigger
        open={dest === "receipt"}
        onOpenChange={onDialogOpenChange}
        initialFile={dest === "receipt" ? file : null}
      />
      <NewCostEntryDialog
        hideTrigger
        open={dest === "cost"}
        onOpenChange={onDialogOpenChange}
        initialFile={dest === "cost" ? file : null}
      />
    </div>
  );
}
