-- ============================================================================
-- Create the readiness_status table for the Workflow "Production Readiness"
-- tracker (Operation Readiness · Ecosfera 3.0 Bukit Damar I-Care). One row per
-- activity: id = the activity Key from src/lib/readiness.ts. Document-store shape
-- (id text, data jsonb, updated_at) like every other collection, so the same
-- records are shared with the mobile/desktop app.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

create table if not exists public.readiness_status (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.readiness_status enable row level security;
alter table public.readiness_status force row level security;

drop policy if exists anon_all on public.readiness_status;

drop policy if exists readiness_status_select on public.readiness_status;
create policy readiness_status_select on public.readiness_status
  for select to authenticated using (true);

drop policy if exists readiness_status_insert on public.readiness_status;
create policy readiness_status_insert on public.readiness_status
  for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists readiness_status_update on public.readiness_status;
create policy readiness_status_update on public.readiness_status
  for update to authenticated
  using (public.has_role('Operator','Manager','Admin'))
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists readiness_status_delete on public.readiness_status;
create policy readiness_status_delete on public.readiness_status
  for delete to authenticated
  using (public.has_role('Manager','Admin'));

commit;
