/**
 * extract-receipt — vision-LLM structured extraction for scanned receipts.
 *
 * The browser sends a receipt image (base64); this function asks Gemini
 * (primary) or Groq (fallback) to transcribe it and return the form fields as
 * JSON. API keys live only in Supabase secrets — never in the client bundle.
 *
 * NOTE: the fallback is Groq (the LPU inference host at api.groq.com, keys
 * "gsk_…"), serving a Llama vision model — NOT xAI's Grok (api.x.ai). Easy to
 * confuse; a Groq key sent to xAI (or vice-versa) is rejected as "incorrect".
 *
 * Secrets (supabase secrets set …):
 *   GEMINI_API_KEY   required for the primary engine
 *   GROQ_API_KEY     required for the fallback engine (GROK_API_KEY also accepted)
 *   GEMINI_MODEL     optional, default "gemini-2.0-flash"
 *                    (gemini-2.5-flash is blocked for new API projects)
 *   GROQ_MODEL       optional, default "qwen/qwen3.6-27b"
 *                    (must be a CURRENT Groq VISION model — the older
 *                    llama-4-scout/maverick vision models were decommissioned
 *                    and now 404 as "model does not exist")
 *
 * Every call (success or failure) is logged to public.ai_usage_log via the
 * service role so Settings can meter this app's spend per model.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** ~4.5MB of binary as base64. Receipts are sent as ≤1600px JPEG, well under. */
const MAX_BASE64_CHARS = 6_000_000;

const PROMPT = `You are reading a photo of a receipt or invoice, most likely Malaysian.
Every receipt is laid out differently — do NOT assume a fixed template. Read what
is actually printed and transcribe it faithfully; never force values into a shape
the receipt doesn't have.

Extract these structured fields:
- merchant: the shop/vendor/business name as printed.
- merchant_tin: the tax ID / SST registration no. / ROC / business registration no.
  if printed (important for Malaysian LHDN records).
- receipt_no: the receipt / invoice / bill number if printed.
- date: the transaction date. Malaysian dates are day-first (dd/mm/yyyy);
  output ISO YYYY-MM-DD.
- currency: e.g. "MYR". Default "MYR" if a Malaysian receipt shows no currency.
- line_items: one entry per purchased line actually shown on the receipt, with
  { description, qty, unit_price, amount }. Use null for any part not printed.
  If the receipt shows no itemised lines, return an empty array.
- subtotal: the pre-tax subtotal if shown (else null).
- tax_type: the indirect-tax label ACTUALLY printed — usually "SST" (Sales &
  Service Tax, the current Malaysian regime). Malaysia abolished GST in 2018, so
  do NOT label tax as GST unless the receipt literally prints "GST". Use "None"
  when no tax line is shown. Transcribe an unusual printed label verbatim.
- tax_rate: the tax rate as a percentage number (e.g. 6 for 6%) if shown or
  derivable, else null.
- tax_amount: the tax amount charged if shown, else null.
- total: the final amount payable / grand total.
- payment_method: e.g. "Cash", "Card", "DuitNow", "e-wallet" if shown.
- category_hint: one short guess like "Fuel", "Fertilizer", "Tools", "Meals", "Utilities".
- raw_text: the full text of the receipt, line by line, exactly as printed.

Amounts are plain numbers (no currency symbol, no thousands separators).
Use null for anything not on the receipt. Never invent values.
Return ONLY a JSON object with keys: merchant, merchant_tin, receipt_no, date,
currency, line_items, subtotal, tax_type, tax_rate, tax_amount, total,
payment_method, category_hint, raw_text.`;

/** OpenAPI-subset schema for Gemini's structured output mode. */
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING", nullable: true },
    merchant_tin: { type: "STRING", nullable: true },
    receipt_no: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true, description: "ISO YYYY-MM-DD" },
    currency: { type: "STRING", nullable: true },
    line_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING", nullable: true },
          qty: { type: "NUMBER", nullable: true },
          unit_price: { type: "NUMBER", nullable: true },
          amount: { type: "NUMBER", nullable: true },
        },
      },
    },
    subtotal: { type: "NUMBER", nullable: true },
    // Free-form: transcribe the printed tax label rather than a fixed enum.
    tax_type: { type: "STRING", nullable: true },
    tax_rate: { type: "NUMBER", nullable: true },
    tax_amount: { type: "NUMBER", nullable: true },
    total: { type: "NUMBER", nullable: true },
    payment_method: { type: "STRING", nullable: true },
    category_hint: { type: "STRING", nullable: true },
    raw_text: { type: "STRING" },
  },
  required: ["raw_text"],
} as const;

interface ProviderResult {
  fields: Record<string, unknown>;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function callGemini(image: string, mime: string): Promise<ProviderResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mime, data: image } },
            { text: PROMPT },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: GEMINI_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return {
    fields: JSON.parse(text),
    model,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callGroq(image: string, mime: string): Promise<ProviderResult> {
  // Groq (api.groq.com, keys "gsk_…"). Accept the older GROK_API_KEY name too,
  // since the secret was originally set under it.
  const key = Deno.env.get("GROQ_API_KEY") ?? Deno.env.get("GROK_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");
  // Must be a Groq VISION model; Llama 4 Scout is fast + multimodal + cheap.
  const model = Deno.env.get("GROQ_MODEL") ?? Deno.env.get("GROK_MODEL") ??
    "meta-llama/llama-4-scout-17b-16e-instruct";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned no content");
  return {
    fields: JSON.parse(text),
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  // Require a signed-in app user — the anon key alone is not enough to spend
  // paid LLM tokens.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);

  let body: { image?: string; mime?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { image, mime = "image/jpeg" } = body;
  if (!image || typeof image !== "string") return json({ error: "Missing image (base64)" }, 400);
  if (image.length > MAX_BASE64_CHARS) return json({ error: "Image too large" }, 413);

  // Service-role client for usage logging (bypasses RLS; clients can only read).
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = (row: Record<string, unknown>) =>
    admin.from("ai_usage_log").insert({
      user_id: user.id,
      user_email: user.email,
      purpose: "receipt-extract",
      ...row,
    }).then(({ error }) => {
      if (error) console.error("[usage-log]", error.message);
    });

  const providers: Array<["gemini" | "groq", (i: string, m: string) => Promise<ProviderResult>]> = [
    ["gemini", callGemini],
    ["groq", callGroq],
  ];

  // Collect every provider's failure so the 502 is actionable — otherwise only
  // the last provider's error surfaces and a skipped/misconfigured primary
  // (e.g. missing GEMINI_API_KEY) is invisible behind the fallback's error.
  const failures: string[] = [];
  for (const [provider, call] of providers) {
    const started = Date.now();
    try {
      const result = await call(image, mime);
      const ms = Date.now() - started;
      await log({
        provider, model: result.model, ok: true, ms,
        input_tokens: result.inputTokens, output_tokens: result.outputTokens,
      });
      return json({ fields: result.fields, provider, model: result.model, ms });
    } catch (err) {
      const ms = Date.now() - started;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${provider}: ${msg}`);
      console.warn(`[extract-receipt] ${provider} failed in ${ms}ms:`, msg);
      // Don't burn a log row when the provider was simply not configured.
      if (!msg.includes("not configured")) {
        await log({ provider, model: null, ok: false, ms, error: msg.slice(0, 500) });
      }
    }
  }
  return json({ error: `All providers failed — ${failures.join(" | ")}` }, 502);
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
