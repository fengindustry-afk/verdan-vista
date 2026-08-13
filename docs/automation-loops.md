# Automation & Agent Loops

CarbonTracker's automation is organized around four autonomy loops, adapted from the
"4 loops of Claude Code" framework. Each loop hands the system a different amount of
control, and the amount of control you grant must match the sharpness of the brief you
write. More control demands sharper guardrails, a clear definition of done, and a
bounded scope. Loop 1 survives vague goals; Loop 4 punishes them.

| Loop | Model | Human role | This repo's implementation | Use when |
|------|-------|-----------|---------------------------|----------|
| **1. Turn-based** | Prompt -> system acts -> you verify | in control each step | All UI flows (Feedstock, Workflow, Capture, Reports) | being wrong is expensive |
| **2. Goal-based** | Define success, system iterates until it passes | sets the goal, reviews the pass | `npm run verify:goal` (`scripts/goal-verify.mjs`) | "make the checks green" |
| **3. Time-based** | Runs on a schedule, no manual prompting | sets the cadence | `api/crons/*` via `vercel.json` | checks nobody remembers at 2am |
| **4. Proactive** | Triggers on new events; feels like a teammate | sets the trigger + guardrails | `api/ingest/sensor.js` -> `api/reactions/notify.js` | a new event should react immediately |

---

## Loop 2 — Goal-based verification

`npm run verify:goal` runs the project's verification gates (the single gate list
defined in `scripts/prepush-check.mjs`, reused not duplicated) until green or a retry cap.

```sh
# All gates
npm run verify:goal

# One gate
npm run verify:goal --goal test

# Retry up to 3 times until green
npm run verify:goal --until-green 3
```

Exit code is 0 only when every selected gate passes. An unknown `--goal` name is
reported, never silently skipped. This is the harness an agent drives until green:
point it at a goal, let it iterate, stop when the verdict is PASS.

Available goals: `typecheck`, `lint`, `test`, `build`, `security`.

## Loop 3 — Time-based (Vercel crons)

All crons live in `api/crons/` and share the request guard + client from
`api/crons/_shared.js`. Schedules are declared in `vercel.json`.

| Cron | File | Schedule | What it does |
|------|------|----------|--------------|
| Database backup | `api/crons/backup.js` | `0 2 * * *` (daily) | Backs up DB metadata, uploads to R2 if configured |
| Sensor SUSPECT re-scan | `api/crons/sensor-scan.js` | `0 */6 * * *` (every 6h) | Re-scans `sensor_readings` for old `SUSPECT` rows, writes a summary to `alerts` |
| MRV reconciliation | `api/crons/reconcile-mrv.js` | `0 3 * * *` (daily) | Compares live sensor/batch totals against the workbook model, flags drift to `alerts` |

To add a cron: create a function in `api/crons/` that imports `isCronRequest` from
`_shared.js`, guards the request, does its work, and writes findings to `alerts` where
relevant. Add a `vercel.json` crons entry. Prefer pure exported helpers (testable via
`node --test`) with the HTTP handler kept thin.

### The `alerts` table

The durable "needs attention" surface. Rows look like:

```json
{
  "kind": "sensor_suspect",
  "severity": "high",
  "source": "cron/sensor-scan",
  "message": "pyro-01 / carbonization_temp_c: latest=1400 (2 SUSPECT since cutoff)",
  "created_at": "2026-08-13T10:00:00Z"
}
```

`kind` values: `sensor_suspect`, `mrv_reconcile_drift`. Wire dashboards/alerts off this
table.

## Loop 4 — Proactive (event-triggered)

The sensor ingest endpoint (`api/ingest/sensor.js`) is the single authenticated write
path for field devices. It validates structure, verifies the HMAC signature, guards
against replay (monotonic `seq`), and flags out-of-range values `SUSPECT`. When a
reading is stored as `SUSPECT`, it fires a best-effort reaction:

- `api/reactions/notify.js` POSTs an alert to `SENSOR_ALERT_WEBHOOK_URL` (optional).

**Design rule:** the reaction is fire-and-forget and env-gated. Ingest correctness must
never depend on it; a failed webhook is logged, never fatal. If no webhook is configured
it is a no-op, so this ships safely before any alert channel exists. The 6h Loop 3
re-scan is the durable backstop for anything the reactive path misses.

## Decision guide

Pick the lowest loop that actually solves the problem:

- One-shot, correctness-critical? **Loop 1** — keep verifying.
- Want an outcome, not a transcript? **Loop 2** — define success, iterate.
- Periodic and forgettable? **Loop 3** — schedule it.
- Event-driven and time-sensitive? **Loop 4** — wire a trigger with tight guardrails.

Escalating a loop without sharpening the brief is how automation turns into garbage
output. If a job is escalating, re-read the guardrails before touching the code.

## Where to add a new check (DRY)

Do NOT add a second gate list. Add gates to the `CHECKS` array in
`scripts/prepush-check.mjs` — `npm run check` (pre-push) and `npm run verify:goal`
(Loop 2) both read the same list. Adding a cron goes in `api/crons/` + `vercel.json`.
Adding a reactive trigger goes in the relevant ingest handler calling into
`api/reactions/`.
