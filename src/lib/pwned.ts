/**
 * Client-side "have I been pwned?" password check against HaveIBeenPwned's free,
 * keyless Pwned Passwords range API.
 *
 * Privacy: we use k-anonymity. The password is SHA-1 hashed in the browser and
 * only the FIRST 5 hex characters of the hash are ever sent to the API. The API
 * returns every breached-hash suffix sharing that prefix; we match the remaining
 * 35 characters locally. The password itself — and its full hash — never leave
 * the device. See https://haveibeenpwned.com/API/v3#PwnedPasswords
 *
 * The API is free and requires no key. It's used as defense-in-depth alongside
 * Supabase Auth's own leaked-password protection (a free toggle under
 * Authentication ▸ Passwords that also uses HIBP server-side).
 */

/** SHA-1 hex digest (uppercase) of a UTF-8 string, via the Web Crypto API. */
async function sha1HexUpper(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * How many known breaches this exact password appears in (0 = not found).
 * Throws only on an unexpected crypto failure; network/HTTP errors surface as a
 * thrown Error so callers can decide whether to fail open or closed.
 */
export async function pwnedPasswordCount(password: string): Promise<number> {
  const hash = await sha1HexUpper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    // Padding masks the real result-set size from network observers.
    headers: { "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error(`Pwned Passwords API returned ${res.status}`);

  const body = await res.text();
  for (const line of body.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const suf = line.slice(0, idx).trim().toUpperCase();
    if (suf === suffix) {
      const count = parseInt(line.slice(idx + 1).trim(), 10);
      return Number.isFinite(count) ? count : 0;
    }
  }
  return 0;
}

/**
 * Convenience guard for sign-up / password-change flows. Returns a human-readable
 * error message if the password is breached, or `null` if it's safe to use.
 *
 * Fails OPEN: if the HIBP request itself errors (offline, rate-limited, blocked),
 * we return `null` rather than block the user — the server-side protection and
 * the length check still apply. Set `failClosed` to reverse this for high-assurance
 * flows.
 */
export async function checkPasswordBreached(
  password: string,
  { failClosed = false }: { failClosed?: boolean } = {}
): Promise<string | null> {
  try {
    const count = await pwnedPasswordCount(password);
    if (count > 0) {
      return `This password has appeared in ${count.toLocaleString()} known data breaches. Please choose a different one.`;
    }
    return null;
  } catch {
    return failClosed
      ? "Couldn't verify this password's safety right now. Please try again."
      : null;
  }
}
