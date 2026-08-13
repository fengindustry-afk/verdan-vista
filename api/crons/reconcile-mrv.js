/**
 * Vercel Cron Function: MRV Value-Chain Reconciliation (Loop 3, time-based).
 *
 * Recomputes the dashboard's custody value chain from live sensor/batch totals
 * and compares them against the workbook model (transcribed in src/lib/valueChain.ts).
 * When live output drifts from the model beyond a tolerance, it writes an alert.
 * This surfaces issues like the MP-Sepang-vs-base divergence called out in
 * ESTERRA_COMPARISON.md (0.25/20t live vs 0.2/10t model) before wrong numbers ship.
 *
 * Endpoint: /api/crons/reconcile-mrv
 * Requires env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   MRV_TOLERANCE (optional, default 0.05 = 5%)
 *
 * Serverless bundle can't import the TS module, so the workbook basis for the
 * live Wood Chip project is mirrored compactly (same pattern as api/ingest/sensor.js).
 */

import { isCronRequest, createCronClient } from "./_shared.js";

const DEFAULT_TOLERANCE = 0.05;

// Compact mirror of WOOD_CHIP_BASIS in src/lib/valueChain.ts (base model).
const WOOD_CHIP_BASIS = {
  preProcessingEfficiency: 0.5,
  conversionEfficiency: 0.2,
  cdrRatio: 1,
  applicationStorageRatio: 1,
  biocharCorcConversion: 2,
};

/**
 * Derive expected chain outputs from delivered tonnes: preprocessed -> biochar -> CORC.
 * @returns {{preprocessed:number, biochar:number, corc:number}}
 */
export function buildExpected(basis, deliveredTonnes) {
  const preprocessed = deliveredTonnes * basis.preProcessingEfficiency;
  const biochar = preprocessed * basis.conversionEfficiency;
  const corc = biochar * basis.cdrRatio * basis.applicationStorageRatio * basis.biocharCorcConversion;
  return { preprocessed, biochar, corc };
}

/**
 * Compare a live value against an expected one. Returns a drift object when the
 * relative difference exceeds tolerance, else null.
 */
export function diffByTolerance(metric, expected, actual, tolerance) {
  if (expected === 0) return null;
  const rel = Math.abs(actual - expected) / expected;
  if (rel <= tolerance) return null;
  return {
    metric,
    expected,
    actual,
    relDiff: Number(rel.toFixed(4)),
    message: `${metric}: live ${actual} vs model ${expected} (${(rel * 100).toFixed(1)}% off, > ${(tolerance * 100).toFixed(0)}% tolerance)`,
  };
}

/**
 * Reconcile live totals against the model. `totals` is a plain object with
 * deliveredTonnes / biocharOutputTonnes (kg for the metric, in MTe for CORC).
 * Returns an array of drift objects (empty when in agreement).
 */
export async function reconcile(totals, basis = WOOD_CHIP_BASIS, tolerance = DEFAULT_TOLERANCE) {
  const drifts = [];
  const { deliveredTonnes, biocharOutputTonnes, corcOutputMTe } = totals;

  if (deliveredTonnes != null && biocharOutputTonnes != null) {
    const expected = buildExpected(basis, deliveredTonnes);
    // Compare the LIVE biochar output against what the model predicts at that delivery.
    const b = diffByTolerance("biochar", expected.biochar, biocharOutputTonnes, tolerance);
    if (b) drifts.push(b);
    // Compare live CORC (MTe) against model CORC when provided.
    if (corcOutputMTe != null) {
      const c = diffByTolerance("corc", expected.corc, corcOutputMTe, tolerance);
      if (c) drifts.push(c);
    }
  }
  return drifts;
}

/** Sum daily totals for a metric from a day's sensor readings (kg, summed). */
export function sumMetric(readings, metric) {
  return readings.reduce((acc, r) => {
    const d = r.data ?? {};
    return d.Metric === metric && typeof d.Value === "number" ? acc + d.Value : acc;
  }, 0);
}

/**
 * Aggregate a day's live sensor readings into reconcile totals.
 * @param {Array} readings — rows from sensor_readings ({data: {PascalCase}})
 * @returns {{deliveredTonnes:number, biocharOutputTonnes:number, corcOutputMTe:number|null}}
 */
export function aggregateDay(readings) {
  const intakeKg = sumMetric(readings, "feedstock_intake_mass_kg");
  const biocharKg = sumMetric(readings, "biochar_output_mass_kg");
  return {
    deliveredTonnes: intakeKg / 1000,
    biocharOutputTonnes: biocharKg / 1000,
    // CORC MTe is derived (biochar * factors); null here lets reconcile compare
    // the biochar leg against the model, which is the load-bearing check.
    corcOutputMTe: null,
  };
}

/**
 * Fetch the latest day's readings from Supabase and reconcile. Uses
 * sensor_readings directly (no separate aggregation table). If the read fails,
 * it THROWS so the handler surfaces a loud failure rather than falsely reporting
 * "clean" — a silent green on a broken pipeline is worse than no signal.
 */
async function runReconcile(client, tolerance) {
  const { data, error } = await client
    .from("sensor_readings")
    .select("*")
    .order("data->>ReadingAt", { ascending: false })
    .limit(500);
  if (error) throw new Error(`reconcile read failed: ${error.message}`);
  if (!data || !data.length) {
    // No readings at all: reconcile nothing, report a clean check (there is no
    // live data to diverge). Distinct from a read *error*, which we throw on.
    return [];
  }
  const totals = aggregateDay(data);
  return await reconcile(totals, WOOD_CHIP_BASIS, tolerance);
}

export default async function handler(req, res) {
  if (!isCronRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const client = createCronClient();
    const tolerance = Number(process.env.MRV_TOLERANCE) || DEFAULT_TOLERANCE;
    const drifts = await runReconcile(client, tolerance);

    if (!drifts.length) {
      return res.status(200).json({ success: true, reconciled: true, drifts: 0 });
    }

    const alert = {
      kind: "mrv_reconcile_drift",
      severity: "medium",
      source: "cron/reconcile-mrv",
      message: drifts.map((d) => d.message).join("; "),
      created_at: new Date().toISOString(),
    };
    const { error } = await client.from("alerts").insert(alert);
    if (error) {
      return res.status(500).json({ error: "Failed to write alert", message: error.message });
    }
    return res.status(200).json({ success: true, reconciled: true, drifts: drifts.length, alert });
  } catch (e) {
    return res.status(500).json({ error: "Reconcile failed", message: e.message });
  }
}
