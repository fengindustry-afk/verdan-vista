# ADR-001 — dMRV Sensor Ingestion Layer

**Status:** Accepted (prototype against mocked data)
**Backlog task:** A3 — "Build sensor-ingestion layer against mocked data (payload schema, tables, API endpoints). Real IoT plugs in later; no redesign."
**Date:** 2026-07-13

## Context

The Puro.earth Biochar Methodology, Edition 2025 (v.2, Approved) requires an
information system that keeps **time-stamped, quantitative** records of all
monitoring activities, traceable to original evidence and retained for **≥2 years
past the crediting period** (rule 9.3.4). Two production parameters —
**carbonization temperature** and **reactor residence time** — must be recorded
at **1-minute intervals** (rule 3.5.38).

No plant hardware exists yet, so this layer is built and exercised entirely
against a mock stream. The design constraint is that swapping the mock generator
for a real gateway must require **zero schema or endpoint changes**.

## Decision

A single authenticated, tamper-checked write path:

```
field device ──HMAC-signed POST──▶ /api/ingest/sensor ──service role──▶ Supabase
   (mock or real)                    (validate + verify)                (sensor_readings)
                                                                              │
                                              authenticated read ◀────────────┘
                                                 (dashboards, MRV reports)
```

### Components

| Piece | File | Role |
|---|---|---|
| Parameter catalog + payload/reading types + validator | [src/lib/sensors.ts](../src/lib/sensors.ts) | Source of truth for monitored parameters, units, ranges, and the wire schema |
| Tables + RLS | [security/create-sensor-ingestion.sql](../security/create-sensor-ingestion.sql) | `sensor_devices` (metadata) and `sensor_readings` (document store) |
| Ingest endpoint | [api/ingest/sensor.js](../api/ingest/sensor.js) | Validates, verifies device HMAC, flags out-of-range, upserts idempotently |
| Mock stream | [scripts/mock-sensor-stream.mjs](../scripts/mock-sensor-stream.mjs) | Emits realistic signed readings for the whole pipeline |
| Tests | [src/lib/sensors.test.ts](../src/lib/sensors.test.ts) | Validator + canonical-signing coverage |

### Key design points

- **Devices never touch Supabase directly.** RLS grants no insert policy to the
  `authenticated`/`anon` roles on `sensor_readings`; only the service-role ingest
  endpoint writes. This makes the endpoint the single verifiable choke point.
- **Per-device HMAC-SHA256** over a fixed canonical string
  (`deviceId|metric|value|unit|ts|seq`). Secrets live only in the endpoint's
  `SENSOR_DEVICE_SECRETS` env var — never in the browser-readable DB.
- **Idempotent + replay-resistant.** Reading id is `{deviceId}:{seq}`; `seq` must
  advance past the device's stored `LastSeq`, so replayed or re-ordered readings
  can't overwrite history.
- **Out-of-range values are stored, not dropped**, but flagged `SUSPECT` with a
  server `ReceivedAt` — the priority dMRV attack is data that *inflates* carbon
  figures, so anomalies must be visible to an auditor, not silently accepted.
- **Retention by construction.** No client delete policy exists on
  `sensor_readings`, satisfying the 2-year retention rule.

## How real IoT plugs in later

The mock generator and a real LoRaWAN/cellular gateway are interchangeable: both
produce the same `SensorPayload` and sign it with the device secret. Choosing the
physical connectivity (backlog D2) and the gateway hardware (backlog E1) does not
change the schema, the endpoint, or the tables.

## Setup

1. Apply `security/rls.sql`, then `security/create-sensor-ingestion.sql` in the
   Supabase SQL editor.
2. Generate a device secret (`openssl rand -hex 32`) and set the endpoint env:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `SENSOR_DEVICE_SECRETS = {"pyro-reactor-01":"<hex-secret>"}`
3. Register the device metadata row (see the example at the bottom of the SQL).
4. Stream mock data:
   `node scripts/mock-sensor-stream.mjs --secret <hex-secret> --count 30`

## Consequences / follow-ups

- Dashboards (backlog B1/B2) can now read `sensor_readings` via the existing
  `Collections.sensorReadings` document-store accessor — no new data layer.
- **A4 correction flagged while sourcing this spec:** the app's `corcMetrics`
  currently uses a tiered permanence factor, but Edition 2025 rule 6.2.2 mandates
  `PF = M − a·(H/Corg)` with soil-temperature regression parameters (Table 6.1).
  That is a separate task (A4 re-verification), not part of A3.
- Lab-only parameters (Corg %, H/Corg) are intentionally **not** device-streamed;
  they enter via lab-result entry (rules 6.1.6 / 6.2.3).
