import type { Receipt } from "./types";

/**
 * Heuristic parser that turns raw OCR text from a (typically Malaysian) receipt
 * into structured fields. Deliberately conservative: it only fills a field when
 * reasonably confident, leaving the rest for the human to confirm in the review
 * form. Everything here is best-effort — the retained image is the source of
 * truth for an audit.
 */

const MONEY = /(?:rm|myr)?\s*(\d[\d,]*\.\d{2})\b/i;

function money(line: string): number | null {
  const m = line.match(MONEY);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Last money value anywhere on a line (totals are usually right-aligned/last). */
function lastMoney(line: string): number | null {
  const all = [...line.matchAll(/(\d[\d,]*\.\d{2})/g)];
  if (all.length === 0) return null;
  const n = Number(all[all.length - 1][1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse a date in common MY formats to ISO `YYYY-MM-DD`, or null. */
function parseDate(text: string): string | null {
  // dd/mm/yyyy | dd-mm-yyyy | dd.mm.yyyy (Malaysian day-first order).
  const dmy = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
  if (dmy) {
    let [, d, m, y] = dmy;
    let yr = Number(y);
    if (yr < 100) yr += 2000;
    const dd = Number(d), mm = Number(m);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yr}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  // yyyy-mm-dd
  const ymd = text.match(/\b(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
  }
  // dd Mon yyyy | dd Month yyyy
  const named = text.match(/\b(\d{1,2})\s*([A-Za-z]{3,})\s*(20\d{2})\b/);
  if (named) {
    const mm = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (mm) return `${named[3]}-${String(mm).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }
  return null;
}

function looksLikeMerchant(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return false;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  // Mostly letters, not a money/date/label line.
  if (letters < t.length * 0.4) return false;
  if (/receipt|invoice|tax|bill|table|cashier|date|time|tel|www|http/i.test(t)) return false;
  if (MONEY.test(t)) return false;
  return true;
}

export function parseReceipt(text: string): Partial<Receipt> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Partial<Receipt> = {};

  // Merchant: first plausible line near the top.
  for (const l of lines.slice(0, 6)) {
    if (looksLikeMerchant(l)) { out.Merchant = l.replace(/\s{2,}/g, " ").slice(0, 80); break; }
  }

  // Date: first parseable date, preferring lines mentioning "date".
  const dateLine = lines.find((l) => /date|tarikh/i.test(l) && parseDate(l)) ?? lines.find((l) => parseDate(l));
  if (dateLine) out.Date = parseDate(dateLine) ?? undefined;

  // Receipt / invoice number.
  const noLine = lines.find((l) => /(receipt|invoice|bill|ref|resit)\s*(no|#|number|:)/i.test(l));
  if (noLine) {
    const m = noLine.match(/[:#]\s*([A-Za-z0-9/\-]+)/) ?? noLine.match(/([A-Za-z0-9]{4,})\s*$/);
    if (m) out.ReceiptNo = m[1];
  }

  // SST/GST registration number.
  const tinLine = lines.find((l) => /(sst|gst)\s*(reg|no|id|:|#)/i.test(l));
  if (tinLine) {
    const m = tinLine.match(/([A-Z0-9]{6,}-?\d*)\s*$/i);
    if (m) out.MerchantTin = m[1];
  }

  // Tax: detect regime + amount. Prefer a line carrying a rate/amount (e.g.
  // "SST 6%  0.70") over a registration-number line (e.g. "SST No: W10-...").
  const taxLines = lines.filter((l) => /\b(sst|gst|service tax|sales tax|cukai)\b/i.test(l));
  const taxLine =
    taxLines.find((l) => /\d\s*%/.test(l) || MONEY.test(l)) ?? taxLines[0];
  if (taxLine) {
    out.TaxType = /gst/i.test(taxLine) ? "GST" : "SST";
    const rate = taxLine.match(/(\d{1,2})\s*%/);
    if (rate) out.TaxRate = Number(rate[1]);
    const amt = money(taxLine);
    if (amt != null) out.TaxAmount = amt;
  }

  // Subtotal.
  const subLine = lines.find((l) => /\bsub[\s-]?total\b/i.test(l));
  if (subLine) { const n = lastMoney(subLine); if (n != null) out.Subtotal = n; }

  // Total: prefer explicit total lines (excluding subtotal); else the largest money value.
  const totalLine = lines.find((l) => /\b(grand\s*total|total|amount\s*due|jumlah)\b/i.test(l) && !/sub[\s-]?total/i.test(l));
  if (totalLine) {
    const n = lastMoney(totalLine);
    if (n != null) out.Total = n;
  }
  if (out.Total == null) {
    const amounts = lines.map(lastMoney).filter((n): n is number => n != null);
    if (amounts.length) out.Total = Math.max(...amounts);
  }

  if (/\b(rm|myr)\b/i.test(text)) out.Currency = "MYR";

  return out;
}

const RETENTION_YEARS = 7;

/**
 * ISO date until which a receipt must be retained. Malaysian records must be
 * kept 7 years from the end of the year of assessment, so we retain until
 * 31 Dec of (transaction year + 7); falls back to the capture date.
 */
export function computeRetentionUntil(transactionDate: string | undefined, capturedAt: string): string {
  const base = transactionDate && /^\d{4}-/.test(transactionDate) ? transactionDate : capturedAt;
  const year = new Date(base).getFullYear();
  const y = Number.isFinite(year) ? year : new Date().getFullYear();
  return `${y + RETENTION_YEARS}-12-31`;
}

export function retentionYearsLeft(retentionUntil: string | undefined): number {
  if (!retentionUntil) return 0;
  const ms = new Date(retentionUntil).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (365.25 * 24 * 3600 * 1000)));
}

export function isRetentionExpired(retentionUntil: string | undefined): boolean {
  if (!retentionUntil) return false;
  return new Date(retentionUntil).getTime() < Date.now();
}
