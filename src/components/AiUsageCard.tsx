import { useEffect, useState } from "react";
import { BentoCard } from "@/components/BentoCard";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Sparkles, AlertTriangle } from "lucide-react";

/**
 * Settings ▸ AI usage — per-model bars for the vision-LLM calls this app makes
 * (receipt extraction etc.), read from `ai_usage_log` (written server-side by
 * the edge functions). This meters ONLY this app: other tools sharing the same
 * Google/xAI key are invisible here — the provider consoles hold the full
 * account picture.
 */

/** USD per 1M tokens (input, output). Longest-prefix match on the model id, so
 * dated variants like `llama-4-scout-…-1212` price correctly. */
const PRICES: Array<[prefix: string, inPerM: number, outPerM: number]> = [
  ["gemini-2.5-flash-lite", 0.10, 0.40],
  ["gemini-2.5-flash", 0.30, 2.50],
  ["gemini-2.5-pro", 1.25, 10.0],
  ["gemini-2.0-flash", 0.10, 0.40],
  // Groq (LPU-hosted Llama vision models) — the receipt fallback.
  ["meta-llama/llama-4-scout", 0.11, 0.34],
  ["meta-llama/llama-4-maverick", 0.20, 0.60],
];

function estimateCost(model: string, inTok: number, outTok: number): number | null {
  const hit = PRICES.find(([p]) => model.startsWith(p));
  if (!hit) return null;
  return (inTok * hit[1] + outTok * hit[2]) / 1_000_000;
}

interface ModelUsage {
  provider: string;
  model: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
}

const WINDOW_DAYS = 30;

export function AiUsageCard() {
  const [rows, setRows] = useState<ModelUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    supabase
      .from("ai_usage_log")
      .select("provider, model, input_tokens, output_tokens, ok")
      .gte("created_at", since)
      .limit(10_000)
      .then(({ data, error }) => {
        if (error) {
          // 42P01 (Postgres) / PGRST205 (PostgREST schema cache): table missing —
          // the SQL hasn't been applied yet.
          const missing = error.code === "42P01" || error.code === "PGRST205" ||
            /find the table/i.test(error.message);
          setError(missing
            ? "Usage table not found — run security/create-ai-usage.sql in the Supabase SQL editor."
            : error.message);
          return;
        }
        const byModel = new Map<string, ModelUsage>();
        for (const r of data ?? []) {
          const model = (r.model as string | null) ?? "(unknown)";
          const key = `${r.provider}/${model}`;
          const m = byModel.get(key) ?? {
            provider: r.provider as string, model, calls: 0, failures: 0,
            inputTokens: 0, outputTokens: 0, cost: null,
          };
          m.calls++;
          if (!r.ok) m.failures++;
          m.inputTokens += (r.input_tokens as number) ?? 0;
          m.outputTokens += (r.output_tokens as number) ?? 0;
          byModel.set(key, m);
        }
        const list = [...byModel.values()].map((m) => ({
          ...m,
          cost: estimateCost(m.model, m.inputTokens, m.outputTokens),
        }));
        list.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.calls - a.calls);
        setRows(list);
      });
  }, []);

  if (!isSupabaseConfigured) return null;

  const maxScale = Math.max(
    ...(rows ?? []).map((r) => r.cost ?? 0),
    ...(rows ?? []).map((r) => (r.cost == null ? r.inputTokens + r.outputTokens : 0) / 1_000_000),
    0.000001,
  );

  return (
    <BentoCard>
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" /> AI usage (last {WINDOW_DAYS} days)
      </h3>
      <p className="text-[11px] text-muted-foreground mb-4">
        Vision-model calls made by this app (receipt auto-fill). Counts only Esterra's own
        usage — other apps sharing the same API keys aren't shown here; see the Google AI
        Studio / xAI consoles for account-wide totals. Costs are estimates from public list
        prices.
      </p>

      {error && (
        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {!error && rows === null && (
        <p className="text-[11px] text-muted-foreground">Loading usage…</p>
      )}

      {!error && rows !== null && rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No AI calls yet — scan a receipt and it will appear here.
        </p>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => {
            const scaleVal = r.cost ?? (r.inputTokens + r.outputTokens) / 1_000_000;
            const pct = Math.max(3, Math.round((scaleVal / maxScale) * 100));
            return (
              <div key={`${r.provider}/${r.model}`}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground truncate">
                    {r.model}
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">{r.provider}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {r.calls} call{r.calls === 1 ? "" : "s"}
                    {r.failures > 0 && <span className="text-amber-400"> · {r.failures} failed</span>}
                    {" · "}{((r.inputTokens + r.outputTokens) / 1000).toFixed(1)}k tok
                    {r.cost != null && <> · ~${r.cost.toFixed(4)}</>}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}
