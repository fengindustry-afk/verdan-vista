-- ============================================================================
-- Create the edit_history table backing the app-wide immutable edit log.
-- Every create / update / delete made through the app's mutation hooks appends
-- one row here with a field-level before→after diff (see src/lib/history.ts).
--
-- Document-store shape (id text, data jsonb, updated_at) like every other
-- collection. Crucially this log is APPEND-ONLY: authenticated users may INSERT
-- and SELECT, but there is intentionally NO update or delete policy, so once a
-- history row is written it can never be altered or removed by a client. That
-- database-level immutability is what makes the log trustworthy — the UI simply
-- never offers an edit/delete affordance.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

create table if not exists public.edit_history (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.edit_history enable row level security;
alter table public.edit_history force row level security;

-- The shared schema recreates a permissive anon_all policy on every table; drop
-- it so RLS actually applies (same gotcha handled in security/rls.sql).
drop policy if exists anon_all on public.edit_history;

-- Any authenticated user can read the log.
drop policy if exists edit_history_select on public.edit_history;
create policy edit_history_select on public.edit_history
  for select to authenticated using (true);

-- Any authenticated user can append (writers are already whoever made the edit).
drop policy if exists edit_history_insert on public.edit_history;
create policy edit_history_insert on public.edit_history
  for insert to authenticated with check (true);

-- No UPDATE and no DELETE policy on purpose: the log is immutable. (Dropping any
-- previously-created ones keeps re-runs clean.)
drop policy if exists edit_history_update on public.edit_history;
drop policy if exists edit_history_delete on public.edit_history;

commit;
