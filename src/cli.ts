import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_NAME, getVersion } from "./index.js";
import { importCsv, type ImportResult } from "./import-csv.js";
import { formatAmount, summarize, type Transaction } from "./ledger.js";
import { categorize, parseRules, type CategorizedTransaction, type CategoryRule } from "./categorize.js";
import { monthlyReport, type MonthlyReport } from "./report.js";

export const HELP_TEXT = `${APP_NAME} — личный учёт финансов (CLI)

Использование:
  pocket-ledger [команда] [опции]
  pocket-ledger import <file.csv>
  pocket-ledger report <file.csv> [--month YYYY-MM] [--rules path] [--json]

Команды:
  import <file.csv>   импортировать банковскую выписку из CSV
  report <file.csv>   построить отчёт по категориям за месяц

Опции команды report:
  --month YYYY-MM   месяц отчёта (по умолчанию — последний месяц в файле)
  --rules path      путь к файлу правил категоризации (по умолчанию
                     rules.json рядом с CSV-файлом)
  --json            вывести отчёт в формате JSON вместо таблицы

Опции:
  -h, --help       показать эту справку
  -v, --version    показать версию пакета
`;

export interface CliResult {
  exitCode: number;
  output: string;
  stderr?: string;
}

function runImportCommand(filePath: string | undefined): CliResult {
  if (!filePath) {
    return {
      exitCode: 2,
      output: "",
      stderr: "Не указан путь к CSV-файлу.\nИспользование: pocket-ledger import <file.csv>",
    };
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (error) {
    return {
      exitCode: 2,
      output: "",
      stderr: `Не удалось прочитать файл "${filePath}": ${(error as Error).message}`,
    };
  }

  let result: ImportResult;
  try {
    result = importCsv(content);
  } catch (error) {
    return {
      exitCode: 2,
      output: "",
      stderr: (error as Error).message,
    };
  }

  const summary = summarize(result.transactions);
  const output = [
    `Импортировано операций: ${result.transactions.length}`,
    `Строк с ошибками: ${result.errors.length}`,
    `Доход: ${formatAmount(summary.income)}`,
    `Расход: ${formatAmount(summary.expense)}`,
    `Баланс: ${formatAmount(summary.balance)}`,
  ].join("\n");

  const stderr =
    result.errors.length > 0
      ? result.errors.map((error) => `Строка ${error.line}: ${error.message}`).join("\n")
      : undefined;

  return {
    exitCode: result.errors.length > 0 ? 1 : 0,
    output,
    stderr,
  };
}

interface ReportArgs {
  filePath?: string;
  month?: string;
  rulesPath?: string;
  json: boolean;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const USAGE = "Использование: pocket-ledger report <file.csv> [--month YYYY-MM] [--rules path] [--json]";

function isFlag(token: string | undefined): boolean {
  return token !== undefined && token.startsWith("--");
}

function parseReportArgs(args: string[]): ReportArgs | { error: string } {
  const result: ReportArgs = { json: false };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--month") {
      const value = args[i + 1];
      if (!value || isFlag(value)) {
        return { error: "Опция --month требует значения в формате YYYY-MM." };
      }
      result.month = value;
      i++;
    } else if (arg === "--rules") {
      const value = args[i + 1];
      if (!value || isFlag(value)) {
        return { error: "Опция --rules требует пути к файлу." };
      }
      result.rulesPath = value;
      i++;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg.startsWith("--")) {
      return { error: `Неизвестная опция: ${arg}` };
    } else {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    return { error: `Не указан путь к CSV-файлу.\n${USAGE}` };
  }

  if (positional.length > 1) {
    return { error: `Лишние аргументы: ${positional.slice(1).join(" ")}\n${USAGE}` };
  }

  result.filePath = positional[0];

  if (result.month !== undefined && !MONTH_PATTERN.test(result.month)) {
    return { error: `Некорректный формат месяца: "${result.month}". Ожидается YYYY-MM с месяцем от 01 до 12.` };
  }

  return result;
}

function latestMonth(transactions: Transaction[]): string | undefined {
  let latest: string | undefined;
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    if (latest === undefined || month > latest) {
      latest = month;
    }
  }
  return latest;
}

