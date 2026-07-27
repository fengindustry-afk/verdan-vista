-- ============================================================================
-- Link carbon-sink shipments to the production batch that supplied them.
--
-- ‼️  THIS FILE IS A TEMPLATE. It intentionally ships with every mapping blank.
--     Do NOT guess. Fill each row from the cited Delivery Order / Invoice.
--
-- WHY THIS ISN'T GENERATED AUTOMATICALLY
--   Production batches use the ZA-* scheme; carbon-sink shipments use TIGGT-BT-*.
--   The two namespaces have ZERO overlap, and the source workbook contains no
--   column that maps one to the other. The workbook's own Dashboard sheet marks
--   8,998.5 kg as "Yet to identify" and leaves the Carbon Sink allocation rows
--   empty — the determination has not been made by anyone yet.
--
--   Deriving the link from date proximity would write invented provenance into
--   a chain of custody that backs CORC issuance. An auditor cannot tell a
--   derived link from a measured one once it is in this column. Don't.
--
-- ⚠️  EXTERNAL BIOCHAR — READ BEFORE FILLING
--   The workbook's "External biochar" sheet records 3,000 kg purchased from
--   AU Synergy on 2024-08-21, and the Dashboard shows 2,400 kg of it going to
--   Application. Biochar that was bought in has NO in-house production batch.
--   If a shipment drew on external stock, leave source_batch_id NULL and put
--   'external: AU Synergy 2024-08-21' in the remarks instead — do not invent a
--   ZA-* id for it. Externally sourced carbon generally cannot be credited the
--   same way as own production; confirm treatment with your verifier.
--
--   Shipments dated before 2024-11-04 (the first production record) cannot have
--   an in-house source at all. Those are marked PRE-PRODUCTION below.
--
-- HOW TO USE
--   1. Pull the Delivery Order / Invoice named in each row's comment.
--   2. Replace NULL with the ZA-* batch id it names, e.g. 'ZA-04-05-25'.
--   3. Delete any row you cannot substantiate — a blank link is honest;
--      a wrong one is not.
--   4. Run step 1 (preview), read it, then uncomment step 2.
--
-- Rows are keyed on (batch_id, usage_date) because TIGGT-BT-2512-0003 appears
-- twice with different dates and quantities.
--
-- NOTE: writes straight to the table, bypassing the app's edit_history, so the
-- Audit Trail will not record these. That is acceptable for a one-off import
-- repair; make later corrections through the UI so they are logged.
-- ============================================================================

begin;

create temp table sink_source_map (
  batch_id        text,
  usage_date      text,
  source_batch_id text   -- ← fill this in from the source document
) on commit drop;

