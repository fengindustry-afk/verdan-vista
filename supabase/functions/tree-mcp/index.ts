/**
 * tree-mcp — Model Context Protocol server (scaffold) for the tree / testing-plot
 * domain. Exposes read + analysis tools an MCP client (Claude, an agent) can call
 * against the shared Supabase data, holding all keys server-side.
 *
 * Transport: MCP "Streamable HTTP" — a single endpoint that accepts JSON-RPC 2.0
 * request objects over POST and replies with application/json. Notifications get
 * a 202 with an empty body. (SSE streaming isn't needed for these short tools.)
 *
 * Auth: every call requires a valid Supabase user JWT in the Authorization
 * header — the same gate the other functions use. DB reads run with the service
 * role; analyze_tree_scan forwards the caller's JWT to analyze-tree-scan.
 *
 * Tools:
 *   - tree_health_history  — summarise one tree's scans + readings
 *   - list_stressed_trees  — flag at-risk trees (latest scan Stressed/Moderate/low score)
 *   - analyze_tree_scan    — run a fresh vision assessment of a stored scan image
 *
 * This is a scaffold: the tool set and persistence are intentionally minimal and
 * meant to grow (e.g. a write-back of assessments, per-plot aggregates, readings
 * trends). See README.md in this folder for how to connect a client.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "esterra-tree-mcp", version: "0.1.0" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Collections an API key may read, and how each is filtered.
 *
 * Allow-list, not a block-list: a table added later is invisible here until
 * someone deliberately lists it. `exclude` drops rows the service role would
 * otherwise hand over — service-role reads bypass RLS, so the privacy rules the
 * app relies on have to be restated here or they simply do not apply.
 */
const READABLE: Record<string, { table: string; exclude?: (d: Json) => boolean }> = {
  trees: { table: "trees" },
  readings: { table: "readings" },
  scans: { table: "scans" },
  soil_samples: { table: "soil_samples" },
  plot_observations: { table: "plot_observations" },
  plot_applications: { table: "plot_applications" },
  plot_comparisons: { table: "plot_comparisons" },
  geotagged_photos: { table: "geotagged_photos" },
  feedstock_sourcing: { table: "feedstock_sourcing" },
  asset_locations: { table: "asset_locations" },
  work_process_entries: { table: "work_process_entries" },
  readiness_status: { table: "readiness_status" },
  sensor_devices: { table: "sensor_devices" },
  sensor_readings: { table: "sensor_readings" },
  cost_budgets: { table: "cost_budgets" },
  cost_categories: { table: "cost_categories" },
  cost_entries: {
    table: "cost_entries",
    // The personal ledger is private to its owner (see
    // security/migrate-personal-ledger-privacy.sql). RLS enforces that for the
    // app; this key never sees those rows at all.
    exclude: (d) => String(d?.Ledger ?? "").toLowerCase() === "personal",
  },
};

// deno-lint-ignore no-explicit-any
type Json = any;

