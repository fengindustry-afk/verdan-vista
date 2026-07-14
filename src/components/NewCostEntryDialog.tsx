import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, ScanLine, X } from "lucide-react";
import { useUpsert, useCategoryNames } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { CostEntry, CostCategory, Receipt } from "@/lib/types";
import { createCostEntry } from "@/lib/costTracker";
import { compressReceiptImage, preprocessForOcr, formatBytes } from "@/lib/receiptImage";
import { runOcr } from "@/lib/ocr";
import { parseReceipt, computeRetentionUntil } from "@/lib/receipts";
import { uploadImage, Buckets } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { newCostEntrySchema, categoryNameSchema } from "@/lib/validation";
import { toast } from "sonner";

const ADD_NEW = "__add_new__";

/** Receipt captured in-dialog to auto-fill the expense and attach as evidence. */
type ScannedReceipt = {
  compressed: Awaited<ReturnType<typeof compressReceiptImage>>;
  preview: string;
  rawText: string;
  parsed: Partial<Receipt>;
};

export function NewCostEntryDialog() {
  const { user } = useAuth();
  const upsert = useUpsert<CostEntry>(Collections.costEntries, { surfaceErrors: true });
  const upsertCategory = useUpsert<CostCategory>(Collections.costCategories, { surfaceErrors: true });
  const upsertReceipt = useUpsert<Receipt>(Collections.receipts, { surfaceErrors: true });
  const categoryNames = useCategoryNames();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(categoryNames[0]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);

  const addingCategory = category === ADD_NEW;

  const reset = () => {
    setTitle(""); setAmount(""); setNote(""); setCategory(categoryNames[0]); setNewCategoryName("");
    setDate(new Date().toISOString().slice(0, 10));
    setReceipt(null); setScanning(false);
  };

  // Scan a receipt to auto-fill the expense. OCR is best-effort: if it can't read
  // the text the user just keys the fields in, and the image is still attached.
  const onScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const compressed = await compressReceiptImage(file);
      const preview = URL.createObjectURL(compressed.blob);
      let rawText = "";
      let parsed: Partial<Receipt> = {};
      try {
        const ocrImage = await preprocessForOcr(file);
        const { text } = await runOcr(ocrImage);
        rawText = text;
        parsed = parseReceipt(text);
        if (parsed.Merchant) setTitle(parsed.Merchant);
        if (parsed.Total != null) setAmount(String(parsed.Total));
        if (parsed.Date) setDate(parsed.Date);
        toast.success("Receipt scanned — review the auto-filled fields.");
      } catch (err) {
        console.warn("[cost] receipt OCR failed:", err);
        toast.warning("Couldn't read the receipt text — fill the fields in manually.");
      }
      setReceipt({ compressed, preview, rawText, parsed });
    } finally {
      setScanning(false);
    }
  };

  const submit = async () => {
    let resolvedCategory = category;

    if (addingCategory) {
      const parsedName = categoryNameSchema.safeParse(newCategoryName);
      if (!parsedName.success) {
        toast.error(parsedName.error.issues[0]?.message ?? "Enter a category name.");
        return;
      }
      resolvedCategory = parsedName.data;
      if (categoryNames.some((c) => c.toLowerCase() === resolvedCategory.toLowerCase())) {
        toast.error(`"${resolvedCategory}" already exists.`);
        return;
      }
    }

    const parsed = newCostEntrySchema.safeParse({ title, category: resolvedCategory, amount, date, note });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }

    // safeParse success guarantees the full shape at runtime; the cast works
    // around zod resolving `.data` to its input (all-optional) flavor here.
    const entry = createCostEntry(parsed.data as Parameters<typeof createCostEntry>[0], user?.FullName || user?.Email || "User");
    try {
      if (addingCategory) {
        await upsertCategory.mutateAsync({ id: crypto.randomUUID(), Name: resolvedCategory });
      }
      // Persist the scanned receipt first (as the retained evidence) and link it
      // to the expense, so it also appears under the Receipts tab.
      if (receipt) {
        const savedReceipt = await saveScannedReceipt(receipt, resolvedCategory);
        entry.ReceiptId = savedReceipt.id;
      }
      await upsert.mutateAsync(entry);
    } catch {
      // A rejected write (RLS/auth) already surfaced an honest "not saved" toast via
      // useUpsert's onError. Keep the dialog open with the entered data so the user
      // can retry with a save-enabled account rather than believing it was logged.
      return;
    }
    toast.success(`Expense "${title}" logged`);
    setOpen(false);
    reset();
  };

  const saveScannedReceipt = async (r: ScannedReceipt, resolvedCategory: string): Promise<Receipt> => {
    const id = `rcpt_${Date.now().toString(36)}`;
    const ext = r.compressed.mime === "image/webp" ? "webp" : "jpg";
    const stored = await uploadImage(Buckets.receipts, `${id}.${ext}`, r.compressed.blob);
    const capturedAt = new Date().toISOString();
    const doc: Receipt = {
      id,
      Merchant: r.parsed.Merchant ?? title,
      MerchantTin: r.parsed.MerchantTin ?? "",
      ReceiptNo: r.parsed.ReceiptNo ?? "",
      Date: r.parsed.Date ?? date,
      Currency: "MYR",
      Category: resolvedCategory,
      Subtotal: r.parsed.Subtotal ?? null,
      TaxType: r.parsed.TaxType ?? "None",
      TaxRate: r.parsed.TaxRate ?? null,
      TaxAmount: r.parsed.TaxAmount ?? null,
      Total: r.parsed.Total ?? (amount ? Number(amount) : null),
      PaymentMethod: "",
      Notes: note,
      RawText: r.rawText,
      ImageUrl: stored.path ?? "",
      ImageBase64: stored.dataUrl ? stored.dataUrl.split(",")[1] ?? "" : "",
      ImageMime: r.compressed.mime,
      ImageBytes: r.compressed.bytes,
      Status: "confirmed",
      CapturedBy: user?.FullName || user?.Email || "User",
      CapturedAt: capturedAt,
      RetentionUntil: computeRetentionUntil(r.parsed.Date ?? date, capturedAt),
    };
    return upsertReceipt.mutateAsync(doc);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Log Expense
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Expense</DialogTitle>
        </DialogHeader>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onScan} className="hidden" />
        <div className="space-y-4 py-2">
          {receipt ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-2">
              <img src={receipt.preview} alt="receipt" className="h-14 w-14 rounded-md object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">Receipt attached</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {formatBytes(receipt.compressed.bytes)} · auto-filled from scan
                </p>
              </div>
              <button onClick={() => setReceipt(null)} className="p-1.5 hover:bg-background/50 rounded transition-colors" aria-label="Remove receipt">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-60"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ScanLine className="h-4 w-4 text-primary" />}
              {scanning ? "Reading receipt…" : "Scan / upload receipt to auto-fill"}
            </button>
          )}

          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fertilizer restock" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground">
                {categoryNames.map((c) => <option key={c}>{c}</option>)}
                <option value={ADD_NEW}>+ Add new category…</option>
              </select>
              {addingCategory && (
                <Input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Amount (MYR)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Additional context" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={upsert.isPending || scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save expense
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
