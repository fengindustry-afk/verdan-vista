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
 * Draw-downs are keyed on the batch they came from, resolved by
 * `resolveSourceBatch`: an explicit `source_batch_id`, else the delivery
 * document shared with the Warehouse line that loaded the lorry, else the
 * entry's own id.
 */

import { allocateDrawdown, dispatchIndex, type WorkProcessEntry } from "./workProcess";

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

/**
 * Biochar bought in rather than made here (workbook: "External biochar" sheet,
 * imported as warehouse entries with this product). It is real supply — it can
 * be drawn down, so the physical balance must count it — but it is NOT own
 * production: the party that produced it holds the carbon claim. Tracked in its
 * own `ExternalSupply` field so the two can never be conflated for CORC.
 */
const EXTERNAL_PRODUCT = "External Biochar";

/** kg of externally purchased biochar this entry brought in, or null. */
function externalSupplyField(e: WorkProcessEntry): string | undefined {
  return e.StageKey === "warehouse" && e.Values?.product === EXTERNAL_PRODUCT
    ? "quantity"
    : undefined;
}

/**
 * Slack on the over-shipment test, in kg. A pro-rata split divides a shipment
 * into fractional shares, so a batch reconciling exactly can land a hair below
 * zero in floating point. A microgram is far below any scale on site, so this
 * cannot mask a real over-shipment.
 */
const KG_EPSILON = 1e-6;

/** Bucket for movement entries that carry no batch id to trace them by. */
export const NO_BATCH = "(no batch id)";

/**
 * Bucket for draw-downs that name a batch we have no production record for. They
 * aren't charged to a phantom per-batch row (that read as "shipped with no
 * production" for every unlinked sink); instead they draw from the shared
 * production pool, checked as a date-ordered running balance. Only shipments
 * that outrun cumulative production *at their point in time* are a real error.
 */
export const POOL = "(unlinked shipments)";

/**
 * Bucket for movement entries with a weight but no date. The pool running
 * balance orders by date, so an undated entry lands at its capture timestamp —
 * which can wrongly read as shipped-before-produced (or hide a real one). Flag
 * them so the date gets filled before trusting the timeline.
 */
export const UNDATED = "(undated movement)";

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

export type BalanceStatus = "ok" | "over" | "premature" | "unsourced" | "incomplete";

export interface BatchBalance {
  BatchId: string;
  /** kg produced across every production entry for this batch. */
  Produced: number;
  /**
   * kg of externally purchased biochar received under this batch id. Supply for
   * mass-balance purposes, but never own production — kept separate so CORC
   * math cannot claim carbon a third party produced.
   */
  ExternalSupply: number;
  /** kg drawn down across application + carbon sink entries. */
  Consumed: number;
  /** (Produced + ExternalSupply) - Consumed. Negative means more shipped than supplied. */
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
  /** Draw-downs naming a batch with no production record (only on the POOL row). */
  UnlinkedCount: number;
  /** Movement entries with a weight but no date (only on the UNDATED row). */
  UndatedCount: number;
  /** The offending entries, so the UI can link straight to each one. */
  Entries: { id: string; label: string }[];
  /** Stage keys that contributed, for drilling back into the entries. */
  Stages: string[];
}

/**
 * The date a movement happened, for ordering the pool running balance. Prefers
 * the stage's own `*_date` field over the capture timestamp, so a sink logged
 * today about a shipment last year still lands in the right spot.
 */
function movementDate(e: WorkProcessEntry): string {
  return ownDate(e) ?? e.Timestamp ?? "";
}

/**
 * The stage's own recorded date, or null when it carries none. Most stages name
 * the field for the event ("production_date", "usage_date"), but Warehouse's is
 * just "Date" → `date`, so match that exactly too — otherwise a dated warehouse
 * receipt is wrongly reported as undated.
 */
export function ownDate(e: WorkProcessEntry): string | null {
  // Earliest of the stage's dates, not the first key encountered. Carbon Sink
  // carries two ("Procurement / Delivery Date" and "Usage Date") and Postgres
  // reorders jsonb keys, so first-match picked a different date in production
  // than in dev — same record, different verdict. Earliest is both deterministic
  // and the right one: the biochar left stock when it was delivered.
  let best: string | null = null;
  for (const [k, v] of Object.entries(e.Values ?? {}))
    if ((k === "date" || k.endsWith("_date")) && /^\d{4}-\d{2}/.test(String(v ?? "")))
      if (best === null || (v as string) < best) best = v as string;
  return best;
}

/**
 * Why an entry has no usable date, for whoever has to go fix it. A date field
 * holding something we can't read ("15/05/2025", "May 2025") is a different
 * repair from one that was never filled in, and the two are indistinguishable
 * from a count alone.
 */
export function undatedReason(e: WorkProcessEntry): string {
  for (const [k, v] of Object.entries(e.Values ?? {})) {
    const s = String(v ?? "").trim();
    if ((k === "date" || k.endsWith("_date")) && s && s !== "-") return s;
  }
  return "no date";
}

