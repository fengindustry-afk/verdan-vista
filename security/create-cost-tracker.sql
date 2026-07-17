-- ============================================================================
-- Create the cost_entries, cost_budgets and cost_categories tables for the
-- Cost Tracker feature. Document-store shape (id text, data jsonb,
-- updated_at) like every other collection.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

create table if not exists public.cost_entries (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_budgets (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_categories (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cost_entries enable row level security;
alter table public.cost_entries force row level security;
alter table public.cost_budgets enable row level security;
alter table public.cost_budgets force row level security;
alter table public.cost_categories enable row level security;
alter table public.cost_categories force row level security;

drop policy if exists anon_all on public.cost_entries;
drop policy if exists anon_all on public.cost_budgets;
drop policy if exists anon_all on public.cost_categories;

-- Personal-ledger rows are private to their owner (matched by login email);
-- Esterra (business) rows stay shared. NULL-safe: a missing owner email or a
-- JWT without an email yields NULL (= not owner), never a match.
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
  using (public.owns_personal_entry(data));

drop policy if exists cost_entries_insert on public.cost_entries;
create policy cost_entries_insert on public.cost_entries
  for insert to authenticated
  with check (
    public.has_role('Operator','Manager','Admin')
    and public.owns_personal_entry(data)
  );

drop policy if exists cost_entries_update on public.cost_entries;
create policy cost_entries_update on public.cost_entries
  for update to authenticated
  using (
    public.has_role('Operator','Manager','Admin')
    and public.owns_personal_entry(data)
  )
  with check (
    public.has_role('Operator','Manager','Admin')
    and public.owns_personal_entry(data)
  );

drop policy if exists cost_entries_delete on public.cost_entries;
create policy cost_entries_delete on public.cost_entries
  for delete to authenticated
  using (
    public.has_role('Manager','Admin')
    and public.owns_personal_entry(data)
  );

drop policy if exists cost_budgets_select on public.cost_budgets;
create policy cost_budgets_select on public.cost_budgets
  for select to authenticated using (true);

drop policy if exists cost_budgets_insert on public.cost_budgets;
create policy cost_budgets_insert on public.cost_budgets
  for insert to authenticated
  with check (public.has_role('Manager','Admin'));

drop policy if exists cost_budgets_update on public.cost_budgets;
create policy cost_budgets_update on public.cost_budgets
  for update to authenticated
  using (public.has_role('Manager','Admin'))
  with check (public.has_role('Manager','Admin'));

drop policy if exists cost_budgets_delete on public.cost_budgets;
create policy cost_budgets_delete on public.cost_budgets
  for delete to authenticated
  using (public.has_role('Manager','Admin'));

drop policy if exists cost_categories_select on public.cost_categories;
create policy cost_categories_select on public.cost_categories
  for select to authenticated using (true);

drop policy if exists cost_categories_insert on public.cost_categories;
create policy cost_categories_insert on public.cost_categories
  for insert to authenticated
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists cost_categories_update on public.cost_categories;
create policy cost_categories_update on public.cost_categories
  for update to authenticated
  using (public.has_role('Operator','Manager','Admin'))
  with check (public.has_role('Operator','Manager','Admin'));

drop policy if exists cost_categories_delete on public.cost_categories;
create policy cost_categories_delete on public.cost_categories
  for delete to authenticated
  using (public.has_role('Operator','Manager','Admin'));

commit;