/** JSON-Schema definitions the client sees via tools/list. */
const TOOLS = [
  {
    name: "tree_health_history",
    description:
      "Summarise the health history of one tree: its scans (dates, status, vigor score, notes) and latest growth readings. Identify the tree by its TreeId (as stored on scans, e.g. \"tree_biochar_P4\") or its TreeCode.",
    inputSchema: {
      type: "object",
      properties: {
        tree_id: { type: "string", description: "TreeId as stored on scans, e.g. tree_biochar_P4" },
        tree_code: { type: "string", description: "Human tree code, resolved via the trees table" },
      },
    },
  },
  {
    name: "list_stressed_trees",
    description:
      "List trees needing attention: those whose most recent scan is Stressed or Moderate, or scored below the vigor threshold. Optionally filter by treatment group (e.g. \"biochar\", \"control\").",
    inputSchema: {
      type: "object",
      properties: {
        treatment_group: { type: "string", description: "Filter by treatment group substring, e.g. biochar" },
        max_score: { type: "number", description: "Flag trees with latest vigor score below this (default 60)" },
        limit: { type: "number", description: "Max trees to return (default 25)" },
      },
    },
  },
  {
    name: "list_collections",
    description:
      "List the data collections this server can read, with a row count for each. Call this first to discover what is available before querying.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "query_collection",
    description:
      "Read records from one collection. Returns whole records as stored, newest first where a date is present. Use list_collections to see valid names. Optionally filter to records whose fields match given values, or whose text contains a search term.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection name, e.g. trees, cost_entries, readings" },
        match: {
          type: "object",
          description: "Field/value pairs a record must match exactly, e.g. {\"TreatmentGroup\": \"Biochar\"}",
        },
        search: { type: "string", description: "Case-insensitive substring matched against the whole record" },
        limit: { type: "number", description: "Max records to return (default 100, max 500)" },
      },
      required: ["collection"],
    },
  },
  {
    name: "analyze_tree_scan",
    description:
      "Run a fresh AI vision assessment of a stored tree-scan image (canopy status, vigor score, visible stress signs). Identify the scan by its id.",
    inputSchema: {
      type: "object",
      properties: {
        scan_id: { type: "string", description: "The scan document id, e.g. scan_mrby9k3x" },
      },
      required: ["scan_id"],
    },
  },
] as const;

// ---- Supabase helpers -------------------------------------------------------

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Latest-first by AnalyzedAt then Timestamp. */
function scanTime(d: Json): number {
  const t = d?.AnalyzedAt || d?.Timestamp || "";
  const ms = Date.parse(String(t).replace(" ", "T"));
  return Number.isFinite(ms) ? ms : 0;
}

// ---- Tool handlers ----------------------------------------------------------

async function treeHealthHistory(args: Json): Promise<Json> {
  const db = admin();
  let treeId: string | undefined = args.tree_id;
  let treeMeta: Json = null;

  if (!treeId && args.tree_code) {
    const { data } = await db.from("trees").select("id,data").eq("data->>TreeCode", args.tree_code).limit(1);
    treeMeta = data?.[0]?.data ?? null;
    treeId = treeMeta?.id || data?.[0]?.id;
  } else if (treeId) {
    const { data } = await db.from("trees").select("id,data")
      .or(`id.eq.${treeId},data->>TreeCode.eq.${treeId}`).limit(1);
    treeMeta = data?.[0]?.data ?? null;
  }
  if (!treeId) throw new Error("Provide tree_id or tree_code");

  const { data: scanRows } = await db.from("scans").select("id,data").eq("data->>TreeId", treeId);
  const scans = (scanRows ?? [])
    .map((r) => r.data)
    .sort((a, b) => scanTime(b) - scanTime(a))
    .map((d) => ({
      status: d.HealthStatus ?? null,
      score: d.HealthScore ?? null,
      note: d.HealthNote ?? null,
      analyzed_at: d.AnalyzedAt ?? d.Timestamp ?? null,
    }));

  const { data: readingRows } = await db.from("readings").select("id,data").eq("data->>TreeId", treeId);
  const readings = (readingRows ?? [])
    .map((r) => r.data)
    .sort((a, b) => Date.parse(b.Date ?? "") - Date.parse(a.Date ?? ""))
    .slice(0, 5);

  const latest = scans.find((s) => s.status);
  return {
    tree_id: treeId,
    tree_code: treeMeta?.TreeCode ?? null,
    species: treeMeta?.Species ?? null,
    treatment_group: treeMeta?.TreatmentGroup ?? treeMeta?.Treatment ?? null,
    scan_count: scans.length,
    latest_assessment: latest ?? null,
    scans,
    recent_readings: readings,
  };
}

