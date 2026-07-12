import { describe, it, expect } from "vitest";
import {
  buildStageGroups,
  sumMetric,
  averageMetric,
  countAnomalies,
  coveragePct,
  dryBiocharBasis,
  labParamsFromFeedstock,
  estimateCarbonRemoved,
  isAnomalous,
} from "./sensorAggregate";
import type { SensorReading, SensorStage } from "./sensors";
import { PARAMETER_BY_KEY } from "./sensors";
import type { Feedstock } from "./types";

let seq = 0;
function reading(
  metric: string,
  value: number,
  over: Partial<SensorReading> = {}
): SensorReading {
  const spec = PARAMETER_BY_KEY[metric];
  seq += 1;
  return {
    id: `dev:${seq}`,
    DeviceId: "pyro-reactor-01",
    Metric: metric,
    Value: value,
    Unit: spec?.unit ?? "",
    Stage: (spec?.stage ?? "output") as SensorStage,
    ReadingAt: new Date(1_700_000_000_000 + seq * 60_000).toISOString(),
    ReceivedAt: new Date(1_700_000_000_000 + seq * 60_000).toISOString(),
    Seq: seq,
    Quality: "OK",
    SigValid: true,
    ...over,
  };
}

describe("isAnomalous", () => {
  it("flags non-OK quality or invalid signature", () => {
    expect(isAnomalous(reading("biochar_output_mass_kg", 1580))).toBe(false);
    expect(isAnomalous(reading("biochar_output_mass_kg", 1580, { Quality: "SUSPECT" }))).toBe(true);
    expect(isAnomalous(reading("biochar_output_mass_kg", 1580, { Quality: "CALIBRATION" }))).toBe(true);
    expect(isAnomalous(reading("biochar_output_mass_kg", 1580, { SigValid: false }))).toBe(true);
  });
});

describe("sumMetric", () => {
  it("sums a metric and excludes anomalous readings by default", () => {
    const rows = [
      reading("biochar_output_mass_kg", 1000),
      reading("biochar_output_mass_kg", 500),
      reading("biochar_output_mass_kg", 9000, { Quality: "SUSPECT" }), // tampered spike
      reading("feedstock_intake_mass_kg", 6000),
    ];
    expect(sumMetric(rows, "biochar_output_mass_kg")).toBe(1500);
    expect(sumMetric(rows, "biochar_output_mass_kg", { includeAnomalous: true })).toBe(10500);
  });
});

describe("averageMetric", () => {
  it("averages non-anomalous readings", () => {
    const rows = [
      reading("biochar_moisture_pct", 8),
      reading("biochar_moisture_pct", 12),
      reading("biochar_moisture_pct", 99, { Quality: "SUSPECT" }),
    ];
    expect(averageMetric(rows, "biochar_moisture_pct")).toBe(10);
  });
});

describe("countAnomalies", () => {
  it("counts by class and total", () => {
    const rows = [
      reading("carbonization_temp_c", 550),
      reading("carbonization_temp_c", 2000, { Quality: "SUSPECT" }),
      reading("carbonization_temp_c", 550, { Quality: "CALIBRATION" }),
      reading("carbonization_temp_c", 550, { SigValid: false }),
    ];
    const a = countAnomalies(rows);
    expect(a.suspect).toBe(1);
    expect(a.calibration).toBe(1);
    expect(a.invalidSig).toBe(1);
    expect(a.total).toBe(3);
  });
});

describe("coveragePct", () => {
  it("is the share of the catalog that reports", () => {
    expect(coveragePct([])).toBe(0);
    const rows = [
      reading("feedstock_intake_mass_kg", 6000),
      reading("biochar_output_mass_kg", 1580),
    ];
    // 2 of 10 catalog parameters reporting.
    expect(coveragePct(rows)).toBeCloseTo(20, 5);
  });
});

describe("buildStageGroups", () => {
  it("groups by stage/metric, orders points by time, and counts anomalies", () => {
    const rows = [
      reading("carbonization_temp_c", 560),
      reading("carbonization_temp_c", 3000, { Quality: "SUSPECT" }),
      reading("biochar_output_mass_kg", 1580),
    ];
    const groups = buildStageGroups(rows);
    const pyro = groups.find((g) => g.stage === "pyrolysis")!;
    expect(pyro).toBeTruthy();
    expect(pyro.anomalies).toBe(1);
    const temp = pyro.metrics.find((m) => m.key === "carbonization_temp_c")!;
    expect(temp.points).toHaveLength(2);
    expect(temp.points[0].t).toBeLessThanOrEqual(temp.points[1].t);
    const output = groups.find((g) => g.stage === "output")!;
    expect(output.metrics[0].latest).toBe(1580);
  });

  it("drops readings with unknown metrics or unparseable timestamps", () => {
    const rows = [
      reading("biochar_output_mass_kg", 1580, { Metric: "not_real" }),
      reading("biochar_output_mass_kg", 1580, { ReadingAt: "nonsense" }),
    ];
    expect(buildStageGroups(rows)).toHaveLength(0);
  });
});

describe("dryBiocharBasis", () => {
  it("derives dry mass from wet mass and moisture", () => {
    const rows = [
      reading("biochar_output_mass_kg", 1000),
      reading("biochar_output_mass_kg", 1000),
      reading("biochar_moisture_pct", 10),
    ];
    const b = dryBiocharBasis(rows);
    expect(b.wetKg).toBe(2000);
    expect(b.moisturePct).toBe(10);
    expect(b.dryKg).toBeCloseTo(1800, 5);
  });
});

describe("labParamsFromFeedstock", () => {
  it("averages record values when present", () => {
    const f = [
      { CarbonContentPct: 78, HCorgRatio: 0.3 },
      { CarbonContentPct: 82, HCorgRatio: 0.5 },
    ] as Feedstock[];
    const p = labParamsFromFeedstock(f);
    expect(p.carbonContentPct).toBe(80);
    expect(p.hCorgRatio).toBeCloseTo(0.4, 5);
    expect(p.source).toMatch(/records/);
  });

  it("falls back to conservative defaults when records lack lab values", () => {
    const p = labParamsFromFeedstock([{ Title: "x" } as Feedstock]);
    expect(p.carbonContentPct).toBe(80);
    expect(p.hCorgRatio).toBe(0.5);
    expect(p.source).toMatch(/default/i);
  });
});

describe("estimateCarbonRemoved (corcMetrics adapter)", () => {
  it("returns a positive durable removal for eligible dry biochar", () => {
    const est = estimateCarbonRemoved({
      dryBiocharKg: 38_000,
      carbonContentPct: 80,
      hCorgRatio: 0.3,
      soilTempC: 7,
    });
    // gross = 38000 * 0.8 * 44/12 / 1000 ≈ 111.47 tCO2e; H/Corg<0.4 → PF 0.9.
    expect(est.grossTco2e).toBeCloseTo(111.47, 1);
    expect(est.permanenceFactor).toBe(0.9);
    expect(est.tco2e).toBeCloseTo(est.grossTco2e * 0.9, 5);
    expect(est.durabilityClass).toBe("CORC1000+");
    expect(est.assumptions.soilTempC).toBe(7);
    expect(est.assumptions.dryBiocharKg).toBe(38_000);
  });

  it("defaults soil temperature to 7 °C when omitted", () => {
    const est = estimateCarbonRemoved({
      dryBiocharKg: 1000,
      carbonContentPct: 80,
      hCorgRatio: 0.5,
    });
    expect(est.assumptions.soilTempC).toBe(7);
  });
});
