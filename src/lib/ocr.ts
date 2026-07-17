/**
 * Classic OCR path — now the FALLBACK behind the AI extraction in
 * `extractReceipt.ts` (which sends the image to the extract-receipt edge
 * function). This module keeps capture working with no AI/network at all:
 * an optional self-hosted OCR service first, then Tesseract.js fully
 * in-browser (images never leave the device on that path). The ~2MB engine +
 * language data are lazy-loaded from the jsDelivr CDN only when actually
 * needed, so the main bundle stays light.
 */

type OcrModule = typeof import("tesseract.js");

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker(onProgress?: (pct: number) => void) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract: OcrModule = await import("tesseract.js");
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        },
      });
      // Receipts are a single column of variable-size text; PSM 6 (assume one
      // uniform block) keeps line structure intact for the line-based parser,
      // and preserving interword spaces keeps "SST 6%  0.70" columns separable.
      await worker.setParameters({
        tessedit_pageseg_mode: "6" as unknown as import("tesseract.js").PSM,
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  /** Which engine produced the text — useful for debugging/telemetry. */
  engine: "remote" | "tesseract";
}

/**
 * Optional self-hosted OCR service (see `ocr-service/`). When VITE_OCR_URL is
 * set and reachable, we use it (PaddleOCR etc. — much stronger on messy
 * receipts); otherwise we transparently fall back to in-browser Tesseract, so
 * capture keeps working when the VM/host is off or offline.
 */
const REMOTE_OCR_URL = (import.meta.env.VITE_OCR_URL as string | undefined)?.replace(/\/$/, "");
const REMOTE_TIMEOUT_MS = 15000;

async function runRemoteOcr(image: Blob): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append("file", image, "receipt");
    const res = await fetch(`${REMOTE_OCR_URL}/ocr`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OCR service ${res.status}`);
    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/** Runs OCR on an image blob, reporting recognition progress (0–100). */
export async function runOcr(
  image: Blob,
  onProgress?: (pct: number) => void
): Promise<OcrResult> {
  if (REMOTE_OCR_URL) {
    try {
      // The remote engine has no incremental progress; show an indeterminate
      // "working" state, then jump to complete.
      onProgress?.(50);
      const text = await runRemoteOcr(image);
      onProgress?.(100);
      return { text, engine: "remote" };
    } catch (err) {
      // Any failure (VM off, timeout, offline) → fall through to Tesseract.
      console.warn("[ocr] remote service unavailable, using Tesseract:", err);
      onProgress?.(0);
    }
  }

  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);
  return { text: data.text ?? "", engine: "tesseract" };
}

/** Free the OCR worker (e.g. when leaving the receipts page) to reclaim memory. */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
