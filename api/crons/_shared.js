/**
 * Shared guard for Vercel cron functions.
 *
 * Verifies the request actually came from Vercel's scheduler so an unauthenticated
 * caller can't trigger expensive scheduled work on demand. Mirrors the guard that
 * used to live inline in api/crons/backup.js; extracted here so every cron stays DRY.
 */

export function isCronRequest(req) {
  // For local testing, allow without auth
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  // In production, Vercel sets X-Vercel-Cron header / __vc_cron=true query param
  return (
    req.headers?.["x-vercel-cron"] === "true" ||
    req.query?.__vc_cron === "true" ||
    req.query?.vc_cron === "true"
  );
}

import { createClient } from "@supabase/supabase-js";

/** Create a Supabase client scoped for scheduled, read-heavy work. */
export function createCronClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}
