/**
 * Receipt image compression tuned for long-term tax-audit archival at scale
 * (thousands/month × 7 years). Receipts are essentially black text on white, so
 * we convert to grayscale and encode as WebP — typically ~5× smaller than a
 * color JPEG while keeping fine print legible for an LHDN auditor.
 *
 * Falls back to JPEG when the browser can't encode WebP.
 */

export interface CompressedReceipt {
  blob: Blob;
  mime: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Decode an image Blob to something drawable on a canvas. Prefers the fast
 * `createImageBitmap` path, but falls back to an `<img>` element — crucial on
 * iOS Safari, where `createImageBitmap` frequently rejects camera HEIC/large
 * JPEGs. Without this fallback the original (~500KB+) iPhone photo would slip
 * through uncompressed.
 */
async function decodeImage(
  file: Blob
): Promise<{ draw: CanvasImageSource; width: number; height: number; close: () => void } | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap) {
    return { draw: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth) return null;
    return {
      draw: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/**
 * Downscale to `maxEdge` on the long side, convert to grayscale, and encode as
 * WebP at `quality`. Defaults chosen to keep receipts readable (~1600px) at a
 * small size (~40–90KB for a typical phone photo). If the first encode still
 * exceeds `maxBytes`, the long edge and quality are stepped down until it fits,
 * so an oversized iPhone photo can't reach the database uncompressed.
 */
export async function compressReceiptImage(
  file: Blob,
  {
    maxEdge = 1600,
    quality = 0.72,
    maxBytes = 200 * 1024,
  }: { maxEdge?: number; quality?: number; maxBytes?: number } = {}
): Promise<CompressedReceipt> {
  const bitmap = await decodeImage(file);
  if (!bitmap) {
    return { blob: file, mime: file.type || "image/jpeg", bytes: file.size, width: 0, height: 0 };
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { blob: file, mime: file.type || "image/jpeg", bytes: file.size, width: w, height: h };
  }
  ctx.drawImage(bitmap.draw, 0, 0, w, h);
  bitmap.close();

  // Grayscale in place — drops chroma an auditor never needs and shrinks the
  // encode substantially.
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Rec. 601 luma.
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);

  const encode = (mime: string, q: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, mime, q));

  let q = quality;
  let blob = await encode("image/webp", q);
  let mime = "image/webp";
  // Some browsers ignore the WebP request and hand back PNG; fall back to JPEG.
  if (!blob || blob.type !== "image/webp") {
    const jpeg = await encode("image/jpeg", q);
    if (jpeg) {
      blob = jpeg;
      mime = "image/jpeg";
    }
  }
  if (!blob) return { blob: file, mime: file.type || "image/jpeg", bytes: file.size, width: w, height: h };

  // If it's still too big (e.g. a dense, full-page receipt), step quality down a
  // few times so nothing oversized ever reaches storage/DB. Re-encoding the same
  // canvas is cheap; text stays legible well below the WebP default quality.
  let steps = 0;
  while (blob.size > maxBytes && q > 0.4 && steps < 4) {
    q -= 0.1;
    const smaller = await encode(mime, q);
    if (!smaller || smaller.size >= blob.size) break;
    blob = smaller;
    steps++;
  }

  return { blob, mime, bytes: blob.size, width: w, height: h };
}

/** Human-readable byte size, e.g. 58KB or 1.2MB. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Produce an OCR-optimised copy of a receipt image — this is fed to Tesseract,
 * NOT stored. Tesseract accuracy hinges on resolution and contrast, so we:
 *   • resize the long edge into ~1800–2400px (upscaling tiny crops toward the
 *     ~300 DPI Tesseract likes, downscaling huge photos so it stays fast),
 *   • convert to grayscale, and
 *   • apply a percentile contrast-stretch so faded thermal-paper text becomes
 *     crisp black-on-white,
 * then encode LOSSLESS PNG so no compression artefacts blur the glyphs.
 */
export async function preprocessForOcr(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const longEdge = Math.max(bitmap.width, bitmap.height);
  // Aim for ~2000px on the long edge; never upscale more than 3× a tiny crop.
  const target = Math.min(2400, Math.max(1800, longEdge));
  const scale = Math.min(3, target / longEdge);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Pass 1: grayscale + build a luma histogram.
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = d[i + 1] = d[i + 2] = y;
    hist[y]++;
  }

  // Find the 2nd / 98th percentile luma to stretch against (robust to specks).
  const total = w * h;
  const loCut = total * 0.02;
  const hiCut = total * 0.98;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= loCut) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= hiCut) { hi = v; break; } }
  const span = Math.max(1, hi - lo);

  // Pass 2: linear contrast stretch [lo,hi] → [0,255].
  for (let i = 0; i < d.length; i += 4) {
    let y = ((d[i] - lo) * 255) / span;
    y = y < 0 ? 0 : y > 255 ? 255 : y;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);

  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return png ?? file;
}
