/**
 * Manual CULA export fallback (air-gap / import-clearing-house cases).
 *
 * GET /api/cula/manual-export?format=json|csv
 * Gated by the shared cron guard in dev; in production requires the
 * X-Cula-Key header matching CULA_MANUAL_KEY (falls back to the cron guard so
 * a scheduled caller can still use it).
 *
 * Returns clean, mapped records as JSON or CSV (reused by the SPA button).
 */

import { isCronRequest } from "../crons/_shared.js";
import { createClientFromEnv, buildRecords, extract, toCsv } from "./clean.js";

export default async function handler(req, res) {
  const key = req.headers?.["x-cula-key"];
  const authorized =
    isCronRequest(req) ||
    (process.env.CULA_MANUAL_KEY && key === process.env.CULA_MANUAL_KEY);
  if (!authorized) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const client = createClientFromEnv();
    const { batches, entriesByBatch } = await extract(client);
    const { records, batchesWithoutRecords } = buildRecords(batches, entriesByBatch);

    const format = req.query?.format === "csv" ? "csv" : "json";
    if (format === "csv") {
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", "attachment; filename=cula-export.csv");
      return res.status(200).send(toCsv(records));
    }
    return res.status(200).json({ recordCount: records.length, batchesWithoutRecords, records });
  } catch (e) {
    return res.status(500).json({ error: "CULA export failed", message: e.message });
  }
}
