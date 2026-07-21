import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, ScanText, Plus, ChevronDown, FileText, X, Image as ImageIcon } from "lucide-react";
import { useUpsert, useCategoryNames } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { Receipt, ReceiptLineItem } from "@/lib/types";
import { compressReceiptImage, formatBytes } from "@/lib/receiptImage";
import { scanReceipt, engineLabel, type ScanEngine } from "@/lib/extractReceipt";
import { renderPdfFirstPage } from "@/lib/pdf";
import { computeRetentionUntil } from "@/lib/receipts";
import { uploadImage, Buckets } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { readCaptureTime, type CaptureTime } from "@/lib/exif";
import { hashStoredImage } from "@/lib/hash";
import { toast } from "sonner";

type Step = "capture" | "processing" | "review";

const emptyForm = {
  Merchant: "", MerchantTin: "", ReceiptNo: "", Date: "", Category: "",
  Subtotal: "", TaxType: "None", TaxRate: "", TaxAmount: "", Total: "",
  PaymentMethod: "", Notes: "",
};
type Form = typeof emptyForm;

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tax labels offered by default. GST is intentionally absent — Malaysia
 * abolished it in 2018 — but any label the scan reads is still preserved. */
const TAX_TYPES = ["None", "SST"];

/** Money fields whose edits trigger a recompute. */
const MONEY_KEYS: ReadonlyArray<keyof Form> = ["Subtotal", "TaxRate", "TaxAmount", "TaxType", "Total"];

/**
 * Keep subtotal / tax / total consistent as the user types. Total is derived
 * (subtotal + tax) so entering a subtotal fills the total, and a tax rate or
 * amount flows through. Tax rate and amount are two views of the same thing:
 * editing the rate (%) computes the amount, editing the amount back-computes
 * the rate. Editing Total directly is treated as a manual override.
 */
function recalcMoney(f: Form, changed: keyof Form): Form {
  const sub = num(f.Subtotal);
  const rate = num(f.TaxRate);
  const amt = num(f.TaxAmount);
  const taxed = f.TaxType !== "" && f.TaxType !== "None";
  const next = { ...f };

  if (!taxed) {
    // No tax regime selected: clear tax fields, total equals subtotal.
    next.TaxRate = "";
    next.TaxAmount = "";
    if (sub != null) next.Total = String(round2(sub));
    return next;
  }

  if (changed === "TaxAmount") {
    if (sub != null && amt != null) {
      next.Total = String(round2(sub + amt));
      if (sub > 0) next.TaxRate = String(round2((amt / sub) * 100));
    }
    return next;
  }

  // Subtotal / TaxRate / TaxType changed → prefer deriving the amount from the
  // rate; otherwise fall back to any known amount, else just the subtotal.
  if (sub != null && rate != null) {
    const ta = round2((sub * rate) / 100);
    next.TaxAmount = String(ta);
    next.Total = String(round2(sub + ta));
  } else if (sub != null && amt != null) {
    next.Total = String(round2(sub + amt));
  } else if (sub != null) {
    next.Total = String(round2(sub));
  }
  return next;
}

/**
 * Scan/attach a receipt. Renders as a self-triggering button by default, but can
 * also be driven externally (controlled `open` + a pre-loaded `initialFile`) so
 * the Share Target chooser can route a shared image/PDF straight into this flow.
 */
