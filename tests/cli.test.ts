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

describe("runCli report", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pocket-ledger-cli-report-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeStatement(): string {
    const file = join(dir, "statement.csv");
    writeFileSync(
      file,
      [
        "date,amount,description",
        "2024-01-05,1000,Зарплата",
        "2024-01-06,-250.50,Пятёрочка",
        "2024-01-07,-100,Такси домой",
        "2024-01-08,-50,Неизвестное",
      ].join("\n"),
      "utf-8",
    );
    return file;
  }

  function writeRules(path: string): void {
    writeFileSync(
      path,
      JSON.stringify([
        { category: "Еда", match: { descriptionContains: ["пятёрочка"] } },
        { category: "Транспорт", match: { descriptionContains: ["такси"] } },
      ]),
      "utf-8",
    );
  }

  it("prints a table report for the given month using rules.json next to the CSV", () => {
    const file = writeStatement();
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Месяц: 2024-01");
    expect(result.output).toContain("Доход: 1000.00");
    expect(result.output).toContain("Расход: 400.50");
    expect(result.output).toContain("Еда");
    expect(result.output).toContain("250.50");
    expect(result.output).toContain("Транспорт");
    expect(result.output).toContain("Без категории");
    expect(result.output).toMatch(/Категория\s+Расход\s+Доход\s+Доля\s+Кол-во/);
  });

  it("uses --rules to override the default rules.json path", () => {
    const file = writeStatement();
    const customRules = join(dir, "custom-rules.json");
    writeRules(customRules);

    const result = runCli(["report", file, "--month", "2024-01", "--rules", customRules]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Еда");
  });

  it("defaults to the latest month present in the file when --month is omitted", () => {
    const file = join(dir, "statement.csv");
    writeFileSync(
      file,
      ["date,amount,description", "2024-01-05,-100,Январь", "2024-03-01,-200,Март"].join("\n"),
      "utf-8",
    );
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Месяц: 2024-03");
  });

  it("exits with 2 when the latest month cannot be determined", () => {
    const file = join(dir, "statement.csv");
    writeFileSync(file, ["date,amount,description", "not-a-date,-100,Ошибка"].join("\n"), "utf-8");
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("месяц");
  });

  it("exits with 1 and reports row errors while still building the report from valid rows", () => {
    const file = join(dir, "statement.csv");
    writeFileSync(
      file,
      [
        "date,amount,description",
        "2024-01-05,-100,Пятёрочка",
        "2024-02-30,-50,Некорректная дата",
      ].join("\n"),
      "utf-8",
    );
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Еда");
    expect(result.stderr).toContain("Строка 3:");
  });

  it("exits with 2 when rules.json is missing", () => {
    const file = writeStatement();

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("правил");
  });

  it("exits with 2 when rules.json is invalid", () => {
    const file = writeStatement();
    writeFileSync(join(dir, "rules.json"), "{not valid json", "utf-8");

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("JSON");
  });

  it("exits with 2 and a rule number when rules.json has an unknown key inside match", () => {
    const file = writeStatement();
    writeFileSync(
      join(dir, "rules.json"),
      JSON.stringify([{ category: "Еда", match: { desc: "кафе" } }]),
      "utf-8",
    );

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Правило 1:");
    expect(result.stderr).toContain("desc");
  });

  it("exits with 2 and a rule number when rules.json has a broken regex", () => {
    const file = writeStatement();
    writeFileSync(
      join(dir, "rules.json"),
      JSON.stringify([{ category: "Еда", match: { descriptionRegex: "(unterminated" } }]),
      "utf-8",
    );

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Правило 1:");
  });

  it("exits with 2 and a rule number when rules.json has an empty category", () => {
    const file = writeStatement();
    writeFileSync(
      join(dir, "rules.json"),
      JSON.stringify([{ category: "", match: { descriptionContains: ["кафе"] } }]),
      "utf-8",
    );

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Правило 1:");
  });

  it("exits with 2 and a best-effort rule number for syntactically broken rules.json", () => {
    const file = writeStatement();
    const broken = JSON.stringify([
      { category: "Еда", match: { descriptionContains: ["кафе"] } },
      { category: "Транспорт", match: { descriptionContains: ["такси"] } },
    ]).replace('"Транспорт"', "Транспорт");
    writeFileSync(join(dir, "rules.json"), broken, "utf-8");

    const result = runCli(["report", file, "--month", "2024-01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Правило 2:");
    expect(result.stderr).toContain("JSON");
  });

  it("exits with 2 for an invalid --month argument", () => {
    const file = writeStatement();
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "--month", "2024/01"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("YYYY-MM");
  });

  it("exits with 2 for a month with an out-of-range month number", () => {
    const file = writeStatement();
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "--month", "2024-13"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("YYYY-MM");
  });

  it("exits with 2 when the CSV file path is missing", () => {
    const result = runCli(["report"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Не указан путь");
  });

  it("exits with 2 when extra positional arguments are given", () => {
    const file = writeStatement();
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "extra-arg"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Лишние аргументы");
  });

  it("exits with 2 when --month is immediately followed by another flag", () => {
    const file = writeStatement();
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "--month", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--month");
  });

  it("prints the report as JSON with --json", () => {
    const file = writeStatement();
    writeRules(join(dir, "rules.json"));

    const result = runCli(["report", file, "--month", "2024-01", "--json"]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.month).toBe("2024-01");
    expect(parsed.income).toBe(1000);
    expect(parsed.expense).toBe(400.5);
    expect(parsed.categories.find((c: { category: string }) => c.category === "Еда")).toEqual({
      category: "Еда",
      expense: 250.5,
      income: 0,
      count: 1,
      share: 62.5,
    });
  });
});
