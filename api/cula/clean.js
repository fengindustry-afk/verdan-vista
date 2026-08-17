/**
 * Reusable CULA export pipeline (no handler) — the server-side mirror of
 * src/lib/cula.ts. The serverless bundle can't import the TS module, so the
 * cleaning/mapping logic is mirrored here in compact JS (same pattern as
 * api/ingest/sensor.js mirrors sensors.ts and reconcile-mrv.js mirrors the
 * workbook basis). Keep src/lib/cula.ts as the source of truth.
 *
 * Flow: extract (Supabase) -> buildRecords (clean+map) -> sign + deliver (HTTP).
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const MASS_KG_FACTOR = 1000; // MT / t -> kg

export function createClientFromEnv() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

export function normBatch(s) {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function toIsoUtc(ts) {
  if (!ts) return null;
  const d = new Date(ts.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function leadingNumber(text) {
  if (text == null) return 0;
  const m = String(text).replace(/,/g, "").match(/^\s*-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// Compact mirror of STAGE_QUANTITY in src/lib/valueChain.ts.
const STAGE_QUANTITY = {
  collection: { keys: ["receiving"], field: "weight", unit: "kg" },
  delivery: { keys: ["receiving"], field: "weight", unit: "kg" },
  pre_processing: { keys: ["isolation"], field: "good_feedstock_quantity", unit: "kg" },
  conversion: { keys: ["production_05", "production_10"], field: "final_biochar_amount", unit: "kg" },
  application: { keys: ["application"], field: "quantity_applied", unit: "kg" },
  carbon_sink: { keys: ["carbon_sink"], field: "quantity", unit: "kg" },
  certification: { keys: ["certification"], field: "certified_corc", unit: "tco2e" },
};

/**
 * Build clean CULA records from feedstock rows + a batch->entries index.
 * @param {Array} batches — feedstock_sourcing rows ({data:{Title,Type}})
 * @param {Map<string,Array>} entriesByBatch — normBatch(Title) -> work_process rows
 * @returns {{records:Array, batchesWithoutRecords:number}}
 */
export function buildRecords(batches, entriesByBatch) {
  const records = [];
  let orphan = 0;
  for (const batch of batches) {
    const title = batch.data?.Title ?? "";
    const batchId = normBatch(title);
    const ents = entriesByBatch.get(batchId) ?? [];
    if (!ents.length) {
      orphan++;
      continue;
    }
    for (const [layer, spec] of Object.entries(STAGE_QUANTITY)) {
      let amount = 0;
      let ts = "";
      for (const e of ents) {
        const d = e.data ?? {};
        if (!spec.keys.includes(d.StageKey)) continue;
        amount += leadingNumber(d.Values?.[spec.field]);
        if ((d.Timestamp ?? "") > ts) ts = d.Timestamp ?? "";
      }
      if (amount <= 0) continue;
      const quantityKg = spec.unit === "kg" ? amount : undefined;
      const quantityTco2e = spec.unit === "tco2e" ? amount : undefined;
      records.push({
        culaId: `CT_${batchId}_${layer}`,
        batchId,
        feedstockType: batch.data?.Type,
        custodyStage: layer,
        stageKey: spec.keys[0],
        recordTimestamp: toIsoUtc(ts),
        quantityKg,
        quantityTco2e,
        provenance: { source: "carbon_tracker" },
        warnings: quantityKg != null && quantityTco2e != null ? ["DUAL_QUANTITY_UNITS"] : [],
        missing: [],
        assumptions: [],
      });
    }
  }
  return { records, batchesWithoutRecords: orphan };
}

export function toCsv(records) {
  const cols = [
    "culaId", "batchId", "feedstockType", "custodyStage", "stageKey",
    "recordTimestamp", "quantityKg", "quantityTco2e",
  ];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...records.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function signPayload(body, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

export async function deliver(payload, url, secret) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cula-signature": `sha256=${signPayload(payload, secret)}`,
    },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
}

/** Read feedstock + work-process and index entries by normalized batch id. */
export async function extract(client) {
  const [b, w] = await Promise.all([
    client.from("feedstock_sourcing").select("*"),
    client.from("work_process_entries").select("*"),
  ]);
  if (b.error) throw new Error(`feedstock read failed: ${b.error.message}`);
  if (w.error) throw new Error(`work-process read failed: ${w.error.message}`);

  const entriesByBatch = new Map();
  for (const e of w.data ?? []) {
    const v = e.data?.Values ?? {};
    const key = normBatch(v.batch_id ?? v.source_batch_id);
    if (!key) continue;
    if (!entriesByBatch.has(key)) entriesByBatch.set(key, []);
    entriesByBatch.get(key).push(e);
  }
  return { batches: b.data ?? [], entriesByBatch };
}
