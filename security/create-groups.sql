-- ============================================================================
-- Access Groups (2026-07-17): admin-managed groups that control which users
-- can see which data. Two layers, both enforced by RLS:
--
--   1. MODULE ACCESS — each group lists the modules its members may access
--      (custody, biomass, trees, testing-plot, workflow, sensors,
--      cost-tracker). A user's module access is the union of their groups'.
--      Users who belong to NO group keep legacy full access (gradual
--      adoption); Admins always see everything.
--   2. RECORD OWNERSHIP — rows stamped with a GroupId are visible only to
--      members of that group (+ Admins). Rows without a GroupId stay shared
--      with everyone who can access the module, so existing data is
--      unaffected until you start assigning groups.
--
-- Membership lives on the user's profile row (users.data->'Groups', an array
-- of group ids) and is pinned by trigger so only Admins can change it.
-- Global roles (Viewer/Operator/Manager/Admin) still gate WHAT users can do;
-- groups gate WHICH rows they see.
--
-- Run AFTER security/rls.sql (needs public.has_role) in the Supabase SQL
-- editor. Safe to re-run (idempotent). Composes with
-- security/migrate-personal-ledger-privacy.sql for cost_entries.
-- ============================================================================

begin;

-- ── 1. Groups collection (document-store shape like every other table) ──────
-- data: { "id", "Name", "Description"?, "Modules": ["cost-tracker", ...] }
create table if not exists public.groups (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.groups enable row level security;
alter table public.groups force row level security;

-- Everyone signed-in may read groups (the app needs names/modules to render);
-- only Admins manage them.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated using (true);

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated with check (public.has_role('Admin'));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (public.has_role('Admin')) with check (public.has_role('Admin'));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated using (public.has_role('Admin'));

-- ── 2. Helpers ───────────────────────────────────────────────────────────────

-- Group ids of the calling user (empty array when none / no profile row).
create or replace function public.current_user_groups()
returns text[]
language sql stable
set search_path = public
as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(coalesce(u.data->'Groups', '[]'::jsonb)))
       from public.users u
      where lower(u.data->>'Email') = lower(auth.jwt() ->> 'email')
      limit 1),
    '{}'::text[]
  );
$$;

-- Module access: Admins always; users in no group keep legacy full access;
-- otherwise at least one of their groups must list the module.
create or replace function public.can_access_module(module text)
returns boolean
language sql stable
set search_path = public
as $$
  select public.has_role('Admin')
      or cardinality(public.current_user_groups()) = 0
      or exists (
           select 1
             from public.groups g
            where g.id = any (public.current_user_groups())
              and g.data->'Modules' ? module
         );
$$;

-- Row visibility: module access AND (ungrouped row = shared; grouped row =
-- members of that group or Admins only).
create or replace function public.can_see_row(module text, data jsonb)
returns boolean
language sql stable
set search_path = public
as $$
  select public.can_access_module(module)
     and (
       data->>'GroupId' is null
       or public.has_role('Admin')
       or (data->>'GroupId') = any (public.current_user_groups())
     );
$$;

-- ── 3. Rebuild the generic policies with group awareness ────────────────────
-- Same role gates as security/rls.sql, with can_see_row layered on. Note
-- INSERT's with-check also runs can_see_row: users can only stamp a GroupId
-- of a group they belong to (or leave the row shared).
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('feedstock_sourcing',   'custody'),
      ('asset_locations',      'custody'),
      ('geotagged_photos',     'custody'),
      ('esa_biomass_data',     'biomass'),
      ('esa_biomass_cache',    'biomass'),
      ('ground_truth_biomass', 'biomass'),
      ('fused_biomass',        'biomass'),
      ('trees',                'trees'),
      ('readings',             'trees'),
      ('scans',                'trees'),
      ('labels',               'trees'),
      ('soil_samples',         'testing-plot'),
      ('plot_observations',    'testing-plot'),
      ('plot_applications',    'testing-plot'),
      ('work_process_entries', 'workflow'),
      ('readiness_status',     'workflow'),
      ('sensor_devices',       'sensors'),
      ('sensor_readings',      'sensors'),
      ('cost_budgets',         'cost-tracker'),
      ('cost_categories',      'cost-tracker'),
      ('receipts',             'cost-tracker')
    ) as m(tbl, module)
  loop
    continue when to_regclass(format('public.%I', rec.tbl)) is null;

    execute format('drop policy if exists %1$s_select on public.%1$I;', rec.tbl);
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated '
      || 'using (public.can_see_row(%2$L, data));', rec.tbl, rec.module);

    execute format('drop policy if exists %1$s_insert on public.%1$I;', rec.tbl);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated '
      || 'with check (public.has_role(''Operator'',''Manager'',''Admin'') '
      || 'and public.can_see_row(%2$L, data));', rec.tbl, rec.module);

    execute format('drop policy if exists %1$s_update on public.%1$I;', rec.tbl);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated '
      || 'using (public.has_role(''Operator'',''Manager'',''Admin'') '
      || 'and public.can_see_row(%2$L, data)) '
      || 'with check (public.has_role(''Operator'',''Manager'',''Admin'') '
      || 'and public.can_see_row(%2$L, data));', rec.tbl, rec.module);

    execute format('drop policy if exists %1$s_delete on public.%1$I;', rec.tbl);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated '
      || 'using (public.has_role(''Manager'',''Admin'') '
      || 'and public.can_see_row(%2$L, data));', rec.tbl, rec.module);
  end loop;
