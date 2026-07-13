/**
 * Mock sensor stream generator (Backlog task A3).
 *
 * Emits realistic, signed sensor payloads for a 150 TPD EFB → biochar pyrolysis
 * line and POSTs them to the ingest endpoint — so the whole pipeline (device →
 * endpoint → Supabase → dashboards) can be exercised before any real IoT exists.
 *
 * Usage:
 *   node scripts/mock-sensor-stream.mjs [--url <endpoint>] [--device <id>]
 *                                       [--secret <hex>] [--count <n>] [--interval <ms>]
 *
 * Env fallbacks: INGEST_URL, MOCK_DEVICE_ID, MOCK_DEVICE_SECRET.
 * Default endpoint: http://localhost:3000/api/ingest/sensor
 *
 * The secret here must match the one in the endpoint's SENSOR_DEVICE_SECRETS for
 * the same deviceId, or every reading is rejected with 401 (as it should be).
 */

import crypto from "crypto";

// Keep in sync with src/lib/sensors.ts PARAMETERS (unit is validated server-side).
const PROFILE = [
  { metric: "feedstock_intake_mass_kg", unit: "kg", base: 6250, jitter: 400 }, // ~150 TPD / 24h
  { metric: "feedstock_moisture_pct", unit: "%", base: 12, jitter: 3 },
  { metric: "carbonization_temp_c", unit: "°C", base: 550, jitter: 25 }, // EFB pyrolysis band
  { metric: "reactor_residence_time_min", unit: "min", base: 25, jitter: 4 },
  { metric: "biochar_output_mass_kg", unit: "kg", base: 1580, jitter: 120 }, // ~38 TPD / 24h
  { metric: "biochar_moisture_pct", unit: "%", base: 8, jitter: 2 },
  { metric: "energy_consumed_kwh", unit: "kWh", base: 210, jitter: 30 },
  { metric: "energy_exported_kwh", unit: "kWh", base: 480, jitter: 60 },
  { metric: "flue_gas_temp_c", unit: "°C", base: 320, jitter: 20 },
  { metric: "flue_gas_o2_pct", unit: "%", base: 7, jitter: 1.5 },
];

function canonicalSignString(p) {
  return [p.deviceId, p.metric, p.value, p.unit, p.ts, p.seq].join("|");
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const URL = arg("url", process.env.INGEST_URL || "http://localhost:3000/api/ingest/sensor");
const DEVICE = arg("device", process.env.MOCK_DEVICE_ID || "pyro-reactor-01");
const SECRET = arg("secret", process.env.MOCK_DEVICE_SECRET || "");
const COUNT = Number(arg("count", "20"));
const INTERVAL = Number(arg("interval", "1000"));

if (!SECRET) {
  console.error("No device secret. Pass --secret <hex> or set MOCK_DEVICE_SECRET.");
  console.error("Generate one with: openssl rand -hex 32  (and register it in SENSOR_DEVICE_SECRETS).");
  process.exit(1);
}

const round = (n) => Math.round(n * 100) / 100;

function makePayload(seq) {
  const p = PROFILE[seq % PROFILE.length];
  // Occasionally emit an out-of-range spike so the SUSPECT flagging is visible.
  const spike = Math.random() < 0.05;
  const value = round(p.base + (Math.random() * 2 - 1) * p.jitter + (spike ? p.base * 3 : 0));
  const ts = new Date().toISOString();
  const payload = { deviceId: DEVICE, metric: p.metric, value, unit: p.unit, ts, seq };
  payload.sig = crypto.createHmac("sha256", SECRET).update(canonicalSignString(payload)).digest("hex");
  return payload;
}

async function send(payload) {
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`seq=${payload.seq} ${payload.metric}=${payload.value}${payload.unit} → ${res.status} ${text}`);
  } catch (e) {
    console.error(`seq=${payload.seq} POST failed:`, e.message);
  }
}

console.log(`Streaming ${COUNT} readings from "${DEVICE}" to ${URL} every ${INTERVAL}ms…`);

// Start seq at the current epoch-seconds so re-runs always advance past LastSeq.
let seq = Math.floor(Date.now() / 1000);
for (let i = 0; i < COUNT; i++) {
  await send(makePayload(seq++));
  if (i < COUNT - 1) await new Promise((r) => setTimeout(r, INTERVAL));
}
console.log("Done.");
