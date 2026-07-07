import type { Feedstock } from "./types";
import {
  parseAuditLog,
  parseCustodyLog,
  currentStageIndex,
  CUSTODY_STAGES,
  FINAL_STAGE,
  type AuditEntry,
  type CustodyLeg,
} from "./feedstock";

/**
 * Pure state transitions on a feedstock batch, mirroring the .NET
 * `FeedstockItem.AppendAudit` / `SetCustodyEntry` / `OnAdvance`. Each returns a
 * new record with `AuditLog` / `CustodyLog` reserialized so it round-trips
 * through the shared Supabase store exactly like the mobile/desktop app writes.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "dd MMM yyyy" — matches the custody-leg date format. */
export function custodyDate(d = new Date()): string {
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "dd MMM yyyy HH:mm" — matches the audit-entry timestamp format. */
export function auditTimestamp(d = new Date()): string {
  return `${custodyDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function appendAudit(f: Feedstock, action: string, actor: string, role: string): Feedstock {
  const list = parseAuditLog(f);
  const entry: AuditEntry = {
    Action: action,
    Actor: actor?.trim() || "Unknown",
    Role: role,
    Timestamp: auditTimestamp(),
  };
  return { ...f, AuditLog: JSON.stringify([...list, entry]) };
}

export function setCustodyEntry(
  f: Feedstock,
  stage: string,
  location: string,
  date: string,
  coords = ""
): Feedstock {
  const entries = parseCustodyLog(f);
  const leg: CustodyLeg = { Location: location, Date: date, Coords: coords };
  return { ...f, CustodyLog: JSON.stringify({ ...entries, [stage]: leg }) };
}

/** Advance a batch to its next custody stage; records the custody leg + an audit entry. */
export function advanceStage(
  f: Feedstock,
  actor: string,
  role: string,
  location: string,
  coords = ""
): Feedstock | null {
  const idx = currentStageIndex(f);
  if (idx >= CUSTODY_STAGES.length - 1) return null;
  const next = CUSTODY_STAGES[idx + 1];
  const today = custodyDate();

  let updated = setCustodyEntry(f, next, location, today, coords);
  updated = { ...updated, CurrentStage: next };
  const label = coords ? `${location} (${coords})` : location;
  updated = appendAudit(updated, `Advanced to ${next} · ${label}`, actor, role);

  // Final leg credits the batch — keep verification status in sync.
  if (next === FINAL_STAGE && (updated.Status ?? "").toLowerCase() !== "verified") {
    updated = { ...updated, Status: "Verified" };
  }
  return updated;
}

export function verifyBatch(f: Feedstock, actor: string, role: string): Feedstock {
  const updated = { ...f, Status: "Verified", IsPending: false };
  return appendAudit(updated, "Batch verified", actor, role);
}

export interface NewBatchInput {
  title: string;
  type: string;
  supplier: string;
  amount: string;
}

export function createBatch(input: NewBatchInput, actor: string, role: string): Feedstock {
  const id = `FS-${Date.now().toString(36).toUpperCase()}`;
  let f: Feedstock = {
    id,
    Id: id,
    Title: input.title,
    Type: input.type,
    Supplier: input.supplier,
    Amount: input.amount,
    Date: custodyDate(),
    Status: "Pending",
    IsPending: true,
    IsWaste: false,
    CurrentStage: CUSTODY_STAGES[0],
  };
  f = setCustodyEntry(f, CUSTODY_STAGES[0], input.supplier, custodyDate());
  f = appendAudit(f, "Batch created", actor, role);
  return f;
}