insert into sink_source_map (batch_id, usage_date, source_batch_id) values
  -- ── PRE-PRODUCTION: dated before the first production record (2024-11-04). ──
  -- These cannot have an in-house source. Either external stock, or predating
  -- the record-keeping. Leave NULL unless a document proves otherwise.
  (''                  , '2023-09-17', NULL),  -- 50 kg    · DELIVERY ORDER & INVOICE · no batch id in source
  ('TIGGT-BT-2404-0001', '2024-04-21', NULL),  -- 50 kg    · DELIVERY ORDER
  ('TIGGT-BT-2405-0002', '2024-05-05', NULL),  -- 50 kg    · DELIVERY ORDER
  ('TIGGT-BT-2407-0001', '2024-07-05', NULL),  -- 100 kg   · DELIVERY ORDER
  ('TIGGT-BT-2407-0002', '2024-07-27', NULL),  -- 100 kg   · DELIVERY ORDER
  ('TIGGT-BT-2408-0002', '2024-08-03', NULL),  -- 25 kg    · DELIVERY ORDER

  -- ── Post-production: an in-house ZA-* batch should exist for these. ──
  ('TIGGT-BT-2502-0001', '2025-02-10', NULL),  -- 15 kg    · DELIVERY ORDER
  ('TIGGT-BT-2503-0001', '2025-03-31', NULL),  -- 18.75 kg · DELIVERY ORDER
  ('TIGGT-BT-2505-0001', '2025-05-17', NULL),  -- 100 kg   · Invoice
  ('TIGGT-BT-2505-0002', '2025-05-24', NULL),  -- 50 kg    · INVOICE
  ('TIGGT-BT-2506-0001', '2025-06-16', NULL),  -- 50 kg    · INVOICE
  ('TIGGT-BT-2507-0001', '2025-07-05', NULL),  -- 200 kg   · Invoice
  ('TIGGT-BT-2508-0001', '2025-08-15', NULL),  -- 20 kg    · DELIVERY ORDER
  ('TIGGT-BT-2508-0002', '2025-08-29', NULL),  -- 30 kg    · DELIVERY ORDER
  ('TIGGT-BT-2509-0001', '2025-09-27', NULL),  -- 50 kg    · INVOICE
  ('TIGGT-BT-2510-0001', '2025-10-08', NULL),  -- 100 kg   · DELIVERY ORDER
  ('TIGGT-BT-2512-0001', '2025-12-14', NULL),  -- 20 kg    · DELIVERY ORDER
  ('TIGGT-BT-2512-0002', '2025-12-16', NULL),  -- 130 kg   · INVOICE
  ('TIGGT-BT-2512-0003', '2025-12-22', NULL),  -- 20 kg    · DELIVERY ORDER
  ('TIGGT-BT-2512-0003', '2026-01-15', NULL),  -- 5 kg     · DELIVERY ORDER
  ('TIGGT-BT-2601-0002', '2026-01-24', NULL),  -- 6 kg     · DELIVERY ORDER
  ('TIGGT-BT-2602-0001', '2026-02-05', NULL),  -- 15 kg    · DELIVERY ORDER
  ('TGGT-BT-2604-0001' , '2026-04-26', NULL);  -- 10 kg    · (note: TGGT typo in source)

-- ── Guard: every id you filled in must be a real production batch. ──────────
-- Returns rows only if something is wrong. Must come back EMPTY before you
-- run the update — otherwise you are about to write a link to a batch that
-- does not exist, which is worse than no link at all.
select m.batch_id, m.usage_date, m.source_batch_id as unknown_production_batch
from sink_source_map m
where m.source_batch_id is not null
  and not exists (
    select 1 from public.work_process_entries p
    where p.data->>'StageKey' in ('production_05', 'production_10')
      and p.data->'Values'->>'batch_id' = m.source_batch_id
  );

-- ── 1. Preview exactly what would change. Read every row. ───────────────────
select e.id,
       e.data->'Values'->>'batch_id'   as sink_batch,
       e.data->'Values'->>'usage_date' as usage_date,
       e.data->'Values'->>'quantity'   as quantity,
       m.source_batch_id               as will_be_set_to
from public.work_process_entries e
join sink_source_map m
  on coalesce(e.data->'Values'->>'batch_id', '') = m.batch_id
 and coalesce(e.data->'Values'->>'usage_date', '') = m.usage_date
where e.data->>'StageKey' = 'carbon_sink'
  and m.source_batch_id is not null
order by m.usage_date;

-- ── 2. The update. Uncomment only after step 1 and the guard both look right. ──
-- Skips NULL mappings, so unfilled rows are left untouched and you can run this
-- again as more documents are recovered.
--
-- update public.work_process_entries e
-- set data = jsonb_set(e.data, '{Values,source_batch_id}', to_jsonb(m.source_batch_id)),
--     updated_at = now()
-- from sink_source_map m
-- where e.data->>'StageKey' = 'carbon_sink'
--   and coalesce(e.data->'Values'->>'batch_id', '') = m.batch_id
--   and coalesce(e.data->'Values'->>'usage_date', '') = m.usage_date
--   and m.source_batch_id is not null;

commit;
