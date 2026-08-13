import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, buildExpected, diffByTolerance } from "./reconcile-mrv.js";

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
