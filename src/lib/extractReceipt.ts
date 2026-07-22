/**
 * Vision-LLM receipt extraction. Sends the receipt image to the
 * `extract-receipt` edge function (Gemini primary → Groq/Llama fallback, keys held
 * server-side in Supabase secrets) and gets the form fields back as JSON —
 * far more accurate on messy thermal receipts than the OCR+heuristic path.
 *
 * `scanReceipt` is the single entry point the dialogs use: it tries the LLM
 * first and transparently falls back to the existing OCR pipeline
 * (ocr-service / in-browser Tesseract + parseReceipt) when the function is
 * unreachable, the user is offline, or the LLM fails — so capture always works.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { runOcr } from "./ocr";
import { parseReceipt } from "./receipts";
import { preprocessForOcr } from "./receiptImage";
import { classifyAiError } from "./aiErrors";
import type { Receipt, ReceiptLineItem } from "./types";

export type ScanEngine = "gemini" | "groq" | "remote" | "tesseract";

export interface ScanResult {
  /** Parsed form fields, PascalCase to match the Receipt document shape. */
  fields: Partial<Receipt>;
  /** Full transcription, retained verbatim for audit search. */
  rawText: string;
  engine: ScanEngine;
  /**
   * Why the AI was skipped, when `engine` fell back to OCR. Without this an OCR
   * result looks like an AI one and a dead key looks like a bad receipt photo.
   */
  fallbackReason?: string;
}

/** One line item as returned by the LLM schema (snake_case). */
interface LlmLineItem {
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

/** Shape returned by the edge function's LLM schema (snake_case). */
interface LlmFields {
  merchant?: string | null;
  merchant_tin?: string | null;
  receipt_no?: string | null;
  date?: string | null;
  currency?: string | null;
  line_items?: LlmLineItem[] | null;
  subtotal?: number | null;
  tax_type?: string | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  payment_method?: string | null;
  category_hint?: string | null;
  raw_text?: string | null;
}

const LLM_TIMEOUT_MS = 45_000;

/**
 * Prepare the image the LLM sees. Unlike the grayscale archival WebP, vision
 * models want the original colour data at a decent resolution — aggressive
 * compression measurably hurts them. ~1600px JPEG q0.85 keeps a phone photo
 * around 300–700KB, well inside the function's payload cap.
 */
async function prepareLlmImage(file: Blob): Promise<{ base64: string; mime: string } | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Undecodable here (e.g. odd HEIC) — ship the original if it's small enough.
    if (file.size <= 4 * 1024 * 1024) {
      return { base64: await blobToBase64(file), mime: file.type || "image/jpeg" };
    }
    return null;
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  let q = 0.85;
  let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
  // Payload safety: step quality down if a dense full-page scan comes out huge.
  while (blob && blob.size > 3 * 1024 * 1024 && q > 0.5) {
    q -= 0.15;
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
  }
  if (!blob) return null;
  return { base64: await blobToBase64(blob), mime: "image/jpeg" };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function str(v: string | null | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Keep only line items that carry at least one readable value. */
function toLineItems(items: LlmLineItem[] | null | undefined): ReceiptLineItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const row: ReceiptLineItem = {};
      if (str(it.description)) row.Description = str(it.description);
      if (num(it.qty) != null) row.Qty = num(it.qty);
      if (num(it.unit_price) != null) row.UnitPrice = num(it.unit_price);
      if (num(it.amount) != null) row.Amount = num(it.amount);
      return row;
    })
    .filter((r) => r.Description || r.Amount != null || r.Qty != null || r.UnitPrice != null);
}

/** Map the LLM's snake_case output onto the app's PascalCase Receipt fields. */
function toReceiptFields(f: LlmFields): Partial<Receipt> {
  const out: Partial<Receipt> = {};
  if (str(f.merchant)) out.Merchant = str(f.merchant);
  if (str(f.merchant_tin)) out.MerchantTin = str(f.merchant_tin);
  if (str(f.receipt_no)) out.ReceiptNo = str(f.receipt_no);
  // Only accept a well-formed ISO date — a hallucinated format would put junk
  // in the <input type="date">.
  if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) out.Date = f.date;
  if (str(f.currency)) out.Currency = str(f.currency);
  const items = toLineItems(f.line_items);
  if (items.length) out.LineItems = items;
  if (num(f.subtotal) != null) out.Subtotal = num(f.subtotal);
  // Accept whatever tax label the receipt actually printed (SST, None, or an
  // unusual label) rather than forcing a fixed set — receipts vary.
  if (str(f.tax_type)) out.TaxType = str(f.tax_type);
  if (num(f.tax_rate) != null) out.TaxRate = num(f.tax_rate);
  if (num(f.tax_amount) != null) out.TaxAmount = num(f.tax_amount);
  if (num(f.total) != null) out.Total = num(f.total);
  if (str(f.payment_method)) out.PaymentMethod = str(f.payment_method);
  if (str(f.category_hint)) out.Category = str(f.category_hint);
  return out;
}

/** Call the extract-receipt edge function. Throws on any failure. */
async function runLlmExtraction(file: Blob): Promise<ScanResult> {
  if (!isSupabaseConfigured) throw new Error("Supabase not configured");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const prepared = await prepareLlmImage(file);
  if (!prepared) throw new Error("Could not prepare image");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.functions.invoke("extract-receipt", {
      body: { image: prepared.base64, mime: prepared.mime },
      signal: controller.signal,
    });
    if (error) {
      // supabase-js hides the response body on non-2xx (FunctionsHttpError).
      // Pull the real server message so the console/log is actionable rather
      // than the opaque "non-2xx status code".
      let detail = error.message;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        try {
          const body = await ctx.text();
          const parsed = JSON.parse(body);
          if (parsed?.error) detail = parsed.error;
        } catch { /* keep the generic message */ }
      }
      throw new Error(detail);
    }
    const provider = data?.provider as ScanEngine | undefined;
    const fields = data?.fields as LlmFields | undefined;
    if (!fields || (provider !== "gemini" && provider !== "groq")) {
      throw new Error("Unexpected extraction response");
    }
    return {
      fields: toReceiptFields(fields),
      rawText: str(fields.raw_text) ?? "",
      engine: provider,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scan a receipt image into structured fields: AI extraction first, classic
 * OCR + heuristic parser as the safety net. Never rejects for engine reasons —
 * worst case it resolves with empty fields and the user types them in.
 */
export async function scanReceipt(
  file: Blob,
  onProgress?: (pct: number) => void
): Promise<ScanResult> {
  let fallbackReason: string | undefined;
  try {
    // No incremental progress from the LLM — show an indeterminate mid-state.
    onProgress?.(40);
    const result = await runLlmExtraction(file);
    onProgress?.(100);
    return result;
  } catch (err) {
    const { message, detail } = classifyAiError(err);
    console.warn(`[scan] AI extraction unavailable (${message}), falling back to OCR:`, detail, err);
    onProgress?.(0);
    fallbackReason = message;
  }

  const ocrImage = await preprocessForOcr(file);
  const { text, engine } = await runOcr(ocrImage, onProgress);
  return { fields: parseReceipt(text), rawText: text, engine, fallbackReason };
}

/** Human label for the engine badge shown on the review screen. */
export function engineLabel(engine: ScanEngine): string {
  switch (engine) {
    case "gemini": return "AI · Gemini";
    case "groq": return "AI · Groq";
    case "remote": return "Server OCR";
    case "tesseract": return "On-device OCR";
  }
}
