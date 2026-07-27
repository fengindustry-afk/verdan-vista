import { describe, it, expect } from "vitest";
import { massBalance, balanceSummary, undatedReason, NO_BATCH, POOL, UNDATED } from "./massBalance";
import type { WorkProcessEntry } from "./workProcess";

function entry(StageKey: string, Values: Record<string, string>, date = "2025-06-01"): WorkProcessEntry {
  // Give every entry a date unless the test set one or opted out (date=""), so
  // only the undated-specific test trips the "no date" warning.
  const hasDate = Object.keys(Values).some((k) => k.endsWith("_date"));
  const V = !hasDate && date ? { movement_date: date, ...Values } : Values;
  return { id: `e${Math.random()}`, StageKey, StageTitle: StageKey, Values: V, CapturedBy: "test", Timestamp: "2026-01-01T00:00:00Z" };
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

  it("names an unreadable date so it can be told apart from a blank one", () => {
    const bad = entry("carbon_sink", { batch_id: "B1", quantity: "10", usage_date: "15/05/2025" }, "");
    const blank = entry("carbon_sink", { batch_id: "B1", quantity: "10" }, "");
    expect(undatedReason(bad)).toBe("15/05/2025");
    expect(undatedReason(blank)).toBe("no date");
    expect(massBalance([bad, blank]).find((r) => r.BatchId === UNDATED)!.Entries.map((x) => x.label))
      .toEqual(["15/05/2025", "no date"]);
  });

  it("reads the same date whichever order the jsonb keys arrive in", () => {
    // Carbon Sink carries two dates and Postgres reorders jsonb keys, so a
    // first-key-wins read gave one verdict in dev and another in production.
    const build = (sink: Record<string, string>) => massBalance([
      entry("production_05", { batch_id: "B1", final_biochar_amount: "100", production_date: "2025-05-16" }),
      entry("carbon_sink", sink),
    ]);
    const dev = build({ batch_id: "GHOST", procurement_delivery_date: "2025-05-15", usage_date: "2025-05-17", quantity: "100" });
    const jsonb = build({ quantity: "100", batch_id: "GHOST", usage_date: "2025-05-17", procurement_delivery_date: "2025-05-15" });
    expect(dev.find((r) => r.BatchId === POOL)!.Status).toBe(jsonb.find((r) => r.BatchId === POOL)!.Status);
  });

  it("does not call a same-day shipment premature", () => {
    const rows = massBalance([
      // Shipment recorded before the production entry, same day: day-granular
      // dates carry no order, so this must not read as shipped-before-produced.
      entry("carbon_sink", { batch_id: "GHOST", quantity: "1000", carbon_sink_date: "2025-03-04" }),
      entry("production_05", { batch_id: "B1", final_biochar_amount: "1000", production_date: "2025-03-04" }),
    ]);
    expect(rows.find((r) => r.BatchId === POOL)).toMatchObject({ Status: "incomplete", Remaining: 0 });
  });

  it("flags a batch that ships more than it made", () => {
    const rows = massBalance([
      entry("production_10", { batch_id: "B2", final_biochar_amount: "500" }),
      entry("carbon_sink", { batch_id: "B2", quantity: "300" }),
      entry("carbon_sink", { batch_id: "B2", quantity: "400" }), // double-counted
    ]);
    expect(rows[0]).toMatchObject({ Produced: 500, Consumed: 700, Remaining: -200, Status: "over" });
  });

  it("pools an unlinked draw-down and flags it premature when nothing was produced first", () => {
    const rows = massBalance([entry("carbon_sink", { batch_id: "TIGGT-BT-2505-0001", quantity: "800" })]);
    // No phantom per-batch row; it draws from the pool, which is empty here.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ BatchId: POOL, Consumed: 800, Remaining: -800, Status: "premature", UnlinkedCount: 1 });
  });

  it("pools an unlinked draw-down without error when production already covers it", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "ZA-01-11-24", final_biochar_amount: "1000", production_date: "2025-01-01" }),
      entry("carbon_sink", { batch_id: "TIGGT-BT-2505-0001", quantity: "300", usage_date: "2025-02-01" }),
    ]);
    const prod = rows.find((r) => r.BatchId === "ZA-01-11-24");
    const pool = rows.find((r) => r.BatchId === POOL);
    expect(prod).toMatchObject({ Produced: 1000, Status: "ok" });
    // Covered by prior production, so a traceability warning, not an error.
    expect(pool).toMatchObject({ Consumed: 300, Status: "incomplete", UnlinkedCount: 1 });
  });

  it("charges draw-down to source_batch_id when the sink uses its own ID scheme", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "ZA-01-11-24", final_biochar_amount: "1000" }),
      entry("carbon_sink", { batch_id: "TIGGT-BT-2505-0001", source_batch_id: "ZA-01-11-24", quantity: "600" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ BatchId: "ZA-01-11-24", Produced: 1000, Consumed: 600, Status: "ok" });
  });

  it("flags a movement that has a weight but no date", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "B1", final_biochar_amount: "1000" }, ""), // no date
    ]);
    const undated = rows.find((r) => r.BatchId === UNDATED);
    expect(undated).toMatchObject({ Status: "incomplete", UndatedCount: 1 });
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

  it("reads a weight typed with a unit suffix instead of flagging it missing", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "U1", final_biochar_amount: "100 kg" }),
      entry("carbon_sink", { batch_id: "U1", quantity: "15KG" }),
    ]);
    expect(rows[0]).toMatchObject({ BatchId: "U1", Status: "ok", MissingAmount: 0, Produced: 100, Consumed: 15 });
  });

  it("counts purchased biochar as supply without ever calling it production", () => {
    const rows = massBalance([
      entry("warehouse", { batch_id: "EXT-AU-SYNERGY-20240821", product: "External Biochar", quantity: "3000" }, "2024-08-21"),
      entry("carbon_sink", { batch_id: "S1", source_batch_id: "EXT-AU-SYNERGY-20240821", quantity: "500" }, "2024-09-01"),
    ]);
    const ext = rows.find((r) => r.BatchId === "EXT-AU-SYNERGY-20240821")!;
    // Supply reconciles the shipment: 3000 in, 500 out, no error.
    expect(ext).toMatchObject({ ExternalSupply: 3000, Consumed: 500, Remaining: 2500, Status: "ok" });
    // But it is never own production — nothing here may back a CORC claim.
    expect(ext.Produced).toBe(0);
    expect(ext.HasProduction).toBe(false);
    const s = balanceSummary(rows);
    expect(s).toMatchObject({ Produced: 0, ExternalSupply: 3000, Consumed: 500, Errors: 0 });
  });

  it("reads the Warehouse stage's bare `date` field, not just `*_date`", () => {
    const rows = massBalance([
      // Warehouse slugs its date field to `date`; a dated receipt must not be
      // counted as undated, or the pool timeline misplaces it.
      entry("warehouse", { batch_id: "EXT-1", product: "External Biochar", quantity: "3000", date: "2024-08-21" }, ""),
    ]);
    expect(rows.find((r) => r.BatchId === UNDATED)).toBeUndefined();
  });

  it("does not let purchased stock mask a genuinely premature shipment", () => {
    const rows = massBalance([
      // Shipped a year before anything was produced or purchased.
      entry("carbon_sink", { batch_id: "EARLY", quantity: "50" }, "2023-09-17"),
      entry("warehouse", { batch_id: "EXT-1", product: "External Biochar", quantity: "3000" }, "2024-08-21"),
    ]);
    expect(rows.find((r) => r.BatchId === POOL)?.Status).toBe("premature");
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
      entry("carbon_sink", { batch_id: "EARLY", quantity: "1,200", usage_date: "2025-01-01" }), // shipped before any production
      entry("production_05", { batch_id: "GAP", final_biochar_amount: "9000", production_date: "2025-02-01" }),
      entry("carbon_sink", { batch_id: "GAP", quantity: "", usage_date: "2025-02-05" }),         // incomplete: no quantity
    ]);
    expect(rows[0]).toMatchObject({ BatchId: POOL, Status: "premature", Remaining: -1200 }); // errors sort first, thousands separator parsed
    expect(rows[1]).toMatchObject({ BatchId: "GAP", Status: "incomplete", MissingAmount: 1 });
    expect(balanceSummary(rows)).toEqual({ Produced: 9000, ExternalSupply: 0, Consumed: 1200, Errors: 1, Warnings: 1 });
  });
});