end $$;

-- ── 4. cost_entries: group layer × personal-ledger privacy ──────────────────
-- (Re)define the owner predicate so this script is self-contained even if
-- migrate-personal-ledger-privacy.sql hasn't run yet.
create or replace function public.owns_personal_entry(data jsonb)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(data->>'Ledger','Esterra') <> 'Personal'
      or nullif(lower(coalesce(data->>'CreatedByEmail', data->>'CreatedBy')), '')
         = lower(auth.jwt()->>'email');
$$;

drop policy if exists cost_entries_select on public.cost_entries;
create policy cost_entries_select on public.cost_entries
  for select to authenticated
  using (
    public.can_see_row('cost-tracker', data)
    and public.owns_personal_entry(data)
  );

drop policy if exists cost_entries_insert on public.cost_entries;
create policy cost_entries_insert on public.cost_entries
  for insert to authenticated
  with check (
    public.has_role('Operator','Manager','Admin')
    and public.can_see_row('cost-tracker', data)
    and public.owns_personal_entry(data)
  );

drop policy if exists cost_entries_update on public.cost_entries;
create policy cost_entries_update on public.cost_entries
  for update to authenticated
  using (
    public.has_role('Operator','Manager','Admin')
    and public.can_see_row('cost-tracker', data)
    and public.owns_personal_entry(data)
  )
  with check (
    public.has_role('Operator','Manager','Admin')
    and public.can_see_row('cost-tracker', data)
    and public.owns_personal_entry(data)
  );

drop policy if exists cost_entries_delete on public.cost_entries;
create policy cost_entries_delete on public.cost_entries
  for delete to authenticated
  using (
    public.has_role('Manager','Admin')
    and public.can_see_row('cost-tracker', data)
    and public.owns_personal_entry(data)
  );

-- ── 5. Pin group membership: only Admins may change users.data->'Groups' ────
-- Extends the anti-privilege-escalation trigger from security/rls.sql (users
-- can update their own profile row, so without this they could join any
-- group themselves).
create or replace function public.enforce_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean := public.has_role('Admin') or auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    if not caller_is_admin then
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{Role}', '"Viewer"');
      new.data := new.data - 'Groups';  -- no self-assigned memberships
    end if;
  elsif tg_op = 'UPDATE' then
    if not caller_is_admin then
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{Role}',
                            coalesce(old.data->'Role', '"Viewer"'));
      if old.data ? 'Groups' then
        new.data := jsonb_set(new.data, '{Groups}', old.data->'Groups');
      else
        new.data := new.data - 'Groups';
      end if;
    end if;
  end if;
  return new;
end $$;

-- (trigger trg_enforce_user_role from rls.sql already points at this function)

commit;

-- ── Verify (optional) ────────────────────────────────────────────────────────
-- 1. Create a group in the app (Settings ▸ Groups & Access) with only the
--    'cost-tracker' module and add a test user to it.
-- 2. As that user: Cost Tracker loads data; Trees/Workflow return zero rows.
-- 3. Stamp a record with the group's GroupId: users outside the group can no
--    longer see it; Admins still can.
