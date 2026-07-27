import { describe, it, expect } from "vitest";
import { corcMetrics, currentStageIndex, massBalance, parseAuditLog, planProduction, wpEntriesForBatch, wpProcessEmissionTco2e, CUSTODY_STAGES } from "./feedstock";
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
  it("uses defaults (33% yield, 80% C, 0.5 H/C) when biochar inputs are blank", () => {
    const m = corcMetrics(batch());
    expect(m.effectiveYieldKg).toBe(660); // 2000 * 0.33
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
    // gross = 660kg * 0.80 * (44/12) / 1000 = 1.936 tCO2e
    // durable = 1.936 * 0.80 = 1.5488 ; lca = 1.5488 * 0.08 ; net = durable - lca
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }));
    expect(m.grossRemovalTco2e).toBeCloseTo(1.936, 2);
    expect(m.durableRemovalTco2e).toBeCloseTo(1.5488, 2);
    expect(m.netCorc).toBeCloseTo(1.425, 2);
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

  // ── Transport deduction: a longer diesel haul must issue fewer credits ──
  const haul = (km: string, fuel = "Diesel") =>
    wpEntry({
      StageKey: "receiving", StageTitle: "Feedstock Collection",
      Values: { batch_id: "Test Batch", distance: km, transport_fuel: fuel },
    });

  it("charges a recorded haul against the batch", () => {
    // 400 km diesel = 400 * 0.9 / 1000 = 0.36 tCO2e, above the 0.113 t proxy.
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }), [haul("400")]);
    expect(m.transportTco2e).toBeCloseTo(0.36, 3);
    expect(m.effectiveLca).toBeCloseTo(0.36, 3);
  });

  it("issues fewer credits the further the feedstock travelled", () => {
    const near = corcMetrics(batch({ HCorgRatio: 0.5 }), [haul("50")]).netCorc;
    const far = corcMetrics(batch({ HCorgRatio: 0.5 }), [haul("900")]).netCorc;
    expect(far).toBeLessThan(near);
  });

  it("never issues more than the 8% proxy alone would have", () => {
    const baseline = corcMetrics(batch({ HCorgRatio: 0.5 })).netCorc;
    for (const km of ["1", "50", "400", "5000"]) {
      expect(corcMetrics(batch({ HCorgRatio: 0.5 }), [haul(km)]).netCorc).toBeLessThanOrEqual(baseline);
    }
  });

  it("keeps the 8% proxy when a short haul falls under it", () => {
    // 10 km = 0.009 t, well below the 0.113 t proxy — proxy still governs.
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }), [haul("10")]);
    expect(m.transportTco2e).toBeCloseTo(0.009, 4);
    expect(m.effectiveLca).toBeCloseTo(m.durableRemovalTco2e * 0.08, 4);
  });

  it("lets an explicit LCA figure override the measured haul", () => {
    const m = corcMetrics(
      batch({ HCorgRatio: 0.5, LcaEmissionsTco2e: 0.5 } as Partial<Feedstock>),
      [haul("400")]
    );
    expect(m.effectiveLca).toBe(0.5);
  });

  it("adds up several deliveries feeding one batch", () => {
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }), [haul("100"), haul("300")]);
    expect(m.transportTco2e).toBeCloseTo(0.36, 3);
  });

  it("charges nothing when no leg recorded a distance", () => {
    expect(corcMetrics(batch({ HCorgRatio: 0.5 }), [haul("")]).transportTco2e).toBe(0);
  });

  it("charges a haul recorded on a downstream stage (warehouse/application/carbon_sink), not just receiving", () => {
    const wp = [wpEntry({ StageKey: "carbon_sink", Values: { distance: "400", transport_fuel: "Diesel" } })];
    expect(corcMetrics(batch({ HCorgRatio: 0.5 }), wp).transportTco2e).toBeCloseTo(0.36, 3);
  });

  it("charges pyrolysis fuel and folds it into effectiveLca alongside transport", () => {
    const wp = [wpEntry({ StageKey: "production_05", Values: { weight_of_fuel: "1000" } })]; // 1000kg diesel
    const m = corcMetrics(batch({ HCorgRatio: 0.5 }), wp);
    expect(m.processEmissionTco2e).toBeCloseTo((1000 * 2.68) / 1000, 3); // 2.68 tCO2e
    expect(m.effectiveLca).toBeCloseTo(m.processEmissionTco2e, 3); // exceeds the 8% proxy
  });
});

