/**
 * On-demand CULA push (thin wrapper over the same pipeline as the cron).
 *
 * POST /api/cula/push  (gated by X-Cula-Key == CULA_MANUAL_KEY, or the cron guard)
 * Forces one extract -> clean -> deliver run now.
 */

import { isCronRequest } from "../crons/_shared.js";
import { createClientFromEnv, buildRecords, deliver, extract } from "./clean.js";

export default async function handler(req, res) {
  const key = req.headers?.["x-cula-key"];
  const authorized =
    isCronRequest(req) ||
    (process.env.CULA_MANUAL_KEY && key === process.env.CULA_MANUAL_KEY);
  if (!authorized) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = process.env.CULA_WEBHOOK_URL;
  const secret = process.env.CULA_WEBHOOK_SECRET;
  if (!url) {
    return res.status(400).json({ error: "CULA_WEBHOOK_URL not configured" });
  }

  try {
    const client = createClientFromEnv();
    const { batches, entriesByBatch } = await extract(client);
    const { records, batchesWithoutRecords } = buildRecords(batches, entriesByBatch);
    const payload = {
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      batchesWithoutRecords,
      records,
    };
    const result = await deliver(payload, url, secret);
    if (!result.ok) {
      return res.status(502).json({ error: "CULA delivery failed", status: result.status });
    }
    return res.status(200).json({ success: true, records: records.length, deliveredAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: "CULA push failed", message: e.message });
  }
}
