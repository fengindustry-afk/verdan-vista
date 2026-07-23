/**
 * log-honeypot — server-side tripwire recorder.
 *
 * The browser cannot see its own public IP (and a MAC address never leaves the
 * local network, so no web app can record it). This function runs server-side,
 * where the caller's IP arrives in the request headers, and writes the hit to
 * ops_events with the service role — so the event lands even if the visitor is
 * unauthenticated or their session's RLS would have dropped the insert.
 *
 * Request:  POST { path?: string }
 * Records:  IP (x-forwarded-for / cf-connecting-ip), user agent, and the
 *           signed-in account email when an Authorization header is present.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Who tripped it — best-effort, never blocks the log.
  let email = "anonymous";
  const auth = req.headers.get("Authorization");
  if (auth) {
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (user?.email) email = user.email;
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  let path = "/feedstock";
  try {
    const body = await req.json();
    if (typeof body?.path === "string") path = body.path.slice(0, 100);
    // Client-claimed identity — useful when the hit fires before session
    // restore, but explicitly marked unverified; the JWT identity wins.
    if (email === "anonymous" && typeof body?.claimed === "string" && body.claimed) {
      email = `${body.claimed.slice(0, 100)} (claimed, unverified)`;
    }
  } catch {
    /* no body is fine */
  }

  const id = `ops_${crypto.randomUUID()}`;
  const doc = {
    id,
    Kind: "honeypot-route-hit",
    Message: `Retired ${path} route opened by ${email} from ${ip}`,
    Detail: `IP ${ip} · ${userAgent}`.slice(0, 500),
    At: new Date().toISOString(),
  };

  // ponytail: no server-side rate limit — a spammer could flood ops_events.
  // Add a per-IP window here if that ever happens.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin.from("ops_events").insert({ id, data: doc });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
