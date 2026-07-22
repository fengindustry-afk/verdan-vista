-- ============================================================================
-- Backfill `source_batch_id` on the November 2024 work-process entries.
--
-- The Tigasfera workbook carried the feedstock lot ID forward in `batch_id` at
-- every stage, so downstream rows already name their input — just implicitly.
-- This makes that link explicit, which is what massBalance.ts reads to charge
-- draw-down against the batch that produced it.
--
-- Deliberately conservative: a row is only linked when its own `batch_id` is
-- an exact match for a Feedstock Collection batch. Nothing is inferred from
-- dates, zones or quantities. Rows whose lineage is genuinely ambiguous are
-- left untouched for a human to resolve (see the "left alone" note below).
--
-- Idempotent: skips rows that already carry a source_batch_id, so re-running
-- never overwrites an operator's correction.
--
-- NOTE: this writes straight to the table and therefore bypasses the app's
-- edit_history log. That is intentional for a one-off import repair, but it
-- means the Audit Trail will not show these 50 changes. Run it once, and make
-- corrections through the UI afterwards so they are recorded.
--
-- Run in the Supabase SQL editor, after security/create-work-process.sql.
-- ============================================================================

begin;

-- Preview first. Expect 50 rows: 20 isolation, 20 drying, 10 production_05.
select data->>'StageKey' as stage,
       data->'Values'->>'batch_id' as batch_id,
       count(*)
from public.work_process_entries e
where data->>'StageKey' <> 'receiving'
  and coalesce(data->'Values'->>'source_batch_id', '') = ''
  and data->'Values'->>'batch_id' ~ '^ZA-\d+-11-24$'
  and exists (
    select 1 from public.work_process_entries r
    where r.data->>'StageKey' = 'receiving'
      and r.data->'Values'->>'batch_id' = e.data->'Values'->>'batch_id'
  )
group by 1, 2
order by 1, 2;

update public.work_process_entries e
set data = jsonb_set(
      data,
      '{Values,source_batch_id}',
      to_jsonb(data->'Values'->>'batch_id')
    ),
    updated_at = now()
where data->>'StageKey' <> 'receiving'
  and coalesce(data->'Values'->>'source_batch_id', '') = ''
  and data->'Values'->>'batch_id' ~ '^ZA-\d+-11-24$'
  and exists (
    select 1 from public.work_process_entries r
    where r.data->>'StageKey' = 'receiving'
      and r.data->'Values'->>'batch_id' = e.data->'Values'->>'batch_id'
  );

commit;

-- ============================================================================
-- Left alone on purpose — these need someone who was there:
--
--   isolation ZA-01-11-18 … ZA-01-11-22 (5 rows, dated 2024-11-04 … 11-08)
--     No Feedstock Collection row carries these IDs, and the trailing number is
--     not the day, so the scheme is unknown. They fall between the ZA-01-11-24
--     (received 11-01) and ZA-02-11-24 (received 11-06) lots, which means a
--     date-window guess would split them arbitrarily across two batches.
--
--   Every ZA-*-11-25 and ZA-*-11-26 batch. Those are the 2025 and 2026
--     seasons, outside this backfill, and none has a receiving row yet.
--
-- To link them once the answer is known, edit the entry in the app so the
-- change lands in the Audit Trail rather than re-running SQL.
-- ============================================================================
