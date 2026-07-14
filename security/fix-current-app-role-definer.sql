-- ============================================================================
-- Fix: "Signed-In Users Can Execute SECURITY DEFINER Function"
--       → public.current_app_role()
-- ============================================================================
-- Supabase's security advisor flags current_app_role() because it is SECURITY
-- DEFINER *and* the `authenticated` role can execute it. The naive remediation
-- (revoke EXECUTE from authenticated) is WRONG here: this function is called by
-- has_role() inside every RLS write policy, and Postgres checks EXECUTE against
-- the CALLING role even for functions used in policies. Revoking it would make
-- every authenticated INSERT/UPDATE/DELETE fail with:
--     permission denied for function current_app_role
--
-- The correct, non-breaking fix is to drop the SECURITY DEFINER property. The
-- function only reads public.users, and users_select already permits any
-- authenticated user to read that table (see security/rls.sql). Running it as
-- SECURITY INVOKER is therefore:
--   • a real least-privilege tightening (no longer executes as the table owner),
--   • safe on the direct RLS path (caller can read users → resolves own role),
--   • safe on the trigger path (enforce_user_role runs as the BYPASSRLS owner;
--     the nested invoker call inherits that context; auth.jwt()/auth.uid() are
--     unaffected),
--   • enough to clear the advisor, which only flags SECURITY DEFINER functions.
--
-- Dependency to keep in mind: this now relies on the users SELECT policy letting
-- a user read AT LEAST their own row. The current policy allows reading all
-- rows, so there is ample headroom. If users_select is ever tightened to
-- admin-only reads, revisit this function.
--
-- Apply in the Supabase SQL editor (runs as the privileged owner). Idempotent.
-- ============================================================================

begin;

-- Re-define as SECURITY INVOKER (CREATE OR REPLACE can flip the security mode).
create or replace function public.current_app_role()
returns text
language sql
stable
security invoker
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

-- Grants are unchanged: anon must not call it, authenticated must (RLS needs it).
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

commit;

-- ── Verify (optional) ───────────────────────────────────────────────────────
-- prosecdef should be false after this runs:
--   select proname, prosecdef
--     from pg_proc
--    where proname in ('current_app_role', 'has_role', 'enforce_user_role');
-- Expected: current_app_role=f, has_role=f, enforce_user_role=t (trigger, locked).
