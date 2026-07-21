import { describe, expect, it } from "vitest";
import { accuracyMeters, distanceMeters, distanceToNearest, geofenceCheck } from "./capture";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(3.139, 101.6869, 3.139, 101.6869)).toBe(0);
  });

  it("matches a known distance (KL to Singapore, ~309 km great circle)", () => {
    const d = distanceMeters(3.139, 101.6869, 1.3521, 103.8198);
    expect(d / 1000).toBeGreaterThan(300);
    expect(d / 1000).toBeLessThan(318);
  });

  it("measures a short offset in metres", () => {
    // 0.001° of latitude is ~111 m anywhere.
    const d = distanceMeters(3.139, 101.6869, 3.14, 101.6869);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });
});

describe("distanceToNearest", () => {
  const here = { Latitude: "3.139000", Longitude: "101.686900" };

  it("returns null when no reference point has coordinates", () => {
    expect(distanceToNearest(here, [{}, { Latitude: "", Longitude: "" }])).toBeNull();
  });

  it("ignores blank coordinates instead of treating them as 0,0", () => {
    // A blank read as 0,0 would be ~11,000 km away and win nothing, but it must
    // not mask the real nearest point either.
    const d = distanceToNearest(here, [
      { Latitude: "", Longitude: "" },
      { Latitude: "3.140000", Longitude: "101.686900" },
    ]);
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(200);
  });

  it("picks the closest of several points", () => {
    const d = distanceToNearest(here, [
      { Latitude: "1.352100", Longitude: "103.819800" },
      { Latitude: "3.139500", Longitude: "101.686900" },
    ]);
    expect(d!).toBeLessThan(100);
  });

  it("returns null for a fix with unusable coordinates", () => {
    expect(distanceToNearest({ Latitude: "abc", Longitude: "" }, [here])).toBeNull();
  });
});

describe("geofenceCheck", () => {
  const site = { Latitude: "3.139000", Longitude: "101.686900" };
  // ~111 m north of the site.
  const near = { Latitude: "3.140000", Longitude: "101.686900", Accuracy: "±5.0m" };

  it("rejects a capture past the radius", () => {
    expect(geofenceCheck(near, [site], 50).outside).toBe(true);
  });

  it("allows it once GPS uncertainty covers the gap", () => {
    const sloppy = { ...near, Accuracy: "±80.0m" };
    expect(geofenceCheck(sloppy, [site], 50).outside).toBe(false);
  });

  it("cannot be outside when there is nothing to measure against", () => {
    const r = geofenceCheck(near, []);
    expect(r.distance).toBeNull();
    expect(r.outside).toBe(false);
  });

  it("treats a missing accuracy as no slack, not as infinite slack", () => {
    expect(accuracyMeters({})).toBe(0);
    expect(geofenceCheck({ ...near, Accuracy: "" }, [site], 50).outside).toBe(true);
  });
});
