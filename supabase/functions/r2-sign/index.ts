/**
 * r2-sign — presigned-URL broker for Cloudflare R2.
 *
 * Heavy media (receipt images/PDFs, geotagged photos, tree scans) lives in a
 * single R2 bucket instead of Supabase Storage, keeping the database lean.
 * R2 credentials exist only here (Supabase secrets); the browser asks this
 * function for a short-lived presigned URL, then PUTs/GETs the object directly
 * against R2 — bytes never flow through this function.
 *
 * Request:  POST { action: "put" | "get", bucket, key, contentType? }
 *   bucket = logical prefix, one of the app's Buckets (receipts, …)
 *   key    = object name within that prefix, e.g. "rcpt_abc.webp"
 * Response: { url, ref }  — ref is the value stored on the row ("r2:bucket/key")
 *
 * Auth: any signed-in user may read (mirrors the Storage RLS "authenticated can
 * select"); uploads require Operator/Manager/Admin, resolved via the same
 * current_app_role() the table RLS uses.
 *
 * Secrets (supabase secrets set …):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   required
 *   R2_BUCKET                                               optional, default "esterra-media"
 *
 * NOTE: the R2 bucket needs a CORS policy allowing PUT/GET from the app's
 * origins, or the browser's direct upload will be blocked (see README steps).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Logical prefixes — must match Buckets in src/lib/storage.ts. */
const ALLOWED_BUCKETS = new Set(["receipts", "geotagged-photos", "tree-scans"]);
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

const PUT_EXPIRES_S = 900; // enough for a large PDF on a slow farm connection
const GET_EXPIRES_S = 3600;

const WRITE_ROLES = new Set(["Operator", "Manager", "Admin"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return json({ error: "R2 not configured" }, 503);
  }
  const r2Bucket = Deno.env.get("R2_BUCKET") ?? "esterra-media";

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);

  let body: { action?: string; bucket?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { action, bucket, key } = body;
  if (action !== "put" && action !== "get") return json({ error: "action must be put|get" }, 400);
  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) return json({ error: "Unknown bucket" }, 400);
  if (!key || !KEY_PATTERN.test(key) || key.includes("..")) return json({ error: "Invalid key" }, 400);

  if (action === "put") {
    // Same role gate the Storage/table RLS applies to inserts.
    const { data: role, error } = await authClient.rpc("current_app_role");
    if (error || !WRITE_ROLES.has(role as string)) {
      return json({ error: "Upload requires Operator/Manager/Admin role" }, 403);
    }
  }

  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const url = new URL(
    `https://${accountId}.r2.cloudflarestorage.com/${r2Bucket}/${bucket}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(action === "put" ? PUT_EXPIRES_S : GET_EXPIRES_S));
  const signed = await aws.sign(
    new Request(url, { method: action === "put" ? "PUT" : "GET" }),
    { aws: { signQuery: true } },
  );

  return json({ url: signed.url, ref: `r2:${bucket}/${key}` });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
