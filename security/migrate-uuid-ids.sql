-- Migrate legacy timestamp-based record ids to UUIDs.
--
-- The app used to mint ids as `prefix_<base36 millisecond timestamp>`, which
-- collides whenever two records are created in the same millisecond (likely on
-- bulk entry, and across devices writing offline). New records now use
-- `prefix_<uuid>`; this backfills the rows written before that change.
--
-- Only the six internal collections are migrated. Human-readable ids that show
-- up in the UI (TREE-, FS-, LOC-, PHOTO-) are deliberately left alone.
--
-- Two things reference these ids by value and are remapped in the same
-- transaction:
--   * edit_history.data->>'DocumentId' — the audit trail's link to the record.
--   * cost_entries.data->>'ReceiptId'  — an expense's link to its receipt.
-- Receipt image paths (data->>'ImageUrl') store the storage path, not the row
-- id, so renaming a receipt row does not orphan its uploaded file.
--
-- Idempotent: rows whose id already carries a UUID suffix are skipped, so
-- re-running is a no-op. Run once against the Supabase SQL editor.

begin;

-- id -> new id for every legacy row across the migrated collections.
create temporary table uuid_id_map on commit drop as
with legacy as (
  select 'plot_applications' as tbl, 'app_'  as prefix, id from plot_applications
  union all select 'soil_samples',     'soil_', id from soil_samples
  union all select 'readings',         'read_', id from readings
  union all select 'plot_observations','obs_',  id from plot_observations
  union all select 'scans',            'scan_', id from scans
  union all select 'receipts',         'rcpt_', id from receipts
)
select tbl, id as old_id, prefix || gen_random_uuid()::text as new_id
from legacy
where id like prefix || '%'
  -- Already migrated? A UUID suffix is 36 chars of hex and dashes.
  and substring(id from length(prefix) + 1) !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Referencing rows must be remapped before the targets move, since these are
-- jsonb values rather than real foreign keys (nothing cascades on its own).
update edit_history h
set data = jsonb_set(h.data, '{DocumentId}', to_jsonb(m.new_id))
from uuid_id_map m
where h.data->>'DocumentId' = m.old_id
  and h.data->>'Collection' = m.tbl;

update cost_entries c
set data = jsonb_set(c.data, '{ReceiptId}', to_jsonb(m.new_id))
from uuid_id_map m
where c.data->>'ReceiptId' = m.old_id
  and m.tbl = 'receipts';

update plot_applications t set id = m.new_id from uuid_id_map m where t.id = m.old_id and m.tbl = 'plot_applications';
update soil_samples      t set id = m.new_id from uuid_id_map m where t.id = m.old_id and m.tbl = 'soil_samples';
update readings          t set id = m.new_id from uuid_id_map m where t.id = m.old_id and m.tbl = 'readings';
update plot_observations t set id = m.new_id from uuid_id_map m where t.id = m.old_id and m.tbl = 'plot_observations';
update scans             t set id = m.new_id from uuid_id_map m where t.id = m.old_id and m.tbl = 'scans';
update receipts          t set id = m.new_id from uuid_id_map m where t.id = m.old_id and m.tbl = 'receipts';

-- Rows migrated per table. Check this before committing.
select tbl, count(*) as migrated from uuid_id_map group by tbl order by tbl;

commit;
