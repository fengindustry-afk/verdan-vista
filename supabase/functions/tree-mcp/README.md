# tree-mcp — Tree / testing-plot MCP server (scaffold)

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the tree domain to MCP clients (Claude, agents), reading the shared Supabase data
with all keys held server-side.

## Endpoint

```
POST https://<project-ref>.supabase.co/functions/v1/tree-mcp
```

- **Transport:** MCP *Streamable HTTP* — JSON-RPC 2.0 request objects over POST,
  `application/json` responses. Notifications return `202` with no body.
- **Auth:** two ways in.

  **API key** (what a manager uses). Issue one in Settings ▸ API Keys, then send:
  ```
  X-API-Key: esterra_<64 hex chars>
  ```
  Read-only: the key sees every read tool, and `analyze_tree_scan` is hidden
  from `tools/list` because it spends AI credits. Keys carry an expiry, can be
  revoked from the same screen, and record a `LastUsedAt` on every call. Only
  a hash is stored, so a key that is lost is replaced, never recovered.

  **User JWT** (a signed-in app session), which also unlocks `analyze_tree_scan`:
  ```
  Authorization: Bearer <access_token>
  apikey: <anon key>
  ```

  Calls with neither get a JSON-RPC `Sign in required` error.

## Tools

| Tool | Args | Returns |
|------|------|---------|
| `tree_health_history` | `tree_id` *or* `tree_code` | Scans (status/score/note/date), latest readings, and the most recent assessment for one tree. |
| `list_stressed_trees` | `treatment_group?`, `max_score?` (default 60), `limit?` (default 25) | Trees whose latest scan is Stressed/Moderate or below the score threshold, worst first. |
| `list_collections` | — | Every readable collection with its row count. Call first to see what exists. |
| `query_collection` | `collection`, `match?`, `search?`, `limit?` (default 100, max 500) | Records from one collection, newest first. `match` is exact field/value pairs; `search` is a substring over the whole record. |
| `analyze_tree_scan` | `scan_id` | A fresh vision assessment of that scan's image (forwards to `analyze-tree-scan`). Read-only — does not persist. **User JWT only.** |

### What `query_collection` can read

`trees`, `readings`, `scans`, `soil_samples`, `plot_observations`,
`plot_applications`, `plot_comparisons`, `geotagged_photos`,
`feedstock_sourcing`, `asset_locations`, `work_process_entries`,
`readiness_status`, `sensor_devices`, `sensor_readings`, `cost_entries`,
`cost_budgets`, `cost_categories`.

It is an allow-list, so a table added later stays invisible until someone lists
it. Reads run with the service role, which bypasses RLS — privacy rules the app
relies on are therefore restated in the server, and the one that matters today
is the **personal ledger**: `cost_entries` rows with `Ledger: "Personal"` are
dropped before anything is returned. `users`, `api_keys` and `edit_history` are
not readable at all.

## Quick check (curl)

```bash
TOKEN=<supabase user access token>
ANON=<supabase anon key>
URL=https://<project-ref>.supabase.co/functions/v1/tree-mcp

# List tools
curl -s "$URL" -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Flag stressed biochar-plot trees
curl -s "$URL" -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"list_stressed_trees","arguments":{"treatment_group":"biochar"}}}'
```

## Giving a manager access

1. An Admin opens **Settings ▸ API Keys**, enters a label ("Aiman — Claude
   desktop") and an expiry in days, and clicks **Issue key**.
2. The key is shown once. Copy it then — it is not recoverable afterwards.
3. Add it to the manager's MCP client as a custom HTTP header:
   ```
   X-API-Key: esterra_…
   ```
4. They can then ask things like *"which biochar trees are stressed?"* or
   *"total biochar applied in June, by product"* and Claude will call the tools.

Revoking is deleting the row in the same screen; the next call fails
immediately.

```bash
# Same check, using an API key instead of a session
curl -s "$URL" -H "X-API-Key: esterra_…" -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Scaffold notes / next steps

- Stateless: no session id or SSE stream (the tools are short request/response).
- `analyze_tree_scan` reuses the deployed `analyze-tree-scan` function and does
  **not** write the result back — add persistence to the `scans` doc when wanted.
- Natural extensions: `plot_health_summary` (per-treatment aggregates), readings
  trend analysis, and a write tool to record assessments or notes.
- Deploy: `supabase functions deploy tree-mcp`.
