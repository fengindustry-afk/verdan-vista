-- ============================================================================
-- Grant an app user the Admin role so their writes pass Row-Level Security.
--
-- WHY: RLS (security/rls.sql) resolves your role via current_app_role() —
--   it reads auth.jwt() ->> 'email', looks that email up in public.users, and
--   returns data->>'Role' (default 'Viewer'). Inserts/updates require the role
--   to be Operator/Manager/Admin. A brand-new signup defaults to Viewer and a
--   demo/"Quick access" login has NO Supabase session at all, so neither can
--   write. This promotes a specific email to Admin.
--
-- HOW TO USE (three steps):
--   1. Create the AUTH account for the email below, one of:
--        • In the app: use "Create account" (Sign up) on the login screen, OR
--        • In Supabase: Authentication → Users → Add user, tick "Auto Confirm".
--      (If email confirmation is on, confirm via the emailed link first.)
--   2. Run THIS script in the Supabase SQL editor (runs as service role, so it
--      bypasses RLS). Change v_email to the address you'll sign in with.
--   3. Sign in through the normal email/password form (NOT the demo buttons).
--      Your writes — receipts, cost entries, etc. — will now be accepted.
--
-- Safe to re-run: promotes an existing users row, or inserts one if missing.
-- ============================================================================

do $$
declare
  v_email text := 'danial.work654@gmail.com';   -- ← CHANGE to your sign-in email
begin
  update public.users
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{Role}', '"Admin"'),
         updated_at = now()
   where lower(data->>'Email') = lower(v_email);

  if not found then
    insert into public.users (id, data)
    values (
      gen_random_uuid()::text,
      jsonb_build_object('Email', v_email, 'FullName', 'Administrator', 'Role', 'Admin')
    );
  end if;
end $$;

-- Verify:
--   select id, data->>'Email' as email, data->>'Role' as role from public.users;
