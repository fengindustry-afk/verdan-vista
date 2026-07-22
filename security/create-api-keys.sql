-- ============================================================================
-- API keys (2026-07-21): long-lived, read-only credentials so a manager can
-- pull data through an MCP client (Claude) without pasting a fresh session
-- token every hour.
--
-- What is stored is a SHA-256 hash of the key, never the key itself. A leaked
-- database dump therefore yields nothing usable, and "show me the key again"
-- is impossible by construction — the UI shows it once, at creation.
--
-- The key is a bearer credential: whoever holds it acts with the role stamped
-- on the row. So:
--   * keys are read-only (the MCP server exposes no write tool to them),
--   * every key carries an expiry,
--   * LastUsedAt is written on each call, so an unused or surprising key is
--     visible rather than silent.
--
-- Only Admins may mint or revoke. The edge function reads this table with the
-- service role, which bypasses RLS by design — the policies below govern the
-- app's own access.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ============================================================================

begin;

-- data: {
--   "id", "Label", "KeyHash", "KeyPrefix", "Role",
--   "CreatedBy", "CreatedAt", "ExpiresAt", "LastUsedAt"?, "Revoked"?
-- }
create table if not exists public.api_keys (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.api_keys enable row level security;
alter table public.api_keys force row level security;

-- Admins only, in every direction. A non-admin has no reason to enumerate even
-- the hashes: knowing a key exists, its label and its role is reconnaissance.
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys
  for select to authenticated using (public.has_role('Admin'));

drop policy if exists api_keys_insert on public.api_keys;
create policy api_keys_insert on public.api_keys
  for insert to authenticated with check (public.has_role('Admin'));

drop policy if exists api_keys_update on public.api_keys;
create policy api_keys_update on public.api_keys
  for update to authenticated
  using (public.has_role('Admin')) with check (public.has_role('Admin'));

drop policy if exists api_keys_delete on public.api_keys;
create policy api_keys_delete on public.api_keys
  for delete to authenticated using (public.has_role('Admin'));

-- The lookup path the edge function uses on every call: hash → key row.
create unique index if not exists api_keys_hash_unique
  on public.api_keys ((data->>'KeyHash'))
  where data->>'KeyHash' is not null;

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- select policyname from pg_policies where tablename = 'api_keys';
-- select indexname  from pg_indexes  where tablename = 'api_keys';
--
-- Which keys are live, and are any of them idle?
--
-- select data->>'Label'      as label,
--        data->>'Role'       as role,
--        data->>'KeyPrefix'  as prefix,
--        data->>'ExpiresAt'  as expires,
--        data->>'LastUsedAt' as last_used
-- from public.api_keys
-- where coalesce((data->>'Revoked')::boolean, false) = false
-- order by data->>'CreatedAt' desc;
