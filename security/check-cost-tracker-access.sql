-- ============================================================================
-- Diagnose why Cost Tracker writes are (or aren't) reaching the database.
--
-- WHY: RLS (security/rls.sql) gates cost_entries / cost_budgets /
--   cost_categories writes on the caller's role, resolved by current_app_role():
--   it reads auth.jwt() ->> 'email', looks that email up in public.users, and
--   returns data->>'Role' (default 'Viewer'). Insert/Update need
--   Operator/Manager/Admin; Delete needs Manager/Admin. The login screen's role
--   buttons and the admin@… ⇒ Admin client derivation are UX ONLY — the database
--   ignores them, so the UI can show "Admin" while the DB still sees "Viewer".
--
-- This script computes exactly what the DB WOULD resolve for a given sign-in
-- email and prints PASS/FAIL for every cost-tracker operation. It is read-only.
--
-- IMPORTANT: The Supabase SQL editor runs as a privileged role with NO user JWT,
--   so current_app_role() called here would always say 'Viewer'. That is why this
--   script takes the email as a parameter and does the lookup itself, mirroring
--   what current_app_role() returns for that user once they are authenticated.
--
-- HOW TO USE: change v_email below to the address you sign in with, then run the
--   whole script in the Supabase SQL editor. Read the NOTICEs it raises.
--
-- If the resolved role is Viewer / no profile, fix it with
--   security/seed-admin-user.sql (promotes the email to Admin).
-- ============================================================================

do $$
declare
  v_email       text := 'marleyn45678@gmail.com';   -- ← CHANGE to your sign-in email
  v_has_auth    boolean;
  v_profile     jsonb;
  v_role        text;
  v_can_write   boolean;   -- Operator / Manager / Admin
  v_can_delete  boolean;   -- Manager / Admin
  v_missing     text := '';
  t             text;
begin
  raise notice '=== Cost Tracker access diagnostic for % ===', v_email;

  -- 1. Is there a Supabase Auth account? Without one the user can never obtain a
  --    JWT, so every write arrives as anon and is denied before RLS role checks.
  select exists (
    select 1 from auth.users where lower(email) = lower(v_email)
  ) into v_has_auth;

  if v_has_auth then
    raise notice '[auth]    OK  — an auth account exists (user can obtain a JWT).';
  else
    raise notice '[auth]    FAIL — NO auth account for this email. Create one (app "Create account", or Supabase → Authentication → Users → Add user), then sign in with the email/password form, NOT the demo buttons.';
  end if;

  -- 2. Resolve the role exactly as current_app_role() would (default 'Viewer').
  select u.data into v_profile
    from public.users u
   where lower(u.data->>'Email') = lower(v_email)
   limit 1;

  if v_profile is null then
    v_role := 'Viewer';
    raise notice '[profile] FAIL — no public.users row for this email → resolves to the default role "Viewer" (cannot write).';
  else
    v_role := coalesce(v_profile->>'Role', 'Viewer');
    raise notice '[profile] OK  — profile found; stored Role = %.', v_role;
  end if;

  v_can_write  := v_role in ('Operator','Manager','Admin');
  v_can_delete := v_role in ('Manager','Admin');
  raise notice '[role]    Resolved role: %  (can write=%, can delete=%)', v_role, v_can_write, v_can_delete;

  -- 3. Do the tables exist and is RLS actually enabled on them?
  foreach t in array array['cost_entries','cost_budgets','cost_categories'] loop
    if to_regclass(format('public.%I', t)) is null then
      v_missing := v_missing || t || ' ';
    end if;
  end loop;
  if v_missing <> '' then
    raise notice '[schema]  FAIL — missing table(s): %— run security/create-cost-tracker.sql.', v_missing;
  else
    raise notice '[schema]  OK  — cost_entries / cost_budgets / cost_categories all exist.';
  end if;

  -- 4. Per-operation verdict for the resolved role (matches the RLS policies).
  raise notice '--- Would each operation pass for role "%"? ---', v_role;
  raise notice 'cost_entries    SELECT: PASS (any authenticated)';
  raise notice 'cost_entries    INSERT: %', case when v_can_write  then 'PASS' else 'FAIL — needs Operator/Manager/Admin' end;
  raise notice 'cost_entries    UPDATE: %', case when v_can_write  then 'PASS' else 'FAIL — needs Operator/Manager/Admin' end;
  raise notice 'cost_entries    DELETE: %', case when v_can_delete then 'PASS' else 'FAIL — needs Manager/Admin' end;
  raise notice 'cost_categories INSERT: %', case when v_can_write  then 'PASS' else 'FAIL — needs Operator/Manager/Admin' end;
  raise notice 'cost_budgets    INSERT: %', case when v_can_delete then 'PASS' else 'FAIL — needs Manager/Admin' end;

  -- 5. Bottom line. The app saves an expense via upsert (INSERT ... ON CONFLICT
  --    DO UPDATE), so it needs the INSERT policy (and UPDATE when the id already
  --    exists) — i.e. write access.
  if v_has_auth and v_can_write and v_missing = '' then
    raise notice '=== RESULT: OK — this account can save cost entries. If writes still fail, confirm the app is in a live (not demo/offline) session so a real JWT is sent. ===';
  else
    raise notice '=== RESULT: BLOCKED — cost-entry writes will be rejected. Fix the FAIL line(s) above (usually: run security/seed-admin-user.sql to promote this email, and ensure it has an auth account). ===';
  end if;
end $$;

-- Optional: raw view of every profile + role, to eyeball mismatches.
--   select data->>'Email' as email, data->>'Role' as role from public.users order by 1;
