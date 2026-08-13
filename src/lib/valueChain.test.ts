import { describe, it, expect } from "vitest";
import {
  WORKBOOK_FEEDSTOCKS,
  actualByStage,
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

describe("potentialByStage", () => {
  const points = potentialByStage(woodChip)!;
  const at = (label: string) => points.find((p) => p.label === label)!;

  it("reproduces the workbook's own totals", () => {
    // Value Chain Evaluation.xlsx Sheet1: C29=30 delivered, D29=15 preprocessed,
    // E29=3 biochar, H29=6 tCO2e.
    expect(at("Collection").tonnes).toBe(30);
    expect(at("Pre-Processing").tonnes).toBe(15);
    expect(at("Material Conversion").tonnes).toBeCloseTo(3, 10);
    expect(at("Carbon Certification").corc).toBeCloseTo(6, 10);
  });

  it("values the same material identically at every stage", () => {
    // 30 x 0.2 = 15 x 0.4 = 3 x 2. A sloped line here would mean the chain
    // invents or destroys carbon between stages.
    for (const p of points) expect(p.corc).toBeCloseTo(6, 10);
  });

  it("values each stage at the flat RM30/tonne rate, tracking mass", () => {
    // 1 MT = RM30, so value falls as the efficiency factors shrink the tonnes
    // down the chain: Collection 30t=900, Conversion 3t=90; Certification = 6 MTe x 30.
    expect(at("Collection").rm).toBeCloseTo(30 * 30, 10);
    expect(at("Material Conversion").rm).toBeCloseTo(3 * 30, 10);
    expect(at("Warehouse").rm).toBeCloseTo(3 * 30, 10);
    expect(at("Carbon Certification").rm).toBeCloseTo(6 * 30, 10);
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
    expect(at("Material Conversion").tonnes).toBe(2); // 1500 + 500 kg
    expect(at("Material Conversion").corc).toBeCloseTo(4, 10); // 2 t x 2
  });

  it("counts a batch once per stage however many entries it has", () => {
    // Two production entries, one batch.
    expect(at("Material Conversion").batches).toBe(1);
    expect(at("Collection").batches).toBe(1);
    // No record at all -> no bar, not a zero-tonne bar with a batch behind it.
    expect(at("Warehouse").batches).toBe(0);
    expect(at("Warehouse").corc).toBe(0);
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
