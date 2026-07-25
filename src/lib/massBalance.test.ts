import { describe, it, expect } from "vitest";
import { massBalance, balanceSummary, NO_BATCH } from "./massBalance";
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

  it("skips stages that carry no biochar movement", () => {
    const rows = massBalance([
      entry("receiving", { batch_id: "B3", weight: "5000" }),
      entry("drying", { batch_id: "B3", output_quantity: "4000" }),
    ]);
    expect(rows).toEqual([]);
  });

  it("collects untraceable movement entries under NO_BATCH as incomplete", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "-", final_biochar_amount: "900" }),
      entry("production_05", { batch_id: "", final_biochar_amount: "900" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ BatchId: NO_BATCH, Status: "incomplete", MissingBatchId: 2 });
  });

  it("flags a batch with a recorded movement but a blank weight as incomplete, not over", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "B4", final_biochar_amount: "" }), // weight not recorded
      entry("application", { batch_id: "B4", quantity_applied: "300" }),
    ]);
    // A blank produced weight must not masquerade as over-shipment.
    expect(rows[0]).toMatchObject({ BatchId: "B4", Status: "incomplete", MissingAmount: 1, HasProduction: true });
  });

  it("holds a literal 0 kg as incomplete until it is verified", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "Z1", final_biochar_amount: "0" }),
    ]);
    expect(rows[0]).toMatchObject({ BatchId: "Z1", Status: "incomplete", ZeroUnverified: 1 });
  });

  it("clears the zero warning once the operator confirms it is real", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "Z2", final_biochar_amount: "0", final_biochar_amount_zero_ok: "true" }),
    ]);
    expect(rows[0]).toMatchObject({ BatchId: "Z2", Status: "ok", ZeroUnverified: 0 });
  });

  it("does not call an unconfirmed-0 production over-shipment", () => {
    const rows = massBalance([
      entry("production_10", { batch_id: "Z3", final_biochar_amount: "0" }),
      entry("carbon_sink", { batch_id: "Z3", quantity: "500" }),
    ]);
    // 0 produced vs 500 shipped looks like over-shipment, but the 0 is unconfirmed.
    expect(rows[0].Status).toBe("incomplete");
  });

  it("groups errors ahead of warnings and tolerates blank or junk numbers", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "GAP", final_biochar_amount: "9000" }),
      entry("carbon_sink", { batch_id: "GAP", quantity: "" }),            // incomplete: no quantity
      entry("carbon_sink", { batch_id: "BAD", quantity: "1,200" }),       // error: unsourced
    ]);
    expect(rows.map((r) => r.BatchId)).toEqual(["BAD", "GAP"]); // errors sort first
    expect(rows[0]).toMatchObject({ Status: "unsourced", Consumed: 1200 }); // thousands separator parsed
    expect(rows[1]).toMatchObject({ Status: "incomplete", MissingAmount: 1 });
    expect(balanceSummary(rows)).toEqual({ Produced: 9000, Consumed: 1200, Errors: 1, Warnings: 1 });
  });
});