export function CaptureReceiptDialog({
  open: controlledOpen,
  onOpenChange,
  initialFile,
  hideTrigger = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialFile?: File | null;
  hideTrigger?: boolean;
} = {}) {
  const { user } = useAuth();
  const upsert = useUpsert<Receipt>(Collections.receipts, { surfaceErrors: true });
  const categoryNames = useCategoryNames();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (o: boolean) => {
    if (isControlled) onOpenChange?.(o);
    else setInternalOpen(o);
  };
  const [step, setStep] = useState<Step>("capture");
  const [preview, setPreview] = useState("");
  const [compressed, setCompressed] = useState<Awaited<ReturnType<typeof compressReceiptImage>> | null>(null);
  const [pdfFile, setPdfFile] = useState<{ blob: Blob; bytes: number } | null>(null);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrEngine, setOcrEngine] = useState<ScanEngine | null>(null);
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [lineItems, setLineItems] = useState<ReceiptLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [captured, setCaptured] = useState<CaptureTime | null>(null);

  const reset = () => {
    setStep("capture"); setPreview(""); setCompressed(null); setPdfFile(null); setOcrPct(0);
    setOcrEngine(null); setRawText(""); setShowRaw(false); setForm(emptyForm); setLineItems([]); setSaving(false); setCaptured(null);
  };

  const set = (k: keyof Form, v: string) =>
    setForm((f) => {
      const nf = { ...f, [k]: v };
      // Recompute derived money fields, but never fight a manual Total edit.
      if (MONEY_KEYS.includes(k) && k !== "Total") return recalcMoney(nf, k);
      return nf;
    });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file);
  };

  // Run the vision-LLM/OCR pipeline on an image and populate the review form.
  // `scanSource` is the best image to read (the original photo, or a PDF page
  // rasterised to an image) — never the lossy archival WebP.
  const scanAndFill = async (scanSource: Blob) => {
    const { fields: parsed, rawText: text, engine } = await scanReceipt(scanSource, setOcrPct);
    setOcrEngine(engine);
    setRawText(text);
    setLineItems(parsed.LineItems ?? []);
    setForm((f) => {
      const filled: Form = {
        ...f,
        Merchant: parsed.Merchant ?? "",
        MerchantTin: parsed.MerchantTin ?? "",
        ReceiptNo: parsed.ReceiptNo ?? "",
        Date: parsed.Date ?? "",
        // Only adopt an AI category suggestion when it matches an existing one.
        Category: parsed.Category && categoryNames.includes(parsed.Category) ? parsed.Category : f.Category,
        Subtotal: parsed.Subtotal != null ? String(parsed.Subtotal) : "",
        TaxType: parsed.TaxType ?? "None",
        TaxRate: parsed.TaxRate != null ? String(parsed.TaxRate) : "",
        TaxAmount: parsed.TaxAmount != null ? String(parsed.TaxAmount) : "",
        Total: parsed.Total != null ? String(parsed.Total) : "",
        PaymentMethod: parsed.PaymentMethod ?? f.PaymentMethod,
      };
      // If the receipt didn't print a total, derive it from subtotal + tax
      // so the amount box isn't left blank.
      return filled.Total ? filled : recalcMoney(filled, "Subtotal");
    });
  };

  const processImageFile = async (file: File) => {
    setStep("processing");
    setOcrPct(0);
    try {
      // Before compressing — the canvas re-encode in compressReceiptImage drops
      // EXIF, so the photo's own date has to be read off the original file.
      setCaptured(await readCaptureTime(file));
      const c = await compressReceiptImage(file);
      setCompressed(c);
      setPreview(URL.createObjectURL(c.blob));

      // Reading is best-effort: if every engine (AI extraction, OCR service,
      // in-browser Tesseract) is unavailable, the user can still fill the form
      // manually and keep the (already-retained) image. Scan from the *original*
      // file — not the lossy archival WebP — for materially better accuracy.
      try {
        await scanAndFill(file);
      } catch (err) {
        console.warn("[receipts] scan failed:", err);
        toast.warning("Couldn't read the text automatically — fill the fields in manually.");
      }
    } finally {
      setStep("review");
    }
  };

  const onPdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    attachPdf(file);
  };

  const attachPdf = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please choose a PDF file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("PDF must be under 50 MB.");
      return;
    }
    setPdfFile({ blob: file, bytes: file.size });
    // A PDF e-receipt / supplier invoice can be auto-read too: rasterise its
    // first page to an image and run the same extraction pipeline. Best-effort —
    // if the render or scan fails, the PDF is still attached and the user can
    // fill the fields in by hand.
    setStep("processing");
    setOcrPct(0);
    try {
      const pageImage = await renderPdfFirstPage(file);
      await scanAndFill(pageImage);
    } catch (err) {
      console.warn("[receipts] pdf scan failed:", err);
    } finally {
      setStep("review");
    }
  };

  // When opened with a pre-loaded file (Share Target flow), run it through the
  // same path a manual pick would take. Guarded so each shared file processes once.
  const processedFile = useRef<File | null>(null);
  useEffect(() => {
    if (open && initialFile && initialFile !== processedFile.current) {
      processedFile.current = initialFile;
      if (initialFile.type === "application/pdf") attachPdf(initialFile);
      else processImageFile(initialFile);
    }
    if (!open) processedFile.current = null;
  }, [open, initialFile]);

  const save = async () => {
    // Allow saving a PDF-only receipt (no photographed image).
    if (!compressed && !pdfFile) return;
    setSaving(true);
    try {
      const id = `rcpt_${crypto.randomUUID()}`;
      const stored = compressed
        ? await uploadImage(Buckets.receipts, `${id}.${compressed.mime === "image/webp" ? "webp" : "jpg"}`, compressed.blob, { keepDataUrl: true })
        : { path: "", dataUrl: "" };

      // Upload PDF if provided.
      let pdfStored: { path?: string; dataUrl?: string } = {};
      if (pdfFile) {
        pdfStored = await uploadImage(Buckets.receipts, `${id}.pdf`, pdfFile.blob, { keepDataUrl: true });
      }

      // Dated to when the receipt was photographed, not when it reached us: a
      // receipt shot on site and uploaded days later keeps its real date.
      const capturedAt = captured
        ? new Date(captured.at.replace(" ", "T")).toISOString()
        : new Date().toISOString();
      const doc: Receipt = {
        id,
        Merchant: form.Merchant.trim(),
        MerchantTin: form.MerchantTin.trim(),
        ReceiptNo: form.ReceiptNo.trim(),
        Date: form.Date,
        Currency: "MYR",
        Category: form.Category.trim(),
        LineItems: lineItems.length ? lineItems : undefined,
        Subtotal: num(form.Subtotal),
        TaxType: form.TaxType,
        TaxRate: num(form.TaxRate),
        TaxAmount: num(form.TaxAmount),
        Total: num(form.Total),
        PaymentMethod: form.PaymentMethod.trim(),
        Notes: form.Notes.trim(),
        RawText: rawText,
        ImageUrl: stored.path ?? "",
        ImageBase64: stored.dataUrl ? stored.dataUrl.split(",")[1] ?? "" : "",
        ImageMime: compressed?.mime ?? "",
        ImageBytes: compressed?.bytes ?? 0,
        PdfUrl: pdfStored.path ?? "",
        PdfBase64: pdfStored.dataUrl ? pdfStored.dataUrl.split(",")[1] ?? "" : "",
        PdfBytes: pdfFile?.bytes,
        Status: "confirmed",
        CapturedBy: user?.FullName || user?.Email || "User",
        CapturedAt: capturedAt,
        CapturedAtSource: captured?.source ?? "upload",
        Sha256: compressed ? await hashStoredImage(compressed.blob) : undefined,
        RetentionUntil: computeRetentionUntil(form.Date, capturedAt),
      };
      await upsert.mutateAsync(doc);
      toast.success("Receipt saved & retained");
      setOpen(false);
      reset();
    } catch {
      // An RLS/auth rejection already surfaced an honest toast via useUpsert's
      // onError. Keep the dialog open with the entered data so the user can sign
      // in with a save-enabled account and retry, rather than losing their work.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Camera className="h-4 w-4" /> Scan Receipt
          </button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan Receipt</DialogTitle>
        </DialogHeader>

        {/* Two inputs: one forces the camera (capture), one is a plain file
            picker for choosing an existing image from the gallery / disk. */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        <input ref={galleryRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        <input ref={pdfRef} type="file" accept=".pdf" onChange={onPdfFile} className="hidden" />

        {step === "capture" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <Camera className="h-7 w-7 text-primary" /> Take photo
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                className="inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <ImageIcon className="h-7 w-7 text-primary" /> Choose from gallery
              </button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Fields auto-filled by AI · falls back to on-device OCR offline
            </p>
            <button
              onClick={() => pdfRef.current?.click()}
              className="w-full inline-flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              <FileText className="h-6 w-6 text-primary" />
              Or attach a PDF (optional)
              <span className="text-[11px]">Up to 50 MB</span>
            </button>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <ScanText className="h-7 w-7 text-primary animate-pulse" />
            {ocrPct > 0 ? `Reading text… ${ocrPct}%` : "Compressing image…"}
            <div className="h-1.5 w-48 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(8, ocrPct)}%` }} />
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 max-h-[65vh] overflow-auto py-1">
            {preview && (
              <div className="relative">
                <img src={preview} alt="receipt" className="w-full rounded-lg max-h-52 object-contain bg-muted" />
                <div className="absolute bottom-2 right-2 flex gap-2">
                  {ocrEngine && (
                    <span
                      className="rounded-lg bg-background/80 backdrop-blur px-2 py-1 text-[10px] border border-border text-muted-foreground"
                      title={
                        ocrEngine === "gemini" || ocrEngine === "groq"
                          ? "Fields extracted by the AI vision model — review before saving"
                          : ocrEngine === "remote"
                            ? "Read by the OCR service"
                            : "AI/OCR service unavailable — read on-device with Tesseract"
                      }
                    >
                      {engineLabel(ocrEngine)}
                    </span>
                  )}
                  {compressed && (
                    <span className="rounded-lg bg-background/80 backdrop-blur px-2 py-1 text-[10px] border border-border text-muted-foreground">
                      {formatBytes(compressed.bytes)} · {compressed.mime.split("/")[1].toUpperCase()}
                    </span>
                  )}
                  <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border">Retake</button>
                </div>
              </div>
            )}

            {pdfFile && (
              <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/30 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">PDF attached</p>
                    <p className="text-[11px] text-muted-foreground">{formatBytes(pdfFile.bytes)}</p>
                  </div>
                </div>
                <button onClick={() => setPdfFile(null)} className="p-1 hover:bg-background/50 rounded transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}

            {!pdfFile && (
              <button
                onClick={() => pdfRef.current?.click()}
                className="w-full inline-flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/50 py-3 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                <FileText className="h-4 w-4 text-primary/60" /> Attach PDF (optional)
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Merchant</Label>
                <Input value={form.Merchant} onChange={(e) => set("Merchant", e.target.value)} placeholder="e.g. 99 Speedmart" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.Date} onChange={(e) => set("Date", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Receipt No.</Label>
                <Input value={form.ReceiptNo} onChange={(e) => set("ReceiptNo", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <select value={form.Category} onChange={(e) => set("Category", e.target.value)} className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground">
                  <option value="">—</option>
                  {categoryNames.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Payment</Label>
                <Input value={form.PaymentMethod} onChange={(e) => set("PaymentMethod", e.target.value)} placeholder="Cash / Card" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Subtotal (MYR)</Label>
                <Input type="number" step="0.01" value={form.Subtotal} onChange={(e) => set("Subtotal", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Tax type</Label>
                <select value={form.TaxType} onChange={(e) => set("TaxType", e.target.value)} className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground">
                  {(TAX_TYPES.includes(form.TaxType) ? TAX_TYPES : [...TAX_TYPES, form.TaxType]).map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Tax rate (%)</Label>
                <Input type="number" step="0.1" value={form.TaxRate} onChange={(e) => set("TaxRate", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Tax amount (MYR)</Label>
                <Input type="number" step="0.01" value={form.TaxAmount} onChange={(e) => set("TaxAmount", e.target.value)} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Total (MYR)</Label>
                <Input type="number" step="0.01" value={form.Total} onChange={(e) => set("Total", e.target.value)} className="mt-1 font-semibold" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notes</Label>
                <Input value={form.Notes} onChange={(e) => set("Notes", e.target.value)} placeholder="Optional" className="mt-1" />
              </div>
            </div>

            {lineItems.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Items read from receipt</span>
                  <span className="text-[10px] text-muted-foreground">{lineItems.length} line{lineItems.length > 1 ? "s" : ""}</span>
                </div>
                <ul className="divide-y divide-border">
                  {lineItems.map((it, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 px-3 py-1.5 text-xs">
                      <span className="text-foreground">
                        {it.Description || "—"}
                        {(it.Qty != null || it.UnitPrice != null) && (
                          <span className="text-muted-foreground">
                            {" "}
                            {it.Qty != null ? `${it.Qty} ×` : ""}
                            {it.UnitPrice != null ? ` ${it.UnitPrice.toFixed(2)}` : ""}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {it.Amount != null ? it.Amount.toFixed(2) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rawText && (
              <div>
                <button onClick={() => setShowRaw((s) => !s)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRaw ? "rotate-180" : ""}`} /> Raw OCR text (retained for audit)
                </button>
                {showRaw && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 border border-border p-3 text-[11px] whitespace-pre-wrap text-muted-foreground">{rawText}</pre>
                )}
              </div>
            )}

            <button
              onClick={save}
              disabled={saving || (!compressed && !pdfFile)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save receipt
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
