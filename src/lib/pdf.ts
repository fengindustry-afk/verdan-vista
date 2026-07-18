/**
 * Render the first page of a PDF to a raster image so the same vision-LLM /
 * OCR pipeline that reads photographed receipts can also read PDF e-receipts
 * and supplier invoices. The current vision provider (Groq/qwen) accepts images
 * only, so a client-side render is the reliable cross-provider path.
 *
 * pdfjs-dist is loaded dynamically — it's a sizeable dependency only needed when
 * a user actually attaches a PDF, so it stays out of the initial bundle.
 */

// pdfjs' worker is served as a static asset from `public/pdf.worker.min.mjs`
// (kept in sync with the installed pdfjs version by the `sync:pdf-worker`
// script). Importing it through Vite's `?url`/`?worker` transforms instead makes
// the dev server stall on the ~1.3MB worker and getDocument() hangs forever. A
// plain `.mjs` URL also lets pdfjs spawn it as a proper MODULE worker.
let workerConfigured = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureWorker(pdfjs: any): void {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
  workerConfigured = true;
}

/**
 * Rasterise page 1 of `file` to a JPEG Blob. `targetLongEdge` controls
 * resolution: ~2000px keeps small invoice print legible for the model without
 * producing an oversized payload.
 */
export async function renderPdfFirstPage(
  file: Blob,
  { targetLongEdge = 2000 }: { targetLongEdge?: number } = {}
): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  ensureWorker(pdfjs);

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(1, targetLongEdge / Math.max(base.width, base.height)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context");
    // White background — PDFs render with transparency, which a receipt scan
    // should not carry into the JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // intent "print" schedules via microtasks instead of requestAnimationFrame,
    // so the render still completes if the tab is backgrounded (Chromium pauses
    // rAF in hidden tabs) — important for a PWA the user may switch away from.
    await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error("PDF page render produced no image");
    return blob;
  } finally {
    pdf.destroy?.();
  }
}