describe("wpProcessEmissionTco2e", () => {
  it("converts production_10's MJ energy reading to the same tCO2e basis as production_05's kg reading", () => {
    // 36 MJ/L, diesel ~0.832 kg/L => 43.27 MJ/kg; 100 MJ => 2.311kg diesel => 0.00619 tCO2e
    const wp = [wpEntry({ StageKey: "production_10", Values: { diesel_energy_36_mj_l: "100" } })];
    expect(wpProcessEmissionTco2e(wp)).toBeCloseTo(0.00619, 4);
  });
});

describe("planProduction", () => {
  it("matches the report's Ecosfera 0.5 worked example (2000kg target -> 6154kg, 31 batches, 372h)", () => {
    const p = planProduction(2000, "Ecosfera 0.5");
    expect(p.feedstockKg).toBeCloseTo(6153.8, 0);
    expect(p.batches).toBe(31);
    expect(p.hours).toBe(31 * 12);
  });

  it("matches the report's Ecosfera 1.0 worked example (2000kg target -> 6006kg, ~119h)", () => {
    const p = planProduction(2000, "Ecosfera 1.0");
    expect(p.feedstockKg).toBeCloseTo(6006, 0);
    expect(p.hours).toBeCloseTo(119, 0);
    expect(p.batches).toBeUndefined();
  });
});

describe("massBalance", () => {
  it("computes conversion, reject, usage-efficiency and biochar-conversion ratios from recorded weights", () => {
    const wp = [
      wpEntry({ StageKey: "receiving", Values: { weight: "1000" } }),
      wpEntry({ StageKey: "isolation", Values: { good_feedstock_quantity: "800", reject_quantity: "200" } }),
      wpEntry({ StageKey: "production_05", Values: { final_biochar_amount: "240" } }),
    ];
    const mb = massBalance(wp);
    expect(mb.conversionRatePct).toBeCloseTo(80, 4); // 800/1000
    expect(mb.rejectPct).toBeCloseTo(20, 4); // 200/1000
    expect(mb.usageEfficiencyPct).toBeCloseTo(80, 4); // 800/1000
    expect(mb.biocharConversionRatePct).toBeCloseTo(30, 4); // 240/800
  });

  it("returns all zeros for a batch with no recorded weights", () => {
    expect(massBalance([])).toEqual({
      rawBiomassKg: 0, feedstockKg: 0, rejectKg: 0, biocharKg: 0,
      conversionRatePct: 0, rejectPct: 0, usageEfficiencyPct: 0, biocharConversionRatePct: 0,
    });
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

describe("wpEntriesForStage", () => {
  it("covers every work-process stage in the catalog exactly once", async () => {
    const { CUSTODY_STAGE_KEYS } = await import("./feedstock");
    const { WORKFLOW_CATALOG } = await import("./workProcess");
    const mapped = Object.values(CUSTODY_STAGE_KEYS).flat();
    // A catalog stage missing here would drop its entries out of the custody
    // chain silently; a duplicate would list the same file under two stages.
    expect([...mapped].sort()).toEqual(WORKFLOW_CATALOG.map((s) => s.Key).sort());
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("groups a batch's entries under the right custody stage, newest first", async () => {
    const { wpEntriesForStage } = await import("./feedstock");
    const entries = [
      wpEntry({ id: "a", StageKey: "isolation", Timestamp: "2024-11-01T00:00:00Z" }),
      wpEntry({ id: "b", StageKey: "drying", Timestamp: "2024-11-09T00:00:00Z" }),
      wpEntry({ id: "c", StageKey: "receiving", Timestamp: "2024-10-01T00:00:00Z" }),
    ];
    expect(wpEntriesForStage("Feedstock Pre-Processing", entries).map((e) => e.id)).toEqual(["b", "a"]);
    expect(wpEntriesForStage("Feedstock Collection", entries).map((e) => e.id)).toEqual(["c"]);
    expect(wpEntriesForStage("Carbon Sink", entries)).toEqual([]);
  });
});
