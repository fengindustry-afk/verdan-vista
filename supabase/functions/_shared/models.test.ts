/**
 * Self-check for the model-fallback ladder:
 *   deno test supabase/functions/_shared/models.test.ts
 * or, without Deno:
 *   npx esbuild supabase/functions/_shared/models.test.ts --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
 */
import { ModelUnavailableError, isModelUnavailable, withModelFallback } from "./models.ts";

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};
const gone = (m: string) => new ModelUnavailableError(m, "decommissioned");

export async function demo() {
  // Retired models are skipped until one answers.
  const tried: string[] = [];
  const got = await withModelFallback(["dead-1", "dead-2", "live"], async (m) => {
    tried.push(m);
    if (m.startsWith("dead")) throw gone(m);
    return `ok:${m}`;
  });
  assert(got === "ok:live", "falls through to the first working model");
  assert(tried.join() === "dead-1,dead-2,live", "tries candidates in order");

  // A bad key must NOT burn through every model — it throws immediately.
  let attempts = 0;
  await withModelFallback(["a", "b", "c"], async () => {
    attempts++;
    throw new Error("401 invalid_api_key");
  }).then(
    () => assert(false, "unreachable"),
    (e: Error) => {
      assert(/401/.test(e.message), "surfaces the real error, not a model error");
      assert(attempts === 1, "stops on a non-model error instead of retrying");
    },
  );

  // Every candidate retired → ask the provider what it serves now.
  const discovered = await withModelFallback(
    ["dead"],
    async (m) => {
      if (m === "dead") throw gone(m);
      return `ok:${m}`;
    },
    async () => ["fresh-from-api"],
  );
  assert(discovered === "ok:fresh-from-api", "recovers via live discovery");

  // Classifier: availability vs everything else.
  assert(isModelUnavailable(404, ""), "404 is unavailable");
  assert(isModelUnavailable(400, "model_decommissioned"), "decommissioned 400 is unavailable");
  assert(!isModelUnavailable(401, "invalid_api_key"), "401 is not a model problem");
  assert(!isModelUnavailable(429, "rate limit"), "429 is not a model problem");

  console.log("models.ts: all checks passed");
}

demo();
