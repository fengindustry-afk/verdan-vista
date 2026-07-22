import { sha256HexText } from "./hash";
import type { ApiKey } from "./types";

/**
 * Read-only API keys for the MCP server (supabase/functions/tree-mcp).
 *
 * The database stores only a hash, so the plaintext exists exactly once: in the
 * browser, at creation, until the admin copies it. Losing it costs a new key,
 * which is cheaper than a credential that can be read back out of a table.
 */

/** Where an MCP client points. */
export const MCP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/tree-mcp`;

/**
 * A 256-bit random key, hex, prefixed so it is recognisable in a log or a
 * config file. `crypto.getRandomValues` is the CSPRNG — Math.random is not,
 * and a guessable key is not a key.
 */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `esterra_${hex}`;
}

/** SHA-256 of the key text — what gets stored, and what the server looks up. */
export function hashApiKey(key: string): Promise<string> {
  return sha256HexText(key);
}

/** A key is usable while it is neither revoked nor past its expiry. */
export function keyIsLive(k: ApiKey, now = Date.now()): boolean {
  if (k.Revoked) return false;
  if (!k.ExpiresAt) return true;
  const expires = Date.parse(k.ExpiresAt);
  return !Number.isFinite(expires) || expires > now;
}
