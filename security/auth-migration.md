# Auth + RLS Migration Guide

Moving CarbonTracker from **open anon access** to **DB-enforced, authenticated
RBAC** — the rawsec "data tier is never trusted to the client" posture.

## Why

Today the Supabase anon key ships inside the client bundle and **RLS is off**, so
anyone who opens DevTools can read, write, and delete every row in every table
(verified: an anon `INSERT` + `DELETE` both succeed). The mock login also derives
the user's role in the browser (`admin@…` ⇒ Admin) and stores it in
`localStorage` — trivially spoofable.

RLS fixes this at the database: no valid JWT ⇒ no access, and writes are checked
against the caller's server-stored role. A tampered client cannot exceed its
privileges.

## ⚠️ Breaking change — shared backend

This Supabase project is shared with the **.NET MAUI app**, which currently uses
the anon key with **no user session**. Once RLS is enabled, that app must sign in
as a real Supabase Auth user (email/password) and send the session JWT on every
request, or it will get empty reads / 401s. **Coordinate the rollout** — enable
RLS only when both clients authenticate.

## Order of operations

1. **Supabase Auth settings** (Dashboard → Authentication):
   - Decide on email confirmation. For frictionless logins either turn *Confirm
     email* off, or configure SMTP. (The web app already surfaces the
     "confirm your email" state.)
   - Keep the default rate limits on the auth endpoints.

2. **Create real accounts** for each operator/manager/admin (sign-up in the web
   app, or Dashboard → Authentication → Users → *Add user*).

3. **Ensure each account has a `users` profile row.** The web app upserts one on
   first login (email-matched). Confirm the row exists for each account.

4. **Apply RLS** — run [`rls.sql`](./rls.sql) in the Supabase SQL editor.

5. **Bootstrap the first admin** (the anti-escalation trigger pins self-created
   roles to `Viewer`), running as the SQL owner:

   ```sql
   update public.users
      set data = jsonb_set(data, '{Role}', '"Admin"')
    where lower(data->>'Email') = lower('you@yourcompany.com');
   ```

6. **The .NET app is already migrated** (drafted in `carbon-tracker-dotnet`):
   - `Services/SupabaseAuthService.cs` — GoTrue sign-in / sign-up / refresh /
     sign-out; refresh token persisted in `SecureStorage`.
   - `Services/SupabaseDataService.cs` — `BuildAsync` now attaches the user JWT
     (`CurrentAccessToken`) as the Bearer, falling back to the anon key when
     signed out (which RLS then denies).
   - `SupabaseConfig.AuthUrl`, DI registration in `MauiProgram.cs`, real sign-in
     in `LoginViewModel`, session revoke in `SettingsViewModel` logout, and
     startup session-restore in `App.xaml.cs`.
   - **Compile it in your MAUI environment** (couldn't be built here) and verify
     before enabling RLS in production. The **demo login** (`demo1234`) has no real
     account, so it stops working once RLS is on — gate it out of production.
   Until both clients are confirmed working, keep RLS off or run
   [`rls-rollback.sql`](./rls-rollback.sql).

7. **Verify** (see checklist) and remove the demo/mock login buttons from
   production, or gate them to a non-production build.

## Policy model (what `rls.sql` enforces)

| Table group | SELECT | INSERT / UPDATE | DELETE |
|-------------|--------|-----------------|--------|
| feedstock, locations, photos, biomass, trees, readings, scans, labels | any authenticated | Operator, Manager, Admin | Manager, Admin |
| users | any authenticated | own row, or Admin (role pinned to Viewer unless Admin) | Admin |
| *anon* | ❌ denied | ❌ denied | ❌ denied |

- `current_app_role()` resolves the role from the `users` table by the caller's
  JWT email (SECURITY DEFINER so the lookup isn't self-blocked).
- `force row level security` is set so even the table owner is subject to policy
  in normal sessions.
- The `enforce_user_role` trigger blocks client-side privilege escalation.

## Verification checklist

Run these after applying (replace the JWT):

```bash
BASE=https://<project>.supabase.co/rest/v1
ANON=<anon-key>

# 1. Anon is now denied (expect 401/empty, NOT 200 with rows)
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/feedstock_sourcing?select=id" \
  -H "apikey: $ANON"

# 2. Anon write is denied (expect 401/403)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/asset_locations" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"id":"X","data":{}}'

# 3. Authenticated Viewer can read but not write; Operator can write; only
#    Admin can change a users row's Role. Test with real session JWTs.
```

Also open the deployed app in the browser and confirm the Network tab shows the
`Authorization: Bearer` header on Supabase calls and that Viewer accounts see no
write buttons *and* get 403 if a write is forced.
