import { describe, it, expect } from "vitest";
import { corcMetrics, currentStageIndex, parseAuditLog, wpEntriesForBatch, CUSTODY_STAGES } from "./feedstock";
import type { Feedstock } from "./types";
import type { WorkProcessEntry } from "./workProcess";

function wpEntry(overrides: Partial<WorkProcessEntry> = {}): WorkProcessEntry {
  return {
    id: "wpe_1",
    StageKey: "production_05",
    StageTitle: "Biochar Production 0.5",
    Values: {},
    CapturedBy: "Tester",
    Timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function batch(overrides: Partial<Feedstock> = {}): Feedstock {
  return {
    id: "FS-TEST",
    Title: "Test Batch",
    Type: "Palm Kernel Shells",
    Date: "01 Jan 2026",
    Amount: "2000 kg",
    Status: "Pending",
    Supplier: "Test Supplier",
    ...overrides,
  };
}

describe("corcMetrics", () => {
  it("uses defaults (30% yield, 80% C, 0.5 H/C) when biochar inputs are blank", () => {
    const m = corcMetrics(batch());
    expect(m.effectiveYieldKg).toBe(600); // 2000 * 0.30
    expect(m.effectiveCarbonPct).toBe(80);
    expect(m.effectiveHCorg).toBe(0.5);
  });

  it("classifies CORC200+ (permanence 0.80) for 0.4 <= H/C < 0.7", () => {
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }));
    expect(m.durabilityClass).toBe("CORC200+");
    expect(m.permanenceFactor).toBe(0.8);
  });

  it("classifies CORC1000+ (permanence 0.90) for H/C < 0.4", () => {
    const m = corcMetrics(batch({ HCorgRatio: 0.3 }));
    expect(m.durabilityClass).toBe("CORC1000+");
    expect(m.permanenceFactor).toBe(0.9);
  });

  it("is not durability-eligible when H/C >= 0.7", () => {
    const m = corcMetrics(batch({ HCorgRatio: 0.8 }));
    expect(m.durabilityEligible).toBe(false);
    expect(m.permanenceFactor).toBe(0);
    expect(m.netCorc).toBe(0);
  });

  it("requires eligible sourcing for CORC eligibility", () => {
    const m = corcMetrics(batch({ Type: "Mystery Wood" }));
    expect(m.sourcingEligible).toBe(false);
    expect(m.isCorcEligible).toBe(false);
    expect(m.netCorc).toBe(0);
  });

  it("computes a positive net CORC for an eligible, durable batch", () => {
    // gross = 600kg * 0.80 * (44/12) / 1000 = 1.76 tCO2e
    // durable = 1.76 * 0.80 = 1.408 ; lca = 1.408 * 0.08 ; net = durable - lca
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }));
    expect(m.grossRemovalTco2e).toBeCloseTo(1.76, 2);
    expect(m.durableRemovalTco2e).toBeCloseTo(1.408, 2);
    expect(m.netCorc).toBeCloseTo(1.295, 2);
    expect(m.isCorcEligible).toBe(true);
  });

  it("prefers measured work-process values over defaults", () => {
    const wp = [
      wpEntry({ Values: { batch_id: "Test Batch", final_biochar_amount: "500" } }),
      wpEntry({
        id: "wpe_2", StageKey: "sampling", StageTitle: "Sampling",
        Values: { batch_id: "Test Batch", carbon_content: "75", h_c_ratio: "0.35" },
      }),
    ];
    const m = corcMetrics(batch(), wp);
    expect(m.effectiveYieldKg).toBe(500); // not 2000 * 0.30
    expect(m.effectiveCarbonPct).toBe(75);
    expect(m.effectiveHCorg).toBe(0.35);
    expect(m.durabilityClass).toBe("CORC1000+");
  });

  it("sums yield across production entries and keeps explicit record fields winning", () => {
    const wp = [
      wpEntry({ Values: { final_biochar_amount: "300" } }),
      wpEntry({ id: "wpe_2", StageKey: "production_10", Values: { final_biochar_amount: "200" } }),
    ];
    expect(corcMetrics(batch(), wp).effectiveYieldKg).toBe(500);
    expect(corcMetrics(batch({ BiocharYieldKg: 999 } as Partial<Feedstock>), wp).effectiveYieldKg).toBe(999);
  });
});

describe("withMeasuredCorcInputs", () => {
  it("fills blank CORC inputs from work-process data, leaving explicit fields alone", async () => {
    const { withMeasuredCorcInputs } = await import("./feedstock");
    const wp = [
      wpEntry({ Values: { batch_id: "Test Batch", final_biochar_amount: "500" } }),
    ];
    const [matched, unmatched, explicit] = withMeasuredCorcInputs(
      [
        batch(),
        batch({ Title: "Other Batch" }),
        batch({ BiocharYieldKg: 999 } as Partial<Feedstock>),
      ],
      wp
    ) as (Feedstock & { BiocharYieldKg?: number })[];
    expect(matched.BiocharYieldKg).toBe(500);
    expect(unmatched.BiocharYieldKg).toBeUndefined();
    expect(explicit.BiocharYieldKg).toBe(999);
  });
});

describe("feedstockForEntry", () => {
  it("resolves an entry to its feedstock by batch_id then source_batch_id", async () => {
    const { feedstockForEntry } = await import("./feedstock");
    const fs = [batch({ id: "FS-1", Title: "ZA-01" }), batch({ id: "FS-2", Title: "Test Batch" })];
    expect(feedstockForEntry({ batch_id: "za-01" }, fs)?.id).toBe("FS-1");
    expect(feedstockForEntry({ source_batch_id: "TEST BATCH" }, fs)?.id).toBe("FS-2");
    expect(feedstockForEntry({ batch_id: "nope" }, fs)).toBeUndefined();
    expect(feedstockForEntry(undefined, fs)).toBeUndefined();
  });
});

describe("wpEntriesForBatch", () => {
  it("matches batch_id and source_batch_id case/space-insensitively", () => {
    const entries = [
      wpEntry({ Values: { batch_id: "  test  batch " } }),
      wpEntry({ id: "wpe_2", Values: { source_batch_id: "TEST BATCH" } }),
      wpEntry({ id: "wpe_3", Values: { batch_id: "Other" } }),
    ];
    expect(wpEntriesForBatch("Test Batch", entries)).toHaveLength(2);
    expect(wpEntriesForBatch("", entries)).toEqual([]);
  });
});

describe("currentStageIndex", () => {
  it("returns 0 for an unset stage", () => {
    expect(currentStageIndex(batch())).toBe(0);
  });
  it("maps a known stage to its index", () => {
    expect(currentStageIndex(batch({ CurrentStage: "Material Conversion" }))).toBe(
      CUSTODY_STAGES.indexOf("Material Conversion")
    );
  });
});

describe("parseAuditLog", () => {
  it("parses a serialized audit log", () => {
    const log = JSON.stringify([{ Action: "Batch created", Actor: "A", Role: "Operator", Timestamp: "t" }]);
    const parsed = parseAuditLog(batch({ AuditLog: log }));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].Action).toBe("Batch created");
  });
  it("returns [] for missing or malformed logs", () => {
    expect(parseAuditLog(batch())).toEqual([]);
    expect(parseAuditLog(batch({ AuditLog: "not json" }))).toEqual([]);
  });
});