describe("dispatch hop", () => {
  it("reconciles a sink that names only its DO, via the warehouse line", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "ZA-01-11-24", final_biochar_amount: "1000" }, "2024-11-04"),
      entry("warehouse", { source_batch_id: "ZA-01-11-24", do_number: "DO-7", quantity: "600" }, "2024-11-10"),
      // No source_batch_id: the sink team only ever had the delivery order.
      entry("carbon_sink", { batch_id: "TIGGT-BT-2505-0001", do_number: "DO-7", quantity: "600" }, "2024-11-12"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ BatchId: "ZA-01-11-24", Produced: 1000, Consumed: 600, Status: "ok" });
    // Nothing stranded in the unlinked pool.
    expect(rows.find((r) => r.BatchId === POOL)).toBeUndefined();
  });

  it("splits a mixed load pro-rata across the batches that filled it", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "ZA-01", final_biochar_amount: "500" }, "2024-11-04"),
      entry("production_05", { batch_id: "ZA-02", final_biochar_amount: "500" }, "2024-11-05"),
      entry("warehouse", { source_batch_id: "ZA-01", do_number: "DO-9", quantity: "300" }, "2024-11-10"),
      entry("warehouse", { source_batch_id: "ZA-02", do_number: "DO-9", quantity: "100" }, "2024-11-10"),
      entry("carbon_sink", { batch_id: "SINK-1", do_number: "DO-9", quantity: "200" }, "2024-11-12"),
    ]);
    // Dispatched 3:1, so the 200 kg shipment lands 150 on ZA-01 and 50 on ZA-02.
    expect(rows.find((r) => r.BatchId === "ZA-01")).toMatchObject({ Consumed: 150, Remaining: 350, Status: "ok" });
    expect(rows.find((r) => r.BatchId === "ZA-02")).toMatchObject({ Consumed: 50, Remaining: 450, Status: "ok" });
    // Fully attributed, so nothing is left stranded in the unlinked pool.
    expect(rows.find((r) => r.BatchId === POOL)).toBeUndefined();
  });

  it("pools only the share drawn from a batch it never produced", () => {
    const rows = massBalance([
      entry("production_05", { batch_id: "ZA-01", final_biochar_amount: "500" }, "2024-11-04"),
      entry("warehouse", { source_batch_id: "ZA-01", do_number: "DO-9", quantity: "300" }, "2024-11-10"),
      entry("warehouse", { source_batch_id: "GHOST", do_number: "DO-9", quantity: "100" }, "2024-11-10"),
      entry("carbon_sink", { batch_id: "SINK-1", do_number: "DO-9", quantity: "200" }, "2024-11-12"),
    ]);
    expect(rows.find((r) => r.BatchId === "ZA-01")).toMatchObject({ Consumed: 150 });
    // Only GHOST's 50 kg share is unattributable, not the whole 200 kg shipment.
    expect(rows.find((r) => r.BatchId === POOL)).toMatchObject({ Consumed: 50, UnlinkedCount: 1 });
  });
});
