/**
 * Model resolution for the vision providers, shared by analyze-tree-scan and
 * extract-receipt.
 *
 * Free-tier model ids get retired regularly (Groq especially), which used to
 * take the whole feature down: one hardcoded id, one 404, dead endpoint. So a
 * call walks a list of candidates instead, and when every candidate is gone it
 * asks the provider what it actually serves right now.
 *
 * Only *availability* errors advance to the next candidate. A 401, a 429 or a
 * malformed reply is not a reason to try another model — those get thrown so
 * the provider-level fallback (and the log) sees the real cause.
 */

/** Groq vision models, newest first. Overridden by GROQ_MODEL (comma-separated). */
export const GROQ_VISION_DEFAULTS = [
  "qwen/qwen3.6-27b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
];

/** Gemini vision models, newest first. Overridden by GEMINI_MODEL. */
export const GEMINI_VISION_DEFAULTS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

/**
 * Candidate list for a provider: whatever the env vars name (comma-separated,
 * so an operator can pin or reorder without a deploy) followed by the built-in
 * defaults, deduped.
 */
export function modelCandidates(envVars: string[], defaults: string[]): string[] {
  const configured = envVars
    .flatMap((name) => (Deno.env.get(name) ?? "").split(","))
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...defaults])];
}

/**
 * Whether a failed response means "this model isn't available" rather than
 * something wrong with the request or the key. Providers signal it as a 404, or
 * a 400 whose body mentions decommissioning/not-found.
 */
export function isModelUnavailable(status: number, body: string): boolean {
  if (status === 404) return true;
  return status === 400 &&
    /model_not_found|model_decommissioned|does not exist|is not supported|has been deprecated|not found/i.test(body);
}

/**
 * Ask Groq which models it currently serves and return the ones that look
 * vision-capable. Last resort, used only when every candidate has been retired
 * — this is what keeps a rotation from needing a code change.
 */
export async function discoverGroqVisionModels(key: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? [])
      .map((m: { id?: string }) => m.id)
      .filter((id: unknown): id is string =>
        typeof id === "string" && /vision|scout|maverick|qwen|llava|vl\b/i.test(id)
      );
  } catch {
    return [];
  }
}

/**
 * Run `attempt` over each candidate, moving on only when a model turns out to
 * be unavailable. `discover` supplies a fresh list once the candidates are
 * exhausted. Throws the last error when nothing works.
 */
export async function withModelFallback<T>(
  candidates: string[],
  attempt: (model: string) => Promise<T>,
  discover?: () => Promise<string[]>
): Promise<T> {
  const tried: string[] = [];
  let lastError: unknown = new Error("No models configured");

  const run = async (models: string[]): Promise<T | typeof NOT_FOUND> => {
    for (const model of models) {
      if (tried.includes(model)) continue;
      tried.push(model);
      try {
        return await attempt(model);
      } catch (err) {
        lastError = err;
        if (!(err instanceof ModelUnavailableError)) throw err;
      }
    }
    return NOT_FOUND;
  };

  const first = await run(candidates);
  if (first !== NOT_FOUND) return first;

  if (discover) {
    const discovered = await discover();
    const second = await run(discovered);
    if (second !== NOT_FOUND) return second;
  }
  throw lastError;
}

const NOT_FOUND = Symbol("no-model-worked");

/** Thrown by a provider call when the model id itself is the problem. */
export class ModelUnavailableError extends Error {
  constructor(model: string, detail: string) {
    super(`model "${model}" unavailable: ${detail}`);
    this.name = "ModelUnavailableError";
  }
}
