#!/usr/bin/env node
/**
 * Verdant Vista data backup.
 *
 * Exports every Verdant Vista table from the shared Supabase project via the
 * REST API (service key bypasses RLS), writes one gzipped JSON snapshot, and
 * optionally uploads it to Cloudflare R2 under the "verdant-vista/" prefix so
 * this project's backups stay separate from other apps sharing the bucket.
 *
 * Usage:
 *   node scripts/backup-supabase.mjs [--to-r2]
 *
 * Env:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY
 *   For --to-r2: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_BUCKET_NAME
 *
 * Restore: see docs/RESTORE.md
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
const TO_R2 = process.argv.includes("--to-r2");
const BACKUP_DIR = path.join(__dirname, "../backups");
const R2_PREFIX = "verdant-vista"; // keeps this project's backups separate in the shared bucket

// Verdant Vista tables (mirrors src/lib/collections.ts + server-side logs)
const TABLES = [
  "feedstock_sourcing", "asset_locations", "geotagged_photos",
  "esa_biomass_data", "esa_biomass_cache", "ground_truth_biomass", "fused_biomass",
  "users", "groups", "trees", "readings", "soil_samples", "scans", "labels",
  "plot_observations", "plot_applications", "plot_comparisons",
  "cost_entries", "cost_budgets", "cost_categories",
  "work_process_entries", "edit_history", "receipts",
  "sensor_devices", "sensor_readings", "readiness_status",
  "api_keys", "ops_events", "ai_usage_log",
];

const PAGE = 1000;

async function fetchTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id&limit=${PAGE}&offset=${offset}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (res.status === 404) return null; // table not provisioned in this DB
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function uploadToR2(filePath) {
  const { CLOUDFLARE_ACCOUNT_ID: acct, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_BUCKET_NAME: bucket } = env;
  if (!acct || !token || !bucket) throw new Error("R2 credentials missing");
  const key = `${R2_PREFIX}/${path.basename(filePath)}`;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${bucket}/objects/${key}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: fs.readFileSync(filePath) }
  );
  if (!res.ok) throw new Error(`R2 upload failed: HTTP ${res.status} ${await res.text()}`);
  console.log(`☁️  Uploaded to R2: ${key}`);
}

async function backup() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const snapshot = { project: "verdant-vista", exportedAt: new Date().toISOString(), tables: {} };
  const failures = [];

  for (const table of TABLES) {
    try {
      const rows = await fetchTable(table);
      if (rows === null) { console.warn(`⚠️  ${table}: not found, skipped`); continue; }
      snapshot.tables[table] = rows;
      console.log(`✅ ${table}: ${rows.length} rows`);
    } catch (e) {
      failures.push(table);
      console.error(`❌ ${e.message}`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `backup-${timestamp}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(snapshot)));
  const totalRows = Object.values(snapshot.tables).reduce((n, r) => n + r.length, 0);
  console.log(`\n📁 ${file} (${totalRows} rows, ${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);

  if (TO_R2) await uploadToR2(file);

  // Keep last 7 local backups
  fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-")).sort().reverse().slice(7)
    .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));

  if (failures.length) {
    console.error(`\n❌ Backup incomplete — failed tables: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\n✅ Backup complete");
}

backup();
