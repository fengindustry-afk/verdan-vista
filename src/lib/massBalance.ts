/**
 * Mass balance over work-process entries: for each batch, how much biochar was
 * produced versus how much was later drawn down (applied or sent to a carbon
 * sink). An auditor's first check — a batch that ships more than it made is
 * either double-counted or mis-keyed, and either way cannot back a credit.
 *
 * Everything is keyed on `batch_id`, the only link between stages today.
 */

import type { WorkProcessEntry } from "./workProcess";

/** Stage → the field holding kg of biochar produced. */
const PRODUCED_FIELD: Record<string, string> = {
  production_05: "final_biochar_amount",
  production_10: "final_biochar_amount",
};

/** Stage → the field holding kg of biochar drawn down. */
const CONSUMED_FIELD: Record<string, string> = {
  application: "quantity_applied",
  carbon_sink: "quantity",
};

export type BalanceStatus = "ok" | "over" | "unsourced";

export interface BatchBalance {
  BatchId: string;
  /** kg produced across every production entry for this batch. */
  Produced: number;
  /** kg drawn down across application + carbon sink entries. */
  Consumed: number;
  /** Produced - Consumed. Negative means more shipped than made. */
  Remaining: number;
  Status: BalanceStatus;
  /** Stage keys that contributed, for drilling back into the entries. */
  Stages: string[];
}

/** Parse a numeric field value; blank, "-" and junk all read as 0. */
function num(v: string | undefined): number {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * One balance row per batch that produced or consumed biochar. Batches with no
 * biochar movement at all (receiving, drying, sampling only) are skipped —
 * there is nothing to balance yet.
 */
export function massBalance(entries: WorkProcessEntry[]): BatchBalance[] {
  const byBatch = new Map<string, BatchBalance>();

  for (const e of entries) {
    const producedKey = PRODUCED_FIELD[e.StageKey];
    const consumedKey = CONSUMED_FIELD[e.StageKey];
    if (!producedKey && !consumedKey) continue;

    // Draw-down is charged to the batch it consumed. `source_batch_id` says so
    // explicitly; without it we fall back to the entry's own batch_id, which
    // only balances when the operator reused the upstream ID verbatim.
    const own = (e.Values?.batch_id ?? "").trim();
    const batchId = (consumedKey && e.Values?.source_batch_id?.trim()) || own;
    if (!batchId || batchId === "-") continue; // unlabelled rows can't be traced

    let row = byBatch.get(batchId);
    if (!row) {
      row = { BatchId: batchId, Produced: 0, Consumed: 0, Remaining: 0, Status: "ok", Stages: [] };
      byBatch.set(batchId, row);
    }
    if (producedKey) row.Produced += num(e.Values[producedKey]);
    if (consumedKey) row.Consumed += num(e.Values[consumedKey]);
    if (!row.Stages.includes(e.StageKey)) row.Stages.push(e.StageKey);
  }

  const rows = [...byBatch.values()];
  for (const r of rows) {
    r.Remaining = r.Produced - r.Consumed;
    // ponytail: exact kg comparison, no tolerance. Add an epsilon if scale
    // rounding starts producing false positives on otherwise-clean batches.
    r.Status = r.Produced === 0 && r.Consumed > 0 ? "unsourced"
      : r.Remaining < 0 ? "over"
      : "ok";
  }
  // Problems first, then largest movement.
  const rank: Record<BalanceStatus, number> = { over: 0, unsourced: 1, ok: 2 };
  return rows.sort((a, b) =>
    rank[a.Status] - rank[b.Status] || (b.Produced + b.Consumed) - (a.Produced + a.Consumed));
}

export interface BalanceSummary {
  Produced: number;
  Consumed: number;
  /** Batches shipping more than they made, or shipping with no production record. */
  Problems: number;
}

export function balanceSummary(rows: BatchBalance[]): BalanceSummary {
  return {
    Produced: rows.reduce((s, r) => s + r.Produced, 0),
    Consumed: rows.reduce((s, r) => s + r.Consumed, 0),
    Problems: rows.filter((r) => r.Status !== "ok").length,
  };
}
