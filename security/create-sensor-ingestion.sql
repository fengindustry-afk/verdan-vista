-- ============================================================================
-- dMRV sensor ingestion (Backlog task A3) — device registry + reading store.
--
-- Two document-store tables mirroring the app convention (id text, data jsonb,
-- updated_at). Field devices NEVER write to these tables directly; they POST
-- signed payloads to /api/ingest/sensor, which validates + verifies the HMAC and
-- writes with the Supabase SERVICE ROLE (which bypasses RLS). That is the whole
-- point of the design: the ingest endpoint is the single, authenticated,
-- tamper-checked write path, so a stolen device key can't rewrite history and a
-- browser session can't forge readings.
--
-- Records satisfy Puro Biochar Methodology Edition 2025 rule 9.3.4: time-stamped,
-- quantitative, retained ≥2 years past the crediting period. Do NOT add a client
-- delete policy — retention is enforced by the absence of one.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

-- ── Device registry ────────────────────────────────────────────────────────
-- One row per registered field device/gateway. `data` holds ONLY non-secret
-- metadata: Name, Stage, LastSeq (highest accepted seq, for replay checks),
-- Active (bool), RegisteredAt, LastSeenAt.
-- The device's shared HMAC secret is NOT stored here — the sensor_devices SELECT
-- policy below exposes `data` to every authenticated user, so a secret in this
-- table would leak. Secrets live server-side only, in the ingest endpoint's
-- SENSOR_DEVICE_SECRETS env var (a JSON map deviceId -> hex secret).
create table if not exists public.sensor_devices (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sensor_devices enable row level security;
alter table public.sensor_devices force row level security;

-- Authenticated app users may READ the registry (dashboards, device health).
-- No insert/update/delete policies: only Manager/Admin should register devices,
-- and that is done out-of-band (SQL editor / admin tool) or via the service role.
drop policy if exists sensor_devices_select on public.sensor_devices;
create policy sensor_devices_select on public.sensor_devices
  for select to authenticated using (true);

-- ── Reading store ──────────────────────────────────────────────────────────
-- One row per accepted reading. id = '{deviceId}:{seq}' so a retried POST is
-- idempotent (upsert can't duplicate a reading). `data` is the SensorReading
-- shape from src/lib/sensors.ts (PascalCase jsonb).
create table if not exists public.sensor_readings (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sensor_readings enable row level security;
alter table public.sensor_readings force row level security;

-- Authenticated app users may READ readings (dashboards, MRV reports).
-- Deliberately NO insert/update/delete policies for the anon/authenticated
-- roles: the service-role ingest endpoint is the only write path, and the
-- absence of a delete policy enforces the 2-year retention requirement.
drop policy if exists sensor_readings_select on public.sensor_readings;
create policy sensor_readings_select on public.sensor_readings
  for select to authenticated using (true);

-- Helpful index for time-series queries by device (jsonb expression index).
create index if not exists sensor_readings_device_idx
  on public.sensor_readings ((data->>'DeviceId'), (data->>'ReadingAt'));

commit;

-- ── Example device registration (run manually, replace the values) ──────────
-- 1. Generate a secret:  openssl rand -hex 32
-- 2. Add it to the ingest endpoint's env (Vercel → Project → Settings → Env):
--      SENSOR_DEVICE_SECRETS = {"pyro-reactor-01":"<hex-secret>"}
-- 3. Register the (non-secret) device metadata row:
--
-- insert into public.sensor_devices (id, data) values (
--   'pyro-reactor-01',
--   jsonb_build_object(
--     'Name', 'Pyrolysis Reactor 1 gateway',
--     'Stage', 'pyrolysis',
--     'LastSeq', 0,
--     'Active', true,
--     'RegisteredAt', now()
--   )
-- ) on conflict (id) do update set data = excluded.data;
