import type { Transaction } from "./ledger.js";

/** A single categorization rule: matches when all present conditions hold. */
export interface CategoryRule {
  category: string;
  /** Case-insensitive substring match: matches if the description contains any of these. */
  descriptionContains?: string[];
  /** Regular expression (as a string) tested against the description. */
  descriptionRegex?: string;
  /** Inclusive lower bound on the amount in rubles (absolute value, see [[toRubAbs]]). */
  amountMin?: number;
  /** Inclusive upper bound on the amount in rubles (absolute value). */
  amountMax?: number;
}

/** A transaction annotated with the category assigned by [[categorize]]. */
export interface CategorizedTransaction extends Transaction {
  category: string;
}

export const UNCATEGORIZED = "Без категории";

function matchesRule(rule: CategoryRule, transaction: Transaction): boolean {
  const description = transaction.description.toLowerCase();

  if (rule.descriptionContains && rule.descriptionContains.length > 0) {
    const matchesAny = rule.descriptionContains.some((needle) => description.includes(needle.toLowerCase()));
    if (!matchesAny) {
      return false;
    }
  }

  if (rule.descriptionRegex !== undefined) {
    const regex = new RegExp(rule.descriptionRegex, "i");
    if (!regex.test(transaction.description)) {
      return false;
    }
  }

  if (rule.amountMin !== undefined || rule.amountMax !== undefined) {
    const amount = Math.abs(transaction.amount);
    if (rule.amountMin !== undefined && amount < rule.amountMin) {
      return false;
    }
    if (rule.amountMax !== undefined && amount > rule.amountMax) {
      return false;
    }
  }

  return true;
}

/**
 * Assigns a category to each transaction using the first matching rule (in
 * order). Transactions matched by no rule fall back to [[UNCATEGORIZED]].
 */
export function categorize(transactions: Transaction[], rules: CategoryRule[]): CategorizedTransaction[] {
  return transactions.map((transaction) => {
    const rule = rules.find((candidate) => matchesRule(candidate, transaction));
    return { ...transaction, category: rule ? rule.category : UNCATEGORIZED };
  });
}

/** Parses and validates the contents of a rules.json file into a rule list. */
export function parseRules(content: string): CategoryRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Некорректный JSON в файле правил: ${(error as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Файл правил должен содержать JSON-массив правил.");
  }

  return parsed.map((raw, index) => validateRule(raw, index + 1));
}

function validateRule(raw: unknown, ruleNumber: number): CategoryRule {
  const prefix = `Правило ${ruleNumber}:`;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${prefix} правило должно быть объектом.`);
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.category !== "string" || record.category.trim() === "") {
    throw new Error(`${prefix} поле "category" обязательно и должно быть непустой строкой.`);
  }

  const rule: CategoryRule = { category: record.category };

  if (record.descriptionContains !== undefined) {
    if (
      !Array.isArray(record.descriptionContains) ||
      record.descriptionContains.length === 0 ||
      !record.descriptionContains.every((item) => typeof item === "string" && item !== "")
    ) {
      throw new Error(`${prefix} поле "descriptionContains" должно быть непустым массивом непустых строк.`);
    }
    rule.descriptionContains = record.descriptionContains as string[];
  }

  if (record.descriptionRegex !== undefined) {
    if (typeof record.descriptionRegex !== "string" || record.descriptionRegex === "") {
      throw new Error(`${prefix} поле "descriptionRegex" должно быть непустой строкой.`);
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(record.descriptionRegex);
    } catch (error) {
      throw new Error(`${prefix} некорректное регулярное выражение "descriptionRegex": ${(error as Error).message}`);
    }
    rule.descriptionRegex = record.descriptionRegex;
  }

  if (record.amountMin !== undefined) {
    if (typeof record.amountMin !== "number" || !Number.isFinite(record.amountMin) || record.amountMin < 0) {
      throw new Error(`${prefix} поле "amountMin" должно быть неотрицательным числом.`);
    }
    rule.amountMin = record.amountMin;
  }

  if (record.amountMax !== undefined) {
    if (typeof record.amountMax !== "number" || !Number.isFinite(record.amountMax) || record.amountMax < 0) {
      throw new Error(`${prefix} поле "amountMax" должно быть неотрицательным числом.`);
    }
    rule.amountMax = record.amountMax;
  }

  if (
    rule.amountMin !== undefined &&
    rule.amountMax !== undefined &&
    rule.amountMin > rule.amountMax
  ) {
    throw new Error(`${prefix} "amountMin" не может быть больше "amountMax".`);
  }

  if (
    rule.descriptionContains === undefined &&
    rule.descriptionRegex === undefined &&
    rule.amountMin === undefined &&
    rule.amountMax === undefined
  ) {
    throw new Error(`${prefix} должно быть указано хотя бы одно условие.`);
  }

  return rule;
}
