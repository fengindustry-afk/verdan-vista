#!/usr/bin/env node
/**
 * Security posture verifier — actively probes the live surface and asserts the
 * controls are in place. Run after applying RLS / storage policies, and against
 * the deployed site to check headers.
 *
 *   node security/verify-posture.mjs
 *   node security/verify-posture.mjs --site https://your-app.vercel.app
 *
 * Reads Supabase creds from env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) or
 * a local .env. Exits non-zero if any check fails.
 */

import { readFileSync } from "node:fs";

// ── Minimal .env loader (no deps) ───────────────────────────────────────────
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
const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const siteArg = process.argv.indexOf("--site");
const SITE = siteArg > -1 ? process.argv[siteArg + 1] : null;

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  const tag = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
};

async function checkDataTier() {
  if (!URL_BASE || !ANON) {
    record("supabase creds present", false, "set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    return;
  }
  const rest = `${URL_BASE.replace(/\/$/, "")}/rest/v1`;
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };

  // Anon read: with RLS on, PostgREST returns 200 with an EMPTY array (rows are
  // filtered), OR 401/403. It's only "open" if rows actually come back.
  const read = await fetch(`${rest}/feedstock_sourcing?select=id&limit=1`, { headers });
  let readRows = [];
  if (read.status === 200) readRows = await read.json().catch(() => []);
  const readDenied = read.status === 401 || read.status === 403 ||
    (read.status === 200 && Array.isArray(readRows) && readRows.length === 0);
  record(
    "anon read denied (RLS on)",
    readDenied,
    `HTTP ${read.status}${readRows.length ? ` — DATA TIER OPEN (${readRows.length}+ rows)` : ""}`
  );

  // Anon write should be denied (401/403). 201 = open. If the probe DID write
  // (data tier still open), delete it immediately so we never leave test data.
  const probeId = `POSTURE-PROBE-${Date.now()}`;
  const write = await fetch(`${rest}/asset_locations`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ id: probeId, data: { probe: true } }),
  });
  if (write.status === 201) {
    await fetch(`${rest}/asset_locations?id=eq.${probeId}`, { method: "DELETE", headers }).catch(() => {});
  }
  record(
    "anon write denied (RLS on)",
    write.status === 401 || write.status === 403,
    `HTTP ${write.status}${write.status === 201 ? " — ANON CAN WRITE (probe cleaned up)" : ""}`
  );
}

async function checkStorage() {
  if (!URL_BASE || !ANON) return;
  const base = URL_BASE.replace(/\/$/, "");
  // Anon listing a private bucket should be denied (400 "not found" is also OK —
  // it means no anon-open bucket exists). A 200 with objects = anon-accessible.
  const res = await fetch(`${base}/storage/v1/object/list/tree-scans`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1 }),
  });
  let openList = false;
  if (res.status === 200) {
    const body = await res.json().catch(() => []);
    openList = Array.isArray(body) && body.length > 0;
  }
  record(
    "storage bucket not anon-listable",
    !openList,
    `HTTP ${res.status}${openList ? " — ANON CAN LIST OBJECTS" : ""}`
  );
}

async function checkHeaders() {
  if (!SITE) {
    console.log("  (skip header checks — pass --site <deployed-url> to enable)");
    return;
  }
  const res = await fetch(SITE, { redirect: "manual" });
  const required = {
    "content-security-policy": (v) => /default-src/.test(v),
    "strict-transport-security": (v) => /max-age=\d+/.test(v),
    "x-frame-options": (v) => /DENY/i.test(v),
    "x-content-type-options": (v) => /nosniff/i.test(v),
    "referrer-policy": (v) => v.length > 0,
    "permissions-policy": (v) => v.length > 0,
  };
  for (const [h, ok] of Object.entries(required)) {
    const val = res.headers.get(h);
    record(`header ${h}`, Boolean(val) && ok(val), val ? "" : "missing");
  }
}

console.log("\n🔐 CarbonTracker security posture\n");
console.log("Data tier:");
await checkDataTier();
console.log("Storage:");
await checkStorage();
console.log("Edge headers:");
await checkHeaders();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\x1b[31mPosture check FAILED.\x1b[0m Review the items above.");
  process.exit(1);
}
console.log("\x1b[32mAll posture checks passed.\x1b[0m");
