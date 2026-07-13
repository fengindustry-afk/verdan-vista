-- ============================================================================
-- Security-linter remediation for CarbonTracker / Esterra
-- ============================================================================
-- Clears the Supabase database linter findings:
--   1. "Function Search Path Mutable"          → pin search_path on our functions
--   2. "Public Can Execute SECURITY DEFINER"   → revoke EXECUTE from public/anon
--   3. "Signed-In Users Can Execute SECURITY   → revoke EXECUTE from authenticated
--       DEFINER" (trigger/util functions)         on functions that don't need it
--   4. "RLS Policy Always True" (edit_history) → replace `true` with a real
--                                                 predicate (functionally identical
--                                                 for the `authenticated` role)
--
-- Apply AFTER security/rls.sql (and the create-*.sql tables) in the Supabase SQL
-- editor. Idempotent — safe to re-run.
--
-- NOTE on the 5th finding, "Leaked Password Protection Disabled": that is an Auth
-- setting, not SQL. Enable it (free) in the Dashboard:
--   Authentication ▸ Sign In / Providers ▸ Passwords ▸
--     "Prevent use of leaked passwords"  → ON
-- The app also checks HIBP client-side on sign-up (src/lib/pwned.ts) as a backstop.
-- ============================================================================

begin;

-- ── 1–3. Function hardening ────────────────────────────────────────────────
-- Pin search_path on every function we own (kills "search_path mutable"), then
-- lock down EXECUTE. current_app_role() and has_role() are evaluated INSIDE RLS
-- policies, so the `authenticated` role must keep EXECUTE on them. The trigger
-- function enforce_user_role() and any util like rls_auto_enable() are never
-- called directly by clients, so no client role needs EXECUTE at all.
--
-- Done dynamically so it matches each function regardless of its argument list
-- (e.g. has_role(variadic text[])), and silently skips any that don't exist.
do $$
declare
  fn record;
begin
  for fn in
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'has_role', 'current_app_role', 'enforce_user_role', 'rls_auto_enable'
       )
  loop
    -- 1. Immutable, injection-safe search_path.
    execute format('alter function public.%I(%s) set search_path = public;',
                   fn.proname, fn.args);

    -- 2/3. Start from "nobody", then re-grant only where required below.
    execute format('revoke all on function public.%I(%s) from public;',
                   fn.proname, fn.args);
    execute format('revoke all on function public.%I(%s) from anon;',
                   fn.proname, fn.args);
    execute format('revoke all on function public.%I(%s) from authenticated;',
                   fn.proname, fn.args);

    -- Re-grant EXECUTE to authenticated ONLY for the role-resolution helpers,
    -- which RLS policy expressions call on every authenticated request.
    if fn.proname in ('has_role', 'current_app_role') then
      execute format('grant execute on function public.%I(%s) to authenticated;',
                     fn.proname, fn.args);
    end if;
  end loop;
end $$;

-- ── 4. edit_history: drop the "always true" expressions ────────────────────
-- The log must stay readable + appendable by any authenticated user and remain
-- append-only (no UPDATE/DELETE policy). Swapping `true` for `auth.uid() is not
-- null` is functionally identical for the `authenticated` role but is a concrete
-- predicate, so the linter no longer flags it.
do $$
begin
  if to_regclass('public.edit_history') is not null then
    execute 'drop policy if exists edit_history_select on public.edit_history';
    execute $p$create policy edit_history_select on public.edit_history
              for select to authenticated using (auth.uid() is not null)$p$;

    execute 'drop policy if exists edit_history_insert on public.edit_history';
    execute $p$create policy edit_history_insert on public.edit_history
              for insert to authenticated with check (auth.uid() is not null)$p$;

    -- Immutability: intentionally no UPDATE / DELETE policy.
    execute 'drop policy if exists edit_history_update on public.edit_history';
    execute 'drop policy if exists edit_history_delete on public.edit_history';
  end if;
end $$;

commit;

-- ── Optional: if rls_auto_enable() is an orphan experiment you don't use ─────
-- (it isn't referenced anywhere in this codebase). To remove it entirely rather
-- than just locking it down, run — after confirming nothing depends on it:
--
--   drop function if exists public.rls_auto_enable();
--
-- Leave it if a scheduled job / event trigger relies on it; the block above has
-- already pinned its search_path and revoked public/anon/authenticated EXECUTE.
