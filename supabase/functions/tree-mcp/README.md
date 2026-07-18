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
- **Auth:** every call needs a valid Supabase **user JWT**:
  ```
  Authorization: Bearer <access_token>
  apikey: <anon key>
  ```
  Unauthenticated calls get a JSON-RPC `Sign in required` error.

## Tools

| Tool | Args | Returns |
|------|------|---------|
| `tree_health_history` | `tree_id` *or* `tree_code` | Scans (status/score/note/date), latest readings, and the most recent assessment for one tree. |
| `list_stressed_trees` | `treatment_group?`, `max_score?` (default 60), `limit?` (default 25) | Trees whose latest scan is Stressed/Moderate or below the score threshold, worst first. |
| `analyze_tree_scan` | `scan_id` | A fresh vision assessment of that scan's image (forwards to `analyze-tree-scan`). Read-only — does not persist. |

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

## Registering with a client

Point any MCP-over-HTTP client at the endpoint with the two headers above. For
clients that only accept a URL, front it with an MCP proxy that injects the
`Authorization`/`apikey` headers.

## Scaffold notes / next steps

- Stateless: no session id or SSE stream (the tools are short request/response).
- `analyze_tree_scan` reuses the deployed `analyze-tree-scan` function and does
  **not** write the result back — add persistence to the `scans` doc when wanted.
- Natural extensions: `plot_health_summary` (per-treatment aggregates), readings
  trend analysis, and a write tool to record assessments or notes.
- Deploy: `supabase functions deploy tree-mcp`.
