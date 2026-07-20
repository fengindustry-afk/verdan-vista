-- ============================================================================
-- Section G — plot_comparisons: manual overrides for the Biochar vs Non-Biochar
-- table. Rows are optional; any null percentage falls back to the value computed
-- from the Section B–D readings. Same shape/policies as the other collections.
-- Run in the Supabase SQL editor after security/rls.sql. Idempotent.
-- ============================================================================
begin;

create table if not exists public.plot_comparisons (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plot_comparisons enable row level security;
alter table public.plot_comparisons force row level security;
drop policy if exists anon_all on public.plot_comparisons;

drop policy if exists plot_comparisons_select on public.plot_comparisons;
create policy plot_comparisons_select on public.plot_comparisons for select to authenticated using (auth.uid() is not null);

drop policy if exists plot_comparisons_insert on public.plot_comparisons;
create policy plot_comparisons_insert on public.plot_comparisons for insert to authenticated with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists plot_comparisons_update on public.plot_comparisons;
create policy plot_comparisons_update on public.plot_comparisons for update to authenticated using (public.has_role('Operator','Manager','Admin')) with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists plot_comparisons_delete on public.plot_comparisons;
create policy plot_comparisons_delete on public.plot_comparisons for delete to authenticated using (public.has_role('Manager','Admin'));

commit;
