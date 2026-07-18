/**
 * Copy pdfjs-dist's worker into public/ so it's served as a static asset at
 * `/pdf.worker.min.mjs` (see src/lib/pdf.ts). Importing the worker through
 * Vite's `?url`/`?worker` transforms stalls the dev server on the ~1.3MB file
 * and makes PDF rendering hang. Run automatically on install/dev/build so the
 * copy never drifts from the installed pdfjs version.
 */
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
  const dest = join(root, "public", "pdf.worker.min.mjs");
  copyFileSync(src, dest);
  console.log("[sync:pdf-worker] copied worker -> public/pdf.worker.min.mjs");
} catch (err) {
  // Don't fail install/build if pdfjs isn't present yet — PDF scanning just
  // won't work until it is.
  console.warn("[sync:pdf-worker] skipped:", err.message);
}
