import { describe, it, expect } from "vitest";
import {
  WORKBOOK_FEEDSTOCKS,
  actualByStage,
  actualByTimeBucket,
  batchesOfFeedstock,
  potentialByStage,
  workbookFeedstock,
} from "./valueChain";
import type { Feedstock } from "./types";
import type { WorkProcessEntry } from "./workProcess";

const woodChip = workbookFeedstock("Wood Chip")!;
const bamboo = workbookFeedstock("Bamboo")!;

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

describe("widget stage chain", () => {
  it("runs Collection → Delivery → Pre-Processing → Conversion → Application → Sink → Certification", () => {
    const points = potentialByStage(woodChip)!;
    expect(points.map((p) => p.label)).toEqual([
      "Collection",
      "Delivery",
      "Pre-Processing",
      "Conversion",
      "Application",
      "Carbon Sink",
      "Carbon Certification",
    ]);
  });
});

describe("potentialByStage", () => {
  const points = potentialByStage(woodChip)!;
  const at = (label: string) => points.find((p) => p.label === label)!;

  it("reproduces the workbook's own totals", () => {
    // Value Chain Evaluation.xlsx Sheet1: C29=30 delivered, D29=15 preprocessed,
    // E29=3 biochar, H29=6 tCO2e. Delivery carries the same delivered material.
    expect(at("Collection").tonnes).toBe(30);
    expect(at("Delivery").tonnes).toBe(30);
    expect(at("Pre-Processing").tonnes).toBe(15);
    expect(at("Conversion").tonnes).toBeCloseTo(3, 10);
    expect(at("Carbon Certification").corc).toBeCloseTo(6, 10);
  });

  it("values the same material identically at every stage", () => {
    // 30 x 0.2 = 15 x 0.4 = 3 x 2. A sloped line here would mean the chain
    // invents or destroys carbon between stages.
    for (const p of points) expect(p.corc).toBeCloseTo(6, 10);
  });

  it("values each stage at the agreed RM rate", () => {
    // Collection/Delivery/Pre-Processing from the workbook VALUE row ÷ quantity
    // (1800/30=60, 900/30=30, 900/15=60); the downstream four at the owner's
    // rates (Material Conversion 2500, Application 2500, Carbon Sink 600,
    // Carbon Certification 600 per certified MTe).
    expect(at("Collection").rm).toBeCloseTo(30 * 60, 10);
    expect(at("Delivery").rm).toBeCloseTo(30 * 30, 10);
    expect(at("Pre-Processing").rm).toBeCloseTo(15 * 60, 10);
    expect(at("Conversion").rm).toBeCloseTo(3 * 2500, 10);
    expect(at("Application").rm).toBeCloseTo(3 * 2500, 10);
    expect(at("Carbon Sink").rm).toBeCloseTo(3 * 600, 10);
    expect(at("Carbon Certification").rm).toBeCloseTo(6 * 600, 10);
  });

  it("no longer draws Sampling or Warehouse bars", () => {
    expect(points.some((p) => p.label === "Sampling" || p.label === "Warehouse")).toBe(false);
  });
});

describe("unparameterised feedstock", () => {
  it("returns null rather than zeros", () => {
    // A zero series would draw a real "this produces nothing" line; the truth is
    // that the workbook's Bamboo column holds the placeholder string "X".
    expect(bamboo.basis).toBeNull();
    expect(potentialByStage(bamboo)).toBeNull();
    expect(actualByStage(bamboo, [batch({ Type: "Bamboo" })], [])).toBeNull();
  });

  it("lists all five workbook feedstocks", () => {
    expect(WORKBOOK_FEEDSTOCKS.map((f) => f.name)).toEqual([
      "Wood Chip",
      "Bamboo",
      "Vetiver",
      "EFB",
      "FIBRECORP",
    ]);
  });
});

