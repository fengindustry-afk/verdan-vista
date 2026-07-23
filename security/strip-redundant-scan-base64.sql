-- ============================================================================
-- Strip redundant inline base64 from scans (2026-07-23).
--
-- Every scan row carried an ImageBase64 copy of its image; 24 of 35 rows also
-- have a stored object (ImageUrl → R2/Supabase Storage), making the inline
-- copy pure bloat: the scans table was 37 MB and getCollection("scans")
-- downloads the whole table on reload — the "app is very slow / data looks
-- gone" bug. Rows whose ONLY copy is the base64 (no ImageUrl) are untouched.
--
-- The stripped values are backed up first, so this is reversible:
--   update scans s set data = jsonb_set(s.data, '{ImageBase64}', to_jsonb(b.image_base64))
--     from scans_b64_backup b where b.id = s.id;
--
-- Run in the Supabase SQL editor or via `supabase db query --linked -f`.
-- Safe to re-run (the second pass finds nothing to strip).
-- ============================================================================

begin;

create table if not exists public.scans_b64_backup (
  id           text primary key,
  image_base64 text not null,
  backed_up_at timestamptz not null default now()
);

-- service/admin only; not part of the app schema
alter table public.scans_b64_backup enable row level security;

insert into public.scans_b64_backup (id, image_base64)
select id, data->>'ImageBase64'
  from public.scans
 where data ? 'ImageBase64'
   and coalesce(data->>'ImageUrl', '') <> ''
on conflict (id) do nothing;

update public.scans
   set data = data - 'ImageBase64'
 where data ? 'ImageBase64'
   and coalesce(data->>'ImageUrl', '') <> '';

commit;

-- Reclaim the freed pages afterwards, as its own statement (VACUUM cannot run
-- inside a transaction): vacuum full public.scans;
