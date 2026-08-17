import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecords,
  deliver,
  extract,
  leadingNumber,
  normBatch,
  signPayload,
  toCsv,
  toIsoUtc,
} from "./clean.js";

test("normBatch / leadingNumber / toIsoUtc normalize inputs", () => {
  assert.equal(normBatch("  za-01-11-24 "), "ZA-01-11-24");
  assert.equal(leadingNumber("1,200 kg"), 1200);
  assert.equal(leadingNumber("abc"), 0);
  assert.equal(toIsoUtc("2026-02-03T09:00:00Z"), "2026-02-03T09:00:00.000Z");
  assert.equal(toIsoUtc("nope"), null);
});

test("buildRecords emits one record per stage with correct units", () => {
  const batches = [{ data: { Title: "ZA-01-11-24", Type: "Woodchip" } }];
  const entries = [
    { data: { StageKey: "receiving", Values: { batch_id: "ZA-01-11-24", weight: "20000" }, Timestamp: "2026-01-01T00:00:00Z" } },
    { data: { StageKey: "certification", Values: { batch_id: "ZA-01-11-24", certified_corc: "3.5" }, Timestamp: "2026-02-01T00:00:00Z" } },
  ];
  const byBatch = new Map([["ZA-01-11-24", entries]]);
  const { records, batchesWithoutRecords } = buildRecords(batches, byBatch);

  const collection = records.find((r) => r.custodyStage === "collection");
  const cert = records.find((r) => r.custodyStage === "certification");
  // The MTe trap: certified CORC is tCO2e and must NOT be divided by 1000.
  assert.equal(collection.quantityKg, 20000);
  assert.equal(cert.quantityTco2e, 3.5);
  assert.equal(cert.quantityKg, undefined);
  assert.equal(batchesWithoutRecords, 0);
});

test("buildRecords counts orphan batches (no linked records)", () => {
  const batches = [{ data: { Title: "NO-RECORDS-HERE" } }];
  const { records, batchesWithoutRecords } = buildRecords(batches, new Map());
  assert.equal(records.length, 0);
  assert.equal(batchesWithoutRecords, 1);
});

test("signPayload is a stable sha256 hex", () => {
  const a = signPayload({ x: 1 }, "secret");
  const b = signPayload({ x: 1 }, "secret");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("toCsv emits a header row and quoted cell", () => {
  const records = [
    { culaId: "CT_ZA-01-11-24_collection", batchId: "ZA-01-11-24", feedstockType: "Woodchip", custodyStage: "collection", stageKey: "receiving", recordTimestamp: "2026-01-01T00:00:00.000Z", quantityKg: 20000, quantityTco2e: undefined },
  ];
  const csv = toCsv(records);
  assert.match(csv.split("\n")[0], /^culaId,batchId,feedstockType,custodyStage/);
  assert.match(csv, /ZA-01-11-24/);
});

test("extract indexes entries by normalized batch id", async () => {
  const fakeClient = {
    from(table) {
      return {
        select: () => {
          if (table === "feedstock_sourcing") {
            return Promise.resolve({ data: [{ data: { Title: "za-01-11-24" } }], error: null });
          }
          return Promise.resolve({
            data: [{ data: { StageKey: "receiving", Values: { batch_id: " ZA-01-11-24 " } } }],
            error: null,
          });
        },
      };
    },
  };
  const { batches, entriesByBatch } = await extract(fakeClient);
  assert.equal(batches.length, 1);
  assert.ok(entriesByBatch.has("ZA-01-11-24"));
});

test("deliver POSTs the payload with an HMAC signature header", async () => {
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200 };
  };
  try {
    const res = await deliver({ a: 1 }, "https://cula.example/x", "secret");
    assert.equal(res.ok, true);
    assert.equal(captured.url, "https://cula.example/x");
    assert.match(captured.opts.headers["x-cula-signature"], /^sha256=[0-9a-f]{64}$/);
  } finally {
    delete global.fetch;
  }
});
