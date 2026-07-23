/**
 * AI tree-scan analysis. Sends a scan image to the `analyze-tree-scan` edge
 * function (Gemini primary → Groq/qwen fallback, keys held server-side) and gets
 * a structured canopy-health assessment back. Falls back transparently to the
 * on-device ExG greenness heuristic when the function is unreachable, the user is
 * offline, or every provider fails — so analysis always produces a result.
 *
 * This is the wiring point for the planned tree MCP: the same edge function that
 * holds the vision keys will host the tree tools.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { analyzeTreeHealth, type HealthResult, type HealthStatus } from "./health";
import { classifyAiError } from "./aiErrors";

export type ScanAnalysisEngine = "gemini" | "groq" | "exg";

export interface ScanAnalysis extends HealthResult {
  /** Which analyzer produced the result (badge on the review screen). */
  engine: ScanAnalysisEngine;
  /**
   * Why the AI was skipped, when `engine` is "exg". Without this the fallback is
   * invisible: a result still appears, so a broken key, an exhausted quota or a
   * missing session all look identical to "the AI just rated it this way".
   */
  fallbackReason?: string;
}

/** Structured fields returned by the edge function's LLM schema. */
interface LlmHealth {
  status?: string | null;
  score?: number | null;
  canopy_density?: string | null;
  leaf_color?: string | null;
  stress_signs?: string[] | null;
  note?: string | null;
}

const VALID_STATUS: HealthStatus[] = ["Healthy", "Moderate", "Stressed", "Unknown"];
const LLM_TIMEOUT_MS = 45_000;
const FETCH_TIMEOUT_MS = 20_000;

/** Phases the caller can show while an analysis runs. */
export type ScanPhase = "loading" | "preparing" | "analyzing" | "fallback";
export type ScanProgress = (phase: ScanPhase) => void;

export const SCAN_PHASE_LABEL: Record<ScanPhase, string> = {
  loading: "Loading image…",
  preparing: "Preparing image…",
  analyzing: "Analyzing canopy…",
  fallback: "Falling back to on-device analysis…",
};

/**
 * Fetch one candidate source as a blob. A signed R2/Supabase URL renders fine in
 * an <img> but can still fail here (CORS, expiry, a dropped connection mid-flight),
 * so the caller needs to know *why* it failed to pick the next candidate.
 * Retries once, because on a weak link the first attempt often just times out.
 */
async function fetchImageBlob(src: string): Promise<Blob> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600));
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        lastErr = `image request returned ${res.status}`;
        if (res.status >= 400 && res.status < 500) break; // 404/403 won't fix itself
        continue;
      }
      const blob = await res.blob();
      if (blob.size === 0) { lastErr = "image was empty"; continue; }
      return blob;
    } catch (err) {
      lastErr = err instanceof DOMException && err.name === "TimeoutError"
        ? "image download timed out"
        : "image could not be downloaded";
    }
  }
  throw new Error(lastErr || "image could not be downloaded");
}

/** Downscale to ~1024px JPEG so the vision model gets enough detail without a
 *  bulky payload. Returns null when the image can't be decoded here. */
async function prepareImage(blob: Blob): Promise<{ base64: string; mime: string } | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!out) return null;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(out);
  });
  return { base64, mime: "image/jpeg" };
}

/** Compose the app's HealthResult note from the richer LLM observations. */
function buildNote(f: LlmHealth): string {
  const parts: string[] = [];
  if (f.note?.trim()) parts.push(f.note.trim());
  const detail: string[] = [];
  if (f.canopy_density?.trim()) detail.push(`canopy ${f.canopy_density.trim()}`);
  if (f.leaf_color?.trim()) detail.push(`leaves ${f.leaf_color.trim()}`);
  if (detail.length) parts.push(`${detail.join(", ")}.`);
  const signs = (f.stress_signs ?? []).filter((s) => s && s.trim());
  if (signs.length) parts.push(`Signs: ${signs.join("; ")}.`);
  return parts.join(" ").trim();
}

function toResult(f: LlmHealth, engine: ScanAnalysisEngine): ScanAnalysis {
  const status = (VALID_STATUS as string[]).includes(f.status ?? "")
    ? (f.status as HealthStatus)
    : "Unknown";
  const score = typeof f.score === "number" && Number.isFinite(f.score)
    ? Math.max(0, Math.min(100, Math.round(f.score)))
    : 0;
  return { status, score, note: buildNote(f) || "No assessment detail returned.", engine };
}

/**
 * Try each candidate source in turn. The signed URL is preferred (full
 * resolution), the inline base64 copy is the offline-proof backstop — it needs
 * no network at all, which is exactly what a weak connection breaks.
 */
export async function loadImage(sources: string[]): Promise<Blob> {
  const reasons: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    try {
      return await fetchImageBlob(src);
    } catch (err) {
      reasons.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(reasons[0] ?? "no image source available");
}

async function runLlm(sources: string[], onProgress: ScanProgress): Promise<ScanAnalysis> {
  if (!isSupabaseConfigured) throw new Error("Supabase not configured");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  onProgress("loading");
  // Preferred path: download + downscale in the browser. A signed URL can render
  // fine in an <img> yet CORS-block a fetch(), so when the download fails and we
  // still have an https source, hand the URL to the edge function instead — it
  // fetches server-side where CORS doesn't apply.
  let body: { image: string; mime: string } | { imageUrl: string };
  try {
    const blob = await loadImage(sources);
    onProgress("preparing");
    const prepared = await prepareImage(blob);
    if (!prepared) throw new Error("image format could not be read");
    body = { image: prepared.base64, mime: prepared.mime };
  } catch (err) {
    const remote = sources.find((s) => s.startsWith("http"));
    if (!remote) throw err;
    console.warn("[scan] browser image download failed, asking server to fetch:", err);
    body = { imageUrl: remote };
  }

  onProgress("analyzing");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.functions.invoke("analyze-tree-scan", {
      body,
      signal: controller.signal,
    });
    if (error) {
      let detail = error.message;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        try {
          const parsed = JSON.parse(await ctx.text());
          if (parsed?.error) detail = parsed.error;
        } catch { /* keep generic */ }
      }
      throw new Error(detail);
    }
    const provider = data?.provider as ScanAnalysisEngine | undefined;
    const fields = data?.fields as LlmHealth | undefined;
    if (!fields || (provider !== "gemini" && provider !== "groq")) {
      throw new Error("Unexpected analysis response");
    }
    return toResult(fields, provider);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Analyze a tree scan image: AI vision assessment first, on-device ExG greenness
 * as the safety net. Never rejects for engine reasons.
 */
export async function analyzeTreeScan(
  src: string,
  opts: { fallbackSrc?: string; onProgress?: ScanProgress } = {}
): Promise<ScanAnalysis> {
  const onProgress = opts.onProgress ?? (() => {});
  const sources = [src, opts.fallbackSrc].filter((s): s is string => !!s && s !== src);
  try {
    return await runLlm([src, ...sources], onProgress);
  } catch (err) {
    const { message: reason, detail } = classifyAiError(err);
    console.warn(`[scan] AI tree analysis unavailable (${reason}), using on-device ExG:`, detail, err);
    onProgress("fallback");
    const exg = await analyzeTreeHealth(src);
    return { ...exg, engine: "exg", fallbackReason: reason };
  }
}

/** Human label for the analyzer badge. */
export function scanEngineLabel(engine: ScanAnalysisEngine): string {
  switch (engine) {
    case "gemini": return "AI · Gemini";
    case "groq": return "AI · Groq";
    case "exg": return "On-device (ExG)";
  }
}
