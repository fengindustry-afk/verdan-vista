-- ============================================================================
-- CarbonTracker — Row-Level Security policies
-- ============================================================================
-- Closes the open data tier: with RLS enabled, the anon key (which ships in the
-- client bundle) can no longer read or write anything. Every request must carry
-- a valid Supabase Auth JWT, and writes are gated by the caller's role.
--
-- Mirrors rawsec's "least-privilege DB roles + DB-enforced access" — the database
-- itself rejects unauthorized access, so a tampered/compromised client cannot
-- exceed its privileges.
--
-- ⚠️  BREAKING: the .NET MAUI app currently talks to Supabase with the anon key
--     and NO user session. After this runs, it must authenticate as a real user
--     (see security/auth-migration.md) or it will receive empty reads / 401s.
--
-- Apply in the Supabase SQL editor (runs as the privileged owner). Roll back with
-- security/rls-rollback.sql.
-- ============================================================================

begin;

-- ── Role resolution ────────────────────────────────────────────────────────
-- The caller's role, looked up from the users table by their authenticated
-- email. SECURITY DEFINER so the lookup itself isn't blocked by RLS. Defaults
-- to the least privilege ('Viewer') when no profile row exists.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.data->>'Role'
       from public.users u
      where lower(u.data->>'Email') = lower(auth.jwt() ->> 'email')
      limit 1),
    'Viewer'
  );
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.has_role(variadic roles text[])
returns boolean
language sql
stable
as $$
  select public.current_app_role() = any(roles);
$$;

-- ── Generic helper: enable RLS + standard policy set on a document-store table ─
-- SELECT  : any authenticated user (Viewers included) may read.
-- INSERT/UPDATE : Operator, Manager, Admin.
-- DELETE  : Manager, Admin.
-- anon has no policy on any table → all anon access is denied by default.
do $$
declare
  t text;
  write_tables text[] := array[
    'feedstock_sourcing', 'asset_locations', 'geotagged_photos',
    'esa_biomass_data', 'esa_biomass_cache', 'ground_truth_biomass',
    'fused_biomass', 'trees', 'readings', 'scans', 'labels', 'conditions'
  ];
begin
  foreach t in array write_tables loop
    -- Skip tables that don't exist on this project (some collections aren't
    -- created yet). Re-running later will pick them up once they exist.
    continue when to_regclass(format('public.%I', t)) is null;

    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);

    -- Drop the legacy wide-open policy from supabase_schema.sql
    -- (create policy anon_all ... for all to anon using(true)) — without this,
    -- RLS stays effectively open because permissive policies are OR'd together.
    execute format('drop policy if exists anon_all on public.%I;', t);

    execute format('drop policy if exists %1$s_select on public.%1$I;', t);
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (true);', t);

    execute format('drop policy if exists %1$s_insert on public.%1$I;', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated '
      || 'with check (public.has_role(''Operator'',''Manager'',''Admin''));', t);

    execute format('drop policy if exists %1$s_update on public.%1$I;', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated '
      || 'using (public.has_role(''Operator'',''Manager'',''Admin'')) '
      || 'with check (public.has_role(''Operator'',''Manager'',''Admin''));', t);

    execute format('drop policy if exists %1$s_delete on public.%1$I;', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated '
      || 'using (public.has_role(''Manager'',''Admin''));', t);
  end loop;
end $$;

-- ── users table: self-service profile + admin management ───────────────────
alter table public.users enable row level security;
alter table public.users force row level security;

-- Drop the legacy wide-open anon policy (see note in the loop above).
drop policy if exists anon_all on public.users;

-- Read: any authenticated user (the app lists team members).
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated using (true);

-- Insert: a user may create ONLY their own profile row (email must match their
-- JWT); Admins may create anyone.
drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert to authenticated
  with check (
    public.has_role('Admin')
    or lower(data->>'Email') = lower(auth.jwt() ->> 'email')
  );

-- Update: a user may update their own row; Admins may update anyone.
drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (
    public.has_role('Admin')
    or lower(data->>'Email') = lower(auth.jwt() ->> 'email')
  )
  with check (
    public.has_role('Admin')
    or lower(data->>'Email') = lower(auth.jwt() ->> 'email')
  );

-- Delete: Admins only.
drop policy if exists users_delete on public.users;
create policy users_delete on public.users
  for delete to authenticated
  using (public.has_role('Admin'));

-- ── Anti privilege-escalation trigger ──────────────────────────────────────
-- The CLIENT derives a role from the email (admin@… ⇒ Admin) — never trust that.
-- This trigger forces the stored Role: new self-created rows are pinned to
-- 'Viewer', and non-admins can never change an existing row's Role. Only an
-- Admin (or a service-role/SQL operator, which bypasses RLS + triggers via
-- session_replication_role) may assign elevated roles.
create or replace function public.enforce_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Trusted when the caller is an Admin, OR when there is no auth context at all
  -- (auth.uid() null ⇒ service-role / SQL-editor / migration — anon is already
  -- blocked by RLS before this trigger can fire).
  caller_is_admin boolean := public.has_role('Admin') or auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    if not caller_is_admin then
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{Role}', '"Viewer"');
    end if;
  elsif tg_op = 'UPDATE' then
    if not caller_is_admin then
      -- preserve the previously stored role
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{Role}',
                            coalesce(old.data->'Role', '"Viewer"'));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_user_role on public.users;
create trigger trg_enforce_user_role
  before insert or update on public.users
  for each row execute function public.enforce_user_role();

commit;

-- ── Post-apply: bootstrap the first admin (run once, as SQL owner) ──────────
-- The trigger blocks self-promotion, so seed your admin here explicitly:
--
--   update public.users
--      set data = jsonb_set(data, '{Role}', '"Admin"')
--    where lower(data->>'Email') = lower('you@yourcompany.com');
--
-- (This SQL runs as table owner and bypasses the trigger's non-admin branch.)
