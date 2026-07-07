import { z } from "zod";

/**
 * Input validation + sanitization for all client-side write paths. Client
 * validation is defense-in-depth / UX only — the database (RLS policies in
 * security/rls.sql) is the real trust boundary. These schemas keep malformed or
 * hostile input out of the payloads we send and out of the DOM.
 */

// True if the string contains any C0/C1 control character (< 0x20 or 0x7F).
// Computed via char codes so no literal control byte appears in source.
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Required")
    .max(max, `Must be ${max} characters or fewer`)
    .refine((s) => !hasControlChar(s), "Contains invalid control characters");

export const newBatchSchema = z.object({
  title: safeText(80),
  type: safeText(60),
  supplier: safeText(120),
  amount: safeText(40),
});
export type NewBatchInput = z.infer<typeof newBatchSchema>;

// Numeric CORC inputs: optional, finite, non-negative, bounded.
const optionalNonNegative = (max: number) =>
  z
    .union([z.literal(""), z.coerce.number().finite().min(0).max(max)])
    .transform((v) => (v === "" ? undefined : v));

export const corcInputSchema = z.object({
  biocharYieldKg: optionalNonNegative(1_000_000),
  carbonContentPct: optionalNonNegative(100),
  hcorgRatio: optionalNonNegative(5),
  pyrolysisTempC: optionalNonNegative(2000),
  lcaEmissionsTco2e: optionalNonNegative(1_000_000),
});

/**
 * Only allow http/https media stream URLs. Explicitly blocks `javascript:`,
 * `data:`, `blob:`, `file:` and other schemes that could inject script or read
 * local resources when assigned to a media/src attribute.
 */
export const streamUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a stream URL")
  .max(2048)
  .refine((val) => {
    let u: URL;
    try {
      u = new URL(val);
    } catch {
      return false;
    }
    return u.protocol === "http:" || u.protocol === "https:";
  }, "Must be an http(s) stream URL");

/** Returns a safe URL string or null. */
export function sanitizeStreamUrl(input: string): string | null {
  const parsed = streamUrlSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
