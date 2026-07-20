-- Migrate legacy timestamp-based record ids to UUIDs.
--
-- The app used to mint ids as `prefix_<base36 millisecond timestamp>`, which
-- collides whenever two records are created in the same millisecond (likely on
-- bulk entry, and across devices writing offline). New records now use
-- `prefix_<uuid>`; this backfills the rows written before that change.
--
-- Only the six internal collections are migrated. Human-readable ids that show
-- up in the UI (TREE-, FS-, LOC-, PHOTO-) are deliberately left alone, and so
-- are DELIBERATE ids: the seed files mint stable ones like
-- `soil_seed_esterra_ph` and `app_20260516_woodchips` so re-running a seed
-- updates in place. Renaming those would turn every re-seed into a duplicate
-- row, so only a base36-timestamp suffix qualifies as legacy (see IS_LEGACY).
--
-- Two things reference these ids by value and are remapped in the same
-- transaction:
--   * edit_history.data->>'DocumentId' — the audit trail's link to the record.
--   * cost_entries.data->>'ReceiptId'  — an expense's link to its receipt.
-- Uploaded media is unaffected: the storage path is stored on the row itself,
-- so a renamed row still resolves its file. The filename keeps the OLD id
-- (paths are minted as `<treeId>/<id>.jpg`), which is cosmetic but worth
-- knowing if you ever match files back to rows by name.
--
-- BEFORE RUNNING
--   1. Take a database snapshot (Dashboard -> Database -> Backups).
--   2. Run STEP 1 alone and read the counts. STEP 2 commits unconditionally.
--   3. Pick a quiet window. Any device that queued writes while offline still
--      holds pre-migration ids in localStorage ("offline_write_queue"), and
--      flushing them after this runs re-inserts a row under the old id. Ask
--      people to be online and reload once the migration is done.
--
-- Idempotent: rows already carrying a UUID suffix are skipped, so re-running is
-- a no-op. Run in the Supabase SQL editor.


-- ── STEP 1 — dry run. Safe, reads only. Run this on its own first. ──────────
-- What WOULD be migrated, per table. If a count looks wrong, stop here.

with legacy as (
  select 'plot_applications' as tbl, 'app_'  as prefix, id from plot_applications
  union all select 'soil_samples',     'soil_', id from soil_samples
  union all select 'readings',         'read_', id from readings
  union all select 'plot_observations','obs_',  id from plot_observations
  union all select 'scans',            'scan_', id from scans
  union all select 'receipts',         'rcpt_', id from receipts
)
select tbl, count(*) as to_migrate, min(id) as sample_id
from legacy
-- starts_with, not LIKE: every prefix ends in '_', which LIKE reads as a
-- single-character wildcard ('soil_%' would also match 'soilX...').
where starts_with(id, prefix)
  -- IS_LEGACY: a base36 millisecond timestamp, i.e. Date.now().toString(36) —
  -- 8 chars today, 9 from year 2059. Anything else (seeded, hand-written, or
  -- already a UUID) is deliberate and stays put.
  and substring(id from length(prefix) + 1) ~ '^[0-9a-z]{8,9}$'
group by tbl
order by tbl;


-- ── STEP 2 — the migration. Run only after STEP 1 looks right. ──────────────

begin;

-- The old -> new map is kept as a REAL table, not a temp one: it is the only
-- record of what this migration did, and the only way to trace or reverse it.
-- Drop it by hand once you are satisfied:  drop table uuid_id_map;
create table if not exists public.uuid_id_map (
  tbl        text        not null,
  old_id     text        not null,
  new_id     text        not null,
  migrated_at timestamptz not null default now(),
  primary key (tbl, old_id)
);
alter table public.uuid_id_map enable row level security;  -- no policies: service-role only

insert into public.uuid_id_map (tbl, old_id, new_id)
with legacy as (
  select 'plot_applications' as tbl, 'app_'  as prefix, id from plot_applications
  union all select 'soil_samples',     'soil_', id from soil_samples
  union all select 'readings',         'read_', id from readings
  union all select 'plot_observations','obs_',  id from plot_observations
  union all select 'scans',            'scan_', id from scans
  union all select 'receipts',         'rcpt_', id from receipts
)
select tbl, id, prefix || gen_random_uuid()::text
from legacy
where starts_with(id, prefix)
  and substring(id from length(prefix) + 1) ~ '^[0-9a-z]{8,9}$'
on conflict (tbl, old_id) do nothing;  -- a re-run maps nothing new

-- Only rows mapped by THIS run (earlier runs already moved their targets).
create temporary table pending on commit drop as
  select m.* from public.uuid_id_map m
  where exists (select 1 from plot_applications t where t.id = m.old_id and m.tbl = 'plot_applications')
     or exists (select 1 from soil_samples      t where t.id = m.old_id and m.tbl = 'soil_samples')
     or exists (select 1 from readings          t where t.id = m.old_id and m.tbl = 'readings')
     or exists (select 1 from plot_observations t where t.id = m.old_id and m.tbl = 'plot_observations')
     or exists (select 1 from scans             t where t.id = m.old_id and m.tbl = 'scans')
     or exists (select 1 from receipts          t where t.id = m.old_id and m.tbl = 'receipts');

-- Referencing rows must be remapped before the targets move, since these are
-- jsonb values rather than real foreign keys (nothing cascades on its own).
update edit_history h
set data = jsonb_set(h.data, '{DocumentId}', to_jsonb(m.new_id))
from pending m
where h.data->>'DocumentId' = m.old_id
  and h.data->>'Collection' = m.tbl;

update cost_entries c
set data = jsonb_set(c.data, '{ReceiptId}', to_jsonb(m.new_id))
from pending m
where c.data->>'ReceiptId' = m.old_id
  and m.tbl = 'receipts';

update plot_applications t set id = m.new_id from pending m where t.id = m.old_id and m.tbl = 'plot_applications';
update soil_samples      t set id = m.new_id from pending m where t.id = m.old_id and m.tbl = 'soil_samples';
update readings          t set id = m.new_id from pending m where t.id = m.old_id and m.tbl = 'readings';
update plot_observations t set id = m.new_id from pending m where t.id = m.old_id and m.tbl = 'plot_observations';
update scans             t set id = m.new_id from pending m where t.id = m.old_id and m.tbl = 'scans';
update receipts          t set id = m.new_id from pending m where t.id = m.old_id and m.tbl = 'receipts';

commit;


-- ── STEP 3 — verify. Should report zero legacy ids left. ────────────────────
--
-- with legacy as (
--   select 'plot_applications' as tbl, 'app_'  as prefix, id from plot_applications
--   union all select 'soil_samples',     'soil_', id from soil_samples
--   union all select 'readings',         'read_', id from readings
--   union all select 'plot_observations','obs_',  id from plot_observations
--   union all select 'scans',            'scan_', id from scans
--   union all select 'receipts',         'rcpt_', id from receipts
-- )
-- select count(*) as legacy_remaining from legacy
-- where starts_with(id, prefix)
--   and substring(id from length(prefix) + 1) ~ '^[0-9a-z]{8,9}$';
--
-- And what moved:  select tbl, count(*) from public.uuid_id_map group by tbl;
