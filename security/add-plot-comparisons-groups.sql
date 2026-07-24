-- ============================================================================
-- plot_comparisons was added (create-plot-comparisons.sql, 2026-07-20) after
-- the access-groups system (create-groups.sql, 2026-07-17) and was never
-- wired into it: its select policy was a flat `auth.uid() is not null`, so
-- every authenticated user could read every group's comparison rows
-- regardless of the "testing-plot" module grant or GroupId.
--
-- This patches the live table to match every other testing-plot table
-- (soil_samples, plot_observations, plot_applications). Safe to re-run.
-- create-groups.sql's own loop now includes plot_comparisons too, so a fresh
-- install never needs this file — it exists only to patch a DB that already
-- ran the old create-groups.sql before this table existed.
-- ============================================================================

begin;

drop policy if exists plot_comparisons_select on public.plot_comparisons;
create policy plot_comparisons_select on public.plot_comparisons
  for select to authenticated using (public.can_see_row('testing-plot', data));

drop policy if exists plot_comparisons_insert on public.plot_comparisons;
create policy plot_comparisons_insert on public.plot_comparisons
  for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin')
              and public.can_see_row('testing-plot', data));

drop policy if exists plot_comparisons_update on public.plot_comparisons;
create policy plot_comparisons_update on public.plot_comparisons
  for update to authenticated
  using (public.has_role('Operator','Manager','Admin')
         and public.can_see_row('testing-plot', data))
  with check (public.has_role('Operator','Manager','Admin')
              and public.can_see_row('testing-plot', data));

drop policy if exists plot_comparisons_delete on public.plot_comparisons;
create policy plot_comparisons_delete on public.plot_comparisons
  for delete to authenticated
  using (public.has_role('Manager','Admin')
         and public.can_see_row('testing-plot', data));

commit;
