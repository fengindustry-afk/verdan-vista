import { describe, it, expect } from "vitest";
import {
  validatePayload,
  canonicalSignString,
  PARAMETER_BY_KEY,
  type SensorPayload,
} from "./sensors";

function base(): SensorPayload {
  return {
    deviceId: "pyro-reactor-01",
    metric: "carbonization_temp_c",
    value: 550,
    unit: "°C",
    ts: "2026-07-13T00:00:00.000Z",
    seq: 1,
  };
}

describe("validatePayload", () => {
  it("accepts a well-formed in-range reading as OK", () => {
    const r = validatePayload(base());
    expect(r.ok).toBe(true);
    expect(r.quality).toBe("OK");
  });

  it("rejects an unknown metric", () => {
    const r = validatePayload({ ...base(), metric: "not_a_real_metric" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown metric/);
  });

  it("rejects a unit that does not match the catalog", () => {
    const r = validatePayload({ ...base(), unit: "F" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unit/);
  });

  it("rejects a non-finite value", () => {
    const r = validatePayload({ ...base(), value: Number.NaN });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-integer / negative seq", () => {
    expect(validatePayload({ ...base(), seq: 1.5 }).ok).toBe(false);
    expect(validatePayload({ ...base(), seq: -1 }).ok).toBe(false);
  });

  it("flags an out-of-range value SUSPECT but still accepts it", () => {
    const spec = PARAMETER_BY_KEY["carbonization_temp_c"];
    const r = validatePayload({ ...base(), value: spec.max + 500 });
    expect(r.ok).toBe(true);
    expect(r.quality).toBe("SUSPECT");
  });
});

describe("canonicalSignString", () => {
  it("is deterministic and order-fixed", () => {
    const p = base();
    expect(canonicalSignString(p)).toBe("pyro-reactor-01|carbonization_temp_c|550|°C|2026-07-13T00:00:00.000Z|1");
  });
});
