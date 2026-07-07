import { describe, it, expect } from "vitest";
import { corcMetrics, currentStageIndex, parseAuditLog, CUSTODY_STAGES } from "./feedstock";
import type { Feedstock } from "./types";

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
