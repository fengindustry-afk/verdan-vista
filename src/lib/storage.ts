import { supabase, isSupabaseConfigured } from "./supabase";
import { isEffectivelyOffline } from "./data";

/**
 * Media storage for captured photos/scans/receipts. Three tiers, best first:
 *
 *   1. Cloudflare R2 — heavy files belong here (cheap at scale, keeps the
 *      Supabase DB/Storage lean). The browser asks the `r2-sign` edge function
 *      for a short-lived presigned URL and PUTs/GETs directly against R2; R2
 *      credentials never reach the client. Stored refs are "r2:bucket/key".
 *   2. Private Supabase Storage bucket — used when R2 isn't configured or the
 *      signing/upload fails. Stored ref is the plain object path (legacy rows
 *      all look like this and keep working unchanged).
 *   3. Inline base64 data URL — last resort so capture still works offline.
 */

export const Buckets = {
  photos: "geotagged-photos",
  scans: "tree-scans",
  receipts: "receipts",
} as const;

const R2_PREFIX = "r2:";

export interface StoredImage {
  /** Storage reference ("r2:bucket/key" or a Supabase Storage object path). */
  path?: string;
  /** Inline data URL fallback (when no storage tier is available). */
  dataUrl?: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** After a signing failure (function not deployed, secrets missing, demo
 * session), skip R2 attempts for a while instead of paying a doomed round-trip
 * on every upload/thumbnail. */
let r2DisabledUntil = 0;
const R2_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

/** Ask r2-sign for a presigned URL. Throws when R2 is unavailable/denied. */
async function signR2(
  action: "put" | "get",
  bucket: string,
  key: string
): Promise<{ url: string; ref: string }> {
  if (Date.now() < r2DisabledUntil) throw new Error("R2 signing on cooldown");
  const { data, error } = await supabase.functions.invoke("r2-sign", {
    body: { action, bucket, key },
  });
  if (error) {
    r2DisabledUntil = Date.now() + R2_RETRY_COOLDOWN_MS;
    throw error;
  }
  if (!data?.url) throw new Error("r2-sign returned no URL");
  return { url: data.url as string, ref: (data.ref as string) ?? `${R2_PREFIX}${bucket}/${key}` };
}

async function uploadToR2(bucket: string, key: string, blob: Blob): Promise<string> {
  const { url, ref } = await signR2("put", bucket, key);
  const res = await fetch(url, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": blob.type || "application/octet-stream" },
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}`);
  return ref;
}

export async function uploadImage(
  bucket: string,
  path: string,
  blob: Blob,
  opts: { keepDataUrl?: boolean } = {}
): Promise<StoredImage> {
  // Offline: skip upload attempts and keep the image inline so capture still works.
  if (isSupabaseConfigured && !isEffectivelyOffline()) {
    // Tier 1: R2. Signing fails fast (503) when the function/secrets aren't set
    // up, or 401 for sessions that can't call functions (demo login) — both fall
    // through to Supabase Storage. On success we do NOT keep the base64 fallback
    // even when asked: the whole point of R2 is keeping big payloads out of the
    // DB row, and GETs are signed by the same function that just signed this PUT.
    try {
      const ref = await uploadToR2(bucket, path, blob);
      return { path: ref };
    } catch (err) {
      console.warn(`[storage] R2 upload for ${bucket}/${path} unavailable, trying Supabase:`, err);
    }

    // Tier 2: Supabase Storage.
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: blob.type || "image/jpeg",
    });
    if (!error) {
      // Optionally also return the inline data URL so the caller can persist a
      // small fallback — the image still renders even if a signed URL can't be
      // produced later (misconfigured bucket / policies), instead of "No image".
      return opts.keepDataUrl ? { path, dataUrl: await blobToDataUrl(blob) } : { path };
    }
    console.warn(`[storage] upload to ${bucket} failed, using inline fallback:`, error.message);
  }
  // Tier 3: inline base64.
  return { dataUrl: await blobToDataUrl(blob) };
}

/** Signed GET URLs (R2 and Supabase Storage), cached until shortly before they
 * expire so a list view doesn't pay one signing round-trip per thumbnail per
 * render. Persisted to localStorage: right after sign-in every thumbnail used
 * to wait on a fresh signing call, which read as "the data is gone" — a warm
 * cache paints them immediately on return visits. URLs expire in ≤60min, so a
 * leaked cache entry is no worse than the session token already stored there. */
const SIGNED_URL_CACHE_KEY = "vv-signed-urls";
const SIGNED_URL_CACHE_MS = 55 * 60 * 1000; // URLs are signed for 60min

const signedUrlCache: Map<string, { url: string; expiresAt: number }> = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(SIGNED_URL_CACHE_KEY) ?? "[]") as
      [string, { url: string; expiresAt: number }][];
    const now = Date.now();
    return new Map(raw.filter(([, v]) => v?.expiresAt > now));
  } catch {
    return new Map();
  }
})();

function cacheSignedUrl(key: string, url: string) {
  signedUrlCache.set(key, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
  try {
    localStorage.setItem(SIGNED_URL_CACHE_KEY, JSON.stringify([...signedUrlCache]));
  } catch { /* quota — in-memory cache still works */ }
}

function cachedSignedUrl(key: string): string | null {
  const hit = signedUrlCache.get(key);
  return hit && hit.expiresAt > Date.now() ? hit.url : null;
}

/** Turns a stored reference into a viewable URL. */
export async function resolveImageUrl(
  bucket: string,
  stored: string | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!stored) return null;
  // Already a usable URL (inline data URL, or a legacy absolute URL).
  if (stored.startsWith("data:") || stored.startsWith("http")) return stored;
  if (!isSupabaseConfigured || isEffectivelyOffline()) return null;

  if (stored.startsWith(R2_PREFIX)) {
    const cached = cachedSignedUrl(stored);
    if (cached) return cached;
    const [b, ...rest] = stored.slice(R2_PREFIX.length).split("/");
    try {
      const { url } = await signR2("get", b, rest.join("/"));
      cacheSignedUrl(stored, url);
      return url;
    } catch (err) {
      console.warn(`[storage] R2 sign ${stored} failed:`, err);
      return null;
    }
  }

  const cacheKey = `${bucket}/${stored}`;
  const cached = cachedSignedUrl(cacheKey);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(stored, expiresIn);
  if (error) {
    console.warn(`[storage] sign ${bucket}/${stored} failed:`, error.message);
    return null;
  }
  cacheSignedUrl(cacheKey, data.signedUrl);
  return data.signedUrl;
}
