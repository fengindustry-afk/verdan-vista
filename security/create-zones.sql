-- ============================================================================
-- zones (2026-07-24): admin-managed zone labels for Work Process location
-- fields. Document-store shape like every other collection. Standard policy
-- set: any authenticated user reads; Operator/Manager/Admin write; Manager/
-- Admin delete (the "Manage zones" UI is gated to Admins on top of this).
-- Run after security/rls.sql. Safe to re-run. rls.sql now lists 'zones' in its
-- generic loop, so a fresh install gets the policies automatically — this file
-- only needs running on a project provisioned before zones existed.
-- ============================================================================
begin;

create table if not exists public.zones (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.zones enable row level security;
alter table public.zones force row level security;
drop policy if exists anon_all on public.zones;

drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones for select to authenticated using (true);

drop policy if exists zones_insert on public.zones;
create policy zones_insert on public.zones for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists zones_update on public.zones;
create policy zones_update on public.zones for update to authenticated
  using (public.has_role('Operator','Manager','Admin'))
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists zones_delete on public.zones;
create policy zones_delete on public.zones for delete to authenticated
  using (public.has_role('Manager','Admin'));

commit;
