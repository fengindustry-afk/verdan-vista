-- ============================================================================
-- DEMO seed: soil-analysis samples for the ESTERRA testing plot (Section E).
--
-- Seven rows, one per SOIL_PARAM (see src/lib/testingPlotSummary.ts), for the
-- "ESTERRA" treatment group. Values are ILLUSTRATIVE demo data showing a typical
-- biochar soil response (rising organic carbon/matter, CEC, moisture; pH nudged
-- toward neutral) — NOT lab results. Replace InitialReading/FinalReading with
-- real assay values, or delete these rows, before using in production.
--
-- Run AFTER security/create-soil-samples.sql (and security/rls.sql). Idempotent:
-- re-running overwrites the same demo ids.
-- ============================================================================

insert into public.soil_samples (id, data) values
  ('soil_seed_esterra_ph',        jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','pH Tanah',             'InitialReading',5.4,'FinalReading',6.3,'Date','2026-04-15','Note','Demo seed')),
  ('soil_seed_esterra_ec',        jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','EC (mS/cm)',           'InitialReading',0.8,'FinalReading',1.1,'Date','2026-04-15','Note','Demo seed')),
  ('soil_seed_esterra_oc',        jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','Organic Carbon (%)',   'InitialReading',1.2,'FinalReading',1.9,'Date','2026-04-15','Note','Demo seed')),
  ('soil_seed_esterra_om',        jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','Organic Matter (%)',   'InitialReading',2.1,'FinalReading',3.3,'Date','2026-04-15','Note','Demo seed')),
  ('soil_seed_esterra_moisture',  jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','Moisture Content (%)', 'InitialReading',18,'FinalReading',24,'Date','2026-04-15','Note','Demo seed')),
  ('soil_seed_esterra_cec',       jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','CEC (cmol/kg)',        'InitialReading',9.5,'FinalReading',13.2,'Date','2026-04-15','Note','Demo seed')),
  ('soil_seed_esterra_n',         jsonb_build_object('TreatmentGroup','ESTERRA','Parameter','Available Nitrogen (%)','InitialReading',0.12,'FinalReading',0.18,'Date','2026-04-15','Note','Demo seed'))
on conflict (id) do update set data = excluded.data, updated_at = now();
