import { describe, it, expect } from "vitest";
import { appendAudit, advanceStage, verifyBatch, createBatch } from "./feedstockActions";
import { parseAuditLog, parseCustodyLog, CUSTODY_STAGES, FINAL_STAGE } from "./feedstock";
import type { Feedstock } from "./types";

function batch(overrides: Partial<Feedstock> = {}): Feedstock {
  return {
    id: "FS-TEST",
    Title: "Test Batch",
    Type: "Palm Kernel Shells",
    Date: "01 Jan 2026",
    Amount: "2000 kg",
    Status: "Pending",
    Supplier: "Test Supplier",
    CurrentStage: CUSTODY_STAGES[0],
    ...overrides,
  };
}

describe("appendAudit", () => {
  it("appends an attributed entry without mutating the original", () => {
    const original = batch();
    const updated = appendAudit(original, "Did a thing", "Alex", "Operator");
    expect(parseAuditLog(original)).toHaveLength(0);
    const log = parseAuditLog(updated);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ Action: "Did a thing", Actor: "Alex", Role: "Operator" });
    expect(log[0].Timestamp).toMatch(/\d{2} \w{3} \d{4} \d{2}:\d{2}/);
  });
});

describe("advanceStage", () => {
  it("moves to the next stage, records a custody leg + audit entry", () => {
    const updated = advanceStage(batch(), "Alex", "Operator", "Mill A", "1.0, 2.0")!;
    expect(updated.CurrentStage).toBe(CUSTODY_STAGES[1]);
    const leg = parseCustodyLog(updated)[CUSTODY_STAGES[1]];
    expect(leg).toMatchObject({ Location: "Mill A", Coords: "1.0, 2.0" });
    expect(parseAuditLog(updated).at(-1)?.Action).toContain(`Advanced to ${CUSTODY_STAGES[1]}`);
  });

  it("auto-verifies the batch on reaching the final stage", () => {
    const nearFinal = batch({ CurrentStage: CUSTODY_STAGES[CUSTODY_STAGES.length - 2] });
    const updated = advanceStage(nearFinal, "Nurul", "Manager", "Sink Site")!;
    expect(updated.CurrentStage).toBe(FINAL_STAGE);
    expect(updated.Status).toBe("Verified");
  });

  it("returns null when already at the final stage", () => {
    expect(advanceStage(batch({ CurrentStage: FINAL_STAGE }), "A", "Operator", "X")).toBeNull();
  });
});

describe("verifyBatch", () => {
  it("sets Verified status and logs it", () => {
    const updated = verifyBatch(batch(), "Nurul", "Manager");
    expect(updated.Status).toBe("Verified");
    expect(parseAuditLog(updated).at(-1)?.Action).toBe("Batch verified");
  });
});

describe("createBatch", () => {
  it("creates a pending batch at the first stage with an initial audit entry", () => {
    const f = createBatch({ title: "New", type: "POME", supplier: "Mill X", amount: "500 kg" }, "Alex", "Operator");
    expect(f.Status).toBe("Pending");
    expect(f.CurrentStage).toBe(CUSTODY_STAGES[0]);
    expect(f.id).toMatch(/^FS-/);
    expect(parseAuditLog(f).at(-1)?.Action).toBe("Batch created");
  });
});
