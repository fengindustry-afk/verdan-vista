/**
 * Loop 4 reaction: fire-and-forget alert notification on a SUSPECT sensor event.
 *
 * Triggered by api/ingest/sensor.js after a reading is stored with quality SUSPECT.
 * Best-effort by design: the ingest write path must never depend on the reaction.
 * When no webhook URL is configured this is a no-op, so the feature is safe to
 * deploy before any alert channel exists. Env: SENSOR_ALERT_WEBHOOK_URL (optional).
 */

/**
 * Build the payload sent to the alert webhook. Exported for tests.
 */
export function buildNotifyPayload(summary) {
  return {
    kind: "sensor_suspect_alert",
    device_id: summary.device_id,
    metric: summary.metric,
    value: summary.value,
    seq: summary.seq,
    received_at: summary.received_at,
    message: `SUSPECT reading on ${summary.device_id} / ${summary.metric}: value ${summary.value} out of range (seq ${summary.seq})`,
    occurred_at: new Date().toISOString(),
  };
}

/**
 * POST a suspect alert to the configured webhook. Never throws.
 * @param {object} summary — {device_id, metric, value, seq, received_at}
 * @param {string|null} webhookUrl — from env SENSOR_ALERT_WEBHOOK_URL
 * @param {Function} [fetchImpl] — injectable fetch for tests (defaults to global fetch)
 * @returns {Promise<number|null>} HTTP status, or null if no webhook / failure
 */
export async function notify(summary, webhookUrl, fetchImpl = globalThis.fetch) {
  if (!webhookUrl) return null;
  const payload = buildNotifyPayload(summary);
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.status;
  } catch {
    // Reaction is best-effort; a failure here must never break ingest.
    return null;
  }
}
