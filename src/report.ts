import type { CategorizedTransaction } from "./categorize.js";

/** Aggregated totals for a single category within a monthly report. */
export interface CategoryTotal {
  category: string;
  /** Total expenses in this category, as a positive amount. */
  expense: number;
  /** Total income in this category. */
  income: number;
  /** Count of all transactions (income and expense) in this category. */
  count: number;
  /** Share of total expense for the month, rounded to 0.1 (percentage points). */
  share: number;
}

export interface MonthlyReport {
  month: string;
  income: number;
  expense: number;
  categories: CategoryTotal[];
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundShare(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Builds a monthly report for transactions whose date falls within the given
 * YYYY-MM month. Categories are sorted by expense descending, with category
 * name as a deterministic tie-breaker. A category with income but no expense
 * still appears, with expense 0 and share 0.
 */
export function monthlyReport(transactions: CategorizedTransaction[], month: string): MonthlyReport {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`Некорректный формат месяца: "${month}". Ожидается YYYY-MM с месяцем от 01 до 12.`);
  }

  const inMonth = transactions.filter((transaction) => transaction.date.startsWith(month));

  let income = 0;
  let expense = 0;
  const categoryTotals = new Map<string, { expense: number; income: number; count: number }>();

  for (const transaction of inMonth) {
    const existing = categoryTotals.get(transaction.category) ?? { expense: 0, income: 0, count: 0 };
    existing.count += 1;

    if (transaction.amount >= 0) {
      income += transaction.amount;
      existing.income += transaction.amount;
    } else {
      const spent = -transaction.amount;
      expense += spent;
      existing.expense += spent;
    }

    categoryTotals.set(transaction.category, existing);
  }

  const categories: CategoryTotal[] = Array.from(categoryTotals.entries())
    .map(([category, totals]) => ({
      category,
      expense: roundCurrency(totals.expense),
      income: roundCurrency(totals.income),
      count: totals.count,
      share: expense > 0 ? roundShare((totals.expense / expense) * 100) : 0,
    }))
    .sort((a, b) => b.expense - a.expense || a.category.localeCompare(b.category));

  return {
    month,
    income: roundCurrency(income),
    expense: roundCurrency(expense),
    categories,
  };
}
