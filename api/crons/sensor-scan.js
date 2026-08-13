/**
 * Vercel Cron Function: Sensor SUSPECT Re-scan (Loop 3, time-based).
 *
 * Runs on a schedule (default every 6h) and re-scans `sensor_readings` for rows
 * flagged SUSPECT (out-of-range values caught at ingest) that are older than a
 * threshold, then writes a compact summary into the `alerts` table so the
 * dashboard has a durable "needs attention" surface. This is the check nobody
 * remembers to run at 2am.
 *
 * Endpoint: /api/crons/sensor-scan
 * Requires env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   SENSOR_SCAN_OLDER_HOURS (optional, default 6)
 *
 * The `collectSuspectSummaries` and `summarizeAlerts` helpers are exported for
 * testability; the handler wires them to Supabase + Vercel.
 */
import { isCronRequest, createCronClient } from "./_shared.js";

const DEFAULT_OLDER_HOURS = 6;

/**
 * Group SUSPECT readings by (device_id, metric), keeping the latest value and a
 * per-group count, for rows received more than `olderThanHours` ago.
 * Pure function over a fake client for tests; the client is a Supabase query builder.
 */
export async function collectSuspectSummaries(client, olderThanHours = DEFAULT_OLDER_HOURS) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const { data, error } = await client
    .from("sensor_readings")
    .select("*")
    .lt("received_at", cutoff)
    .eq("status", "SUSPECT")
    .order("received_at", { ascending: true });

  if (error) {
    throw new Error(`sensor-scan query failed: ${error.message}`);
  }
  if (!data || data.length === 0) return [];

  // Group by device+metric, keep the last (latest) value per group.
  const groups = new Map();
  for (const row of data) {
    const key = `${row.device_id}\u0000${row.metric}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.latest_value = row.value;
      existing.received_at = row.received_at;
    } else {
      groups.set(key, {
        device_id: row.device_id,
        metric: row.metric,
        latest_value: row.value,
        count: 1,
        received_at: row.received_at,
      });
    }
  }
  return [...groups.values()];
}

/** Turn grouped summaries into a single human-readable alert row for the alerts table. */
export function summarizeAlerts(summaries) {
  if (!summaries.length) return null;
  const lines = summaries.map(
    (s) => `${s.device_id} / ${s.metric}: latest=${s.latest_value} (${s.count} SUSPECT since cutoff)`
  );
  return {
    kind: "sensor_suspect",
    severity: "high",
    source: "cron/sensor-scan",
    message: lines.join("; "),
    created_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (!isCronRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const client = createCronClient();
    const olderHours = Number(process.env.SENSOR_SCAN_OLDER_HOURS) || DEFAULT_OLDER_HOURS;
    const summaries = await collectSuspectSummaries(client, olderHours);
    const alert = summarizeAlerts(summaries);

    if (!alert) {
      return res.status(200).json({ success: true, checked: true, alerts: 0 });
    }

    const { error } = await client.from("alerts").insert(alert);
    if (error) {
      return res.status(500).json({ error: "Failed to write alert", message: error.message });
    }
    return res.status(200).json({
      success: true,
      checked: true,
      alerts: summaries.length,
      alert,
    });
  } catch (e) {
    return res.status(500).json({ error: "Sensor scan failed", message: e.message });
  }
}
