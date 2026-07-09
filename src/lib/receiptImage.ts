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
 * Downscale to `maxEdge` on the long side, convert to grayscale, and encode as
 * WebP at `quality`. Defaults chosen to keep receipts readable (~1600px) at a
 * small size (~40–90KB for a typical phone photo).
 */
export async function compressReceiptImage(
  file: Blob,
  { maxEdge = 1600, quality = 0.72 }: { maxEdge?: number; quality?: number } = {}
): Promise<CompressedReceipt> {
  const bitmap = await createImageBitmap(file).catch(() => null);
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
  ctx.drawImage(bitmap, 0, 0, w, h);

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
  bitmap.close?.();

  const encode = (mime: string): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, mime, quality));

  let blob = await encode("image/webp");
  let mime = "image/webp";
  // Some browsers ignore the WebP request and hand back PNG; fall back to JPEG.
  if (!blob || blob.type !== "image/webp") {
    const jpeg = await encode("image/jpeg");
    if (jpeg) {
      blob = jpeg;
      mime = "image/jpeg";
    }
  }
  if (!blob) return { blob: file, mime: file.type || "image/jpeg", bytes: file.size, width: w, height: h };

  return { blob, mime, bytes: blob.size, width: w, height: h };
}

/** Human-readable byte size, e.g. 58KB or 1.2MB. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
