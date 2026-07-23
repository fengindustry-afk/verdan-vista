-- ============================================================================
-- Ops events (2026-07-23): operational degradation log behind the admin
-- Notification Centre (bell in the header). The app writes an event when a
-- media upload falls back a storage tier (R2 → Supabase → base64), a signed
-- URL can't be produced, or AI analysis falls back to on-device — things that
-- work-but-degraded and would otherwise only reach the console.
--
-- data: { "Kind", "Message", "Detail"?, "At", "By"? }
--
-- Any signed-in user may append (they're the ones hitting the failure);
-- only Admins read/delete. No updates — it's a log.
-- Run AFTER security/rls.sql (needs public.has_role). Idempotent.
-- ============================================================================

begin;

create table if not exists public.ops_events (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ops_events enable row level security;
alter table public.ops_events force row level security;

drop policy if exists ops_events_select on public.ops_events;
create policy ops_events_select on public.ops_events
  for select to authenticated using (public.has_role('Admin'));

drop policy if exists ops_events_insert on public.ops_events;
create policy ops_events_insert on public.ops_events
  for insert to authenticated with check (true);

drop policy if exists ops_events_delete on public.ops_events;
create policy ops_events_delete on public.ops_events
  for delete to authenticated using (public.has_role('Admin'));

commit;
