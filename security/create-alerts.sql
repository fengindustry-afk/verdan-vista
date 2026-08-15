-- ============================================================================
-- alerts — durable "needs attention" surface for the automation loops.
--
-- Written by the Loop 3 crons (sensor-scan, reconcile-mrv) and seeded by the
-- Loop 4 reaction (notify). Dashboards / alert channels read this table. See
-- docs/automation-loops.md for the full model.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

-- One row per alert event. `kind` and `severity` are free-form but documented in
-- docs/automation-loops.md (sensor_suspect, mrv_reconcile_drift). `source` names
-- the producer (cron/sensor-scan, cron/reconcile-mrv, ingest/...).
create table if not exists public.alerts (
  id         uuid        primary key default gen_random_uuid(),
  kind       text        not null,
  severity   text        not null default 'medium',   -- info | medium | high
  source     text        not null,
  message    text        not null,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.alerts enable row level security;
alter table public.alerts force row level security;

-- Authenticated app users may read alerts (dashboards). Only the service role
-- (crons) writes; there is deliberately no insert/update/delete policy for
-- anon/authenticated roles so field devices and browser sessions can't forge or
-- clear alerts.
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select to authenticated using (true);

-- Keep queries by producer + recency fast.
create index if not exists alerts_source_idx on public.alerts (source, created_at desc);

commit;
