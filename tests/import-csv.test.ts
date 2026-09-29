import { describe, expect, it } from "vitest";
import { importCsv, normalizeDate } from "../src/import-csv.js";

describe("importCsv", () => {
  it("parses a comma-delimited file with all columns", () => {
    const csv = ["date,amount,description,currency", "2024-01-05,1500.25,Зарплата,USD"].join("\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual([
      { date: "2024-01-05", amount: 1500.25, description: "Зарплата", currency: "USD" },
    ]);
  });

  it("parses a semicolon-delimited file detected from the header", () => {
    const csv = ["date;amount;description", "05.01.2024;-99,90;Кафе"].join("\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual([
      { date: "2024-01-05", amount: -99.9, description: "Кафе", currency: "RUB" },
    ]);
  });

  it("defaults currency to RUB when the column is absent", () => {
    const csv = ["date,amount,description", "2024-01-05,10,Прочее"].join("\n");

    const result = importCsv(csv);

    expect(result.transactions[0]?.currency).toBe("RUB");
  });

  it("resolves columns regardless of order and case", () => {
    const csv = ["DESCRIPTION,Currency,AMOUNT,Date", "Возврат,EUR,20,2024-03-01"].join("\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual([
      { date: "2024-03-01", amount: 20, description: "Возврат", currency: "EUR" },
    ]);
  });

  it("handles quoted fields containing the delimiter and doubled quotes", () => {
    const csv = [
      "date,amount,description",
      '2024-01-05,100,"Оплата, ""срочно"", по счёту"',
    ].join("\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions[0]?.description).toBe('Оплата, "срочно", по счёту');
  });

  it("strips a UTF-8 BOM from the start of the file", () => {
    const csv = "﻿" + ["date,amount,description", "2024-01-05,10,Тест"].join("\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(1);
  });

  it("supports CRLF line endings", () => {
    const csv = ["date,amount,description", "2024-01-05,10,Тест1", "2024-01-06,20,Тест2"].join("\r\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(2);
  });

  it("skips blank lines without affecting error line numbers", () => {
    const csv = [
      "date,amount,description",
      "",
      "2024-01-05,10,Тест",
      "",
      "not-a-date,10,Ошибка",
    ].join("\n");

    const result = importCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.errors).toEqual([{ line: 5, message: expect.stringContaining("даты") }]);
  });

  it("parses amounts using a decimal comma and space thousand separators", () => {
    const csv = ["date,amount,description", "2024-01-05,\"1 234,56\",Крупная покупка"].join("\n");

    const result = importCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.transactions[0]?.amount).toBe(1234.56);
  });

  it("treats negative amounts as expenses", () => {
    const csv = ["date,amount,description", "2024-01-05,-42.5,Такси"].join("\n");

    const result = importCsv(csv);

    expect(result.transactions[0]?.amount).toBe(-42.5);
  });

  it("collects row errors with correct physical line numbers without aborting the import", () => {
    const csv = [
      "date,amount,description",
      "2024-01-05,10,Хорошая строка",
      "2024-02-30,20,Несуществующая дата",
      "2024-01-07,not-a-number,Некорректная сумма",
      "2024-01-08,30,Ещё одна хорошая строка",
    ].join("\n");

    const result = importCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({ line: 3, message: expect.stringContaining("Несуществующая дата") });
    expect(result.errors[1]).toEqual({ line: 4, message: expect.stringContaining("сумма") });
  });

  it("reports a row error for a mismatched field count", () => {
    const csv = ["date,amount,description", "2024-01-05,10"].join("\n");

    const result = importCsv(csv);

    expect(result.transactions).toEqual([]);
    expect(result.errors).toEqual([{ line: 2, message: expect.stringContaining("Неверное число полей") }]);
  });

  it("reports a row error for an unterminated quote", () => {
    const csv = ["date,amount,description", '2024-01-05,10,"Незакрытая'].join("\n");

    const result = importCsv(csv);

    expect(result.transactions).toEqual([]);
    expect(result.errors).toEqual([{ line: 2, message: expect.stringContaining("кавычка") }]);
  });

  it("throws a clear error when a required column is missing", () => {
    const csv = ["date,description", "2024-01-05,Тест"].join("\n");

    expect(() => importCsv(csv)).toThrowError(/amount/);
  });
});

describe("normalizeDate", () => {
  it("accepts ISO dates", () => {
    expect(normalizeDate("2024-03-07")).toBe("2024-03-07");
  });

  it("converts DD.MM.YYYY to ISO", () => {
    expect(normalizeDate("07.03.2024")).toBe("2024-03-07");
  });

  it("rejects a non-existent calendar date", () => {
    expect(() => normalizeDate("2024-02-30")).toThrowError(/Несуществующая дата/);
  });

  it("rejects an unrecognized format", () => {
    expect(() => normalizeDate("2024/03/07")).toThrowError(/формат/);
  });
});
