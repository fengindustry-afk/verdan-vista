import { supabase, isSupabaseConfigured } from "./supabase";

/**
 * Image storage for captured photos/scans. Primary path uploads to a private
 * Supabase Storage bucket (scalable — the DB row stores only the object path,
 * and images are viewed via short-lived signed URLs). If the bucket doesn't
 * exist yet (security/storage-policies.sql not applied) or the upload fails, it
 * falls back to an inline base64 data URL so capture still works.
 */

export const Buckets = {
  photos: "geotagged-photos",
  scans: "tree-scans",
} as const;

export interface StoredImage {
  /** Object path in the bucket (when uploaded to Storage). */
  path?: string;
  /** Inline data URL fallback (when Storage is unavailable). */
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

export async function uploadImage(
  bucket: string,
  path: string,
  blob: Blob
): Promise<StoredImage> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: blob.type || "image/jpeg",
    });
    if (!error) return { path };
    console.warn(`[storage] upload to ${bucket} failed, using inline fallback:`, error.message);
  }
  return { dataUrl: await blobToDataUrl(blob) };
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
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(stored, expiresIn);
  if (error) {
    console.warn(`[storage] sign ${bucket}/${stored} failed:`, error.message);
    return null;
  }
  return data.signedUrl;
}
