/**
 * analyze-tree-scan — vision-LLM canopy-health assessment for a tree/plant scan.
 *
 * The browser sends a field photo (base64); this function asks Gemini (primary)
 * or Groq/qwen (fallback) to judge canopy health and return structured JSON.
 * API keys live only in Supabase secrets — never in the client bundle. This is
 * the server-side upgrade of the on-device ExG greenness heuristic, and the
 * anchor point for the planned tree MCP integration.
 *
 * Mirrors extract-receipt: same provider order, auth gate, usage logging, and
 * the qwen reasoning_effort fix (reasoning models otherwise break json_object).
 *
 * Providers are tried in order: Groq, then Gemini.
 * Secrets: GROQ_API_KEY (GROK_API_KEY accepted) / GEMINI_API_KEY, optional
 * GEMINI_MODEL (default gemini-2.0-flash) / GROQ_MODEL (default qwen/qwen3.6-27b).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BASE64_CHARS = 6_000_000;

const PROMPT = `You are an agronomist assessing ONE tree or plant from a single field
photo, taken in a Malaysian biochar/agroforestry trial plot. Judge canopy health
from what is actually visible — never guess beyond the image.

Return these fields:
- status: one of "Healthy", "Moderate", "Stressed", or "Unknown". Use "Unknown"
  only when the photo does not clearly show a plant/tree/foliage.
- score: integer 0-100 canopy vigor (0 = bare/dead, 100 = dense, vigorous, deep-green foliage).
- canopy_density: short phrase, e.g. "dense", "moderate", "sparse".
- leaf_color: short phrase, e.g. "deep green", "pale green", "yellowing", "browning".
- stress_signs: array of short strings for VISIBLE issues only, e.g.
  "leaf yellowing (chlorosis)", "leaf spots", "pest damage", "wilting", "dieback".
  Empty array if none are visible.
- note: 1-2 plain-language sentences an operator can act on.

Base everything ONLY on the image. Do not invent values.
Return ONLY a JSON object with keys: status, score, canopy_density, leaf_color,
stress_signs, note.`;

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["Healthy", "Moderate", "Stressed", "Unknown"] },
    score: { type: "NUMBER" },
    canopy_density: { type: "STRING", nullable: true },
    leaf_color: { type: "STRING", nullable: true },
    stress_signs: { type: "ARRAY", items: { type: "STRING" } },
    note: { type: "STRING" },
  },
  required: ["status", "score", "note"],
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
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 1200)}`);
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
  const key = Deno.env.get("GROQ_API_KEY") ?? Deno.env.get("GROK_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const model = Deno.env.get("GROQ_MODEL") ?? Deno.env.get("GROK_MODEL") ??
    "qwen/qwen3.6-27b";

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } },
        { type: "text", text: PROMPT },
      ],
    }],
  };
  // qwen3 is a reasoning model — disable thinking so json_object isn't broken by
  // <think> tokens (json_validate_failed). Guarded to qwen models.
  if (/qwen/i.test(model)) body.reasoning_effort = "none";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 1200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned no content");
  return {
    fields: parseJsonLoose(text),
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

function parseJsonLoose(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```(?:json)?/gi, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Groq returned non-JSON content");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

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

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = (row: Record<string, unknown>) =>
    admin.from("ai_usage_log").insert({
      user_id: user.id,
      user_email: user.email,
      purpose: "tree-health",
      ...row,
    }).then(({ error }) => {
      if (error) console.error("[usage-log]", error.message);
    });

  // Groq first, Gemini as the fallback.
  const providers: Array<["gemini" | "groq", (i: string, m: string) => Promise<ProviderResult>]> = [
    ["groq", callGroq],
    ["gemini", callGemini],
  ];

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
      console.warn(`[analyze-tree-scan] ${provider} failed in ${ms}ms:`, msg);
      if (!msg.includes("not configured")) {
        await log({ provider, model: null, ok: false, ms, error: msg.slice(0, 2000) });
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
