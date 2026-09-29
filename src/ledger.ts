/** A single normalized financial transaction. */
export interface Transaction {
  /** Normalized date in YYYY-MM-DD form. */
  date: string;
  /** Signed amount: positive for income, negative for expense. */
  amount: number;
  description: string;
  currency: string;
}

/** Aggregated totals over a set of transactions. */
export interface Summary {
  income: number;
  expense: number;
  balance: number;
}

/**
 * Parses a monetary amount that may use a decimal comma and
 * space (including non-breaking space) thousand separators, e.g. "1 234,56".
 */
export function parseAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("Пустое значение суммы.");
  }

  let normalized = trimmed.replace(/[\s ]/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    // Both separators present: treat comma as a thousands separator.
    normalized = normalized.replace(/,/g, "");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Некорректная сумма: "${raw}".`);
  }
  return value;
}

/** Rounds a value to two decimal places to avoid floating point drift. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Formats a monetary amount with exactly two decimal places, e.g. "1234.50". */
export function formatAmount(value: number): string {
  return value.toFixed(2);
}

/** Computes total income, expense and balance for a list of transactions. */
export function summarize(transactions: Transaction[]): Summary {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    if (transaction.amount >= 0) {
      income += transaction.amount;
    } else {
      expense += -transaction.amount;
    }
  }

  return {
    income: roundCurrency(income),
    expense: roundCurrency(expense),
    balance: roundCurrency(income - expense),
  };
}
