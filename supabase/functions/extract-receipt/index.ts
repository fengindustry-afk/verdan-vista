/**
 * extract-receipt — vision-LLM structured extraction for scanned receipts.
 *
 * The browser sends a receipt image (base64); this function asks Gemini
 * (primary) or Grok (fallback) to transcribe it and return the form fields as
 * JSON. API keys live only in Supabase secrets — never in the client bundle.
 *
 * Secrets (supabase secrets set …):
 *   GEMINI_API_KEY   required for the primary engine
 *   GROK_API_KEY     required for the fallback engine (XAI_API_KEY also accepted)
 *   GEMINI_MODEL     optional, default "gemini-2.0-flash"
 *                    (gemini-2.5-flash is blocked for new API projects)
 *   GROK_MODEL       optional, default "grok-4"
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
Transcribe it and extract the structured fields below. Rules:
- Dates on Malaysian receipts are day-first (dd/mm/yyyy). Output ISO YYYY-MM-DD.
- Amounts are plain numbers (no currency symbol, no thousands separators).
- tax_type is "SST", "GST", or "None" (SST is the current Malaysian regime).
- merchant_tin is the tax ID / SST registration / ROC number if printed.
- category_hint: one short guess like "Fuel", "Fertilizer", "Tools", "Meals", "Utilities".
- raw_text: the full text of the receipt, line by line, as printed.
- Use null for anything not on the receipt. Never invent values.
Return ONLY a JSON object with keys: merchant, merchant_tin, receipt_no, date,
currency, subtotal, tax_type, tax_rate, tax_amount, total, payment_method,
category_hint, raw_text.`;

/** OpenAPI-subset schema for Gemini's structured output mode. */
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING", nullable: true },
    merchant_tin: { type: "STRING", nullable: true },
    receipt_no: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true, description: "ISO YYYY-MM-DD" },
    currency: { type: "STRING", nullable: true },
    subtotal: { type: "NUMBER", nullable: true },
    tax_type: { type: "STRING", nullable: true, enum: ["SST", "GST", "None"] },
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

async function callGrok(image: string, mime: string): Promise<ProviderResult> {
  // Secret is GROK_API_KEY (matches docs/setup); accept XAI_API_KEY too as an alias.
  const key = Deno.env.get("GROK_API_KEY") ?? Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("GROK_API_KEY not configured");
  const model = Deno.env.get("GROK_MODEL") ?? "grok-4";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mime};base64,${image}`, detail: "high" } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Grok returned no content");
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

  const providers: Array<["gemini" | "grok", (i: string, m: string) => Promise<ProviderResult>]> = [
    ["gemini", callGemini],
    ["grok", callGrok],
  ];

  let lastErr = "no provider configured";
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
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[extract-receipt] ${provider} failed in ${ms}ms:`, lastErr);
      // Don't burn a log row when the provider was simply not configured.
      if (!lastErr.includes("not configured")) {
        await log({ provider, model: null, ok: false, ms, error: lastErr.slice(0, 500) });
      }
    }
  }
  return json({ error: `All providers failed: ${lastErr}` }, 502);
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
