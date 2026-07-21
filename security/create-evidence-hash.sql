-- ============================================================================
-- Evidence hash — block double-counting at the database.
--
-- Scans and receipts carry a SHA-256 of their stored image (src/lib/hash.ts).
-- A partial unique index makes the same image impossible to file twice: the
-- same tree photographed once and claimed under two tree ids, or a receipt
-- submitted twice, is rejected by the DB rather than caught by review.
--
-- Double counting is the integrity failure carbon registries actually police,
-- so this is the constraint worth having enforced rather than merely intended.
--
-- Partial (WHERE ... IS NOT NULL) so the rows written before hashing existed
-- are unaffected — many rows with no hash are not "duplicates" of each other.
--
-- Run in the Supabase SQL editor. Idempotent, and safe on live data: it only
-- fails if genuine duplicates already exist, which the check below reveals
-- first. Nothing is deleted either way.
-- ============================================================================


-- ── STEP 1 — are there duplicates already? Read-only. Run this first. ───────
-- Any row here must be resolved by hand before STEP 2 can succeed: decide
-- which record is the real one and delete or re-capture the other.

select 'scans' as tbl, data->>'Sha256' as sha256, count(*) as copies,
       string_agg(id, ', ' order by id) as row_ids
from public.scans
where data->>'Sha256' is not null
group by data->>'Sha256'
having count(*) > 1
union all
select 'receipts', data->>'Sha256', count(*), string_agg(id, ', ' order by id)
from public.receipts
where data->>'Sha256' is not null
group by data->>'Sha256'
having count(*) > 1
union all
select 'geotagged_photos', data->>'Sha256', count(*), string_agg(id, ', ' order by id)
from public.geotagged_photos
where data->>'Sha256' is not null
group by data->>'Sha256'
having count(*) > 1;


-- ── STEP 2 — enforce it. Run once STEP 1 returns nothing. ──────────────────

create unique index if not exists scans_sha256_unique
  on public.scans ((data->>'Sha256'))
  where data->>'Sha256' is not null;

create unique index if not exists receipts_sha256_unique
  on public.receipts ((data->>'Sha256'))
  where data->>'Sha256' is not null;

-- Photo evidence (carbon-sink images captured without an AI scan) is claimed
-- the same way and double-counted the same way, so it gets the same guard.
create unique index if not exists geotagged_photos_sha256_unique
  on public.geotagged_photos ((data->>'Sha256'))
  where data->>'Sha256' is not null;

-- Lookup path for "which record does this image belong to", and for the
-- integrity re-check that re-hashes stored objects and compares.
create index if not exists edit_history_evidence
  on public.edit_history ((data->>'Evidence'))
  where data->>'Evidence' is not null;


-- ── STEP 3 — verify. ───────────────────────────────────────────────────────
--
-- select indexname from pg_indexes
-- where indexname in ('scans_sha256_unique', 'receipts_sha256_unique',
--                     'edit_history_evidence');
--
-- Tamper check for one record — the hash on the row must still match the
-- append-only log's copy from when it was written:
--
-- select s.id,
--        s.data->>'Sha256'                     as hash_on_record,
--        h.data->>'Evidence'                   as hash_in_audit_log,
--        (s.data->>'Sha256') = (h.data->>'Evidence') as intact
-- from public.scans s
-- join public.edit_history h
--   on h.data->>'DocumentId' = s.id
--  and h.data->>'Action' = 'create'
-- where s.data->>'Sha256' is not null;
