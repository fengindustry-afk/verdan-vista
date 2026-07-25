/**
 * Mass balance over work-process entries: for each batch, how much biochar was
 * produced versus how much was later drawn down (applied or sent to a carbon
 * sink). An auditor's first check — a batch that ships more than it made is
 * either double-counted or mis-keyed, and either way cannot back a credit.
 *
 * Two tiers of finding:
 *   • errors   — contradictions the numbers can't explain (over-shipment, or a
 *                draw-down with no production record). Disqualifying.
 *   • warnings — gaps that make a batch unverifiable rather than wrong: a
 *                production/application/sink entry with a blank amount, or a
 *                movement entry with no batch id to trace it by. An auditor
 *                holds these until the record is completed.
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

/** Bucket for movement entries that carry no batch id to trace them by. */
export const NO_BATCH = "(no batch id)";

/**
 * Companion field written next to an amount field to confirm a literal 0 is
 * real ("we genuinely produced/shipped 0 kg"), not a forgotten entry. Value
 * "true" clears the zero from the incomplete warning.
 */
export const ZERO_OK_SUFFIX = "_zero_ok";

/** The amount field for a movement stage, or undefined for a non-movement stage. */
export function amountFieldForStage(stageKey: string): string | undefined {
  return PRODUCED_FIELD[stageKey] ?? CONSUMED_FIELD[stageKey];
}

export type BalanceStatus = "ok" | "over" | "unsourced" | "incomplete";

export interface BatchBalance {
  BatchId: string;
  /** kg produced across every production entry for this batch. */
  Produced: number;
  /** kg drawn down across application + carbon sink entries. */
  Consumed: number;
  /** Produced - Consumed. Negative means more shipped than made. */
  Remaining: number;
  Status: BalanceStatus;
  /** Movement entries whose amount field was blank/non-numeric. */
  MissingAmount: number;
  /** Movement entries recorded as a literal 0 kg without a verified flag. */
  ZeroUnverified: number;
  /** Movement entries with no batch id (only accrues in the NO_BATCH bucket). */
  MissingBatchId: number;
  /** A production entry exists for this batch, whatever its recorded weight. */
  HasProduction: boolean;
  /** Stage keys that contributed, for drilling back into the entries. */
  Stages: string[];
}

/**
 * Parse a numeric field value. Returns null for a blank, "-", or junk value —
 * the caller treats null as "not recorded" (a gap), which is different from a
 * recorded zero.
 */
function parseAmount(v: string | undefined): number | null {
  const s = String(v ?? "").replace(/[, ]/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * One balance row per batch that produced or consumed biochar. Batches with no
 * biochar movement at all (receiving, drying, sampling only) are skipped —
 * there is nothing to balance yet. Movement entries with no batch id are not
 * skipped: they collect under NO_BATCH so the gap is visible.
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
    const traced = (consumedKey && e.Values?.source_batch_id?.trim()) || own;
    const untraced = !traced || traced === "-";
    const batchId = untraced ? NO_BATCH : traced;

    let row = byBatch.get(batchId);
    if (!row) {
      row = {
        BatchId: batchId, Produced: 0, Consumed: 0, Remaining: 0, Status: "ok",
        MissingAmount: 0, ZeroUnverified: 0, MissingBatchId: 0, HasProduction: false, Stages: [],
      };
      byBatch.set(batchId, row);
    }

    if (producedKey) row.HasProduction = true;
    if (untraced) row.MissingBatchId += 1;

    const amountKey = producedKey || consumedKey;
    const amt = parseAmount(e.Values[amountKey]);
    if (amt === null) {
      row.MissingAmount += 1; // recorded a movement but not how much
    } else {
      // A literal 0 is real data only once the operator confirms it; until then
      // it reads the same as a forgotten entry, so hold it as a warning.
      if (amt === 0 && e.Values[amountKey + ZERO_OK_SUFFIX] !== "true") row.ZeroUnverified += 1;
      if (producedKey) row.Produced += amt; else row.Consumed += amt;
    }
    if (!row.Stages.includes(e.StageKey)) row.Stages.push(e.StageKey);
  }

  const rows = [...byBatch.values()];
  for (const r of rows) {
    r.Remaining = r.Produced - r.Consumed;
    // ponytail: exact kg comparison, no tolerance. Add an epsilon if scale
    // rounding starts producing false positives on otherwise-clean batches.
    r.Status =
      // Untraceable entries: nothing can be reconciled, so never call them
      // over/unsourced off unrelated sums — just flag the missing id.
      r.BatchId === NO_BATCH ? "incomplete"
      // Shipped with no production entry at all: an over-crediting risk.
      : r.Consumed > 0 && !r.HasProduction ? "unsourced"
      // Only trust a negative balance when every amount was actually recorded
      // and confirmed; a blank or unconfirmed-0 weight would otherwise
      // masquerade as over-shipment.
      : r.MissingAmount === 0 && r.ZeroUnverified === 0 && r.Remaining < 0 ? "over"
      // Quantities reconciled, but some amount is unrecorded or an unconfirmed 0.
      : r.MissingAmount > 0 || r.ZeroUnverified > 0 ? "incomplete"
      : "ok";
  }
  // Errors first, then warnings, then largest movement.
  const rank: Record<BalanceStatus, number> = { over: 0, unsourced: 1, incomplete: 2, ok: 3 };
  return rows.sort((a, b) =>
    rank[a.Status] - rank[b.Status] || (b.Produced + b.Consumed) - (a.Produced + a.Consumed));
}

/** Over-shipment or shipped-with-no-production. Disqualifying. */
export function isError(s: BalanceStatus): boolean {
  return s === "over" || s === "unsourced";
}

export interface BalanceSummary {
  Produced: number;
  Consumed: number;
  /** Batches shipping more than they made, or shipping with no production record. */
  Errors: number;
  /** Batches with a blank amount or an untraceable movement entry. */
  Warnings: number;
}

export function balanceSummary(rows: BatchBalance[]): BalanceSummary {
  return {
    Produced: rows.reduce((s, r) => s + r.Produced, 0),
    Consumed: rows.reduce((s, r) => s + r.Consumed, 0),
    Errors: rows.filter((r) => isError(r.Status)).length,
    Warnings: rows.filter((r) => r.Status === "incomplete").length,
  };
}