async function listStressedTrees(args: Json): Promise<Json> {
  const db = admin();
  const maxScore = typeof args.max_score === "number" ? args.max_score : 60;
  const limit = typeof args.limit === "number" ? args.limit : 25;

  const { data: scanRows } = await db.from("scans").select("id,data");
  // Keep the latest scored scan per tree.
  const latestByTree = new Map<string, Json>();
  for (const r of scanRows ?? []) {
    const d = r.data;
    if (!d?.TreeId || !d.HealthStatus) continue;
    const prev = latestByTree.get(d.TreeId);
    if (!prev || scanTime(d) > scanTime(prev)) latestByTree.set(d.TreeId, { ...d, _scanId: r.id });
  }

  // Tree metadata for codes / treatment-group filtering.
  const { data: treeRows } = await db.from("trees").select("id,data");
  const treeById = new Map<string, Json>();
  for (const r of treeRows ?? []) treeById.set(r.data?.id || r.id, r.data);

  const group = (args.treatment_group ?? "").toString().toLowerCase();
  const flagged = [...latestByTree.entries()]
    .map(([treeId, d]) => {
      const meta = treeById.get(treeId) ?? {};
      return {
        tree_id: treeId,
        tree_code: meta.TreeCode ?? null,
        treatment_group: meta.TreatmentGroup ?? meta.Treatment ?? null,
        status: d.HealthStatus,
        score: d.HealthScore ?? null,
        note: d.HealthNote ?? null,
        scan_id: d._scanId,
        analyzed_at: d.AnalyzedAt ?? d.Timestamp ?? null,
      };
    })
    .filter((t) => t.status === "Stressed" || t.status === "Moderate" || (typeof t.score === "number" && t.score < maxScore))
    .filter((t) => !group || String(t.treatment_group ?? "").toLowerCase().includes(group))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, limit);

  return { count: flagged.length, threshold: maxScore, trees: flagged };
}

async function listCollections(): Promise<Json> {
  const db = admin();
  const collections = await Promise.all(
    Object.entries(READABLE).map(async ([name, def]) => {
      const { count } = await db.from(def.table).select("id", { count: "exact", head: true });
      return { collection: name, records: count ?? 0 };
    }),
  );
  return { collections };
}

/** Newest first when the record carries a date; undated rows sort last. */
function recordTime(d: Json): number {
  const t = d?.Date || d?.Timestamp || d?.CreatedAt || d?.AnalyzedAt || "";
  const ms = Date.parse(String(t).replace(" ", "T"));
  return Number.isFinite(ms) ? ms : 0;
}

async function queryCollection(args: Json): Promise<Json> {
  const def = READABLE[args.collection];
  if (!def) {
    throw new Error(
      `Unknown or non-readable collection "${args.collection}". Valid: ${Object.keys(READABLE).join(", ")}`,
    );
  }
  // Cap the limit: an unbounded read of readings or sensor_readings would blow
  // the model's context and time out the function.
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 100, 500);

  const { data: rows, error } = await db_select(def.table);
  if (error) throw new Error(error.message);

  const match = (args.match ?? {}) as Record<string, unknown>;
  const search = String(args.search ?? "").toLowerCase();

  const records = (rows ?? [])
    .map((r: Json) => r.data ?? {})
    .filter((d: Json) => !def.exclude?.(d))
    .filter((d: Json) =>
      Object.entries(match).every(([k, v]) => String(d?.[k] ?? "").toLowerCase() === String(v).toLowerCase())
    )
    .filter((d: Json) => !search || JSON.stringify(d).toLowerCase().includes(search))
    .sort((a: Json, b: Json) => recordTime(b) - recordTime(a));

  return {
    collection: args.collection,
    matched: records.length,
    returned: Math.min(records.length, limit),
    records: records.slice(0, limit),
  };
}

function db_select(table: string) {
  return admin().from(table).select("id,data");
}

