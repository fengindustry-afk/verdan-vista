# Security Model

CarbonTracker Web is a static SPA (Vite/React) backed by Supabase. Unlike a
self-hosted 3-tier stack, there is no application server to guard the database —
so **the database must guard itself**. The security posture below follows that
principle: never trust the client, enforce access at the data tier, and lock down
the delivery edge.

## Architecture & trust boundaries

```
  Browser (untrusted)                 Supabase (trust boundary)
  ┌───────────────────┐    HTTPS      ┌────────────────────────────┐
  │ React SPA          │ ───JWT────▶  │ Auth (GoTrue)              │
  │  - anon key (public)│             │ PostgREST + Postgres        │
  │  - session JWT      │ ◀──rows───  │  └─ Row-Level Security ◀──── the real boundary
  │  - RBAC (UX only)   │             │ Storage                    │
  └───────────────────┘              └────────────────────────────┘
        ▲ edge: CSP + security headers (Vercel/Netlify)
```

- The **anon key is public** (it ships in the JS bundle). It is safe *only* when
  RLS is enabled — RLS is what makes the key harmless.
- The **session JWT** authenticates real users; the client sends it on every
  Supabase call automatically.
- **Client-side RBAC** (`src/lib/rbac.ts`) hides controls a role can't use. It is
  **not** a security boundary — it's convenience. Enforcement is RLS.

## Threat → control map

| Threat | Control |
|--------|---------|
| **Open data tier** — anyone with the (public) anon key reads/writes/deletes all rows | **Row-Level Security** (`security/rls.sql`): no valid JWT ⇒ no access; writes gated by server-stored role. *Apply-when-ready — see `security/auth-migration.md`.* |
| **Privilege escalation** — client derives its own role (`admin@…`) and could self-promote | `enforce_user_role` trigger pins self-created roles to `Viewer`; only an Admin (or SQL owner) can elevate. Client role is never trusted server-side. |
| **XSS injecting into the DOM** | Strict **CSP** (`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`); React escapes by default; no `dangerouslySetInnerHTML`. |
| **Malicious stream/URL injection** (`javascript:`, `data:`, `file:` in the CCTV custom input) | `sanitizeStreamUrl` (`src/lib/validation.ts`) allows only `http(s)`; covered by tests. |
| **Clickjacking** | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`. |
| **MIME sniffing** | `X-Content-Type-Options: nosniff`. |
| **Protocol downgrade / MITM** | `Strict-Transport-Security` (2y, preload) + CSP `upgrade-insecure-requests`. |
| **Referrer / cross-origin leakage** | `Referrer-Policy: no-referrer`; `Cross-Origin-Opener-Policy: same-origin`. |
| **Device API abuse** | `Permissions-Policy` scopes geolocation + camera to `self` (needed for GPS/photo capture) and denies mic, payment, USB, FLoC entirely; cross-origin frames get nothing. |
| **Malformed / oversized input** | `zod` schemas validate + bound every write form (`newBatchSchema`, `corcInputSchema`). |
| **Brute-force login** | Supabase Auth built-in rate limits on the auth endpoints. |
| **Vulnerable dependencies** | `npm audit` (prod, high-gate) + `npm audit signatures` + Dependency Review on PRs; client-shipped `xlsx` pinned to the patched SheetJS build. |
| **Secret leakage** | Only the public anon key is in the client (by design). Service-role key is never in the frontend. `.env` is git-ignored. **gitleaks** scans every push/PR + full history. |
| **Open object storage** — anon read/write of GPS-tagged evidence photos | Buckets kept **private**, authenticated-only, role-gated (`security/storage-policies.sql`); supersedes the anon-open `shared/supabase_storage.sql`. Images served via short-lived signed URLs. |
| **Posture drift** — a control silently regresses | `security/verify-posture.mjs` (`npm run security:verify`) actively probes anon read/write, storage listability, and edge headers; exits non-zero on regression. |
| **SQL injection** | No hand-built SQL in the app; PostgREST parameterizes. RLS policies use bound `auth.jwt()` claims. |

## Security controls in this repo

| Control | Location |
|---------|----------|
| Security headers + strict CSP | `vercel.json`, `public/_headers` |
| Row-Level Security policies | `security/rls.sql` (+ `rls-rollback.sql`) |
| Auth + RLS migration runbook | `security/auth-migration.md` |
| Input validation / URL sanitization | `src/lib/validation.ts` (+ tests) |
| Hardened storage (private buckets) | `security/storage-policies.sql` |
| Live posture verifier | `security/verify-posture.mjs` (`npm run security:verify`) |
| CI security scan (audit + signatures + gitleaks) | `.github/workflows/security.yml`, `.gitleaks.toml` |

## Residual risks / accepted items

- **RLS not yet enabled on the shared project.** This is the top open item;
  enabling it is a coordinated, breaking change with the .NET app
  (`security/auth-migration.md`). Until then, the data tier is open.
- **Session token in `localStorage`.** Supabase-JS stores the session there by
  default; a successful XSS could read it. Mitigated by the strict CSP and no
  untrusted HTML injection. (HttpOnly cookies would require a server proxy the
  static-SPA architecture doesn't have.)
- **Demo login** issues a client-only session with no JWT — for demos only.
  Disable or gate it out of production once real auth + RLS are live.
- **`picomatch@2.3.1`** flagged by `npm audit` (ReDoS) is a **build-time-only**
  transitive dep of Tailwind's toolchain; it never runs against untrusted input
  in production and cannot be bumped without breaking the toolchain. Accepted.
- **CCTV custom streams** are constrained by CSP `connect-src`; arbitrary hosts
  won't load unless added to the allow-list. Intentional.

## Reporting

Report suspected vulnerabilities privately to the maintainers; do not open a
public issue with exploit details.
