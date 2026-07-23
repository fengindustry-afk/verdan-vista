import { describe, expect, it } from "vitest";
import { shouldLog, OPS_FIX } from "./opsLog";

describe("opsLog", () => {
  it("throttles repeat events of the same kind within the window", () => {
    expect(shouldLog("test-kind", 1_000_000)).toBe(true);
    expect(shouldLog("test-kind", 1_000_000 + 30_000)).toBe(false);
    expect(shouldLog("test-kind", 1_000_000 + 61_000)).toBe(true);
  });

  it("does not throttle across different kinds", () => {
    expect(shouldLog("kind-a", 2_000_000)).toBe(true);
    expect(shouldLog("kind-b", 2_000_000)).toBe(true);
  });

  it("has a suggested fix for every kind", () => {
    for (const fix of Object.values(OPS_FIX)) {
      expect(fix.length).toBeGreaterThan(20);
    }
  });
});
