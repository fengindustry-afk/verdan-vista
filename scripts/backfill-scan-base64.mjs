#!/usr/bin/env node
/**
 * Backfill inline base64 copies for legacy tree scans.
 *
 * Scans captured before the `keepDataUrl` change store only a storage object
 * path (`data.ImageUrl`) with no inline `data.ImageBase64`. Those rows render
 * ONLY when a signed URL can be produced and the object actually resolves — so a
 * transient auth hiccup or a missing object shows a blank tile with no fallback.
 *
 * This script downloads each such scan's object from the private `tree-scans`
 * bucket, re-encodes it as base64, and writes it back into the row's jsonb as
 * `ImageBase64`, giving every legacy scan the same offline/failure-proof fallback
 * new scans already carry (see src/components/StoredImage.tsx onError handling).
 *
 * Usage:
 *   node scripts/backfill-scan-base64.mjs [--dry-run] [--limit N]
 *
 * Requires (service-role — the bucket is private and rows are RLS-protected):
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY   (Dashboard → Project Settings → API → service_role)
 *
 * Safe to re-run: rows that already have a non-empty ImageBase64 are skipped, and
 * writes preserve every other field in the payload untouched.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── Minimal .env loader (no deps) — mirrors security/verify-posture.mjs ──────
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env — rely on process.env */
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const SCANS_TABLE = "scans";
const SCANS_BUCKET = "tree-scans";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing credentials. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY\n" +
      "(service_role key from Dashboard → Project Settings → API). The tree-scans bucket is\n" +
      "private and scan rows are RLS-protected, so the anon key cannot run this backfill."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** True when a scan already has a usable inline image or nothing to backfill from. */
function needsBackfill(data) {
  const hasInline = typeof data.ImageBase64 === "string" && data.ImageBase64.length > 0;
  const ref = data.ImageUrl;
  const hasStoragePath =
    typeof ref === "string" && ref.length > 0 && !ref.startsWith("data:") && !ref.startsWith("http");
  return !hasInline && hasStoragePath;
}

async function main() {
  console.log(`\n🌱 Backfilling scan base64 (${DRY_RUN ? "DRY RUN — no writes" : "LIVE"})\n`);

  const { data: rows, error } = await supabase
    .from(SCANS_TABLE)
    .select("id,data,updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error(`Failed to read "${SCANS_TABLE}":`, error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []).filter((r) => needsBackfill(r.data ?? {}));
  console.log(`${rows?.length ?? 0} scans total — ${candidates.length} need a base64 fallback.\n`);

  let filled = 0;
  let missing = 0;
  let failed = 0;
  let processed = 0;

  for (const row of candidates) {
    if (processed >= LIMIT) break;
    processed++;
    const path = row.data.ImageUrl;

    const { data: blob, error: dlErr } = await supabase.storage.from(SCANS_BUCKET).download(path);
    if (dlErr || !blob) {
      // Object referenced by the row isn't in the bucket (never uploaded, or a
      // path mismatch) — there's nothing to encode, so leave the row as-is.
      missing++;
      console.log(`  [skip] ${row.id} — object not found: ${SCANS_BUCKET}/${path}`);
      continue;
    }

    try {
      const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      if (DRY_RUN) {
        filled++;
        console.log(`  [would fill] ${row.id} — ${(base64.length / 1024).toFixed(0)} KB base64`);
        continue;
      }
      const { error: upErr } = await supabase
        .from(SCANS_TABLE)
        .update({
          data: { ...row.data, ImageBase64: base64 },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
      filled++;
      console.log(`  [filled] ${row.id} — ${(base64.length / 1024).toFixed(0)} KB base64`);
    } catch (e) {
      failed++;
      console.error(`  [fail] ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(
    `\nDone. ${filled} ${DRY_RUN ? "would be filled" : "filled"}, ` +
      `${missing} skipped (object missing), ${failed} failed.`
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Backfill crashed:", e);
  process.exit(1);
});
