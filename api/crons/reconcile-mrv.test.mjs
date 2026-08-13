import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, buildExpected, diffByTolerance, aggregateDay, sumMetric } from "./reconcile-mrv.js";

// Compact mirror of the workbook basis for the live Wood Chip project
// (see src/lib/valueChain.ts WOOD_CHIP_BASIS). Base model per ESTERRA_COMPARISON.md:
// preproc 0.5, conversion 0.2, CDR 1, app/storage 1, biochar->CORC x2.
const WOOD_CHIP = {
  preProcessingEfficiency: 0.5,
  conversionEfficiency: 0.2,
  cdrRatio: 1,
  applicationStorageRatio: 1,
  biocharCorcConversion: 2,
};

test("buildExpected derives expected CORC from delivered tonnes via the chain", () => {
  // 30 t delivered -> x0.5 = 15 preproc -> x0.2 = 3 biochar -> x2 = 6 MTe
  const expected = buildExpected(WOOD_CHIP, 30);
  assert.equal(expected.preprocessed, 15);
  assert.equal(expected.biochar, 3);
  assert.equal(expected.corc, 6);
});

test("diffByTolerance reports a drift when live output is off the model", () => {
  const expected = { corc: 6 };
  // Live is 5 MTe (the MP Sepang 0.25/20t variant), ~16.7% below model.
  const drift = diffByTolerance("corc", expected.corc, 5, 0.05);
  assert.ok(drift, "5 vs 6 exceeds 5% tolerance");
  assert.equal(drift.actual, 5);
  assert.equal(drift.expected, 6);
});

test("diffByTolerance returns null when within tolerance", () => {
  const drift = diffByTolerance("corc", 6, 6.1, 0.05);
  assert.equal(drift, null);
});

test("reconcile returns [] when live totals match the model", async () => {
  const fakeTotals = { deliveredTonnes: 30, biocharOutputTonnes: 3 };
  const out = await reconcile(fakeTotals, WOOD_CHIP, 0.05);
  assert.deepEqual(out, []);
});

test("reconcile flags corc mismatch when live diverges", async () => {
  // MP Sepang live scenario: 2.5t biochar -> 5 MTe vs model 3t -> 6 MTe.
  const fakeTotals = { deliveredTonnes: 30, biocharOutputTonnes: 2.5, corcOutputMTe: 5 };
  const out = await reconcile(fakeTotals, WOOD_CHIP, 0.05);
  const corcDrift = out.find((d) => d.metric === "corc");
  assert.ok(corcDrift, "expected a corc drift");
  assert.equal(corcDrift.actual, 5);
  assert.equal(corcDrift.expected, 6);
});

const READING = (metric, value) => ({ data: { Metric: metric, Value: value } });

test("sumMetric sums only the named metric's values", () => {
  const readings = [
    READING("feedstock_intake_mass_kg", 1000),
    READING("biochar_output_mass_kg", 200),
    READING("feedstock_intake_mass_kg", 3000),
    READING("carbonization_temp_c", 550),
  ];
  assert.equal(sumMetric(readings, "feedstock_intake_mass_kg"), 4000);
  assert.equal(sumMetric(readings, "biochar_output_mass_kg"), 200);
});

test("aggregateDay converts kg totals to tonnes and nulls derived CORC", () => {
  const readings = [
    READING("feedstock_intake_mass_kg", 10000),
    READING("feedstock_intake_mass_kg", 20000), // 30,000 kg = 30 t delivered
    READING("biochar_output_mass_kg", 3000),    // 3,000 kg = 3 t biochar
  ];
  const t = aggregateDay(readings);
  assert.equal(t.deliveredTonnes, 30);
  assert.equal(t.biocharOutputTonnes, 3);
  assert.equal(t.corcOutputMTe, null);
});

test("aggregateDay ignores rows without a matching metric or numeric value", () => {
  const readings = [{ data: { Metric: "feedstock_intake_mass_kg" } }, { data: { Metric: "x", Value: 99 } }, {}];
  const t = aggregateDay(readings);
  assert.equal(t.deliveredTonnes, 0);
  assert.equal(t.biocharOutputTonnes, 0);
});
