/**
 * Content hashing for captured evidence (scan photos, receipt images).
 *
 * Why a hash is on the record at all — three distinct jobs:
 *
 *  1. Integrity. Re-hash the stored object and compare: any byte that changed
 *     since capture shows up, whether from storage corruption or substitution.
 *  2. Double-counting. The same photo filed twice — or one tree photographed
 *     once and claimed under two tree ids — collides on the hash. Double
 *     counting is the integrity failure carbon registries actually police, and
 *     a unique index (security/create-evidence-hash.sql) blocks it at the DB.
 *  3. A stable identifier for the evidence, independent of row id, filename or
 *     storage path — so a migration or an R2 move can't orphan the link.
 *
 * What it does NOT do: a hash says nothing about *when*. Hashing a photo with
 * doctored EXIF yields a perfectly valid hash of a doctored file. Capture time
 * is a separate concern (src/lib/exif.ts), and neither substitutes for the
 * other. Proving existence at a point in time needs an external anchor (RFC
 * 3161 timestamp, or whatever Cula specifies) — deliberately not built yet.
 *
 * Trust note: this runs in the browser, so the value is a *claim* until the
 * server verifies it. What makes it evidence rather than decoration is that
 * the hash is copied into the append-only edit-history log at creation (see
 * recordEdit), where the writer cannot quietly rewrite it afterwards.
 */

/** SHA-256 of a blob's bytes, lowercase hex. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of a string's UTF-8 bytes, lowercase hex. */
export async function sha256HexText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash the bytes as they will be stored, not the file as picked.
 *
 * The stored object is what an auditor can actually re-hash later, so that is
 * what the record must commit to. The trade-off: capture dialogs compress
 * before upload, and two devices re-encoding the same original can produce
 * different bytes — so duplicate detection catches a re-upload of the same
 * stored image, but not the same photo compressed independently elsewhere.
 */
export const hashStoredImage = sha256Hex;
