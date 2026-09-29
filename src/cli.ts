import { APP_NAME, getVersion } from "./index.js";

export const HELP_TEXT = `${APP_NAME} — личный учёт финансов (CLI)

Использование:
  pocket-ledger [команда] [опции]

Опции:
  -h, --help       показать эту справку
  -v, --version    показать версию пакета

Текущее состояние:
  Проект находится на стадии каркаса. Команды импорта CSV, категоризации,
  отчётов и бюджетов ещё не реализованы и появятся в следующих итерациях.
`;

export interface CliResult {
  exitCode: number;
  output: string;
}

export function runCli(argv: string[]): CliResult {
  if (argv.includes("-v") || argv.includes("--version")) {
    return { exitCode: 0, output: getVersion() };
  }

  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    return { exitCode: 0, output: HELP_TEXT };
  }

  return {
    exitCode: 1,
    output: `Неизвестная команда: ${argv.join(" ")}\nЗапустите pocket-ledger --help для списка доступных опций.`,
  };
}
