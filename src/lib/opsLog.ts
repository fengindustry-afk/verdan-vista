/**
 * Operational-event log behind the admin Notification Centre. Call logOpsEvent
 * where the app degrades but keeps working (storage tier fallback, AI skip) —
 * a console.warn there is invisible to the admin who could actually fix it.
 *
 * Fire-and-forget: logging must never break the flow it observes. Bursts of the
 * same kind are throttled so one broken R2 config doesn't write a row per
 * thumbnail.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type OpsEventKind =
  | "r2-upload-failed"
  | "r2-sign-failed"
  | "storage-upload-failed"
  | "image-resolve-failed"
  | "ai-analysis-fallback"
  | "honeypot-route-hit";

export interface OpsEvent {
  id: string;
  Kind: OpsEventKind;
  Message: string;
  Detail?: string;
  At: string;
}

/** Admin-facing suggested fix per kind, shown in the Notification Centre. */
export const OPS_FIX: Record<OpsEventKind, string> = {
  "r2-upload-failed":
    "Media is falling back to Supabase Storage. Check the r2-sign function secrets (R2_ACCOUNT_ID / keys) and the R2 bucket CORS policy — see docs/R2-STORAGE.md.",
  "r2-sign-failed":
    "Signed R2 URLs can't be produced, so R2 images won't render. Check the r2-sign function is deployed and its R2 secrets are set.",
  "storage-upload-failed":
    "Both R2 and Supabase Storage rejected the upload; the image was kept inline (base64) in the database row. Check storage bucket policies and connectivity, then re-upload via the record's Replace button.",
  "image-resolve-failed":
    "A stored image reference couldn't be turned into a URL. If it persists, open the record and use Replace to re-upload the image.",
  "ai-analysis-fallback":
    "AI scan analysis fell back to the on-device estimate. Check provider keys/quota in Supabase secrets (GEMINI_API_KEY / GROQ_API_KEY) and Settings ▸ AI usage.",
  "honeypot-route-hit":
    "Someone opened the retired /feedstock URL, which no navigation links to — either a stale bookmark or someone probing routes. Check the logged account and, if it wasn't a teammate, review that account's activity in the Audit Trail.",
};

// One event per kind per interval — a broken tier fails once per asset, not once.
const THROTTLE_MS = 60_000;
const lastLogged = new Map<string, number>();

/** True when this kind hasn't been logged within the throttle window (and marks it). */
export function shouldLog(kind: string, now = Date.now()): boolean {
  const last = lastLogged.get(kind) ?? 0;
  if (now - last < THROTTLE_MS) return false;
  lastLogged.set(kind, now);
  return true;
}

export function logOpsEvent(kind: OpsEventKind, message: string, detail?: unknown) {
  if (!isSupabaseConfigured || !shouldLog(kind)) return;
  const doc: OpsEvent = {
    id: `ops_${crypto.randomUUID()}`,
    Kind: kind,
    Message: message,
    Detail: detail == null ? undefined : String(detail instanceof Error ? detail.message : detail).slice(0, 500),
    At: new Date().toISOString(),
  };
  // Fire-and-forget; RLS quietly drops it for signed-out sessions.
  void supabase
    .from("ops_events")
    .insert({ id: doc.id, data: doc })
    .then(({ error }) => {
      if (error) console.warn("[ops] event not logged:", error.message);
    });
}