async function analyzeTreeScanTool(args: Json, authHeader: string): Promise<Json> {
  if (!args.scan_id) throw new Error("scan_id is required");
  const db = admin();
  const { data: row } = await db.from("scans").select("id,data").eq("id", args.scan_id).limit(1).single();
  if (!row) throw new Error(`Scan ${args.scan_id} not found`);
  const d = row.data;

  // Prefer the inline base64; otherwise sign + fetch the stored object.
  let base64: string | undefined = d.ImageBase64;
  let mime = d.ImageMime || "image/jpeg";
  if (!base64 && d.ImageUrl) {
    const { data: signed } = await db.storage.from("tree-scans").createSignedUrl(d.ImageUrl, 120)
      .catch(() => ({ data: null }));
    const url = signed?.signedUrl;
    if (url) {
      const res = await fetch(url);
      const buf = new Uint8Array(await res.arrayBuffer());
      base64 = btoa(String.fromCharCode(...buf));
      mime = res.headers.get("content-type") || mime;
    }
  }
  if (!base64) throw new Error("Scan has no readable image");

  // Reuse the deployed analyze-tree-scan function, forwarding the caller's JWT.
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-tree-scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({ image: base64, mime }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `analyze-tree-scan ${res.status}`);
  return { scan_id: args.scan_id, tree_id: d.TreeId ?? null, provider: body.provider, assessment: body.fields };
}

async function callTool(name: string, args: Json, caller: Caller): Promise<Json> {
  switch (name) {
    case "tree_health_history": return treeHealthHistory(args ?? {});
    case "list_stressed_trees": return listStressedTrees(args ?? {});
    case "list_collections": return listCollections();
    case "query_collection": return queryCollection(args ?? {});
    case "analyze_tree_scan":
      // Spends AI credits and needs a user JWT to forward — not something a
      // read-only key gets to trigger.
      if (caller.kind === "api_key") {
        throw new Error("analyze_tree_scan requires a signed-in user; API keys are read-only.");
      }
      return analyzeTreeScanTool(args ?? {}, caller.authHeader);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- Authentication ---------------------------------------------------------

type Caller =
  | { kind: "user"; authHeader: string; label: string }
  | { kind: "api_key"; authHeader: ""; label: string };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolve an X-API-Key header to a caller, or null if it is not usable.
 *
 * The stored side is a hash, so the lookup is by hash — the plaintext key never
 * touches the database. Expiry and revocation are checked here rather than in
 * the query so the reason can be logged if that is ever wanted.
 */
async function callerFromApiKey(key: string): Promise<Caller | null> {
  const db = admin();
  const hash = await sha256Hex(key);
  const { data } = await db.from("api_keys").select("id,data").eq("data->>KeyHash", hash).limit(1);
  const row = data?.[0];
  if (!row) return null;

  const d = row.data ?? {};
  if (d.Revoked === true) return null;
  if (d.ExpiresAt && Date.parse(String(d.ExpiresAt)) < Date.now()) return null;

  // Record use. Deliberately not awaited into the failure path: a key that
  // works must not stop working because this write failed.
  db.from("api_keys")
    .update({ data: { ...d, LastUsedAt: new Date().toISOString() }, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => {}, () => {});

  return { kind: "api_key", authHeader: "", label: String(d.Label ?? row.id) };
}

// ---- JSON-RPC / MCP plumbing ------------------------------------------------

function rpcResult(id: Json, result: Json) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function rpcError(id: Json, code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST with JSON-RPC (MCP Streamable HTTP)" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Two ways in: a signed-in app user (full tool set) or a read-only API key
  // issued from Settings (see security/create-api-keys.sql).
  const apiKey = req.headers.get("x-api-key") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  let caller: Caller | null = null;

  if (apiKey) {
    caller = await callerFromApiKey(apiKey);
    if (!caller) return rpcError(null, -32001, "Invalid, revoked or expired API key");
  } else {
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return rpcError(null, -32001, "Sign in required, or send an X-API-Key header");
    caller = { kind: "user", authHeader, label: user.email ?? user.id };
  }

  let msg: Json;
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  // Notifications (no id) — acknowledge with 202, no body.
  if (msg && msg.id === undefined) {
    return new Response(null, { status: 202, headers: CORS });
  }

  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        // A key never gets to see the tool it cannot call.
        return rpcResult(id, {
          tools: caller.kind === "api_key" ? TOOLS.filter((t) => t.name !== "analyze_tree_scan") : TOOLS,
        });
      case "tools/call": {
        const out = await callTool(params?.name, params?.arguments, caller);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Tool failures are returned as a tool result with isError so the model sees them.
    if (method === "tools/call") {
      return rpcResult(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
    }
    return rpcError(id, -32603, message);
  }
});
