import { describe, expect, it } from "vitest";
import { scanTreeGapMeters, formatMeters, SCAN_GPS_TOLERANCE_M } from "./capture";

describe("scanTreeGapMeters", () => {
  const tree = { Latitude: "2.824703", Longitude: "101.769411" };

  it("returns null when either side isn't geotagged", () => {
    expect(scanTreeGapMeters({ Latitude: "2.8", Longitude: "101.7" }, null)).toBeNull();
    expect(scanTreeGapMeters({ Latitude: "2.8", Longitude: "101.7" }, {})).toBeNull();
    expect(scanTreeGapMeters({}, tree)).toBeNull();
    // Blank strings are not 0,0 — they're "no coordinate".
    expect(scanTreeGapMeters({ Latitude: "", Longitude: "" }, tree)).toBeNull();
  });

  it("is ~0 when the scan sits on its tree, and flags a far tag", () => {
    expect(scanTreeGapMeters(tree, tree)!).toBeLessThan(1);
    // The seed case: scans ~15km from the plot must exceed the tolerance.
    const far = scanTreeGapMeters({ Latitude: "2.882210", Longitude: "101.635255" }, tree)!;
    expect(far).toBeGreaterThan(SCAN_GPS_TOLERANCE_M);
    expect(far).toBeGreaterThan(10_000);
  });
});

describe("formatMeters", () => {
  it("uses metres under a km and km above", () => {
    expect(formatMeters(42.4)).toBe("42 m");
    expect(formatMeters(15_000)).toBe("15.0 km");
  });
});
