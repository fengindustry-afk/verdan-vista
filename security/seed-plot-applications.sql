-- ============================================================================
-- Section H seed — ESTERRA BIOCHAR FERTILISER PROGRAMME 2026
-- Source: ESTERRA_PLOT5_PAPAYA_FIXED.xlsx, sheet "SECTION H - REKOD APLIKASI
-- PRODUK". Four applications across the papaya Plot 5 trial (170 trees).
--
-- Column meaning, as used by the programme:
--   RatePerTreeKg  KADAR (KG/POKOK)              total fertiliser put to the trees
--   BiocharKg      TOTAL KADAR APLIKASI (KG)     biochar content in that fertiliser
--   UnitPrice      PRICE LIST (RAW MATERIAL)     biochar price, RM/kg
-- Cost is charged on the biochar: BiocharKg x UnitPrice
-- (5.1 x 1.50 = RM 7.65, 8.5 x 3.00 = RM 25.50, 17 x 1.00 = RM 17.00).
-- Probiomax has no price in the sheet, so it contributes no cost.
--
-- Run AFTER security/create-testing-plot-sections.sql. Idempotent.
-- ============================================================================

insert into public.plot_applications (id, data) values
  ('app_20260516_woodchips', jsonb_build_object('Date','2026-05-16','Product','Woodchips Biochar',          'RatePerTreeKg',30, 'TreeCount',170,'BiocharKg',5.1,'UnitPrice',1.5,'Method','Menabur','Officer','Babu','Supervisor','Danial')),
  ('app_20260620_probiomax', jsonb_build_object('Date','2026-06-20','Product','Probiomax',                  'RatePerTreeKg',20, 'TreeCount',170,'BiocharKg',20,                 'Method','Menabur')),
  ('app_20260627_t100',      jsonb_build_object('Date','2026-06-27','Product','T100',                       'RatePerTreeKg',50, 'TreeCount',170,'BiocharKg',8.5,'UnitPrice',3.0,'Method','Menabur','Officer','Babu','Supervisor','Danial')),
  ('app_20260704_gradec',    jsonb_build_object('Date','2026-07-04','Product','Woodchips Biochar - Grade C','RatePerTreeKg',100,'TreeCount',170,'BiocharKg',17, 'UnitPrice',1.0,'Method','Menabur','Officer','Babu','Supervisor','Danial'))
on conflict (id) do update set data = excluded.data, updated_at = now();
