import { parseAmount, type Transaction } from "./ledger.js";

/** A row-level import error tied to a physical line of the source file. */
export interface ImportError {
  /** 1-based physical line number in the source file, header included. */
  line: number;
  message: string;
}

export interface ImportResult {
  transactions: Transaction[];
  errors: ImportError[];
}

const REQUIRED_COLUMNS = ["date", "amount", "description"] as const;
const DEFAULT_CURRENCY = "RUB";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RU_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** Normalizes YYYY-MM-DD or DD.MM.YYYY into YYYY-MM-DD, validating the calendar date. */
export function normalizeDate(raw: string): string {
  const trimmed = raw.trim();

  let year: number;
  let month: number;
  let day: number;

  const isoMatch = ISO_DATE.exec(trimmed);
  const ruMatch = RU_DATE.exec(trimmed);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (ruMatch) {
    day = Number(ruMatch[1]);
    month = Number(ruMatch[2]);
    year = Number(ruMatch[3]);
  } else {
    throw new Error(`Неизвестный формат даты: "${raw}".`);
  }

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`Несуществующая дата: "${raw}".`);
  }

  const pad = (value: number, length: number) => String(value).padStart(length, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Splits a single CSV line into fields, honoring quotes and doubled quotes. */
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (inQuotes) {
    throw new Error("Незакрытая кавычка в строке CSV.");
  }

  fields.push(current);
  return fields;
}

/**
 * Imports transactions from a CSV bank statement.
 *
 * Required columns (case-insensitive, any order): date, amount, description.
 * Optional: currency (defaults to RUB). The delimiter (comma or semicolon) is
 * auto-detected from the header line. Row-level errors do not abort the
 * import; a missing required column throws instead, since the file cannot be
 * interpreted at all.
 */
export function importCsv(content: string): ImportResult {
  const stripped = stripBom(content);
  const physicalLines = stripped.split(/\r\n|\r|\n/);

  let headerLineIndex = -1;
  for (let i = 0; i < physicalLines.length; i++) {
    if (physicalLines[i].trim() !== "") {
      headerLineIndex = i;
      break;
    }
  }
  if (headerLineIndex === -1) {
    throw new Error("CSV файл пуст.");
  }

  const headerRaw = physicalLines[headerLineIndex];
  const delimiter = headerRaw.includes(";") ? ";" : ",";
  const headerFields = parseCsvLine(headerRaw, delimiter).map((field) => field.trim().toLowerCase());

  const columnIndex: Record<string, number> = {};
  headerFields.forEach((name, idx) => {
    columnIndex[name] = idx;
  });

  for (const required of REQUIRED_COLUMNS) {
    if (!(required in columnIndex)) {
      throw new Error(`В CSV отсутствует обязательная колонка "${required}".`);
    }
  }

  const currencyIndex = columnIndex["currency"];

  const transactions: Transaction[] = [];
  const errors: ImportError[] = [];

  for (let i = headerLineIndex + 1; i < physicalLines.length; i++) {
    const rawLine = physicalLines[i];
    if (rawLine.trim() === "") {
      continue;
    }
    const lineNumber = i + 1;

    try {
      const fields = parseCsvLine(rawLine, delimiter);
      if (fields.length !== headerFields.length) {
        throw new Error(`Неверное число полей: ожидалось ${headerFields.length}, получено ${fields.length}.`);
      }

      const dateRaw = fields[columnIndex["date"]];
      const amountRaw = fields[columnIndex["amount"]];
      const descriptionRaw = fields[columnIndex["description"]];
      const currencyRaw = currencyIndex !== undefined ? fields[currencyIndex] : "";

      const date = normalizeDate(dateRaw);
      const amount = parseAmount(amountRaw);
      const description = descriptionRaw.trim();
      const currency = currencyRaw.trim() !== "" ? currencyRaw.trim().toUpperCase() : DEFAULT_CURRENCY;

      transactions.push({ date, amount, description, currency });
    } catch (error) {
      errors.push({ line: lineNumber, message: (error as Error).message });
    }
  }

  return { transactions, errors };
}
