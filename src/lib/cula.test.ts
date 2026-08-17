import { describe, it, expect } from "vitest";
import {
  MASS_KG_FACTOR,
  buildCulaRecords,
  buildSensorRollup,
  culaLint,
  dryMassKg,
  normBatch,
  parseNumber,
  toCsv,
  toIsoUtc,
  type CulaRecord,
} from "./cula";
import type { Feedstock } from "./types";
import type { WorkProcessEntry } from "./workProcess";
import type { SensorReading } from "./sensors";

function wpEntry(overrides: Partial<WorkProcessEntry> = {}): WorkProcessEntry {
  return {
    id: "wpe_1",
    StageKey: "receiving",
    StageTitle: "Feedstock Collection",
    Values: {},
    CapturedBy: "Tester",
    Timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function batch(overrides: Partial<Feedstock> = {}): Feedstock {
  return {
    id: "FS-1",
    Title: "ZA-01-11-24",
    Type: "Woodchip",
    Date: "01 Nov 2024",
    Amount: "20000 kg",
    Status: "Pending",
    Supplier: "MP Sepang",
    ...overrides,
  };
}

function reading(overrides: Partial<SensorReading> = {}): SensorReading {
  return {
    id: "dev1:1",
    DeviceId: "dev1",
    Metric: "biochar_output_mass_kg",
    Value: 1000,
    Unit: "kg",
    Stage: "output",
    ReadingAt: "2026-01-01T00:00:00Z",
    ReceivedAt: "2026-01-01T00:00:05Z",
    Seq: 1,
    Quality: "OK",
    SigValid: true,
    ...overrides,
  };
}

const BASIS = {
  preProcessingEfficiency: 0.5,
  conversionEfficiency: 0.25,
  cdrRatio: 1,
  applicationStorageRatio: 1,
  biocharCorcConversion: 2,
  sources: [{ name: "MP Sepang Green Waste", sourceTonnes: 10, deliveredTonnes: 20 }],
};

describe("normalization helpers", () => {
  it("normalises batch ids", () => {
    expect(normBatch("  za-01-11-24 ")).toBe("ZA-01-11-24");
    expect(normBatch("ZA 01 11 24")).toBe("ZA 01 11 24");
    expect(normBatch()).toBe("");
  });

  it("parses timestamps to ISO UTC (date-only -> UTC midnight)", () => {
    expect(toIsoUtc("2026-02-03")).toBe("2026-02-03T00:00:00.000Z");
    expect(toIsoUtc("2026-02-03T09:00:00Z")).toBe("2026-02-03T09:00:00.000Z");
    expect(toIsoUtc("not-a-date")).toBeNull();
    expect(toIsoUtc(undefined)).toBeNull();
  });

  it("parses leading numbers and dry mass", () => {
    expect(parseNumber("1,200 kg")).toBe(1200);
    expect(parseNumber("5 MT")).toBe(5);
    expect(dryMassKg(100, 20)).toBe(80);
    expect(MASS_KG_FACTOR).toBe(1000);
  });
});

describe("culaLint", () => {
  const base: CulaRecord = {
    culaId: "ct",
    batchId: "ZA-01-11-24",
    custodyStage: "collection",
    provenance: { source: "carbon_tracker" },
    warnings: [],
    missing: [],
    assumptions: [],
  };

  it("flags dual quantity units", () => {
    const r = { ...base, quantityKg: 1000, quantityTco2e: 1 };
    expect(culaLint(r).pass).toBe(false);
    expect(culaLint(r).warnings).toContain("DUAL_QUANTITY_UNITS");
  });

  it("flags negative mass and unparseable timestamps", () => {
    expect(culaLint({ ...base, quantityKg: -1 }).warnings).toContain("NEGATIVE_MASS");
    expect(culaLint({ ...base, quantityKg: 1 }).warnings).toContain("TIMESTAMP_UNPARSEABLE");
  });
});

describe("buildCulaRecords", () => {
  const entries = [
    wpEntry({ id: "r1", StageKey: "receiving", Values: { batch_id: "ZA-01-11-24", weight: "20000" } }),
    wpEntry({
      id: "p1",
      StageKey: "production_05",
      Values: { batch_id: "ZA-01-11-24", final_biochar_amount: "1500" },
    }),
    wpEntry({
      id: "c1",
      StageKey: "certification",
      Values: { batch_id: "ZA-01-11-24", certified_corc: "3.5" },
    }),
  ];

  it("emits one record per batch-stage with correct units", () => {
    const { records } = buildCulaRecords([batch()], entries, BASIS);
    const byStage = new Map(records.map((r) => [r.custodyStage, r]));

    expect(byStage.get("collection")?.quantityKg).toBe(20000);
    expect(byStage.get("delivery")?.quantityKg).toBe(20000); // same receiving load
    expect(byStage.get("conversion")?.quantityKg).toBe(1500);
    // The MTe trap: certified CORC must be emitted as tCO2e, NOT divided by 1000.
    expect(byStage.get("certification")?.quantityTco2e).toBe(3.5);
    expect(byStage.get("certification")?.quantityKg).toBeUndefined();
  });

  it("carries the batch's credit metrics and the workbook model per stage", () => {
    const { records } = buildCulaRecords([batch()], entries, BASIS);
    const collection = records.find((r) => r.custodyStage === "collection")!;
    expect(collection.netCorc).toBeTypeOf("number");
    expect(collection.netCorc).toBeGreaterThan(0);
    expect(collection.corcTco2e).toBeCloseTo(5, 10); // 20 t x 0.25
    expect(collection.rm).toBeCloseTo(1200, 10); // 20 t x 60 RM/t (origin)
  });

  it("counts orphan batches", () => {
    const { batchesWithoutRecords } = buildCulaRecords(
      [batch(), batch({ id: "FS-2", Title: "NO-RECORDS-HERE" })],
      entries
    );
    expect(batchesWithoutRecords).toBe(1);
  });
});

describe("buildSensorRollup", () => {
  it("rolls up non-anomalous readings and dry-biochar carbon", () => {
    const readings = [
      reading({ id: "dev1:1", Metric: "biochar_output_mass_kg", Value: 1000, Quality: "OK" }),
      reading({ id: "dev1:2", Metric: "biochar_output_mass_kg", Value: 500, Quality: "SUSPECT" }),
      reading({ id: "dev1:3", Metric: "biochar_moisture_pct", Value: 20, Quality: "OK" }),
    ];
    const rollup = buildSensorRollup(readings, "2026-01-01", "2026-01-31");
    const out = rollup.find((r) => r.metricKey === "biochar_output_mass_kg");
    const dry = rollup.find((r) => r.metricKey === "dry_biochar_mass_kg");
    // 1000 kg wet x (1 - 20/100) = 800 kg dry, carbon > 0.
    expect(dry?.quantityKg).toBeCloseTo(800, 10);
    expect(dry?.carbonRemovedTco2e).toBeGreaterThan(0);
    expect(out?.value).toBe(1000); // SUSPECT excluded from the sum
    expect(out?.anomalousReadings).toBe(1);
  });
});

describe("toCsv", () => {
  it("writes a header and quoted rows", () => {
    const r: CulaRecord = {
      culaId: "ct_1",
      batchId: "ZA-01-11-24",
      custodyStage: "conversion",
      quantityKg: 1500,
      netCorc: 4,
      provenance: { source: "carbon_tracker" },
      warnings: ["YIELD_OVER_100PCT"],
      missing: [],
      assumptions: [],
    };
    const csv = toCsv([r]);
    expect(csv.split("\n")[0]).toContain("culaId,batchId,feedstockType,custodyStage");
    expect(csv).toContain("YIELD_OVER_100PCT");
    expect(csv).toContain("1500");
  });
});
