-- ============================================================================
-- CarbonTracker — Hardened Supabase Storage policies
-- ============================================================================
-- SUPERSEDES the insecure shared/supabase_storage.sql in the .NET repo, which
-- creates a PUBLIC bucket with anon insert/update/read (its own comment says
-- "tighten to authenticated before any public release"). That bucket does not
-- exist yet on this project — apply THIS instead so it's never opened.
--
-- Model (matches security/rls.sql): private bucket, authenticated-only. No anon
-- access. Reads for signed-in users; writes for Operator/Manager/Admin; deletes
-- for Manager/Admin. Evidence images (tree scans, geotagged photos) are integrity-
-- and location-sensitive, so they must never be world-readable or anon-writable.
--
-- Run in the Supabase SQL editor. Reuses public.has_role() from security/rls.sql,
-- so apply rls.sql first.
-- ============================================================================

begin;

-- ── Private buckets ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('tree-scans', 'tree-scans', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('geotagged-photos', 'geotagged-photos', false)
on conflict (id) do update set public = false;

-- Remove any legacy anon-open policies from the insecure setup.
drop policy if exists "tree-scans anon insert" on storage.objects;
drop policy if exists "tree-scans anon update" on storage.objects;
drop policy if exists "tree-scans anon read"   on storage.objects;

-- ── Authenticated, role-gated object policies ───────────────────────────────
-- SELECT: any authenticated user may read objects in these buckets.
drop policy if exists "evidence read (authenticated)" on storage.objects;
create policy "evidence read (authenticated)" on storage.objects
  for select to authenticated
  using (bucket_id in ('tree-scans', 'geotagged-photos'));

-- INSERT: Operator, Manager, Admin.
drop policy if exists "evidence insert (operator+)" on storage.objects;
create policy "evidence insert (operator+)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('tree-scans', 'geotagged-photos')
    and public.has_role('Operator', 'Manager', 'Admin')
  );

-- UPDATE (overwrite): Operator, Manager, Admin.
drop policy if exists "evidence update (operator+)" on storage.objects;
create policy "evidence update (operator+)" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('tree-scans', 'geotagged-photos')
    and public.has_role('Operator', 'Manager', 'Admin')
  )
  with check (
    bucket_id in ('tree-scans', 'geotagged-photos')
    and public.has_role('Operator', 'Manager', 'Admin')
  );

-- DELETE: Manager, Admin.
drop policy if exists "evidence delete (manager+)" on storage.objects;
create policy "evidence delete (manager+)" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('tree-scans', 'geotagged-photos')
    and public.has_role('Manager', 'Admin')
  );

commit;

-- ── Client impact ───────────────────────────────────────────────────────────
-- Buckets are now PRIVATE, so `.../object/public/<bucket>/<path>` URLs stop
-- working. Both clients must fetch images with a signed URL instead:
--
--   POST /storage/v1/object/sign/<bucket>/<path>   (Authorization: Bearer <jwt>)
--   → { signedURL }   (short-lived; regenerate on demand)
--
-- .NET: DONE — SupabaseStorageService now uploads with the user JWT and returns
-- the object path; CreateSignedUrlAsync + ResolveDisplayUrlAsync (legacy-aware)
-- added; TreeHealthService.ResolveScanImageUrlAsync + TreeDetailViewModel resolve
-- a signed URL before display. Build in the MAUI env to verify.
-- Web: use supabase.storage.from(bucket).createSignedUrl(path, ttl) when the web
-- app starts uploading images (it currently doesn't).
