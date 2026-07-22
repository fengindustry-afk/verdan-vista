/**
 * Turn a raw AI failure into something a field user can act on.
 *
 * The providers all phrase the same condition differently — Gemini says
 * RESOURCE_EXHAUSTED, Groq says rate_limit_exceeded, the edge function wraps both
 * in "All providers failed — ..." — and none of those belong in a toast. This
 * collapses them onto a fixed set of causes, so "out of quota" reads as out of
 * quota rather than as a 429 with a JSON blob attached.
 */

export type AiErrorKind =
  | "offline"
  | "unreachable"
  | "timeout"
  | "quota"
  | "busy"
  | "auth"
  | "signin"
  | "unconfigured"
  | "image"
  | "too-large"
  | "bad-response"
  | "unknown";

export interface AiError {
  kind: AiErrorKind;
  /** Shown to the user. Complete sentence fragment, no error codes. */
  message: string;
  /** The original text, kept for the console so nothing is lost. */
  detail: string;
}

const RULES: [AiErrorKind, RegExp, string][] = [
  // Config and session first — these are unambiguous and cheap to check.
  ["unconfigured", /supabase not configured/i, "AI not configured on this build"],
  ["signin", /not signed in|sign in required|jwt|401.*(unauthor|expired)/i, "Sign in again to use AI"],

  // Quota before rate-limit: an exhausted plan is a different fix than a burst.
  [
    "quota",
    /quota|resource_exhausted|insufficient_quota|billing|credit|exceeded your current/i,
    "AI out of quota — the daily limit is used up",
  ],
  ["busy", /over capacity|overloaded|rate.?limit|too many requests|429|503/i, "AI busy — try again in a moment"],

  ["auth", /invalid_api_key|api key not valid|invalid api key|permission denied|403/i, "AI key rejected — check the server key"],

  // Image problems come from our own pipeline and are already plain. They must
  // be matched before the generic timeout/network rules below, or "image
  // download timed out" gets reported as the AI timing out.
  ["too-large", /image too large/i, "Image too large for the AI"],
  ["image", /image (could not|download|request|was empty|format)|no image source/i, ""],

  ["timeout", /timeout|timed out|aborted|abort/i, "AI timed out — the connection is too slow"],
  [
    "unreachable",
    /failed to send a request|failed to fetch|network|econnrefused|dns|edge function/i,
    "AI not reachable — no connection to the service",
  ],

  ["bad-response", /unexpected analysis response|invalid json|missing image/i, "AI returned an unreadable answer"],
];

export function classifyAiError(raw: unknown): AiError {
  const detail = raw instanceof Error ? raw.message : String(raw ?? "");

  // A browser that knows it is offline beats any message parsing.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "offline", message: "Offline — AI needs a connection", detail };
  }

  for (const [kind, pattern, message] of RULES) {
    if (pattern.test(detail)) {
      // The image rules already produce readable text ("image download timed
      // out"), so reuse it rather than flattening it to something vaguer.
      return { kind, message: message || `AI skipped — ${detail}`, detail };
    }
  }
  return { kind: "unknown", message: detail ? `AI failed — ${detail}` : "AI failed for an unknown reason", detail };
}
