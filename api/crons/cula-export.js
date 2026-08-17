/**
 * Vercel Cron Function: export clean data to CULA.
 *
 * Runs the extract -> clean -> map -> deliver pipeline for the CULA MRV/registry
 * interface, records a watermark + a row in cula_export_log, and raises an
 * `alerts` row on failure (a failed push must never be silently green).
 *
 * Endpoint: /api/crons/cula-export
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, CULA_WEBHOOK_URL (optional: when
 * unset this is a dry-run that just records the payload size), CULA_WEBHOOK_SECRET.
 */

import { isCronRequest } from "./_shared.js";
import { createClientFromEnv, buildRecords, deliver, extract } from "../cula/clean.js";

export default async function handler(req, res) {
  if (!isCronRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const client = createClientFromEnv();
  try {
    const { batches, entriesByBatch } = await extract(client);
    const { records, batchesWithoutRecords } = buildRecords(batches, entriesByBatch);

    const url = process.env.CULA_WEBHOOK_URL;
    const secret = process.env.CULA_WEBHOOK_SECRET;
    let deliveredAt = null;
    let dryRun = false;

    if (!url) {
      dryRun = true; // no webhook configured — dry-run: log and stop
    } else {
      const payload = {
        exportedAt: new Date().toISOString(),
        recordCount: records.length,
        batchesWithoutRecords,
        records,
      };
      const result = await deliver(payload, url, secret);
      if (!result.ok) {
        throw new Error(`CULA delivery failed with HTTP ${result.status}`);
      }
      deliveredAt = new Date().toISOString();
    }

    const log = {
      lastExportAt: new Date().toISOString(),
      recordCount: records.length,
      batchesWithoutRecords,
      status: dryRun ? "dry_run" : "ok",
      dryRun,
      deliveredAt,
      errors: [],
    };
    const { error } = await client.from("cula_export_log").upsert({
      id: "latest",
      data: log,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`cula_export_log upsert failed: ${error.message}`);

    return res.status(200).json({ success: true, dryRun, records: records.length, deliveredAt });
  } catch (e) {
    const alert = {
      kind: "cula_export_failure",
      severity: "high",
      source: "cron/cula-export",
      message: e.message,
      created_at: new Date().toISOString(),
    };
    await client.from("alerts").insert(alert).then(() => {});
    return res.status(500).json({ error: "CULA export failed", message: e.message });
  }
}
