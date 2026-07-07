-- ============================================================================
-- Create the geotagged_photos table (missing from the original .NET schema) and
-- secure it. The web app's "Capture Photo" feature writes here. Document-store
-- shape (id text, data jsonb, updated_at) like every other collection.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- ============================================================================

begin;

create table if not exists public.geotagged_photos (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Secure it the same way as the rest (see security/rls.sql): RLS on, no anon,
-- authenticated read, Operator+ write, Manager+ delete. Uses public.has_role()
-- created by rls.sql — apply rls.sql first.
alter table public.geotagged_photos enable row level security;
alter table public.geotagged_photos force row level security;

drop policy if exists anon_all on public.geotagged_photos;

drop policy if exists geotagged_photos_select on public.geotagged_photos;
create policy geotagged_photos_select on public.geotagged_photos
  for select to authenticated using (true);

drop policy if exists geotagged_photos_insert on public.geotagged_photos;
create policy geotagged_photos_insert on public.geotagged_photos
  for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists geotagged_photos_update on public.geotagged_photos;
create policy geotagged_photos_update on public.geotagged_photos
  for update to authenticated
  using (public.has_role('Operator','Manager','Admin'))
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists geotagged_photos_delete on public.geotagged_photos;
create policy geotagged_photos_delete on public.geotagged_photos
  for delete to authenticated
  using (public.has_role('Manager','Admin'));

commit;
