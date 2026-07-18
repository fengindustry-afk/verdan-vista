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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function callTool(name: string, args: Json, authHeader: string): Promise<Json> {
  switch (name) {
    case "tree_health_history": return treeHealthHistory(args ?? {});
    case "list_stressed_trees": return listStressedTrees(args ?? {});
    case "analyze_tree_scan": return analyzeTreeScanTool(args ?? {}, authHeader);
    default: throw new Error(`Unknown tool: ${name}`);
  }
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

  // Require a signed-in app user.
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return rpcError(null, -32001, "Sign in required");

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
        return rpcResult(id, { tools: TOOLS });
      case "tools/call": {
        const out = await callTool(params?.name, params?.arguments, authHeader);
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
