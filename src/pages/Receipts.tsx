import { useEffect, useMemo, useState } from "react";
import { BentoCard } from "@/components/BentoCard";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ReceiptText, Search, X, Loader2, HardDrive, ShieldCheck, Trash2, FileWarning,
} from "lucide-react";
import { useReceipts, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { Receipt } from "@/lib/types";
import { formatBytes } from "@/lib/receiptImage";
import { retentionYearsLeft, isRetentionExpired } from "@/lib/receipts";
import { resolveImageUrl, Buckets } from "@/lib/storage";
import { fmt } from "@/lib/format";
import { CaptureReceiptDialog } from "@/components/CaptureReceiptDialog";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

export default function Receipts() {
  const { data: receipts = [], isLoading } = useReceipts();
  const { role } = useAuth();
  const canAdd = hasPermission(role, Permission.AddCosts);
  const canDelete = hasPermission(role, Permission.DeleteCosts);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Receipt | null>(null);

  const stats = useMemo(() => {
    const bytes = receipts.reduce((s, r) => s + (r.ImageBytes ?? 0), 0);
    const value = receipts.reduce((s, r) => s + (r.Total ?? 0), 0);
    const needReview = receipts.filter((r) => r.Status === "review").length;
    return {
      count: receipts.length,
      bytes,
      avg: receipts.length ? bytes / receipts.length : 0,
      value,
      needReview,
    };
  }, [receipts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...receipts].sort((a, b) => ((a.Date ?? a.CapturedAt ?? "") < (b.Date ?? b.CapturedAt ?? "") ? 1 : -1));
    if (!q) return rows;
    return rows.filter((r) =>
      [r.Merchant, r.ReceiptNo, r.Category, r.Notes, r.RawText, r.Date]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [receipts, query]);

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paper receipts digitised & retained 7 years for LHDN tax audit
          </p>
        </div>
        {canAdd && <CaptureReceiptDialog />}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BentoCard>
          <div className="flex items-center gap-1.5 mb-1">
            <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Receipts stored</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(stats.count)}</p>
        </BentoCard>
        <BentoCard delay={0.05}>
          <div className="flex items-center gap-1.5 mb-1">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Storage used</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatBytes(stats.bytes)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">avg {formatBytes(stats.avg)}/receipt</p>
        </BentoCard>
        <BentoCard delay={0.1}>
          <p className="text-xs text-muted-foreground mb-1">Total captured value</p>
          <p className="text-2xl font-bold text-foreground">RM {fmt(stats.value, 2)}</p>
        </BentoCard>
        <BentoCard delay={0.15}>
          <p className="text-xs text-muted-foreground mb-1">Needs review</p>
          <p className={`text-2xl font-bold ${stats.needReview > 0 ? "text-amber-400" : "text-foreground"}`}>
            {fmt(stats.needReview)}
          </p>
        </BentoCard>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merchant, no., text…" className="pl-9 pr-9" />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-16">
          <ReceiptText className="h-8 w-8 opacity-40" />
          {query ? "No receipts match your search." : "No receipts yet — scan your first one."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r, i) => {
            const yrs = retentionYearsLeft(r.RetentionUntil);
            const expired = isRetentionExpired(r.RetentionUntil);
            return (
              <button key={r.id} onClick={() => setSelected(r)} className="text-left">
                <BentoCard delay={i * 0.03} className="h-full group cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                      <ReceiptText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground leading-none">RM {fmt(r.Total ?? 0, 2)}</p>
                      {r.TaxType && r.TaxType !== "None" && (
                        <p className="text-[10px] text-muted-foreground mt-1">{r.TaxType} {r.TaxRate ? `${r.TaxRate}%` : ""}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-3 truncate group-hover:text-primary transition-colors">
                    {r.Merchant || "Unknown merchant"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.Date || "No date"}{r.ReceiptNo ? ` · #${r.ReceiptNo}` : ""}{r.Category ? ` · ${r.Category}` : ""}
                  </p>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
                    <Badge variant="outline" className={`text-[10px] border ${expired ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-primary/10 text-primary border-primary/30"}`}>
                      {expired ? "Retention lapsed" : `Keep ${yrs}y`}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{formatBytes(r.ImageBytes ?? 0)}</span>
                  </div>
                </BentoCard>
              </button>
            );
          })}
        </div>
      )}

      <ReceiptDetailDialog
        receipt={selected}
        onClose={() => setSelected(null)}
        canDelete={canDelete}
      />
    </div>
  );
}

