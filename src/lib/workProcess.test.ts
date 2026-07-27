import { describe, it, expect } from "vitest";
import { TRAIL, trailStraightLineKm, COORDS_SUFFIX, WORKFLOW_CATALOG, dispatchIndex, allocateDrawdown, drawdownBatches, doNumber, type WorkProcessEntry } from "./workProcess";

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

describe("dispatch hop", () => {
  const wp = (StageKey: string, Values: Record<string, string>) =>
    ({ id: StageKey + Math.random(), StageKey, StageTitle: StageKey, Values, CapturedBy: "t", Timestamp: "" }) as WorkProcessEntry;

  // The workbook's real break: Carbon Sink keys rows TIGGT-BT-…, knows only the
  // DO, and never sees the ZA production code.
  const warehouse = wp("warehouse", { source_batch_id: "ZA-01-11-24", do_number: "2020808/001", quantity: "600" });

  it("resolves a sink that only knows its delivery document", () => {
    const d = dispatchIndex([warehouse]);
    expect(allocateDrawdown({ batch_id: "TIGGT-BT-2505-0001", do_number: "2020808/001" }, d, 600))
      .toEqual([{ batch: "ZA-01-11-24", kg: 600 }]);
  });

  it("reads the DO case-insensitively and via the legacy Application field", () => {
    const d = dispatchIndex([warehouse]);
    expect(drawdownBatches({ biochar_do: "2020808/001" }, d)).toEqual(["ZA-01-11-24"]);
    expect(doNumber({ do_number: " inv-3 " })).toBe("INV-3");
    expect(doNumber({ do_number: "-" })).toBe("");
  });

  it("prefers an explicit source link over the hop", () => {
    const d = dispatchIndex([warehouse]);
    expect(allocateDrawdown({ source_batch_id: "ZB-09", do_number: "2020808/001" }, d, 50))
      .toEqual([{ batch: "ZB-09", kg: 50 }]);
  });

  it("only indexes warehouse lines carrying both a DO and a batch", () => {
    expect(dispatchIndex([wp("carbon_sink", { source_batch_id: "ZA-01", do_number: "D1" })]).size).toBe(0);
    expect(dispatchIndex([wp("warehouse", { source_batch_id: "ZA-01" })]).size).toBe(0);
    expect(dispatchIndex([wp("warehouse", { do_number: "D1" })]).size).toBe(0);
  });

  it("sums repeated lines for the same batch under one DO", () => {
    const d = dispatchIndex([
      wp("warehouse", { source_batch_id: "ZA-01", do_number: "D1", quantity: "100" }),
      wp("warehouse", { source_batch_id: "ZA-01", do_number: "D1", quantity: "50" }),
    ]);
    expect(d.get("D1")).toEqual([{ batch: "ZA-01", kg: 150 }]);
  });
});

describe("pro-rata split", () => {
  const wh = (batch: string, doNo: string, quantity: string) =>
    ({ id: batch + doNo, StageKey: "warehouse", StageTitle: "Warehouse", CapturedBy: "t", Timestamp: "",
       Values: { source_batch_id: batch, do_number: doNo, quantity } }) as WorkProcessEntry;

  it("splits a mixed load by the kg each batch contributed", () => {
    const d = dispatchIndex([wh("ZA-01", "D9", "300"), wh("ZA-02", "D9", "100")]);
    // 400 kg dispatched 3:1, so a 200 kg draw-down splits 150/50.
    expect(allocateDrawdown({ batch_id: "SINK-1", do_number: "D9" }, d, 200))
      .toEqual([{ batch: "ZA-01", kg: 150 }, { batch: "ZA-02", kg: 50 }]);
  });

  it("conserves mass exactly when the shares do not divide evenly", () => {
    const d = dispatchIndex([wh("A", "D1", "1"), wh("B", "D1", "1"), wh("C", "D1", "1")]);
    const out = allocateDrawdown({ batch_id: "S", do_number: "D1" }, d, 100);
    // Thirds are not representable in binary floating point; the split must
    // still re-sum to exactly the shipped weight, or the balance leaks kg.
    expect(out.reduce((s, a) => s + a.kg, 0)).toBe(100);
    expect(out).toHaveLength(3);
    for (const a of out) expect(a.kg).toBeCloseTo(33.333, 3);
  });

  it("refuses to split a mixed load whose lines carry no weights", () => {
    const d = dispatchIndex([wh("ZA-01", "D2", ""), wh("ZA-02", "D2", "")]);
    // An even split would be a guess dressed up as arithmetic, so it falls back
    // to the entry's own id and stays visibly unlinked.
    expect(allocateDrawdown({ batch_id: "SINK-9", do_number: "D2" }, d, 90))
      .toEqual([{ batch: "SINK-9", kg: 90 }]);
  });

  it("returns nothing when no route yields a batch", () => {
    expect(allocateDrawdown({ quantity: "10" }, new Map(), 10)).toEqual([]);
    expect(allocateDrawdown({ batch_id: "-" }, new Map(), 10)).toEqual([]);
    expect(allocateDrawdown(undefined, new Map(), 10)).toEqual([]);
  });
});
