import { describe, it, expect } from "vitest";
import { legEmissionsTco2e, hasDistance, factorFor, FUEL_KGCO2E_PER_KM } from "./transport";

describe("legEmissionsTco2e", () => {
  it("charges distance at the fuel's factor, in tonnes", () => {
    // 100 km diesel @ 0.9 kg/km = 90 kg = 0.09 t
    expect(legEmissionsTco2e(100, "Diesel")).toBeCloseTo(0.09, 6);
  });

  it("makes a longer haul cost more credits", () => {
    const near = legEmissionsTco2e(20, "Diesel");
    const far = legEmissionsTco2e(200, "Diesel");
    expect(far).toBeGreaterThan(near);
  });

  it("rates diesel above electric for the same distance", () => {
    expect(legEmissionsTco2e(50, "Diesel")).toBeGreaterThan(legEmissionsTco2e(50, "Electric"));
  });

  it("returns 0 for a distance that was never recorded", () => {
    for (const bad of [undefined, "", "abc", 0, -5]) {
      expect(legEmissionsTco2e(bad as never, "Diesel")).toBe(0);
      expect(hasDistance(bad as never)).toBe(false);
    }
    expect(hasDistance(12)).toBe(true);
  });
});

describe("factorFor", () => {
  it("falls back to the dirtiest factor so a blank fuel never flatters the total", () => {
    expect(factorFor(undefined)).toBe(FUEL_KGCO2E_PER_KM.Other);
    expect(factorFor("")).toBe(FUEL_KGCO2E_PER_KM.Other);
    expect(factorFor("Hydrogen")).toBe(FUEL_KGCO2E_PER_KM.Other);
    expect(factorFor("Diesel")).toBe(FUEL_KGCO2E_PER_KM.Diesel);
  });
});
