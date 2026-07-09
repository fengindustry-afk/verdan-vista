-- ============================================================================
-- Receipts — digitised paper receipts retained 7 years for Malaysian (LHDN)
-- tax audit. Structured fields live in the document-store table below; the
-- compressed image (grayscale WebP) lives in the private `receipts` Storage
-- bucket, referenced by object path (row stores only the path + byte size, so
-- the DB stays lean at thousands of receipts/month).
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

create table if not exists public.receipts (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.receipts enable row level security;
alter table public.receipts force row level security;

drop policy if exists anon_all on public.receipts;

drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts
  for select to authenticated using (true);

drop policy if exists receipts_insert on public.receipts;
create policy receipts_insert on public.receipts
  for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists receipts_update on public.receipts;
create policy receipts_update on public.receipts
  for update to authenticated
  using (public.has_role('Operator','Manager','Admin'))
  with check (public.has_role('Operator','Manager','Admin'));

-- Tax records must survive their 7-year retention window: only Manager/Admin may
-- delete, and application code should block deletes before RetentionUntil.
drop policy if exists receipts_delete on public.receipts;
create policy receipts_delete on public.receipts
  for delete to authenticated
  using (public.has_role('Manager','Admin'));

-- ── Private Storage bucket for the receipt images ───────────────────────────
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "receipts read (authenticated)" on storage.objects;
create policy "receipts read (authenticated)" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

drop policy if exists "receipts insert (operator+)" on storage.objects;
create policy "receipts insert (operator+)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_role('Operator','Manager','Admin'));

drop policy if exists "receipts update (operator+)" on storage.objects;
create policy "receipts update (operator+)" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.has_role('Operator','Manager','Admin'))
  with check (bucket_id = 'receipts' and public.has_role('Operator','Manager','Admin'));

drop policy if exists "receipts delete (manager+)" on storage.objects;
create policy "receipts delete (manager+)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.has_role('Manager','Admin'));

commit;
