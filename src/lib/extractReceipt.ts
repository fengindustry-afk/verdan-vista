/**
 * Vision-LLM receipt extraction. Sends the receipt image to the
 * `extract-receipt` edge function (Gemini primary → Grok fallback, keys held
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
import type { Receipt } from "./types";

export type ScanEngine = "gemini" | "grok" | "remote" | "tesseract";

export interface ScanResult {
  /** Parsed form fields, PascalCase to match the Receipt document shape. */
  fields: Partial<Receipt>;
  /** Full transcription, retained verbatim for audit search. */
  rawText: string;
  engine: ScanEngine;
}

/** Shape returned by the edge function's LLM schema (snake_case). */
interface LlmFields {
  merchant?: string | null;
  merchant_tin?: string | null;
  receipt_no?: string | null;
  date?: string | null;
  currency?: string | null;
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
  if (num(f.subtotal) != null) out.Subtotal = num(f.subtotal);
  if (f.tax_type && ["SST", "GST", "None"].includes(f.tax_type)) out.TaxType = f.tax_type;
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
    if (error) throw error;
    const provider = data?.provider as ScanEngine | undefined;
    const fields = data?.fields as LlmFields | undefined;
    if (!fields || (provider !== "gemini" && provider !== "grok")) {
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
  try {
    // No incremental progress from the LLM — show an indeterminate mid-state.
    onProgress?.(40);
    const result = await runLlmExtraction(file);
    onProgress?.(100);
    return result;
  } catch (err) {
    console.warn("[scan] AI extraction unavailable, falling back to OCR:", err);
    onProgress?.(0);
  }

  const ocrImage = await preprocessForOcr(file);
  const { text, engine } = await runOcr(ocrImage, onProgress);
  return { fields: parseReceipt(text), rawText: text, engine };
}

/** Human label for the engine badge shown on the review screen. */
export function engineLabel(engine: ScanEngine): string {
  switch (engine) {
    case "gemini": return "AI · Gemini";
    case "grok": return "AI · Grok";
    case "remote": return "Server OCR";
    case "tesseract": return "On-device OCR";
  }
}
