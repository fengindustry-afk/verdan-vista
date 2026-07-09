import type { CostEntry, CostBudget } from "./types";

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
  input: { title: string; category: string; amount: number; date: string; note?: string },
  createdBy: string
): CostEntry {
  return {
    id: crypto.randomUUID(),
    Title: input.title,
    Category: input.category,
    Amount: input.amount,
    Date: input.date,
    Note: input.note,
    CreatedBy: createdBy,
  };
}
