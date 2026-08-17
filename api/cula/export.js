/**
 * Admin-triggered CULA export: accepts the (possibly admin-adjusted) clean
 * records from the CulaAdmin UI and delivers them to the CULA webhook.
 *
 * POST /api/cula/export
 * Body: { records: CulaRecord[], exportedAt?: string }
 * Gated by X-Cula-Key == CULA_MANUAL_KEY (or the cron guard).
 */

import { isCronRequest } from "../crons/_shared.js";
import { createClientFromEnv, deliver } from "./clean.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = req.headers?.["x-cula-key"];
  const authorized =
    isCronRequest(req) ||
    (process.env.CULA_MANUAL_KEY && key === process.env.CULA_MANUAL_KEY);
  if (!authorized) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = process.env.CULA_WEBHOOK_URL;
  if (!url) {
    return res.status(400).json({ error: "CULA_WEBHOOK_URL not configured" });
  }

  try {
    const body = req.body ?? {};
    const records = body.records;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: "records must be an array" });
    }

    const client = createClientFromEnv();
    const exportedAt = body.exportedAt ?? new Date().toISOString();
    const payload = {
      exportedAt,
      recordCount: records.length,
      records,
      source: "admin-ui",
    };

    const result = await deliver(payload, url, process.env.CULA_WEBHOOK_SECRET);
    if (!result.ok) {
      return res.status(502).json({ error: "CULA delivery failed", status: result.status });
    }

    await client.from("cula_export_log").upsert({
      id: "latest",
      data: {
        lastExportAt: new Date().toISOString(),
        recordCount: records.length,
        status: "ok",
        deliveredAt: new Date().toISOString(),
        source: "admin-ui",
        errors: [],
      },
      updated_at: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, records: records.length, deliveredAt: exportedAt });
  } catch (e) {
    return res.status(500).json({ error: "CULA export failed", message: e.message });
  }
}
