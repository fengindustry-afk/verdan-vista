/**
 * migrate-scan-b64 — ONE-TIME migration (2026-07-23): move scans whose only
 * image copy is the inline ImageBase64 into R2, then strip the base64 (after
 * backing it up into scans_b64_backup, same as the earlier strip migration).
 *
 * Gated by the MIGRATE_TOKEN secret instead of a user JWT so it can be invoked
 * from the CLI. Delete this function (and the secret) after running.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = Deno.env.get("MIGRATE_TOKEN");
  if (!token || req.headers.get("x-migrate-token") !== token) {
    return json({ error: "Forbidden" }, 403);
  }

  const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")!;
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
  const r2Bucket = Deno.env.get("R2_BUCKET") ?? "esterra-media";
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await admin
    .from("scans")
    .select("id,data")
    .filter("data->>ImageBase64", "neq", "")
    .or("data->>ImageUrl.is.null,data->>ImageUrl.eq.");
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, string> = {};
  for (const row of rows ?? []) {
    const d = row.data as Record<string, unknown>;
    const b64 = d.ImageBase64 as string | undefined;
    if (!b64) { results[row.id] = "skipped: no base64"; continue; }
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const key = `${(d.TreeId as string) || "unknown"}/${row.id}.jpg`;
      const put = await aws.fetch(
        `https://${accountId}.r2.cloudflarestorage.com/${r2Bucket}/tree-scans/${key}`,
        { method: "PUT", body: bytes, headers: { "Content-Type": "image/jpeg" } },
      );
      if (!put.ok) { results[row.id] = `R2 PUT ${put.status}`; continue; }

      // Backup, then rewrite the row: base64 out, R2 ref in.
      await admin.from("scans_b64_backup").upsert({ id: row.id, image_base64: b64 });
      const newData = { ...d, ImageUrl: `r2:tree-scans/${key}` };
      delete newData.ImageBase64;
      const { error: upErr } = await admin.from("scans")
        .update({ data: newData, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      results[row.id] = upErr ? `update failed: ${upErr.message}` : "migrated";
    } catch (e) {
      results[row.id] = `failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return json({ candidates: rows?.length ?? 0, results });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
