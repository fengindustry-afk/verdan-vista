import type { CostEntry, CostBudget } from "./types";

/** Ledgers from the Esterra Smart Money Tracker: business vs personal money. */
export const LEDGERS = ["Esterra", "Personal"] as const;

/** Transaction types (legacy rows without a Type are treated as "Expense"). */
export const ENTRY_TYPES = ["Expense", "Income", "Savings", "Investment", "Project"] as const;

/** Effective type for an entry — rows created before the ledger concept are expenses. */
export function entryType(e: CostEntry): string {
  return e.Type || "Expense";
}

/** True when the entry counts as spending (used by budgets & spend charts). */
export function isSpend(e: CostEntry): boolean {
  return entryType(e) === "Expense";
}

/** True if the ISO date string falls within the given month (0-indexed) and year. */
function isInMonth(iso: string, month: number, year: number): boolean {
  const d = new Date(iso);
  return d.getMonth() === month && d.getFullYear() === year;
}

export interface CategorySpend {
  category: string;
  spent: number;
  budget: number;
  /** 0-100+, spent as a percentage of budget (0 when budget is unset). */
  pctUsed: number;
  status: "ok" | "warning" | "over";
}

/** Aggregates this month's spend per category against configured budgets. */
export function categorySpendForMonth(
  entries: CostEntry[],
  budgets: CostBudget[],
  categories: string[],
  now: Date = new Date()
): CategorySpend[] {
  const month = now.getMonth();
  const year = now.getFullYear();
  const budgetByCategory = new Map(budgets.map((b) => [b.Category, b.MonthlyLimit]));

  return categories.map((category) => {
    const spent = entries
      .filter((e) => e.Category === category && isInMonth(e.Date, month, year))
      .reduce((sum, e) => sum + (e.Amount || 0), 0);
    const budget = budgetByCategory.get(category) ?? 0;
    const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;
    const status: CategorySpend["status"] =
      budget > 0 && spent >= budget ? "over" : budget > 0 && spent >= budget * 0.9 ? "warning" : "ok";
    return { category, spent, budget, pctUsed, status };
  });
}

export interface MonthSummary {
  totalSpent: number;
  totalBudget: number;
  remaining: number;
  /** Naive linear projection of month-end spend based on days elapsed so far. */
  projectedTotal: number;
  daysElapsed: number;
  daysInMonth: number;
}

/** Smart month-end projection: extrapolates current burn rate across the full month. */
export function projectMonthSummary(
  entries: CostEntry[],
  budgets: CostBudget[],
  now: Date = new Date()
): MonthSummary {
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthEntries = entries.filter((e) => isInMonth(e.Date, month, year));
  const totalSpent = monthEntries.reduce((sum, e) => sum + (e.Amount || 0), 0);
  const totalBudget = budgets.reduce((sum, b) => sum + (b.MonthlyLimit || 0), 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = Math.max(1, now.getDate());
  const projectedTotal = (totalSpent / daysElapsed) * daysInMonth;

  return {
    totalSpent,
    totalBudget,
    remaining: totalBudget - totalSpent,
    projectedTotal,
    daysElapsed,
    daysInMonth,
  };
}

export function createCostEntry(
  input: {
    title: string; category: string; amount: number; date: string; note?: string;
    ledger?: string; type?: string;
  },
  createdBy: string,
  createdByEmail?: string
): CostEntry {
  return {
    id: crypto.randomUUID(),
    Title: input.title,
    Category: input.category,
    Amount: input.amount,
    Date: input.date,
    Note: input.note,
    CreatedBy: createdBy,
    CreatedByEmail: createdByEmail,
    Ledger: input.ledger ?? "Esterra",
    Type: input.type ?? "Expense",
  };
}

/**
 * Smart Money Tracker summary (mirrors the Estera.xlsx dashboard): income
 * (PENDAPATAN), expenses (PERBELANJAAN), balance (BAKI = income − expenses),
 * savings & investment (SIMPANAN & PELABURAN), and balance as % of income —
 * over the entries matching a ledger and/or month ("YYYY-MM") filter.
 */
export interface MoneySummary {
  income: number;
  expenses: number;
  balance: number;
  savingsInvestment: number;
  /** balance / income × 100 (0 when there is no income). */
  pctBalanceOfIncome: number;
  count: number;
}

export function filterEntries(
  entries: CostEntry[],
  filter: { ledger?: string; month?: string }
): CostEntry[] {
  return entries.filter((e) => {
    if (filter.ledger && filter.ledger !== "All" && (e.Ledger ?? "Esterra") !== filter.ledger) return false;
    if (filter.month && filter.month !== "All" && !(e.Date ?? "").startsWith(filter.month)) return false;
    return true;
  });
}

export function moneySummary(entries: CostEntry[]): MoneySummary {
  let income = 0, expenses = 0, savingsInvestment = 0;
  for (const e of entries) {
    const amt = e.Amount || 0;
    const t = entryType(e);
    if (t === "Income") income += amt;
    else if (t === "Savings" || t === "Investment") savingsInvestment += amt;
    else expenses += amt; // Expense and Project both count as outgoings
  }
  const balance = income - expenses;
  return {
    income, expenses, balance, savingsInvestment,
    pctBalanceOfIncome: income > 0 ? (balance / income) * 100 : 0,
    count: entries.length,
  };
}

/** Expense totals per category, largest first — the dashboard's category chart. */
export function expenseByCategory(entries: CostEntry[]): Array<{ category: string; total: number }> {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (!isSpend(e)) continue;
    const c = e.Category || "Other";
    totals.set(c, (totals.get(c) ?? 0) + (e.Amount || 0));
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Distinct months ("YYYY-MM") present in the data, newest first. */
export function availableMonths(entries: CostEntry[]): string[] {
  const months = new Set<string>();
  for (const e of entries) {
    const m = (e.Date ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) months.add(m);
  }
  return [...months].sort().reverse();
}
