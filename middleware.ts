// =============================================================================
// Verdant Vista — Vercel Edge Middleware (free-tier edge hardening)
// -----------------------------------------------------------------------------
// This is the closest portable equivalent to the rawsec-Ubuntu nginx + CrowdSec
// edge (D:\Project\rawsec\proxy). Vercel cannot run those containers, so the
// *intents* are reproduced here in the Edge runtime, which runs before every
// request on the Hobby (free) plan:
//
//   rawsec nginx/CrowdSec            ->  this middleware
//   ------------------------------------------------------------
//   CrowdSec decoy-scenario         ->  BLOCKED_PATHS  (instant 403 on scans)
//   CrowdSec bad-actor detection    ->  BLOCKED_AGENTS (scanner UA block)
//   limit_req login 5r/m            ->  best-effort edge rate limit (see notes)
//   allowed HTTP methods            ->  ALLOWED_METHODS
//   IP/geo edge rules               ->  BLOCKED_COUNTRIES / ADMIN_PATH gate
//
// NOTE ON RATE LIMITING: Edge Middleware instances are per-region and stateless
// across invocations, so the in-memory limiter below is BEST-EFFORT friction,
// not a distributed guarantee. The real auth brute-force wall lives in the
// Supabase dashboard (Auth -> Rate Limits), because the browser calls
// supabase.co/auth/v1/token DIRECTLY and never passes through Vercel. See
// security/vercel-vs-rawsec.md.
// =============================================================================

// --- CrowdSec decoy analog: exploit-scanner paths -> instant 403 -------------
const BLOCKED_PATHS: RegExp[] = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.aws/i,
  /^\/\.ssh/i,
  /^\/\.svn/i,
  /wp-admin|wp-login\.php|xmlrpc\.php/i,
  /phpmyadmin|pma\/|adminer/i,
  /^\/vendor\//i,
  /^\/config\.(json|php|yml|yaml)/i,
  /\.(bak|old|sql|env|ini)$/i,
];

// --- Malicious scanner / empty user agents -----------------------------------
const BLOCKED_AGENTS =
  /(sqlmap|nikto|nmap|masscan|nessus|acunetix|dirbuster|gobuster|wpscan|zgrab|fuzz|semrush|petalbot)/i;

// --- HTTP methods this static SPA actually needs at the edge ------------------
const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "DELETE"]);

// --- Optional geo block (empty = off). Use ISO country codes, e.g. ["CN","RU"]
const BLOCKED_COUNTRIES: string[] = [];

// --- Best-effort edge rate limit (per instance) ------------------------------
const RATE_LIMIT_WINDOW_MS = 10_000; // 10s window
const RATE_LIMIT_MAX = 100; // requests/window/IP before 429
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    hits.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    if (hits.size > 5000) hits.clear(); // crude memory cap for the edge instance
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}

function deny(status: number, msg: string): Response {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// --- httpOnly Cookie handlers (for session token security) ---------------------
async function handleSetCookie(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { session: string };
    if (!body.session) {
      return deny(400, "Missing session payload");
    }

    // Parse session to extract token and expiry
    let sessionData: { access_token?: string; expires_at?: number };
    try {
      sessionData = JSON.parse(body.session);
    } catch {
      return deny(400, "Invalid session JSON");
    }

    const accessToken = sessionData.access_token;
    if (!accessToken) {
      return deny(400, "Missing access_token in session");
    }

    // Extract expiry from JWT (iat + exp claims), or default to 1 hour
    let maxAge = 3600;
    try {
      const payload = JSON.parse(
        atob(accessToken.split(".")[1])
      ) as { exp?: number; iat?: number };
      if (payload.exp && payload.iat) {
        maxAge = payload.exp - payload.iat;
      }
    } catch {
      // Unable to parse JWT; use default TTL
    }

    // Get project ref from environment or derive from request
    const projectRef = process.env.VITE_SUPABASE_URL?.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1] ?? "project";

    const cookieName = `sb-${projectRef}-auth-token`;
    const cookieValue = encodeURIComponent(body.session);
    const cookieHeader = `${cookieName}=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

    return new Response(
      JSON.stringify({ success: true, message: "Cookie set" }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": cookieHeader,
        },
      }
    );
  } catch (error) {
    console.error("[middleware] Error in handleSetCookie:", error);
    return deny(500, "Internal Server Error");
  }
}

function handleClearCookie(): Response {
  // Get project ref from environment or derive from request
  const projectRef = process.env.VITE_SUPABASE_URL?.match(
    /https:\/\/([^.]+)\.supabase\.co/
  )?.[1] ?? "project";

  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieHeader = `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

  return new Response(
    JSON.stringify({ success: true, message: "Cookie cleared" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": cookieHeader,
      },
    }
  );
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;
  const ua = request.headers.get("user-agent") ?? "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const country = request.headers.get("x-vercel-ip-country") ?? "";

  // 0. Handle httpOnly cookie setter (internal auth route)
  if (path === "/_auth/set-cookie") {
    if (request.method === "POST") {
      return await handleSetCookie(request);
    } else if (request.method === "DELETE") {
      return handleClearCookie();
    }
    return deny(405, "Method Not Allowed");
  }

  // 1. Method allowlist (drop TRACE/PUT/DELETE etc. at the static edge)
  if (!ALLOWED_METHODS.has(request.method)) {
    return deny(405, "Method Not Allowed");
  }

  // 2. Decoy / exploit-scanner paths -> instant 403 (CrowdSec decoy analog)
  // Exclude internal /_auth routes from blocklist
  if (!path.startsWith("/_auth") && BLOCKED_PATHS.some((re) => re.test(path))) {
    return deny(403, "Forbidden");
  }

  // 3. Known malicious scanners by user agent
  if (BLOCKED_AGENTS.test(ua)) {
    return deny(403, "Forbidden");
  }

  // 4. Optional geo block
  if (country && BLOCKED_COUNTRIES.includes(country)) {
    return deny(403, "Forbidden");
  }

  // 5. Best-effort per-IP rate limit (see file header caveat)
  if (rateLimited(ip)) {
    return deny(429, "Too Many Requests");
  }

  // Pass through — static asset / SPA index is served normally.
  return undefined;
}

// Run on everything except Vercel's own internals and hashed build assets,
// keeping free-tier invocation counts low.
export const config = {
  matcher: ["/((?!_next/|assets/|favicon|.*\\.(?:js|css|png|jpg|svg|woff2?)$).*)"],
};
