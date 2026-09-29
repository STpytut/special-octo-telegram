import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { getVersion } from "../src/index.js";

describe("runCli", () => {
  it("prints help text with no arguments", () => {
    const result = runCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Pocket Ledger");
    expect(result.output).toContain("Использование:");
  });

  it("prints help text for --help", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("pocket-ledger [команда] [опции]");
  });

  it("prints the package version for --version", () => {
    const result = runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(getVersion());
  });

  it("rejects unknown commands", () => {
    const result = runCli(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("");
    expect(result.stderr).toContain("Неизвестная команда");
  });
});

describe("runCli import", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pocket-ledger-cli-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports a valid CSV file and prints a summary", () => {
    const file = join(dir, "statement.csv");
    writeFileSync(
      file,
      ["date,amount,description", "2024-01-05,1000,Зарплата", "2024-01-06,-250.50,Продукты"].join("\n"),
      "utf-8",
    );

    const result = runCli(["import", file]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBeUndefined();
    expect(result.output).toContain("Импортировано операций: 2");
    expect(result.output).toContain("Строк с ошибками: 0");
    expect(result.output).toContain("Доход: 1000.00");
    expect(result.output).toContain("Расход: 250.50");
    expect(result.output).toContain("Баланс: 749.50");
  });

  it("exits with 1 and reports row errors on stderr while still printing the summary", () => {
    const file = join(dir, "statement-with-errors.csv");
    writeFileSync(
      file,
      [
        "date,amount,description",
        "2024-01-05,1000,Зарплата",
        "2024-02-30,100,Некорректная дата",
        "not-a-number,50,Некорректная сумма строки",
      ].join("\n"),
      "utf-8",
    );

    const result = runCli(["import", file]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Импортировано операций: 1");
    expect(result.output).toContain("Строк с ошибками: 2");
    expect(result.stderr).toContain("Строка 3:");
  });

  it("exits with 2 when the file cannot be read", () => {
    const result = runCli(["import", join(dir, "missing.csv")]);

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("");
    expect(result.stderr).toContain("Не удалось прочитать файл");
  });

  it("exits with 2 when a required column is missing", () => {
    const file = join(dir, "missing-column.csv");
    writeFileSync(file, "date,description\n2024-01-05,Зарплата\n", "utf-8");

    const result = runCli(["import", file]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('"amount"');
  });
});
