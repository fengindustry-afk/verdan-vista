# Vercel edge hardening vs. rawsec-Ubuntu proxy

Why the rawsec-Ubuntu enclave (`D:\Project\rawsec`) does **not** port 1:1 to
this Vercel-hosted SPA, and what we do instead. See also `SECURITY.md`.

## The structural mismatch

rawsec's security model is **network topology**: Postgres sits on an
`internal: true` db-net with *no host port*, reachable only through
backend → frontend → nginx. The nginx proxy is the single front door and
everything behind it is private.

This app has **no such topology**. It is a static Vite bundle on Vercel's CDN,
and the browser talks to Supabase (`*.supabase.co`) **directly**. Any proxy in
front of Vercel would only see requests for our static JS — never the API/data
calls that matter. So the "single front door" concept structurally does not
exist here.

**Consequence:** Supabase **RLS is the direct replacement for rawsec's db-net
isolation.** It is the wall. Already applied & enforced (3/3, 2026-07-07).

## Can Vercel run the rawsec containers? No.

Vercel (Hobby/free) runs only: static assets, Serverless Functions, and Edge
Middleware/Functions. No `docker-compose`, no persistent nginx/CrowdSec/Postgres
containers, no network segmentation, no SSH host. The rawsec stack cannot run.

## Component mapping

| rawsec (nginx + CrowdSec) | Vercel equivalent | Status |
|---|---|---|
| TLS termination, HSTS, HTTP/2 | Automatic managed certs | ✅ built-in |
| Security headers + CSP | `vercel.json` + `public/_headers` | ✅ done (stricter CSP than rawsec) |
| `server_tokens off` | Origin version never leaked | ✅ built-in |
| CrowdSec decoy-scenario (instant ban) | `middleware.ts` `BLOCKED_PATHS` → 403 | ✅ done (free) |
| CrowdSec bad-actor detection | `middleware.ts` `BLOCKED_AGENTS` | ✅ done (free) |
| Allowed HTTP methods | `middleware.ts` `ALLOWED_METHODS` | ✅ done (free) |
| IP/geo edge rules | `middleware.ts` `BLOCKED_COUNTRIES` (opt-in) | ✅ hook (free) |
| `limit_req` general 30r/s | `middleware.ts` best-effort limiter | ⚠️ per-instance only (free) |
| `limit_req` **login 5r/m** | **Supabase dashboard → Auth → Rate Limits** | ⬜ **action item** |
| Full CrowdSec IPS (log-learning) | Vercel WAF managed rules + bot protection | ⬜ Pro/Enterprise (paid) |
| `/api/` reverse-proxy to backend | N/A — Supabase is hit directly | — n/a |
| db-net network isolation | **Supabase RLS** | ✅ enforced |
| Prometheus/Loki/Grafana/Promtail | Vercel Log Drains → external Grafana/Datadog | ⬜ optional |
| read-only FS, cap_drop, restic | Managed by Vercel/Supabase | — n/a |

## Free-tier posture (what we built)

`middleware.ts` (root) — runs on the edge before every request, Hobby plan, no
cost, no external store. Covers decoy-path blocking, scanner-UA blocking, method
allowlist, optional geo block, and best-effort rate limiting.

## Remaining action items (both free)

1. **Supabase Auth rate limits** — the real brute-force wall for `/auth/v1/token`
   (browser calls it directly; Vercel/middleware never see it). Set in the
   Supabase dashboard. This is the true analog of rawsec's `login 5r/m`.
2. **Vercel Firewall** — enable the free custom rules / Attack Challenge Mode in
   the project dashboard (managed WAF rulesets are paid, but basics are free).
