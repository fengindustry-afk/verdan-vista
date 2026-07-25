import { describe, it, expect } from "vitest";
import { TRAIL, trailStraightLineKm, COORDS_SUFFIX, WORKFLOW_CATALOG } from "./workProcess";

const trail = (from: string, to: string) => ({
  [TRAIL.fromKey + COORDS_SUFFIX]: from,
  [TRAIL.toKey + COORDS_SUFFIX]: to,
});

describe("trailStraightLineKm", () => {
  it("measures the leg between origin and drop", () => {
    // Cyberjaya → Broga, roughly 40 km apart as the crow flies.
    const km = trailStraightLineKm(trail("2.9213,101.6559", "2.9750,101.9000"));
    expect(km).toBeGreaterThan(25);
    expect(km).toBeLessThan(35);
  });

  it("is null unless both endpoints carry usable coordinates", () => {
    expect(trailStraightLineKm({})).toBeNull();
    expect(trailStraightLineKm(trail("2.92,101.65", ""))).toBeNull();
    expect(trailStraightLineKm(trail("2.92,101.65", "not,coords"))).toBeNull();
  });

  it("is zero when the load never left the origin", () => {
    expect(trailStraightLineKm(trail("2.92,101.65", "2.92,101.65"))).toBe(0);
  });
});

describe("Feedstock Collection trail fields", () => {
  it("carries every leg of the trail the keys expect", () => {
    const keys = WORKFLOW_CATALOG.find((s) => s.Key === "receiving")!
      .Sections.flatMap((s) => s.Fields.map((f) => f.Key));
    for (const k of [TRAIL.fromKey, TRAIL.routeKey, TRAIL.distanceKey, TRAIL.toKey]) {
      expect(keys).toContain(k);
    }
  });
});
