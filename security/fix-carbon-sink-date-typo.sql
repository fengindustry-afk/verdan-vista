-- ============================================================================
-- Fix a scrambled date in one carbon_sink entry.
--
-- The source workbook ("e. Work Process Data Collection.xlsx", sheet
-- 07_Carbon_Sink, row 14) has Usage Date typed as the text "27/72024" for
-- batch TIGGT-BT-2407-0002 — a typo for 27/7/2024 — and it was imported
-- verbatim into usage_date. Correcting it to "2024-07-27" (the app's date
-- field format) so the mass-balance timeline can place this shipment
-- correctly relative to production.
--
-- Verified this is the only entry with this value (see step 1). Run in the
-- Supabase SQL editor. This bypasses the app's edit_history, so the Audit
-- Trail will not record it — that's expected for a source-data correction
-- like this. Take a backup first if you want to be extra safe
-- (scripts/backup-supabase.mjs).
-- ============================================================================

begin;

-- ── 1. Confirm the row and its current value before touching anything. ─────
select id, data->'Values'->>'batch_id' as batch_id, data->'Values'->>'usage_date' as usage_date
from public.work_process_entries
where data->>'StageKey' = 'carbon_sink'
  and data->'Values'->>'batch_id' = 'TIGGT-BT-2407-0002'
  and data->'Values'->>'usage_date' = '27/72024';

-- ── 2. The fix. Uncomment only after step 1 shows exactly the one row. ─────
-- update public.work_process_entries
-- set data = jsonb_set(data, '{Values,usage_date}', '"2024-07-27"'::jsonb)
-- where data->>'StageKey' = 'carbon_sink'
--   and data->'Values'->>'batch_id' = 'TIGGT-BT-2407-0002'
--   and data->'Values'->>'usage_date' = '27/72024';

commit;
