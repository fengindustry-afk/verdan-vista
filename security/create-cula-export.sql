-- CULA export log: high-water mark + last delivery status for the CULA interface.
-- Document-store shape, matching the rest of the schema (id text PK, data jsonb, updated_at).
-- Writes are service-role only (via api/crons/cula-export.js); authenticated users may
-- read the latest export status. No client write policy — same posture as create-sensor-ingestion.sql.

create table if not exists public.cula_export_log (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Optional: an index over the high-water mark for window queries.
create index if not exists cula_export_log_last_export_at
  on public.cula_export_log ((data ->> 'lastExportAt'));

alter table public.cula_export_log enable row level security;

-- Read for authenticated users only.
create policy "cula_export_log_select_auth"
  on public.cula_export_log for select
  using (auth.role() = 'authenticated');

-- No insert/update/delete policies: writes flow through the service-role serverless
-- function only (api/crons/cula-export.js), which bypasses RLS. Do not add client
-- write policies here.
