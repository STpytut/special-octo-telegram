import type { Transaction } from "./ledger.js";

/** Match conditions for a category rule. All present conditions are combined with AND. */
export interface CategoryMatch {
  /** Case-insensitive substring match: matches if the description contains any of these. */
  descriptionContains?: string[];
  /** Regular expression (as a string, case-sensitive) tested against the description. */
  descriptionRegex?: string;
  /** Inclusive lower bound on the signed transaction amount, in rubles. */
  amountMin?: number;
  /** Inclusive upper bound on the signed transaction amount, in rubles. */
  amountMax?: number;
}

/** A single categorization rule: matches when all conditions in `match` hold. */
export interface CategoryRule {
  category: string;
  match: CategoryMatch;
}

/** A transaction annotated with the category assigned by [[categorize]]. */
export interface CategorizedTransaction extends Transaction {
  category: string;
}

export const UNCATEGORIZED = "Без категории";

const MATCH_KEYS = ["descriptionContains", "descriptionRegex", "amountMin", "amountMax"] as const;
const RULE_KEYS = ["category", "match"] as const;

function matchesRule(rule: CategoryRule, transaction: Transaction): boolean {
  const { match } = rule;
  const description = transaction.description.toLowerCase();

  if (match.descriptionContains && match.descriptionContains.length > 0) {
    const matchesAny = match.descriptionContains.some((needle) => description.includes(needle.toLowerCase()));
    if (!matchesAny) {
      return false;
    }
  }

  if (match.descriptionRegex !== undefined) {
    const regex = new RegExp(match.descriptionRegex);
    if (!regex.test(transaction.description)) {
      return false;
    }
  }

  if (match.amountMin !== undefined && transaction.amount < match.amountMin) {
    return false;
  }

  if (match.amountMax !== undefined && transaction.amount > match.amountMax) {
    return false;
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

/**
 * Best-effort mapping from a character offset in the source JSON to the
 * 1-based index of the top-level array element containing it. Used to give
 * syntactically broken rules.json files a plausible rule number.
 */
function findRuleNumberForPosition(content: string, position: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let ruleIndex = 1;

  const end = Math.min(position, content.length);
  for (let i = 0; i < end; i++) {
    const ch = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
    } else if (ch === "," && depth === 1) {
      ruleIndex++;
    }
  }

  return ruleIndex;
}

/**
 * Best-effort recovery of a character offset from a JSON.parse error message
 * that does not report an explicit position (as used by newer V8 engines,
 * which instead include a short excerpt of the source around the error).
 */
function estimateErrorPosition(content: string, message: string): number | undefined {
  const tokenMatch = /Unexpected token '(.)'/.exec(message);
  const excerptMatch = /\.\.\.(.*)\.\.\./s.exec(message);
  if (!tokenMatch || !excerptMatch) {
    return undefined;
  }

  const excerpt = excerptMatch[1];
  const excerptStart = content.indexOf(excerpt);
  if (excerptStart === -1) {
    return undefined;
  }

  const tokenOffset = excerpt.indexOf(tokenMatch[1]);
  if (tokenOffset === -1) {
    return undefined;
  }

  return excerptStart + tokenOffset;
}

/** Parses and validates the contents of a rules.json file into a rule list. */
export function parseRules(content: string): CategoryRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = (error as Error).message;
    const positionMatch = /position (\d+)/.exec(message);
    const position = positionMatch
      ? Number(positionMatch[1])
      : (estimateErrorPosition(content, message) ?? content.length);
    const ruleNumber = findRuleNumberForPosition(content, position);
    throw new Error(`Правило ${ruleNumber}: файл правил содержит некорректный JSON: ${message}`);
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

  for (const key of Object.keys(record)) {
    if (!(RULE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${prefix} неизвестное поле "${key}". Допустимы: ${RULE_KEYS.join(", ")}.`);
    }
  }

  if (typeof record.category !== "string" || record.category.trim() === "") {
    throw new Error(`${prefix} поле "category" обязательно и должно быть непустой строкой.`);
  }

  if (typeof record.match !== "object" || record.match === null || Array.isArray(record.match)) {
    throw new Error(`${prefix} поле "match" обязательно и должно быть объектом.`);
  }

  const matchRecord = record.match as Record<string, unknown>;
  for (const key of Object.keys(matchRecord)) {
    if (!(MATCH_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${prefix} неизвестное условие "${key}" в "match". Допустимы: ${MATCH_KEYS.join(", ")}.`);
    }
  }

  const match: CategoryMatch = {};

  if (matchRecord.descriptionContains !== undefined) {
    if (
      !Array.isArray(matchRecord.descriptionContains) ||
      matchRecord.descriptionContains.length === 0 ||
      !matchRecord.descriptionContains.every((item) => typeof item === "string" && item !== "")
    ) {
      throw new Error(`${prefix} поле "match.descriptionContains" должно быть непустым массивом непустых строк.`);
    }
    match.descriptionContains = matchRecord.descriptionContains as string[];
  }

  if (matchRecord.descriptionRegex !== undefined) {
    if (typeof matchRecord.descriptionRegex !== "string" || matchRecord.descriptionRegex === "") {
      throw new Error(`${prefix} поле "match.descriptionRegex" должно быть непустой строкой.`);
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(matchRecord.descriptionRegex);
    } catch (error) {
      throw new Error(
        `${prefix} некорректное регулярное выражение "match.descriptionRegex": ${(error as Error).message}`,
      );
    }
    match.descriptionRegex = matchRecord.descriptionRegex;
  }

  if (matchRecord.amountMin !== undefined) {
    if (typeof matchRecord.amountMin !== "number" || !Number.isFinite(matchRecord.amountMin)) {
      throw new Error(`${prefix} поле "match.amountMin" должно быть числом.`);
    }
    match.amountMin = matchRecord.amountMin;
  }

  if (matchRecord.amountMax !== undefined) {
    if (typeof matchRecord.amountMax !== "number" || !Number.isFinite(matchRecord.amountMax)) {
      throw new Error(`${prefix} поле "match.amountMax" должно быть числом.`);
    }
    match.amountMax = matchRecord.amountMax;
  }

  if (match.amountMin !== undefined && match.amountMax !== undefined && match.amountMin > match.amountMax) {
    throw new Error(`${prefix} "match.amountMin" не может быть больше "match.amountMax".`);
  }

  if (
    match.descriptionContains === undefined &&
    match.descriptionRegex === undefined &&
    match.amountMin === undefined &&
    match.amountMax === undefined
  ) {
    throw new Error(`${prefix} в "match" должно быть указано хотя бы одно условие.`);
  }

  return { category: record.category, match };
}