describe("actualByStage", () => {
  const entries = [
    wpEntry({ id: "r1", StageKey: "receiving", Values: { batch_id: "ZA-01-11-24", weight: "20000" } }),
    wpEntry({
      id: "p1",
      StageKey: "production_05",
      Values: { batch_id: "ZA-01-11-24", final_biochar_amount: "1500" },
    }),
    wpEntry({
      id: "p2",
      StageKey: "production_10",
      Values: { batch_id: "ZA-01-11-24", final_biochar_amount: "500" },
    }),
    wpEntry({
      id: "c1",
      StageKey: "certification",
      Values: { batch_id: "ZA-01-11-24", certified_corc: "3.5" },
    }),
  ];
  const series = actualByStage(woodChip, [batch()], entries)!;
  const at = (label: string) => series.points.find((p) => p.label === label)!;

  it("converts kg to tonnes and applies the remaining factors", () => {
    expect(at("Collection").tonnes).toBe(20);
    expect(at("Collection").corc).toBeCloseTo(4, 10); // 20 t x 0.2
    expect(at("Delivery").tonnes).toBe(20); // same receiving record
    expect(at("Delivery").corc).toBeCloseTo(4, 10); // delivery carries collection's chain
    expect(at("Conversion").tonnes).toBe(2); // 1500 + 500 kg
    expect(at("Conversion").corc).toBeCloseTo(4, 10); // 2 t x 2
  });

  it("counts a batch once per stage however many entries it has", () => {
    // Two production entries, one batch.
    expect(at("Conversion").batches).toBe(1);
    expect(at("Collection").batches).toBe(1);
    // No record at all -> no bar, not a zero-tonne bar with a batch behind it.
    expect(at("Application").batches).toBe(0);
    expect(at("Application").corc).toBe(0);
  });

  it("takes certified CORC at face value instead of re-deriving it", () => {
    // The registry certified 3.5 tCO2e. Running the 2 t of biochar through the
    // model would have claimed 4 — the certificate wins.
    expect(at("Carbon Certification").corc).toBe(3.5);
    expect(at("Carbon Certification").tonnes).toBe(0);
  });

  it("reports batches with no linked record instead of dropping them silently", () => {
    const orphan = batch({ id: "FS-2", Title: "NO-RECORDS-HERE" });
    const s = actualByStage(woodChip, [batch(), orphan], entries)!;
    expect(s.batchesWithoutRecords).toBe(1);
  });
});

describe("actualByTimeBucket", () => {
  it("buckets each batch at its furthest recorded stage, once", () => {
    const entries = [
      wpEntry({ id: "r1", StageKey: "receiving", Timestamp: "2026-01-05T08:00:00Z", Values: { batch_id: "ZA-01-11-24", weight: "20000" } }),
      wpEntry({ id: "r2", StageKey: "receiving", Timestamp: "2026-01-20T08:00:00Z", Values: { batch_id: "ZA-01-11-24", weight: "10000" } }),
      wpEntry({ id: "p1", StageKey: "production_05", Timestamp: "2026-02-03T09:00:00Z", Values: { batch_id: "ZA-01-11-24", final_biochar_amount: "1500" } }),
    ];
    const points = actualByTimeBucket(woodChip, [batch()], entries, "month")!;
    const at = (label: string) => points.find((p) => p.label === label)!;

    // The batch's custody reached Material Conversion, so it counts once there —
    // the January receiving records are behind it and are not double-counted.
    expect(points.map((p) => p.label)).toEqual(["2026-02"]);
    expect(at("2026-02").tonnes).toBeCloseTo(1.5, 10);
    expect(at("2026-02").corc).toBeCloseTo(3, 10); // 1.5 t x 2
    expect(at("2026-02").rm).toBeCloseTo(1.5 * 2500, 10);
    expect(at("2026-02").batches).toBe(1);
  });

  it("accumulates as a running total since the first record when cumulative", () => {
    const entries = [
      wpEntry({ id: "r1", StageKey: "receiving", Timestamp: "2026-01-05T08:00:00Z", Values: { batch_id: "ZA-01-11-24", weight: "20000" } }),
      wpEntry({ id: "r2", StageKey: "receiving", Timestamp: "2026-02-10T08:00:00Z", Values: { batch_id: "ZA-02-11-24", weight: "10000" } }),
    ];
    const points = actualByTimeBucket(woodChip, [batch(), batch({ id: "FS-2", Title: "ZA-02-11-24" })], entries, "month", true)!;
    const at = (label: string) => points.find((p) => p.label === label)!;

    expect(points.map((p) => p.label)).toEqual(["2026-01", "2026-02"]);
    // January: 20 t received at Collection = 20 x 0.2 = 4 tCO₂e.
    expect(at("2026-01").corc).toBeCloseTo(4, 10);
    // February: the running total since the first record — 4 + (10 t x 0.2).
    expect(at("2026-02").corc).toBeCloseTo(6, 10);
    expect(at("2026-02").tonnes).toBeCloseTo(30, 10);
  });

  it("drops batches with no linked record", () => {
    const entries = [
      wpEntry({ id: "r1", StageKey: "receiving", Timestamp: "not-a-date", Values: { batch_id: "ZA-01-11-24", weight: "20000" } }),
    ];
    const points = actualByTimeBucket(woodChip, [batch()], entries, "day")!;
    expect(points).toEqual([]);
  });
});

describe("batchesOfFeedstock", () => {
  it("matches the workbook name against the app's own type spellings", () => {
    const all = [
      batch({ id: "a", Type: "Woodchip" }),
      batch({ id: "b", Type: "wood chip" }),
      batch({ id: "c", Type: "Bamboo" }),
    ];
    expect(batchesOfFeedstock(woodChip, all).map((f) => f.id)).toEqual(["a", "b"]);
    expect(batchesOfFeedstock(bamboo, all).map((f) => f.id)).toEqual(["c"]);
  });
});
