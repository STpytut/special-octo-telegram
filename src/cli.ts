import { readFileSync } from "node:fs";
import { APP_NAME, getVersion } from "./index.js";
import { importCsv, type ImportResult } from "./import-csv.js";
import { summarize } from "./ledger.js";

export const HELP_TEXT = `${APP_NAME} — личный учёт финансов (CLI)

Использование:
  pocket-ledger [команда] [опции]
  pocket-ledger import <file.csv>

Команды:
  import <file.csv>   импортировать банковскую выписку из CSV

Опции:
  -h, --help       показать эту справку
  -v, --version    показать версию пакета

Текущее состояние:
  Проект находится на стадии каркаса. Категоризация, отчёты и бюджеты
  ещё не реализованы и появятся в следующих итерациях.
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
    `Доход: ${summary.income.toFixed(2)}`,
    `Расход: ${summary.expense.toFixed(2)}`,
    `Баланс: ${summary.balance.toFixed(2)}`,
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

  return {
    exitCode: 1,
    output: "",
    stderr: `Неизвестная команда: ${argv.join(" ")}\nЗапустите pocket-ledger --help для списка доступных опций.`,
  };
}
