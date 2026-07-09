/**
 * Client-side OCR via Tesseract.js. Runs entirely in the browser — receipt
 * images never leave the device — and the ~2MB engine + language data are
 * lazy-loaded only when a scan is actually requested, so the main bundle stays
 * light. The worker/core/lang assets are fetched from the jsDelivr CDN on first
 * use (cached by the browser thereafter).
 */

type OcrModule = typeof import("tesseract.js");

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker(onProgress?: (pct: number) => void) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract: OcrModule = await import("tesseract.js");
      return Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        },
      });
    })();
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
}

/** Runs OCR on an image blob, reporting recognition progress (0–100). */
export async function runOcr(
  image: Blob,
  onProgress?: (pct: number) => void
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);
  return { text: data.text ?? "" };
}

/** Free the OCR worker (e.g. when leaving the receipts page) to reclaim memory. */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
