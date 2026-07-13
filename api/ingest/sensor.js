/**
 * dMRV sensor ingestion endpoint (Backlog task A3).
 *
 * POST /api/ingest/sensor
 * Body: a SensorPayload (see src/lib/sensors.ts) — one signed reading.
 *
 * This is the single, authenticated, tamper-checked write path into the
 * `sensor_readings` store. Field devices cannot write to Supabase directly (RLS
 * gives them no insert policy); they send an HMAC-signed payload here, and this
 * function — running server-side with the SERVICE ROLE key — validates it,
 * verifies the signature against the device's server-held secret, flags
 * out-of-range values, and upserts idempotently.
 *
 * Threat model (priority attack = data tampering that inflates carbon figures):
 *   - Forged reading from a random client → rejected: no valid device signature.
 *   - Replayed / re-ordered reading       → id is `{deviceId}:{seq}` (idempotent)
 *                                            and seq must exceed the device's
 *                                            LastSeq, so old values can't overwrite.
 *   - Out-of-range value (sensor spoof)   → stored but flagged SUSPECT + ReceivedAt
 *                                            recorded, so an auditor sees it.
 *   - Secret exposure via the app         → secrets live only in this function's
 *                                            env, never in the browser-readable DB.
 *
 * The parameter catalog below is a compact mirror of src/lib/sensors.ts
 * (PARAMETERS). Keep the two in sync — sensors.ts is the source of truth; this
 * copy exists only because the serverless bundle can't import the TS module.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY          (service role — bypasses RLS; server-only)
 *   SENSOR_DEVICE_SECRETS         JSON map: {"<deviceId>":"<hex-secret>", ...}
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Compact mirror of PARAMETERS in src/lib/sensors.ts: key -> {unit, min, max, stage}.
const PARAMS = {
  feedstock_intake_mass_kg: { unit: "kg", min: 0, max: 50000, stage: "feedstock" },
  feedstock_moisture_pct: { unit: "%", min: 0, max: 90, stage: "feedstock" },
  carbonization_temp_c: { unit: "°C", min: 0, max: 1200, stage: "pyrolysis" },
  reactor_residence_time_min: { unit: "min", min: 0, max: 240, stage: "pyrolysis" },
  biochar_output_mass_kg: { unit: "kg", min: 0, max: 20000, stage: "output" },
  biochar_moisture_pct: { unit: "%", min: 0, max: 80, stage: "output" },
  energy_consumed_kwh: { unit: "kWh", min: 0, max: 100000, stage: "energy" },
  energy_exported_kwh: { unit: "kWh", min: 0, max: 100000, stage: "energy" },
  flue_gas_temp_c: { unit: "°C", min: 0, max: 1000, stage: "environment" },
  flue_gas_o2_pct: { unit: "%", min: 0, max: 25, stage: "environment" },
};

// Mirror of canonicalSignString() in src/lib/sensors.ts — fixed field order.
function canonicalSignString(p) {
  return [p.deviceId, p.metric, p.value, p.unit, p.ts, p.seq].join("|");
}

// Constant-time hex-digest comparison (avoids leaking validity via timing).
function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function loadDeviceSecrets() {
  try {
    return JSON.parse(process.env.SENSOR_DEVICE_SECRETS || "{}");
  } catch {
    console.error("[ingest] SENSOR_DEVICE_SECRETS is not valid JSON");
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error("[ingest] missing SUPABASE_URL / SUPABASE_SERVICE_KEY");
    return res.status(500).json({ error: "ingestion not configured" });
  }

  // Vercel parses JSON bodies automatically; tolerate a raw string too.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "body is not valid JSON" });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "missing JSON body" });
  }

  // ── Structural + plausibility validation (mirrors validatePayload) ─────────
  const { deviceId, metric, value, unit, ts, seq, batchId } = body;
  if (typeof deviceId !== "string" || !deviceId) return res.status(400).json({ error: "deviceId required" });
  const spec = PARAMS[metric];
  if (!spec) return res.status(400).json({ error: `unknown metric "${metric}"` });
  if (typeof value !== "number" || !Number.isFinite(value)) return res.status(400).json({ error: "value must be a finite number" });
  if (unit !== spec.unit) return res.status(400).json({ error: `unit "${unit}" != expected "${spec.unit}"` });
  if (typeof ts !== "string" || Number.isNaN(Date.parse(ts))) return res.status(400).json({ error: "ts must be ISO-8601" });
  if (!Number.isInteger(seq) || seq < 0) return res.status(400).json({ error: "seq must be a non-negative integer" });

  // ── Device auth: HMAC-SHA256 over the canonical string ─────────────────────
  const secrets = loadDeviceSecrets();
  const secret = secrets[deviceId];
  if (!secret) return res.status(401).json({ error: "unknown or unregistered device" });

  const expected = crypto
    .createHmac("sha256", secret)
    .update(canonicalSignString({ deviceId, metric, value, unit, ts, seq }))
    .digest("hex");
  if (!timingSafeEqualHex(expected, body.sig)) {
    return res.status(401).json({ error: "invalid signature" });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ── Replay / re-order guard: seq must advance past the device's LastSeq ────
  const { data: deviceRow } = await supabase
    .from("sensor_devices")
    .select("data")
    .eq("id", deviceId)
    .maybeSingle();

  if (deviceRow?.data && deviceRow.data.Active === false) {
    return res.status(403).json({ error: "device is deactivated" });
  }
  const lastSeq = Number(deviceRow?.data?.LastSeq ?? -1);
  if (seq <= lastSeq) {
    // Idempotent no-op for an exact resend; rejection for a stale/replayed seq.
    return res.status(409).json({ error: `seq ${seq} not newer than last accepted ${lastSeq}` });
  }

  // ── Store the reading (idempotent id) ──────────────────────────────────────
  const inRange = value >= spec.min && value <= spec.max;
  const quality = body.quality === "CALIBRATION" ? "CALIBRATION" : inRange ? "OK" : "SUSPECT";
  const id = `${deviceId}:${seq}`;
  const reading = {
    DeviceId: deviceId,
    Metric: metric,
    Value: value,
    Unit: unit,
    Stage: spec.stage,
    ReadingAt: ts,
    ReceivedAt: new Date().toISOString(),
    Seq: seq,
    ...(batchId ? { BatchId: String(batchId) } : {}),
    Quality: quality,
    SigValid: true,
  };

  const { error: insErr } = await supabase
    .from("sensor_readings")
    .upsert({ id, data: reading, updated_at: new Date().toISOString() });
  if (insErr) {
    console.error("[ingest] reading upsert failed:", insErr.message);
    return res.status(502).json({ error: "failed to store reading" });
  }

  // Best-effort: advance the device's LastSeq + LastSeenAt for the next replay check.
  const nextDeviceData = {
    ...(deviceRow?.data ?? { Active: true, RegisteredAt: new Date().toISOString() }),
    LastSeq: seq,
    LastSeenAt: new Date().toISOString(),
    Stage: spec.stage,
  };
  await supabase
    .from("sensor_devices")
    .upsert({ id: deviceId, data: nextDeviceData, updated_at: new Date().toISOString() });

  return res.status(202).json({ accepted: true, id, quality });
}