function padEnd(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

function formatReportTable(report: MonthlyReport): string {
  const headers = ["Категория", "Расход", "Доход", "Доля", "Кол-во"];
  const rows = report.categories.map((category) => [
    category.category,
    formatAmount(category.expense),
    formatAmount(category.income),
    `${category.share.toFixed(1)}%`,
    String(category.count),
  ]);

  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...rows.map((row) => row[columnIndex].length)),
  );

  const formatRow = (cells: string[]) =>
    cells
      .map((cell, columnIndex) => (columnIndex === 0 ? padEnd(cell, widths[columnIndex]) : padStart(cell, widths[columnIndex])))
      .join("  ");

  const lines = [
    `Месяц: ${report.month}`,
    `Доход: ${formatAmount(report.income)}`,
    `Расход: ${formatAmount(report.expense)}`,
    "",
    formatRow(headers),
    ...rows.map(formatRow),
  ];

  return lines.join("\n");
}

function reportToJson(report: MonthlyReport): string {
  return JSON.stringify(report, null, 2);
}

function runReportCommand(args: string[]): CliResult {
  const parsed = parseReportArgs(args);
  if ("error" in parsed) {
    return { exitCode: 2, output: "", stderr: parsed.error };
  }

  const { filePath, month, rulesPath, json } = parsed;

  let content: string;
  try {
    content = readFileSync(filePath!, "utf-8");
  } catch (error) {
    return {
      exitCode: 2,
      output: "",
      stderr: `Не удалось прочитать файл "${filePath}": ${(error as Error).message}`,
    };
  }

  let importResult: ImportResult;
  try {
    importResult = importCsv(content);
  } catch (error) {
    return {
      exitCode: 2,
      output: "",
      stderr: (error as Error).message,
    };
  }

  const resolvedRulesPath = rulesPath ?? join(dirname(filePath!), "rules.json");

  let rulesContent: string;
  try {
    rulesContent = readFileSync(resolvedRulesPath, "utf-8");
  } catch (error) {
    return {
      exitCode: 2,
      output: "",
      stderr: `Не удалось прочитать файл правил "${resolvedRulesPath}": ${(error as Error).message}`,
    };
  }

  let rules: CategoryRule[];
  try {
    rules = parseRules(rulesContent);
  } catch (error) {
    return {
      exitCode: 2,
      output: "",
      stderr: (error as Error).message,
    };
  }

  const resolvedMonth = month ?? latestMonth(importResult.transactions);
  if (resolvedMonth === undefined) {
    return {
      exitCode: 2,
      output: "",
      stderr: "Не удалось определить месяц отчёта: в файле нет ни одной корректной операции.",
    };
  }

  const categorized: CategorizedTransaction[] = categorize(importResult.transactions, rules);
  const report = monthlyReport(categorized, resolvedMonth);

  const output = json ? reportToJson(report) : formatReportTable(report);
  const stderr =
    importResult.errors.length > 0
      ? importResult.errors.map((error) => `Строка ${error.line}: ${error.message}`).join("\n")
      : undefined;

  return {
    exitCode: importResult.errors.length > 0 ? 1 : 0,
    output,
    stderr,
  };
}

export function runCli(argv: string[]): CliResult {
  if (argv.includes("-v") || argv.includes("--version")) {
    return { exitCode: 0, output: getVersion() };
  }

  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    return { exitCode: 0, output: HELP_TEXT };
  }

  const [command, ...rest] = argv;

  if (command === "import") {
    return runImportCommand(rest[0]);
  }

  if (command === "report") {
    return runReportCommand(rest);
  }

  return {
    exitCode: 1,
    output: "",
    stderr: `Неизвестная команда: ${argv.join(" ")}\nЗапустите pocket-ledger --help для списка доступных опций.`,
  };
}
