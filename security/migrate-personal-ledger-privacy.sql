-- ============================================================================
-- Personal-ledger privacy for the Cost Tracker (2026-07-17).
--
-- Before this: every authenticated user could read ALL cost entries,
-- including the Personal ledger. After this: rows with Ledger = 'Personal'
-- are visible/editable ONLY by their owner, matched by login email
-- (danial.work654@gmail.com for all current rows). Esterra (business)
-- rows remain shared as before.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
-- security/create-cost-tracker.sql now carries the same policies for
-- fresh installs.
-- ============================================================================

begin;

-- ── 1. Backfill: stamp existing Personal rows with their owner's email ──
-- All Personal rows to date were imported from Estera.xlsx and belong to
-- danial.work654@gmail.com. New app entries stamp CreatedByEmail themselves.
update public.cost_entries
set data = data || jsonb_build_object('CreatedByEmail', 'danial.work654@gmail.com'),
    updated_at = now()
where coalesce(data->>'Ledger','Esterra') = 'Personal'
  and data->>'CreatedByEmail' is null;

-- ── 2. Owner predicate ──
-- NULL-safe: a missing owner email or a JWT without an email yields NULL
-- (= not owner), never a match.
create or replace function public.owns_personal_entry(data jsonb)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(data->>'Ledger','Esterra') <> 'Personal'
      or nullif(lower(coalesce(data->>'CreatedByEmail', data->>'CreatedBy')), '')
         = lower(auth.jwt()->>'email');
$$;

-- ── 3. Replace cost_entries policies ──
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

commit;

-- ── Verify (optional) ──
-- As danial.work654@gmail.com you should see all 135 seeded rows; any other
-- account should see zero Personal rows:
--   select coalesce(data->>'Ledger','Esterra') as ledger, count(*)
--   from public.cost_entries group by 1;
