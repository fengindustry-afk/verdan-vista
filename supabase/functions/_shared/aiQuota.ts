/**
 * Per-user daily cap on paid AI calls. ai_usage_log is the rate-limit state —
 * both providers already log every attempt there, so counting today's rows is
 * the enforcement the log was missing. Override with the AI_DAILY_CAP secret.
 */

// deno-lint-ignore no-explicit-any
type AdminClient = any;

const DEFAULT_DAILY_CAP = 50;

/** True when this user has already spent today's AI-call allowance (UTC day). */
export async function overDailyCap(admin: AdminClient, userId: string): Promise<boolean> {
  const cap = Number(Deno.env.get("AI_DAILY_CAP")) || DEFAULT_DAILY_CAP;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", dayStart.toISOString());
  return (count ?? 0) >= cap;
}
