# AGENTS.md — Routing stub for CarbonTracker (verdant-vista)

This file is the always-on routing index. It does NOT contain the answer to any
specific question; it tells a model WHERE to look so it loads only the leaf it
needs instead of holding the whole repo in context. Read the relevant section,
then `read_file`/`search_files` the specific target. Do not load files wholesale.

## What this is

CarbonTracker is a biochar / carbon-credit (CORC) SPA: Vite + React + TS app,
Supabase backend, Vercel serverless functions + crons. It models a biomass →
biochar → CORC custody value chain. When a task arrives, route to the matching
area below.

## Routing map (load by need)

| Task | Go to |
|------|-------|
| **Value-chain / CORC math, dashboard "Potential CORC" chart** | `src/lib/valueChain.ts` (workbook model) · `src/lib/feedstock.ts` (lab-measured corcMetrics) · `src/lib/sensorAggregate.ts` |
| **Sensors / dMRV pipeline (device → ingest → store)** | `src/lib/sensors.ts` (types, PARAMETERS, validation) · `api/ingest/sensor.js` (signed write path) · `scripts/mock-sensor-stream.mjs` · `security/create-sensor-ingestion.sql` |
| **Automation loops (crons, alerts, reactions)** | `api/crons/*` (sensor-scan, reconcile-mrv, backup, `_shared.js`) · `api/reactions/notify.js` · `docs/automation-loops.md` · `vercel.json` (cron schedule) |
| **Business source docs (workbooks, PDFs, partnership)** | `esterra/` · `ESTERRA_COMPARISON.md` (base-vs-MP-Sepang divergence) |
| **Design decisions & architecture ADRs** | `docs/` — esp. `ADR-001-sensor-ingestion.md`, `ADR-002-audio-local-vs-cloud.md`, `SPECIFICATION.md`, `automation-loops.md` |
| **Security / RLS / schema migrations** | `security/*.sql` (create-*.sql per table, rls.sql, storage-policies.sql) · `SECURITY.md` |
| **Supabase edge functions** | `supabase/functions/*` (analyze-tree-scan, extract-receipt, r2-sign, tree-mcp) |
| **Session continuity (what's in progress, decisions)** | `memory-bank/` — `activeContext.md`, `progress.md`, `decisionLog.md`, `productContext.md`, `systemPatterns.md` |
| **Verification / CI / scripts** | `scripts/` — `prepush-check.mjs` (gates), `goal-verify.mjs` (Loop 2), `backup-supabase.mjs` · `.github/workflows/ci.yml` · `package.json` scripts |
| **App pages / features** | `src/pages/*` (Dashboard, Feedstock, Workflow, CorcCalculator, SensorDashboard, Reports, ...) · `src/lib/*` |
| **Mobile / desktop audio capture (unrelated to carbon core)** | `docs/AREA*.md`, `docs/*audio*.md` — separate subsystem; only touch if the task is audio |

## Conventions to honor

- **Cost & latency discipline:** prefer deterministic routing (paths, indexes) over
  re-scanning; load only the files a task needs. See `docs/automation-loops.md`
  (4-loop autonomy) and the latency/quality ruling.
- **Authoritative model = BASE** for MRV reconciliation (see `api/crons/reconcile-mrv.js`);
  the MP Sepang variant is NOT authoritative without owner sign-off.
- **Verify, don't self-report:** use `npm run check` / `npm run verify:goal` before
  claiming green. Secrets live in `.env` / Vercel env, never in committed code.
- **RLS is load-bearing:** writes go through service-role serverless functions
  (`api/*`, `supabase/functions/*`); the anon key cannot write. Don't bypass this.
- Add new knowledge to the correct leaf and this index, not into this file's body.
