-- ============================================================================
-- Seed: Esterra Smart Money Tracker — transactions & categories imported from
-- Estera.xlsx (2026-07-17), attributed to danial.work654@gmail.com.
-- 135 transactions (complete rows only: date + description + amount>0;
-- 226 incomplete template rows and 1 cross-sheet duplicates skipped).
-- Document-store shape (PascalCase jsonb). Idempotent: deterministic ids +
-- upsert, so re-running refreshes rather than duplicates.
-- CreatedByEmail drives RLS: Personal-ledger rows are visible only to this
-- owner (see security/migrate-personal-ledger-privacy.sql).
-- Run AFTER security/create-cost-tracker.sql, in the Supabase SQL editor.
-- ============================================================================

begin;

-- ── Categories (both ledgers' sets; replaces the app's built-in defaults) ──
insert into public.cost_categories (id, data) values ('costcat_feedstock-woodchip-compost', '{"id": "costcat_feedstock-woodchip-compost", "Name": "Feedstock (Woodchip/Compost)", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_payroll', '{"id": "costcat_payroll", "Name": "Payroll", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_logistics--transport', '{"id": "costcat_logistics--transport", "Name": "Logistics & Transport", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_utilities', '{"id": "costcat_utilities", "Name": "Utilities", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_equipment--maintenance', '{"id": "costcat_equipment--maintenance", "Name": "Equipment & Maintenance", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_carbon-credit-revenue', '{"id": "costcat_carbon-credit-revenue", "Name": "Carbon Credit Revenue", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_client-sales-revenue', '{"id": "costcat_client-sales-revenue", "Name": "Client Sales Revenue", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_ar-collection', '{"id": "costcat_ar-collection", "Name": "AR Collection", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_ap-payment', '{"id": "costcat_ap-payment", "Name": "AP Payment", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_r-d--partnership', '{"id": "costcat_r-d--partnership", "Name": "R&D / Partnership", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_admin--office', '{"id": "costcat_admin--office", "Name": "Admin & Office", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_meals--entertainment', '{"id": "costcat_meals--entertainment", "Name": "Meals & Entertainment", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_other', '{"id": "costcat_other", "Name": "Other", "Ledger": "Esterra"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_keperluan-rumah-tangga', '{"id": "costcat_keperluan-rumah-tangga", "Name": "Keperluan Rumah Tangga", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_transport', '{"id": "costcat_transport", "Name": "Transport", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_hiburan--lifestyle', '{"id": "costcat_hiburan--lifestyle", "Name": "Hiburan & Lifestyle", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_pelaburan--tabungan', '{"id": "costcat_pelaburan--tabungan", "Name": "Pelaburan & Tabungan", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_pendidikan', '{"id": "costcat_pendidikan", "Name": "Pendidikan", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_kesihatan', '{"id": "costcat_kesihatan", "Name": "Kesihatan", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_sosial', '{"id": "costcat_sosial", "Name": "Sosial", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_keperluan-peribadi', '{"id": "costcat_keperluan-peribadi", "Name": "Keperluan Peribadi", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_categories (id, data) values ('costcat_lain-lain', '{"id": "costcat_lain-lain", "Name": "Lain-lain", "Ledger": "Personal"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();

-- ── Transactions (135 rows) ──
insert into public.cost_entries (id, data) values ('mtx_20260401_2d972832db', '{"id": "mtx_20260401_2d972832db", "Title": "BARANG PAM VICTA", "Category": "Equipment & Maintenance", "Amount": 60.0, "Date": "2026-04-01", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260401_8c8f412a6d', '{"id": "mtx_20260401_8c8f412a6d", "Title": "lunch danial", "Category": "Hiburan & Lifestyle", "Amount": 25.0, "Date": "2026-04-01", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260402_5be16d979c', '{"id": "mtx_20260402_5be16d979c", "Title": "LUNCH DANIAL", "Category": "Hiburan & Lifestyle", "Amount": 17.0, "Date": "2026-04-02", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260502_3061ff8bef', '{"id": "mtx_20260502_3061ff8bef", "Title": "DINNER Danial", "Category": "Hiburan & Lifestyle", "Amount": 301.6, "Date": "2026-05-02", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260502_4735b0109b', '{"id": "mtx_20260502_4735b0109b", "Title": "KASUT KERJA", "Category": "Keperluan Peribadi", "Amount": 230.0, "Date": "2026-05-02", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260502_768bd45346', '{"id": "mtx_20260502_768bd45346", "Title": "PARKING FEE IOI", "Category": "Transport", "Amount": 7.0, "Date": "2026-05-02", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260502_068fff8c2a', '{"id": "mtx_20260502_068fff8c2a", "Title": "chat gpt subscription", "Category": "Admin & Office", "Amount": 160.0, "Date": "2026-05-02", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260502_95dfce0fbb', '{"id": "mtx_20260502_95dfce0fbb", "Title": "chat gpt subscription", "Category": "Admin & Office", "Amount": 158.13, "Date": "2026-05-02", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260503_68e7afd3c8', '{"id": "mtx_20260503_68e7afd3c8", "Title": "LUNCH DI SITE", "Category": "Hiburan & Lifestyle", "Amount": 29.0, "Date": "2026-05-03", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260504_fd31ea60dd', '{"id": "mtx_20260504_fd31ea60dd", "Title": "LUNCH DANIAL", "Category": "Hiburan & Lifestyle", "Amount": 12.6, "Date": "2026-05-04", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260504_84aa79f260', '{"id": "mtx_20260504_84aa79f260", "Title": "PALLET PLASTIC", "Category": "Equipment & Maintenance", "Amount": 250.0, "Date": "2026-05-04", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260504_e57f2d73de', '{"id": "mtx_20260504_e57f2d73de", "Title": "Rokok dan Kopi 7e", "Category": "Hiburan & Lifestyle", "Amount": 35.3, "Date": "2026-05-04", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260505_6d64867d0d', '{"id": "mtx_20260505_6d64867d0d", "Title": "INTERNET", "Category": "Admin & Office", "Amount": 50.0, "Date": "2026-05-05", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260505_b895a4de78', '{"id": "mtx_20260505_b895a4de78", "Title": "LUNCH DI SITE", "Category": "Hiburan & Lifestyle", "Amount": 11.5, "Date": "2026-05-05", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260505_83ededc109', '{"id": "mtx_20260505_83ededc109", "Title": "RACUN OUTLOOK MAY", "Category": "Equipment & Maintenance", "Amount": 200.0, "Date": "2026-05-05", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260505_67b138e136', '{"id": "mtx_20260505_67b138e136", "Title": "ROKOK dan Kopi 7e", "Category": "Hiburan & Lifestyle", "Amount": 25.0, "Date": "2026-05-05", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260506_d005f6b17f', '{"id": "mtx_20260506_d005f6b17f", "Title": "INSURANCE", "Category": "Kesihatan", "Amount": 59.4, "Date": "2026-05-06", "Ledger": "Personal", "Type": "Investment", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "Minyak Petrol Papaya Plot 5"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260506_eff7ea6113', '{"id": "mtx_20260506_eff7ea6113", "Title": "LUNCH WITH MIRM LOI DEALS", "Category": "Hiburan & Lifestyle", "Amount": 27.0, "Date": "2026-05-06", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260506_12a162d3bb', '{"id": "mtx_20260506_12a162d3bb", "Title": "PETROL", "Category": "Transport", "Amount": 99.0, "Date": "2026-05-06", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260508_0ede87db00', '{"id": "mtx_20260508_0ede87db00", "Title": "BAHAN MASAK", "Category": "Keperluan Rumah Tangga", "Amount": 12.35, "Date": "2026-05-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260508_378ee1997e', '{"id": "mtx_20260508_378ee1997e", "Title": "BAHAN MASAK", "Category": "Keperluan Rumah Tangga", "Amount": 49.15, "Date": "2026-05-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260508_9118bbc63e', '{"id": "mtx_20260508_9118bbc63e", "Title": "LALAMOVE - SCREEN SIMA", "Category": "Equipment & Maintenance", "Amount": 50.0, "Date": "2026-05-08", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260508_9065369f48', '{"id": "mtx_20260508_9065369f48", "Title": "ROKOK", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-05-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260508_3648f532f9', '{"id": "mtx_20260508_3648f532f9", "Title": "SIMA GRINDER SCREEN 3MM", "Category": "Equipment & Maintenance", "Amount": 197.0, "Date": "2026-05-08", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260508_d9ff85597b', '{"id": "mtx_20260508_d9ff85597b", "Title": "TAYAR RANGER 3 BIJI", "Category": "Transport", "Amount": 420.0, "Date": "2026-05-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260509_28a871d0e4', '{"id": "mtx_20260509_28a871d0e4", "Title": "CANDY", "Category": "Hiburan & Lifestyle", "Amount": 4.0, "Date": "2026-05-09", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260509_bffebdf982', '{"id": "mtx_20260509_bffebdf982", "Title": "LUNCH DANIAL R&R", "Category": "Hiburan & Lifestyle", "Amount": 28.2, "Date": "2026-05-09", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260509_91acb94565', '{"id": "mtx_20260509_91acb94565", "Title": "PAPAYA SEEDLINGS - 370", "Category": "Equipment & Maintenance", "Amount": 600.0, "Date": "2026-05-09", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260509_571e0f3783', '{"id": "mtx_20260509_571e0f3783", "Title": "ROKOK", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-05-09", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260509_d58c07c728', '{"id": "mtx_20260509_d58c07c728", "Title": "TNG PENDING", "Category": "Transport", "Amount": 10.0, "Date": "2026-05-09", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260510_717ce61527', '{"id": "mtx_20260510_717ce61527", "Title": "DINNER DANIAL W CLIENT", "Category": "Hiburan & Lifestyle", "Amount": 101.55, "Date": "2026-05-10", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260511_576dc64e7e', '{"id": "mtx_20260511_576dc64e7e", "Title": "BAYAR GANTI RUGI ACCIDENT", "Category": "Logistics & Transport", "Amount": 4000.0, "Date": "2026-05-11", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260512_cd746e2c19', '{"id": "mtx_20260512_cd746e2c19", "Title": "DANIAL LUNCH", "Category": "Hiburan & Lifestyle", "Amount": 38.0, "Date": "2026-05-12", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260513_1bb2697fbd', '{"id": "mtx_20260513_1bb2697fbd", "Title": "DANIAL LUNCH", "Category": "Hiburan & Lifestyle", "Amount": 47.0, "Date": "2026-05-13", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260513_a4f0620d6f', '{"id": "mtx_20260513_a4f0620d6f", "Title": "ROKOK", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-05-13", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260514_388fd5cafd', '{"id": "mtx_20260514_388fd5cafd", "Title": "PETROL", "Category": "Transport", "Amount": 100.0, "Date": "2026-05-14", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260515_65ecdc8069', '{"id": "mtx_20260515_65ecdc8069", "Title": "KOPI", "Category": "Hiburan & Lifestyle", "Amount": 14.2, "Date": "2026-05-15", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260515_af0e1ef75c', '{"id": "mtx_20260515_af0e1ef75c", "Title": "KOPI MCD", "Category": "Hiburan & Lifestyle", "Amount": 10.0, "Date": "2026-05-15", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260515_953a309cc4', '{"id": "mtx_20260515_953a309cc4", "Title": "SOFT COPY FOR GRADUATION", "Category": "Pendidikan", "Amount": 100.0, "Date": "2026-05-15", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260516_d024fe7b6a', '{"id": "mtx_20260516_d024fe7b6a", "Title": "SUNSCREEN", "Category": "Equipment & Maintenance", "Amount": 40.0, "Date": "2026-05-16", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260517_6449489f75', '{"id": "mtx_20260517_6449489f75", "Title": "DANIAL LUNCH", "Category": "Hiburan & Lifestyle", "Amount": 32.8, "Date": "2026-05-17", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260518_80b084a8f8', '{"id": "mtx_20260518_80b084a8f8", "Title": "ROKOK DAn Kopi 7e", "Category": "Hiburan & Lifestyle", "Amount": 32.5, "Date": "2026-05-18", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260519_33ddde622b', '{"id": "mtx_20260519_33ddde622b", "Title": "DANIAL DINNER W CLIENT", "Category": "Hiburan & Lifestyle", "Amount": 42.0, "Date": "2026-05-19", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260520_87d3b4cfc4', '{"id": "mtx_20260520_87d3b4cfc4", "Title": "COMPANY REGISTRATION SSM", "Category": "Admin & Office", "Amount": 70.0, "Date": "2026-05-20", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260523_49bdab9080', '{"id": "mtx_20260523_49bdab9080", "Title": "BARANG PAIP PAPAYA PLOT 5", "Category": "Equipment & Maintenance", "Amount": 514.9, "Date": "2026-05-23", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260525_f324eea426', '{"id": "mtx_20260525_f324eea426", "Title": "BARANG PAIP PAPAYA PLOT 5", "Category": "Equipment & Maintenance", "Amount": 134.0, "Date": "2026-05-25", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260526_2b3b61f07c', '{"id": "mtx_20260526_2b3b61f07c", "Title": "PETROL", "Category": "Transport", "Amount": 100.0, "Date": "2026-05-26", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260526_ecff685086', '{"id": "mtx_20260526_ecff685086", "Title": "PETROL PAPAYA PLOT", "Category": "Equipment & Maintenance", "Amount": 40.0, "Date": "2026-05-26", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260528_5c1fa257d9', '{"id": "mtx_20260528_5c1fa257d9", "Title": "LUNCH DI SITE", "Category": "Hiburan & Lifestyle", "Amount": 33.5, "Date": "2026-05-28", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260530_05fd2944a8', '{"id": "mtx_20260530_05fd2944a8", "Title": "INVESTMENT PRINCIPAL", "Category": "Pelaburan & Tabungan", "Amount": 50.0, "Date": "2026-05-30", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260530_a64b20d183', '{"id": "mtx_20260530_a64b20d183", "Title": "LUNCH DI SITE", "Category": "Hiburan & Lifestyle", "Amount": 17.0, "Date": "2026-05-30", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260530_46ecd01e25', '{"id": "mtx_20260530_46ecd01e25", "Title": "PETROL", "Category": "Transport", "Amount": 100.0, "Date": "2026-05-30", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260531_7c361b68f2', '{"id": "mtx_20260531_7c361b68f2", "Title": "LUNCH", "Category": "Hiburan & Lifestyle", "Amount": 23.4, "Date": "2026-05-31", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260531_1c4f747ea2', '{"id": "mtx_20260531_1c4f747ea2", "Title": "SABUN", "Category": "Keperluan Rumah Tangga", "Amount": 60.0, "Date": "2026-05-31", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260602_148ad721d3', '{"id": "mtx_20260602_148ad721d3", "Title": "Lucnch Danial", "Category": "Hiburan & Lifestyle", "Amount": 50.0, "Date": "2026-06-02", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260602_34ef006eb0', '{"id": "mtx_20260602_34ef006eb0", "Title": "chat gpt subscription", "Category": "Admin & Office", "Amount": 158.13, "Date": "2026-06-02", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260602_d7b5fd7e8c', '{"id": "mtx_20260602_d7b5fd7e8c", "Title": "lunch danial", "Category": "Hiburan & Lifestyle", "Amount": 38.3, "Date": "2026-06-02", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260602_80f23f3b03', '{"id": "mtx_20260602_80f23f3b03", "Title": "security fee office", "Category": "Admin & Office", "Amount": 50.0, "Date": "2026-06-02", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260604_f90cc13658', '{"id": "mtx_20260604_f90cc13658", "Title": "Breakfast Danial", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-06-04", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260604_b1fecd01cc', '{"id": "mtx_20260604_b1fecd01cc", "Title": "insurance", "Category": "Pelaburan & Tabungan", "Amount": 59.4, "Date": "2026-06-04", "Ledger": "Personal", "Type": "Investment", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260604_9b47d34a27', '{"id": "mtx_20260604_9b47d34a27", "Title": "rokok", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-06-04", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260605_c478d9abf0', '{"id": "mtx_20260605_c478d9abf0", "Title": "makan", "Category": "Hiburan & Lifestyle", "Amount": 20.7, "Date": "2026-06-05", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260605_cb8ea31e3c', '{"id": "mtx_20260605_cb8ea31e3c", "Title": "makan", "Category": "Hiburan & Lifestyle", "Amount": 6.9, "Date": "2026-06-05", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260608_ef93ffcecf', '{"id": "mtx_20260608_ef93ffcecf", "Title": "Breakfast Danial", "Category": "Hiburan & Lifestyle", "Amount": 14.6, "Date": "2026-06-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260608_a7a8d33543', '{"id": "mtx_20260608_a7a8d33543", "Title": "investment principal", "Category": "Pelaburan & Tabungan", "Amount": 50.0, "Date": "2026-06-08", "Ledger": "Personal", "Type": "Investment", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260608_7d6ce1d507', '{"id": "mtx_20260608_7d6ce1d507", "Title": "rokok", "Category": "Hiburan & Lifestyle", "Amount": 30.1, "Date": "2026-06-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260609_ba117c89a1', '{"id": "mtx_20260609_ba117c89a1", "Title": "Dinner Danial", "Category": "Hiburan & Lifestyle", "Amount": 22.0, "Date": "2026-06-09", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260609_a42387c612', '{"id": "mtx_20260609_a42387c612", "Title": "kopi", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-06-09", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260609_48ea74b9b7', '{"id": "mtx_20260609_48ea74b9b7", "Title": "sabun", "Category": "Keperluan Rumah Tangga", "Amount": 60.0, "Date": "2026-06-09", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260610_b697044007', '{"id": "mtx_20260610_b697044007", "Title": "Minyak Petrol Papaya Plot 5", "Category": "Equipment & Maintenance", "Amount": 40.0, "Date": "2026-06-10", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "Minyak Petrol Papaya Plot 5"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260610_593f77d614', '{"id": "mtx_20260610_593f77d614", "Title": "investment principal", "Category": "Pelaburan & Tabungan", "Amount": 50.0, "Date": "2026-06-10", "Ledger": "Personal", "Type": "Investment", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260612_9ba8b9b4fb', '{"id": "mtx_20260612_9ba8b9b4fb", "Title": "rokok", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-06-12", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260613_372940708e', '{"id": "mtx_20260613_372940708e", "Title": "As niaga", "Category": "Hiburan & Lifestyle", "Amount": 12.0, "Date": "2026-06-13", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260613_7f416141ca', '{"id": "mtx_20260613_7f416141ca", "Title": "golf nilai", "Category": "Hiburan & Lifestyle", "Amount": 16.0, "Date": "2026-06-13", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260613_d6d18b8c8c', '{"id": "mtx_20260613_d6d18b8c8c", "Title": "lunch danial", "Category": "Hiburan & Lifestyle", "Amount": 39.2, "Date": "2026-06-13", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260613_e58438cfd8', '{"id": "mtx_20260613_e58438cfd8", "Title": "makan", "Category": "Hiburan & Lifestyle", "Amount": 32.4, "Date": "2026-06-13", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260614_cea921ec7c', '{"id": "mtx_20260614_cea921ec7c", "Title": "lunch danial", "Category": "Hiburan & Lifestyle", "Amount": 28.0, "Date": "2026-06-14", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260615_938d635166', '{"id": "mtx_20260615_938d635166", "Title": "rokok kopi 7 e", "Category": "Hiburan & Lifestyle", "Amount": 32.4, "Date": "2026-06-15", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260616_78c0beba5e', '{"id": "mtx_20260616_78c0beba5e", "Title": "air", "Category": "Hiburan & Lifestyle", "Amount": 13.4, "Date": "2026-06-16", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260617_d5ac09fbef', '{"id": "mtx_20260617_d5ac09fbef", "Title": "Meeting note Device", "Category": "Admin & Office", "Amount": 850.0, "Date": "2026-06-17", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260617_ae702f3c45', '{"id": "mtx_20260617_ae702f3c45", "Title": "golf semarak range", "Category": "Hiburan & Lifestyle", "Amount": 16.0, "Date": "2026-06-17", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260617_4888226e7f', '{"id": "mtx_20260617_4888226e7f", "Title": "lunch danial", "Category": "Hiburan & Lifestyle", "Amount": 93.5, "Date": "2026-06-17", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260617_a4741fbbc0', '{"id": "mtx_20260617_a4741fbbc0", "Title": "sabun 1", "Category": "Keperluan Rumah Tangga", "Amount": 40.0, "Date": "2026-06-17", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260617_4764c31940', '{"id": "mtx_20260617_4764c31940", "Title": "sabun 2", "Category": "Keperluan Rumah Tangga", "Amount": 91.0, "Date": "2026-06-17", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260618_cc39fd6d02', '{"id": "mtx_20260618_cc39fd6d02", "Title": "Hm group Empire", "Category": "Hiburan & Lifestyle", "Amount": 25.0, "Date": "2026-06-18", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260618_c8f9ed179a', '{"id": "mtx_20260618_c8f9ed179a", "Title": "Repair kereta", "Category": "Transport", "Amount": 4205.0, "Date": "2026-06-18", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260618_58e745bb63', '{"id": "mtx_20260618_58e745bb63", "Title": "kopi", "Category": "Hiburan & Lifestyle", "Amount": 20.0, "Date": "2026-06-18", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260619_319b9694f3', '{"id": "mtx_20260619_319b9694f3", "Title": "Meeting at Ebis Hotel", "Category": "Transport", "Amount": 50.0, "Date": "2026-06-19", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260619_fcb06e584d', '{"id": "mtx_20260619_fcb06e584d", "Title": "Rokok dan Kopi 7e", "Category": "Hiburan & Lifestyle", "Amount": 32.4, "Date": "2026-06-19", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260619_5f1752bc08', '{"id": "mtx_20260619_5f1752bc08", "Title": "Tol Parking", "Category": "Transport", "Amount": 4.0, "Date": "2026-06-19", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260620_0e71e386c6', '{"id": "mtx_20260620_0e71e386c6", "Title": "Al quran Apps store", "Category": "Hiburan & Lifestyle", "Amount": 24.0, "Date": "2026-06-20", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260620_5d189ed637', '{"id": "mtx_20260620_5d189ed637", "Title": "Dinner Danial", "Category": "Hiburan & Lifestyle", "Amount": 123.4, "Date": "2026-06-20", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_85085a768b', '{"id": "mtx_20260621_85085a768b", "Title": "AIR MINERAL", "Category": "Hiburan & Lifestyle", "Amount": 8.0, "Date": "2026-06-21", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_4823b79d2b', '{"id": "mtx_20260621_4823b79d2b", "Title": "AIR MINERAL", "Category": "Hiburan & Lifestyle", "Amount": 4.0, "Date": "2026-06-21", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_c2517d918d', '{"id": "mtx_20260621_c2517d918d", "Title": "BARANG PAIP PAPAYA PLOT 5", "Category": "Equipment & Maintenance", "Amount": 6.5, "Date": "2026-06-21", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_a88b4632d2', '{"id": "mtx_20260621_a88b4632d2", "Title": "BOT ITIK, TAMAN BOTANI", "Category": "Hiburan & Lifestyle", "Amount": 25.0, "Date": "2026-06-21", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_b61de45139', '{"id": "mtx_20260621_b61de45139", "Title": "Breakfast Danial", "Category": "Hiburan & Lifestyle", "Amount": 47.4, "Date": "2026-06-21", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_5da3edfafe', '{"id": "mtx_20260621_5da3edfafe", "Title": "LRT Damai", "Category": "Transport", "Amount": 15.0, "Date": "2026-06-21", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260621_9139cac24a', '{"id": "mtx_20260621_9139cac24a", "Title": "LUNCH DPULZE", "Category": "Hiburan & Lifestyle", "Amount": 50.0, "Date": "2026-06-21", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260622_b0c260286c', '{"id": "mtx_20260622_b0c260286c", "Title": "CHARGER", "Category": "Admin & Office", "Amount": 9.0, "Date": "2026-06-22", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260622_433854a7d5', '{"id": "mtx_20260622_433854a7d5", "Title": "IOT SET UP SYSTEMS", "Category": "Equipment & Maintenance", "Amount": 10000.0, "Date": "2026-06-22", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com", "Note": "PAPAYA PLOT PROJECTS"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260623_a57a7ea80d', '{"id": "mtx_20260623_a57a7ea80d", "Title": "CLEARANCE FEE IUKL", "Category": "Lain-lain", "Amount": 2400.0, "Date": "2026-06-23", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_dd10e58b0e', '{"id": "mtx_20260624_dd10e58b0e", "Title": "GOLF SEmarak range", "Category": "Hiburan & Lifestyle", "Amount": 16.0, "Date": "2026-06-24", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_4ac114188b', '{"id": "mtx_20260624_4ac114188b", "Title": "GOLF SEmarak range", "Category": "Hiburan & Lifestyle", "Amount": 8.0, "Date": "2026-06-24", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_4e93d689ca', '{"id": "mtx_20260624_4e93d689ca", "Title": "KOPI DANIAL", "Category": "Hiburan & Lifestyle", "Amount": 10.0, "Date": "2026-06-24", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_dd800f031e', '{"id": "mtx_20260624_dd800f031e", "Title": "MAKAN", "Category": "Hiburan & Lifestyle", "Amount": 21.0, "Date": "2026-06-24", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_07ee91414e', '{"id": "mtx_20260624_07ee91414e", "Title": "PRINTING FEE - COMPANY FILES", "Category": "Admin & Office", "Amount": 8.1, "Date": "2026-06-24", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_3e7848b021', '{"id": "mtx_20260624_3e7848b021", "Title": "PRINTING FEE - COMPANY FILES", "Category": "Admin & Office", "Amount": 7.5, "Date": "2026-06-24", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_4e181bed05', '{"id": "mtx_20260624_4e181bed05", "Title": "ROKOK", "Category": "Hiburan & Lifestyle", "Amount": 23.0, "Date": "2026-06-24", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260624_0ea6fa856f', '{"id": "mtx_20260624_0ea6fa856f", "Title": "ROKOK DAn Kopi 7e", "Category": "Hiburan & Lifestyle", "Amount": 38.0, "Date": "2026-06-24", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260626_10d76b3455', '{"id": "mtx_20260626_10d76b3455", "Title": "Tol TNG", "Category": "Transport", "Amount": 20.0, "Date": "2026-06-26", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260627_b0bdb676e5', '{"id": "mtx_20260627_b0bdb676e5", "Title": "PEN PAKWAN", "Category": "Other", "Amount": 25.0, "Date": "2026-06-27", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260701_baae60de96', '{"id": "mtx_20260701_baae60de96", "Title": "BUSSINESS CARD DANIAL", "Category": "Admin & Office", "Amount": 151.2, "Date": "2026-07-01", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260701_36d796a900', '{"id": "mtx_20260701_36d796a900", "Title": "ESTERRA CIMB CAPITAL", "Category": "Lain-lain", "Amount": 2700.0, "Date": "2026-07-01", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260701_f1edd2f40c', '{"id": "mtx_20260701_f1edd2f40c", "Title": "ESTERRA CIMB CAPITAL", "Category": "Lain-lain", "Amount": 40.0, "Date": "2026-07-01", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260701_b0a7bad24f', '{"id": "mtx_20260701_b0a7bad24f", "Title": "KURSUS DURIAN BANGI GOLF- DURIAN TALK", "Category": "Pendidikan", "Amount": 80.0, "Date": "2026-07-01", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260701_b47fff17f8', '{"id": "mtx_20260701_b47fff17f8", "Title": "NETFLIX", "Category": "Hiburan & Lifestyle", "Amount": 76.0, "Date": "2026-07-01", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260702_2fa6f9a049', '{"id": "mtx_20260702_2fa6f9a049", "Title": "CHAT GPT SUBCRIPTION", "Category": "Admin & Office", "Amount": 163.0, "Date": "2026-07-02", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260707_c3631b526f', '{"id": "mtx_20260707_c3631b526f", "Title": "MAKAN", "Category": "Hiburan & Lifestyle", "Amount": 24.0, "Date": "2026-07-07", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260707_22d41e9c78', '{"id": "mtx_20260707_22d41e9c78", "Title": "Rokok", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-07-07", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260708_7f9823d890', '{"id": "mtx_20260708_7f9823d890", "Title": "BABU WAGES JUNE 2026", "Category": "Payroll", "Amount": 1500.0, "Date": "2026-07-08", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260708_b340be8fb9', '{"id": "mtx_20260708_b340be8fb9", "Title": "BABU WAGES JUNE 2026", "Category": "Payroll", "Amount": 400.0, "Date": "2026-07-08", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260708_859bfb61e6', '{"id": "mtx_20260708_859bfb61e6", "Title": "Claude ai subsribtion for office documents", "Category": "Admin & Office", "Amount": 95.0, "Date": "2026-07-08", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260708_9b65e1f7fc', '{"id": "mtx_20260708_9b65e1f7fc", "Title": "DIESEL RANGER", "Category": "Transport", "Amount": 100.0, "Date": "2026-07-08", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260708_4aeea76891', '{"id": "mtx_20260708_4aeea76891", "Title": "PETROL FOR PAPAYA PLOT 5", "Category": "Equipment & Maintenance", "Amount": 40.0, "Date": "2026-07-08", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260709_14ebe28b79', '{"id": "mtx_20260709_14ebe28b79", "Title": "Lunch Danial", "Category": "Hiburan & Lifestyle", "Amount": 28.2, "Date": "2026-07-09", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260710_fae7cff1e2', '{"id": "mtx_20260710_fae7cff1e2", "Title": "Bakery meals", "Category": "Hiburan & Lifestyle", "Amount": 22.8, "Date": "2026-07-10", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260710_c7a42596ab', '{"id": "mtx_20260710_c7a42596ab", "Title": "Breakfast @ Nilai 3", "Category": "Hiburan & Lifestyle", "Amount": 22.5, "Date": "2026-07-10", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260710_1bc30c30aa', '{"id": "mtx_20260710_1bc30c30aa", "Title": "Pantry office", "Category": "Admin & Office", "Amount": 87.5, "Date": "2026-07-10", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260711_e367bfb677', '{"id": "mtx_20260711_e367bfb677", "Title": "Meering - Petrol", "Category": "Transport", "Amount": 100.0, "Date": "2026-07-11", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260714_fc57ae2293', '{"id": "mtx_20260714_fc57ae2293", "Title": "Coffee latte - Solaris", "Category": "Hiburan & Lifestyle", "Amount": 18.55, "Date": "2026-07-14", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260714_de83df8d02', '{"id": "mtx_20260714_de83df8d02", "Title": "Rokok", "Category": "Hiburan & Lifestyle", "Amount": 19.0, "Date": "2026-07-14", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260714_b425b7b86d', '{"id": "mtx_20260714_b425b7b86d", "Title": "Tol to Ipoh - Wise Project MRM", "Category": "Transport", "Amount": 50.0, "Date": "2026-07-14", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260725_6c682ac75e', '{"id": "mtx_20260725_6c682ac75e", "Title": "AIR KEDAI PIAN - JELEBU", "Category": "Hiburan & Lifestyle", "Amount": 5.5, "Date": "2026-07-25", "Ledger": "Personal", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.cost_entries (id, data) values ('mtx_20260725_3c3090b23f', '{"id": "mtx_20260725_3c3090b23f", "Title": "PAPAYA PLOT - MINYAK PETROL", "Category": "Equipment & Maintenance", "Amount": 40.0, "Date": "2026-07-25", "Ledger": "Esterra", "Type": "Expense", "CreatedBy": "danial.work654@gmail.com", "CreatedByEmail": "danial.work654@gmail.com"}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();

commit;
