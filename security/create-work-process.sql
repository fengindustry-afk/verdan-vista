-- ============================================================================
-- Create the work_process_entries table for the Workflow "Work Process Data
-- Collection" feature (ported from the .NET carbon-tracker Workflow tab).
-- Document-store shape (id text, data jsonb, updated_at) like every other
-- collection, so the same records are shared with the mobile/desktop app.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()); load the historical
-- rows afterwards with security/seed-work-process.sql.
-- ============================================================================

begin;

create table if not exists public.work_process_entries (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.work_process_entries enable row level security;
alter table public.work_process_entries force row level security;

drop policy if exists anon_all on public.work_process_entries;

drop policy if exists work_process_entries_select on public.work_process_entries;
create policy work_process_entries_select on public.work_process_entries
  for select to authenticated using (true);

drop policy if exists work_process_entries_insert on public.work_process_entries;
create policy work_process_entries_insert on public.work_process_entries
  for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists work_process_entries_update on public.work_process_entries;
create policy work_process_entries_update on public.work_process_entries
  for update to authenticated
  using (public.has_role('Operator','Manager','Admin'))
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists work_process_entries_delete on public.work_process_entries;
create policy work_process_entries_delete on public.work_process_entries
  for delete to authenticated
  using (public.has_role('Manager','Admin'));

commit;
