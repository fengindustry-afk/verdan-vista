/**
 * Tree-health estimation from a scan image.
 *
 * This is the web preview of the on-device analysis that already ships in the
 * mobile app. It classifies canopy vigor from foliage greenness using the
 * Excess Green vegetation index (ExG = 2G − R − B), a standard proxy for healthy
 * chlorophyll-rich foliage. A future upgrade will swap this heuristic for the
 * same ML model the mobile client runs.
 */

export type HealthStatus = "Healthy" | "Moderate" | "Stressed" | "Unknown";

export interface HealthResult {
  status: HealthStatus;
  /** Canopy vigor 0–100. */
  score: number;
  note: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

const classify = (score: number): HealthStatus =>
  score >= 60 ? "Healthy" : score >= 35 ? "Moderate" : "Stressed";

export async function analyzeTreeHealth(src: string): Promise<HealthResult> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    return { status: "Unknown", score: 0, note: "Image could not be loaded for analysis." };
  }

  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { status: "Unknown", score: 0, note: "Canvas is unavailable in this browser." };
  ctx.drawImage(img, 0, 0, size, size);

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return { status: "Unknown", score: 0, note: "Image is cross-origin and cannot be analyzed here." };
  }

  let vegPixels = 0;
  let exgSum = 0;
  const total = size * size;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const exg = 2 * g - r - b; // Excess Green Index
    if (exg > 10) {
      vegPixels++;
      exgSum += exg;
    }
  }

  const vegFraction = vegPixels / total; // share of frame that is foliage
  const meanExg = vegPixels ? exgSum / vegPixels : 0; // greenness vigor of that foliage
  const vigor = Math.min(1, meanExg / 120);
  // Weight canopy coverage and greenness equally; penalize near-empty frames.
  const raw = (0.5 * vegFraction + 0.5 * vigor) * (vegFraction > 0.05 ? 1 : 0.4);
  const score = Math.max(0, Math.min(100, Math.round(raw * 140)));
  const status = classify(score);

  const note =
    `Canopy coverage ${Math.round(vegFraction * 100)}% · greenness vigor ${Math.round(vigor * 100)}%. ` +
    (status === "Healthy"
      ? "Dense, vigorous green foliage — no visible stress."
      : status === "Moderate"
      ? "Some canopy thinning or yellowing — monitor for stress."
      : "Sparse or discolored foliage — likely stressed, inspect on site.");

  return { status, score, note };
}

export const healthTone = (status: string | undefined): string => {
  switch (status) {
    case "Healthy":
      return "text-emerald-400 border-emerald-400/40";
    case "Moderate":
      return "text-amber-400 border-amber-400/40";
    case "Stressed":
      return "text-red-400 border-red-400/40";
    default:
      return "text-muted-foreground border-border";
  }
};
