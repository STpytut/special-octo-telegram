import type { CategorizedTransaction } from "./categorize.js";

/** Aggregated spending for a single category within a monthly report. */
export interface CategoryTotal {
  category: string;
  /** Total spent in this category, as a positive amount. */
  amount: number;
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

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundShare(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Builds a monthly report for transactions whose date falls within the given
 * YYYY-MM month. Expense categories are sorted by amount descending, with
 * category name as a deterministic tie-breaker.
 */
export function monthlyReport(transactions: CategorizedTransaction[], month: string): MonthlyReport {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`Некорректный формат месяца: "${month}". Ожидается YYYY-MM.`);
  }

  const inMonth = transactions.filter((transaction) => transaction.date.startsWith(month));

  let income = 0;
  let expense = 0;
  const categoryTotals = new Map<string, { amount: number; count: number }>();

  for (const transaction of inMonth) {
    if (transaction.amount >= 0) {
      income += transaction.amount;
      continue;
    }

    const spent = -transaction.amount;
    expense += spent;

    const existing = categoryTotals.get(transaction.category);
    if (existing) {
      existing.amount += spent;
      existing.count += 1;
    } else {
      categoryTotals.set(transaction.category, { amount: spent, count: 1 });
    }
  }

  const roundedExpense = roundCurrency(expense);

  const categories: CategoryTotal[] = Array.from(categoryTotals.entries())
    .map(([category, totals]) => ({
      category,
      amount: roundCurrency(totals.amount),
      count: totals.count,
      share: expense > 0 ? roundShare((totals.amount / expense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));

  return {
    month,
    income: roundCurrency(income),
    expense: roundedExpense,
    categories,
  };
}