function ReceiptDetailDialog({
  receipt,
  onClose,
  canDelete,
}: {
  receipt: Receipt | null;
  onClose: () => void;
  canDelete: boolean;
}) {
  const del = useDelete(Collections.receipts);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let active = true;
    setImgUrl(null);
    setShowRaw(false);
    if (!receipt) return;
    (async () => {
      if (receipt.ImageBase64) {
        const mime = receipt.ImageMime || "image/webp";
        if (active) setImgUrl(`data:${mime};base64,${receipt.ImageBase64}`);
        return;
      }
      const url = await resolveImageUrl(Buckets.receipts, receipt.ImageUrl);
      if (active) setImgUrl(url);
    })();
    return () => { active = false; };
  }, [receipt]);

  if (!receipt) return null;
  const expired = isRetentionExpired(receipt.RetentionUntil);

  const rows: [string, string | undefined][] = [
    ["Merchant", receipt.Merchant],
    ["Tax / SST No.", receipt.MerchantTin],
    ["Receipt No.", receipt.ReceiptNo],
    ["Date", receipt.Date],
    ["Category", receipt.Category],
    ["Payment", receipt.PaymentMethod],
    ["Subtotal", receipt.Subtotal != null ? `RM ${fmt(receipt.Subtotal, 2)}` : undefined],
    ["Tax", receipt.TaxType && receipt.TaxType !== "None"
      ? `${receipt.TaxType} ${receipt.TaxRate ? receipt.TaxRate + "% " : ""}· RM ${fmt(receipt.TaxAmount ?? 0, 2)}`
      : undefined],
    ["Total", receipt.Total != null ? `RM ${fmt(receipt.Total, 2)}` : undefined],
    ["Notes", receipt.Notes],
  ];

  const remove = async () => {
    await del.mutateAsync(receipt.id);
    onClose();
  };

  return (
    <Dialog open={!!receipt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" />
            {receipt.Merchant || "Receipt"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-auto py-1">
          <div className="rounded-lg bg-muted overflow-hidden flex items-center justify-center min-h-[8rem]">
            {imgUrl ? (
              <img src={imgUrl} alt="receipt" className="w-full max-h-72 object-contain" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground my-10" />
            )}
          </div>

          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${expired ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}`}>
            {expired ? <FileWarning className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
            {expired
              ? `Retention period lapsed (kept until ${receipt.RetentionUntil}).`
              : `Retained for LHDN audit until ${receipt.RetentionUntil} · ${retentionYearsLeft(receipt.RetentionUntil)} years left`}
          </div>

          <div className="space-y-1.5">
            {rows.filter(([, v]) => v?.trim?.() || v).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 border-b border-border/30 pb-1.5">
                <span className="text-xs text-muted-foreground shrink-0">{k}</span>
                <span className={`text-sm text-right break-words ${k === "Total" ? "font-bold text-foreground" : "text-foreground"}`}>{v}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Captured by {receipt.CapturedBy || "—"} · {receipt.CapturedAt?.slice(0, 10)} · {formatBytes(receipt.ImageBytes ?? 0)} {receipt.ImageMime?.split("/")[1]?.toUpperCase()}
          </p>

          {receipt.RawText && (
            <div>
              <button onClick={() => setShowRaw((s) => !s)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
                {showRaw ? "Hide" : "Show"} raw OCR text
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 border border-border p-3 text-[11px] whitespace-pre-wrap text-muted-foreground">{receipt.RawText}</pre>
              )}
            </div>
          )}

          {canDelete && (
            <button onClick={remove} disabled={del.isPending} className="inline-flex items-center gap-2 text-xs text-destructive hover:text-destructive/80 disabled:opacity-60">
              {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete receipt
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
