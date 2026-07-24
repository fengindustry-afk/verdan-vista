import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildTestingPlotWorkbook, type TestingPlotData } from "./exportTestingPlot";

const empty: TestingPlotData = {
  trees: [], readings: [], soilSamples: [], observations: [],
  applications: [], comparisons: [],
};

const populated: TestingPlotData = {
  trees: [
    { id: "t1", TreeCode: "P1", TreatmentGroup: "Control", Species: "Papaya", Latitude: "2.824703", Longitude: "101.769411" },
    { id: "t2", TreeCode: "P1", TreatmentGroup: "Biochar", Species: "Papaya" },
  ],
  readings: [
    { id: "r1", TreeId: "t1", Date: "2026-01-01", HeightCm: 100 },
    { id: "r2", TreeId: "t1", Date: "2026-03-01", HeightCm: 150 },
  ],
  soilSamples: [
    { id: "s1", TreatmentGroup: "Control", Parameter: "pH Tanah", InitialReading: 5, FinalReading: 6, Latitude: "2.8248", Longitude: "101.7695" },
  ],
  observations: [{ id: "o1", Date: "2026-02-01", LeafCondition: "Sihat", Latitude: "2.8246", Longitude: "101.7693" }],
  applications: [{ id: "a1", Date: "2026-01-15", Product: "Biochar", BiocharKg: 10, UnitPrice: 2.5, Latitude: "2.8249", Longitude: "101.7698" }],
  comparisons: [{ id: "c1", Parameter: "HeightCm", BiocharPct: 40, NonBiocharPct: 20 }],
  photos: [{ id: "PHOTO-1", Latitude: "2.8", Longitude: "101.7", Sha256: "abc", TimestampSource: "exif" }],
  scans: [
    // On its tree (t1 at 2.824703,101.769411) — no flag.
    { id: "sc1", TreeId: "t1", Latitude: "2.824703", Longitude: "101.769411", HealthStatus: "Healthy", HealthScore: 88, Sha256: "h1" },
    // ~16 km away — flagged for the auditor.
    { id: "sc2", TreeId: "t1", Latitude: "2.882210", Longitude: "101.635255", Sha256: "h2" },
    // References a tree not in this plot — excluded from the sheet.
    { id: "sc3", TreeId: "other", Latitude: "2.8", Longitude: "101.7" },
  ],
};

const rows = (wb: XLSX.WorkBook, name: string) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);

describe("buildTestingPlotWorkbook", () => {
  it("writes a sheet per workbook section, even with no data", () => {
    const wb = buildTestingPlotWorkbook(empty);
    const letters = wb.SheetNames.filter((n) => /^[A-H] · /.test(n)).map((n) => n[0]);
    expect(letters).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(wb.SheetNames[0]).toBe("Ringkasan");
    // Excel rejects sheet names over 31 chars — a silently corrupt file.
    for (const n of wb.SheetNames) expect(n.length).toBeLessThanOrEqual(31);
  });

  it("omits the photo sheet when there is no evidence", () => {
    expect(buildTestingPlotWorkbook(empty).SheetNames).not.toContain("Bukti Foto");
    expect(buildTestingPlotWorkbook(populated).SheetNames).toContain("Bukti Foto");
  });

  it("carries tree coordinates into section A", () => {
    const wb = buildTestingPlotWorkbook(populated);
    const a = rows(wb, wb.SheetNames.find((n) => n.startsWith("A"))!);
    expect(a).toHaveLength(2);
    expect(a[0].Latitude).toBe(2.824703);
    expect(a[0]["Bilangan Bacaan"]).toBe(2);
  });

  it("computes the LAMA → BARU → % pair for growth", () => {
    const wb = buildTestingPlotWorkbook(populated);
    const b = rows(wb, wb.SheetNames.find((n) => n.startsWith("B"))!);
    expect(b[0]["Ketinggian LAMA (cm)"]).toBe(100);
    expect(b[0]["Ketinggian BARU (cm)"]).toBe(150);
    expect(b[0]["Ketinggian %"]).toBe(50);
  });

  it("multiplies out the application cost", () => {
    const wb = buildTestingPlotWorkbook(populated);
    const h = rows(wb, wb.SheetNames.find((n) => n.startsWith("H"))!);
    expect(h[0]["Jumlah Kos (RM)"]).toBe(25);
  });

  it("carries coordinates into soil, observation and application sheets", () => {
    const wb = buildTestingPlotWorkbook(populated);
    const e = rows(wb, wb.SheetNames.find((n) => n.startsWith("E"))!);
    const f = rows(wb, wb.SheetNames.find((n) => n.startsWith("F"))!);
    const h = rows(wb, wb.SheetNames.find((n) => n.startsWith("H"))!);
    expect(e[0].Latitude).toBe(2.8248);
    expect(f[0].Longitude).toBe(101.7693);
    expect(h[0].Latitude).toBe(2.8249);
  });

  it("exports plot scans with the GPS-vs-tree check, excluding off-plot scans", () => {
    const wb = buildTestingPlotWorkbook(populated);
    const s = rows(wb, "Imbasan");
    expect(s).toHaveLength(2); // sc3 (other tree) is excluded
    expect(s[0]["ID Pokok"]).toBe("P1");
    expect(s[0]["Jarak dari pokok (m)"]).toBe(0); // on its tree
    expect(s[0].Semakan).toBe("");
    expect(s[1].Semakan).toBe("SEMAK GPS"); // ~16 km away
    expect(Number(s[1]["Jarak dari pokok (m)"])).toBeGreaterThan(10000);
  });

  it("omits the scan sheet when there are no plot scans", () => {
    expect(buildTestingPlotWorkbook(empty).SheetNames).not.toContain("Imbasan");
  });

  it("leaves an unmeasured percentage blank rather than reporting 0%", () => {
    // t2 has no readings at all, so its growth pair has nothing to compute.
    const wb = buildTestingPlotWorkbook(populated);
    const b = rows(wb, wb.SheetNames.find((n) => n.startsWith("B"))!);
    expect(b[1]["Ketinggian %"]).toBe("");
    expect(b[1]["Ketinggian LAMA (cm)"]).toBe("");
  });
});

describe("coordinate cells", () => {
  const sheetA = (wb: XLSX.WorkBook) =>
    wb.Sheets[wb.SheetNames.find((n) => n.startsWith("A"))!];

  it("stores coordinates as numbers with 6 visible decimals", () => {
    const cell = sheetA(buildTestingPlotWorkbook(populated)).I2;
    expect(cell.t).toBe("n");
    expect(cell.v).toBe(2.824703);
    expect(cell.z).toBe("0.000000");
  });

  it("leaves a tree without coordinates blank, not at 0,0", () => {
    // Number("") is 0 — a real location off West Africa, and a lie on a map.
    const cell = sheetA(buildTestingPlotWorkbook(populated)).I3;
    expect(cell.v).toBe("");
  });
});
