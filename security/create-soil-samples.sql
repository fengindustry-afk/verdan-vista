-- ============================================================================
-- Soil-analysis samples for the testing plot — the web counterpart of the
-- ESTERRA spreadsheet's "Section E · Analisis Tanah".
--
-- One document-store table following the app convention (id text, data jsonb,
-- updated_at). Each row is one soil parameter's initial + final reading for a
-- treatment group; the app computes the percentage change client-side and folds
-- it into the Testing Site Summary alongside the growth/health parameters.
--
-- `data` is the SoilSample shape from src/lib/types.ts (PascalCase jsonb):
--   TreatmentGroup, Parameter, InitialReading, FinalReading, Date, Note.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Then run security/rls.sql — it already lists 'soil_samples' in its write_tables
-- loop, so it will apply the standard document-store policies
-- (authenticated read; Operator/Manager/Admin write; Manager/Admin delete).
-- ============================================================================

begin;

create table if not exists public.soil_samples (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS immediately so the table is never briefly world-writable between
-- creation and the rls.sql run. rls.sql (re)creates the actual policies.
alter table public.soil_samples enable row level security;
alter table public.soil_samples force row level security;

-- Helpful index for grouping samples by treatment group / parameter.
create index if not exists soil_samples_group_param_idx
  on public.soil_samples ((data->>'TreatmentGroup'), (data->>'Parameter'));

commit;
