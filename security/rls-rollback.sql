-- ============================================================================
-- Rollback for security/rls.sql — disables RLS and drops the policies/functions.
-- Use only to revert to the (insecure) open state, e.g. if the .NET app hasn't
-- migrated to real auth yet and you need to restore shared access temporarily.
-- ============================================================================

begin;

do $$
declare
  t text;
  all_tables text[] := array[
    'feedstock_sourcing', 'asset_locations', 'geotagged_photos',
    'esa_biomass_data', 'esa_biomass_cache', 'ground_truth_biomass',
    'fused_biomass', 'trees', 'readings', 'scans', 'labels', 'conditions', 'users'
  ];
begin
  foreach t in array all_tables loop
    continue when to_regclass(format('public.%I', t)) is null;
    execute format('drop policy if exists %1$s_select on public.%1$I;', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I;', t);
    execute format('drop policy if exists %1$s_update on public.%1$I;', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I;', t);
    execute format('alter table public.%I disable row level security;', t);
  end loop;
end $$;

drop trigger if exists trg_enforce_user_role on public.users;
drop function if exists public.enforce_user_role();
drop function if exists public.has_role(text[]);
drop function if exists public.current_app_role();

commit;
