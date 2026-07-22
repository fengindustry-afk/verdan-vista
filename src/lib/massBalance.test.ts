import { describe, it, expect } from "vitest";
import { massBalance, balanceSummary } from "./massBalance";
import type { WorkProcessEntry } from "./workProcess";

function entry(StageKey: string, Values: Record<string, string>): WorkProcessEntry {
  return { id: `e${Math.random()}`, StageKey, StageTitle: StageKey, Values, CapturedBy: "test", Timestamp: "2026-01-01T00:00:00Z" };
}

describe("massBalance", () => {
  it("nets production against application and sink draw-down", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "B1", final_biochar_amount: "1000" }),
      entry("application", { batch_id: "B1", quantity_applied: "400" }),
      entry("carbon_sink", { batch_id: "B1", quantity: "250" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Produced: 1000, Consumed: 650, Remaining: 350, Status: "ok" });
    expect(rows[0].Stages).toEqual(["production_05", "application", "carbon_sink"]);
  });

  it("flags a batch that ships more than it made", () => {
    const rows = massBalance([
      entry("production_10", { batch_id: "B2", final_biochar_amount: "500" }),
      entry("carbon_sink", { batch_id: "B2", quantity: "300" }),
      entry("carbon_sink", { batch_id: "B2", quantity: "400" }), // double-counted
    ]);
    expect(rows[0]).toMatchObject({ Produced: 500, Consumed: 700, Remaining: -200, Status: "over" });
  });

  it("flags draw-down with no production record as unsourced", () => {
    const rows = massBalance([entry("carbon_sink", { batch_id: "TIGGT-BT-2505-0001", quantity: "800" })]);
    expect(rows[0]).toMatchObject({ Produced: 0, Consumed: 800, Status: "unsourced" });
  });

  it("charges draw-down to source_batch_id when the sink uses its own ID scheme", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "ZA-01-11-24", final_biochar_amount: "1000" }),
      entry("carbon_sink", { batch_id: "TIGGT-BT-2505-0001", source_batch_id: "ZA-01-11-24", quantity: "600" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ BatchId: "ZA-01-11-24", Produced: 1000, Consumed: 600, Status: "ok" });
  });

  it("skips stages and batch ids that carry no biochar movement", () => {
    const rows = massBalance([
      entry("receiving", { batch_id: "B3", weight: "5000" }),
      entry("drying", { batch_id: "B3", output_quantity: "4000" }),
      entry("production_05", { batch_id: "-", final_biochar_amount: "900" }),
      entry("production_05", { batch_id: "", final_biochar_amount: "900" }),
    ]);
    expect(rows).toEqual([]);
  });

  it("sorts problems first and tolerates blank or junk numbers", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "OK", final_biochar_amount: "9000" }),
      entry("carbon_sink", { batch_id: "OK", quantity: "" }),
      entry("carbon_sink", { batch_id: "BAD", quantity: "1,200" }),
    ]);
    expect(rows.map((r) => r.BatchId)).toEqual(["BAD", "OK"]);
    expect(rows[0].Consumed).toBe(1200); // thousands separator parsed
    expect(rows[1].Consumed).toBe(0);
    expect(balanceSummary(rows)).toEqual({ Produced: 9000, Consumed: 1200, Problems: 1 });
  });
});
