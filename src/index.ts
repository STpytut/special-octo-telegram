export { getVersion } from "./version.js";
export { parseAmount, summarize, formatAmount } from "./ledger.js";
export type { Transaction, Summary } from "./ledger.js";
export { importCsv, normalizeDate } from "./import-csv.js";
export type { ImportError, ImportResult } from "./import-csv.js";
export { categorize, parseRules, UNCATEGORIZED } from "./categorize.js";
export type { CategoryRule, CategorizedTransaction } from "./categorize.js";
export { monthlyReport } from "./report.js";
export type { CategoryTotal, MonthlyReport } from "./report.js";

/** Human-readable name of the application. */
export const APP_NAME = "Pocket Ledger";