/**
 * Parse a numeric field value. Returns null for a blank, "-", or junk value —
 * the caller treats null as "not recorded" (a gap), which is different from a
 * recorded zero.
 */
function parseAmount(v: string | undefined): number | null {
  // Pull the leading numeric magnitude, tolerating a unit suffix the operator
  // typed into a kg field ("15KG", "1,200 kg"). We keep the number, not the
  // unit — the field is already denominated in kg, so no conversion.
  const s = String(v ?? "").replace(/,/g, "");
  const m = s.match(/-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
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
  // Every physical movement (+ produced, − consumed) with a date, for the pool
  // running balance. A dip below zero means biochar left before it was made.
  const timeline: { date: string; delta: number }[] = [];
  // Draw-downs that name a batch we never produced — collected, not charged to
  // a phantom per-batch row.
  const pool = { count: 0, kg: 0 };
  // Movements with a weight but no date, which the timeline can't place reliably.
  const undated: { id: string; label: string }[] = [];
  // DO → batch, so a draw-down that only knows its delivery document still
  // reconciles against the batch the warehouse loaded it from.
  const dispatch = dispatchIndex(entries);

  // Pass 1: which batch ids can a draw-down legitimately be charged against?
  // Own production *and* external purchases — both are real stock on hand. The
  // distinction between them is preserved per row, not by excluding one here.
  const supplyBatches = new Set<string>();
  for (const e of entries) {
    if (PRODUCED_FIELD[e.StageKey] || externalSupplyField(e)) {
      const b = (e.Values?.batch_id ?? "").trim();
      if (b && b !== "-") supplyBatches.add(b);
    }
  }

  const ensure = (batchId: string): BatchBalance => {
    let row = byBatch.get(batchId);
    if (!row) {
      row = {
        BatchId: batchId, Produced: 0, ExternalSupply: 0, Consumed: 0, Remaining: 0,
        Status: "ok", MissingAmount: 0, ZeroUnverified: 0, MissingBatchId: 0,
        HasProduction: false, UnlinkedCount: 0, UndatedCount: 0, Entries: [], Stages: [],
      };
      byBatch.set(batchId, row);
    }
    return row;
  };

  for (const e of entries) {
    const producedKey = PRODUCED_FIELD[e.StageKey];
    const consumedKey = CONSUMED_FIELD[e.StageKey];
    const externalKey = externalSupplyField(e);
    if (!producedKey && !consumedKey && !externalKey) continue;

    const amountKey = producedKey || consumedKey || externalKey!;
    const amt = parseAmount(e.Values[amountKey]);
    const zeroUnverified = amt === 0 && e.Values[amountKey + ZERO_OK_SUFFIX] !== "true";
    // Physical inventory moves whether or not the entry is traceable.
    if (amt !== null) {
      const incoming = Boolean(producedKey || externalKey);
      timeline.push({ date: movementDate(e), delta: incoming ? amt : -amt });
      if (ownDate(e) === null) undated.push({ id: e.id, label: undatedReason(e) }); // can't place it on the timeline
    }

    // Purchased stock. Counted as supply, but never as own production —
    // HasProduction stays false so nothing can claim its carbon.
    if (externalKey) {
      const own = (e.Values?.batch_id ?? "").trim();
      const untraced = !own || own === "-";
      const row = ensure(untraced ? NO_BATCH : own);
      if (untraced) row.MissingBatchId += 1;
      if (amt === null) row.MissingAmount += 1;
      else { if (zeroUnverified) row.ZeroUnverified += 1; row.ExternalSupply += amt; }
      if (!row.Stages.includes(e.StageKey)) row.Stages.push(e.StageKey);
      continue;
    }

    if (producedKey) {
      const own = (e.Values?.batch_id ?? "").trim();
      const untraced = !own || own === "-";
      const row = ensure(untraced ? NO_BATCH : own);
      row.HasProduction = true;
      if (untraced) row.MissingBatchId += 1;
      if (amt === null) row.MissingAmount += 1;
      else { if (zeroUnverified) row.ZeroUnverified += 1; row.Produced += amt; }
      if (!row.Stages.includes(e.StageKey)) row.Stages.push(e.StageKey);
      continue;
    }

    // Consumption. Explicit source link, else the DO dispatch hop (pro-rata
    // across a mixed load), else own id. A load split over several batches
    // charges each its own share, so one shipment can be part reconciled and
    // part pooled — that is the honest reading, not a rounding convenience.
    const allocs = allocateDrawdown(e.Values, dispatch, amt ?? 0);
    if (allocs.length === 0) {
      // No batch id at all — a data gap, surfaced under NO_BATCH.
      const row = ensure(NO_BATCH);
      row.MissingBatchId += 1;
      if (amt === null) row.MissingAmount += 1;
      else if (zeroUnverified) row.ZeroUnverified += 1;
      if (!row.Stages.includes(e.StageKey)) row.Stages.push(e.StageKey);
    } else {
      // A blank/unconfirmed-zero amount is one flaw in one entry, so it is
      // recorded once (against the largest share) rather than per slice.
      const flagged = allocs.reduce((a, b) => (b.kg > a.kg ? b : a));
      // Likewise the pool counts unlinked *shipments*, not unlinked shares: a
      // load split over two unknown batches is still one untraceable movement.
      let pooled = false;
      for (const a of allocs) {
        if (supplyBatches.has(a.batch)) {
          const row = ensure(a.batch);
          if (amt === null) { if (a === flagged) row.MissingAmount += 1; }
          else { if (zeroUnverified && a === flagged) row.ZeroUnverified += 1; row.Consumed += a.kg; }
          if (!row.Stages.includes(e.StageKey)) row.Stages.push(e.StageKey);
        } else {
          // Names a batch we never produced — draw from the shared pool instead.
          pooled = true;
          if (amt !== null) pool.kg += a.kg;
        }
      }
      if (pooled) pool.count += 1;
    }
  }

  const rows = [...byBatch.values()];
  for (const r of rows) {
    r.Remaining = r.Produced + r.ExternalSupply - r.Consumed;
    r.Status =
      // Untraceable entries: nothing to reconcile, just flag the missing id.
      r.BatchId === NO_BATCH ? "incomplete"
      // Only trust a negative balance when every amount was actually recorded
      // and confirmed; a blank or unconfirmed-0 weight would otherwise
      // masquerade as over-shipment.
      : r.MissingAmount === 0 && r.ZeroUnverified === 0 && r.Remaining < -KG_EPSILON ? "over"
      // Quantities reconciled, but some amount is unrecorded or an unconfirmed 0.
      : r.MissingAmount > 0 || r.ZeroUnverified > 0 ? "incomplete"
      : "ok";
  }

  // The pool: run the physical inventory forward by date. The deepest it goes
  // negative is biochar that shipped before any production could cover it.
  if (pool.count > 0) {
    // Net each day before scanning. Dates are day-granular, so entries sharing a
    // date carry no order between them — reading them in array order would call
    // a same-day "made 1t, shipped 1t" a shipment before production. Only a
    // deficit that survives to the end of a day is evidence of anything.
    const byDay = new Map<string, number>();
    for (const t of timeline) byDay.set(t.date.slice(0, 10), (byDay.get(t.date.slice(0, 10)) ?? 0) + t.delta);
    let bal = 0, min = 0;
    for (const d of [...byDay.keys()].sort()) { bal += byDay.get(d)!; if (bal < min) min = bal; }
    const deficit = min < -KG_EPSILON ? -min : 0;
    rows.push({
      BatchId: POOL, Produced: 0, ExternalSupply: 0, Consumed: pool.kg, Remaining: deficit ? -deficit : 0,
      Status: deficit > 0 ? "premature" : "incomplete",
      MissingAmount: 0, ZeroUnverified: 0, MissingBatchId: 0, HasProduction: false,
      UnlinkedCount: pool.count, UndatedCount: 0, Entries: [], Stages: [],
    });
  }

  // Undated movements make the timeline (and any premature verdict) unreliable.
  if (undated.length > 0) {
    rows.push({
      BatchId: UNDATED, Produced: 0, ExternalSupply: 0, Consumed: 0, Remaining: 0, Status: "incomplete",
      MissingAmount: 0, ZeroUnverified: 0, MissingBatchId: 0, HasProduction: false,
      UnlinkedCount: 0, UndatedCount: undated.length, Entries: undated, Stages: [],
    });
  }

  // Errors first, then warnings, then largest movement.
  const rank: Record<BalanceStatus, number> = { over: 0, premature: 0, unsourced: 1, incomplete: 2, ok: 3 };
  return rows.sort((a, b) =>
    rank[a.Status] - rank[b.Status] || (b.Produced + b.Consumed) - (a.Produced + a.Consumed));
}

/** Over-shipment, shipped-before-produced, or shipped-with-no-production. Disqualifying. */
export function isError(s: BalanceStatus): boolean {
  return s === "over" || s === "premature" || s === "unsourced";
}

export interface BalanceSummary {
  /** kg made on site. This is the only figure a CORC claim may be based on. */
  Produced: number;
  /** kg bought in from a third party. Real supply, but not our carbon to claim. */
  ExternalSupply: number;
  Consumed: number;
  /** Batches shipping more than they made, or shipping with no production record. */
  Errors: number;
  /** Batches with a blank amount or an untraceable movement entry. */
  Warnings: number;
}

export function balanceSummary(rows: BatchBalance[]): BalanceSummary {
  return {
    Produced: rows.reduce((s, r) => s + r.Produced, 0),
    ExternalSupply: rows.reduce((s, r) => s + r.ExternalSupply, 0),
    Consumed: rows.reduce((s, r) => s + r.Consumed, 0),
    Errors: rows.filter((r) => isError(r.Status)).length,
    Warnings: rows.filter((r) => r.Status === "incomplete").length,
  };
}
