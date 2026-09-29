import { describe, expect, it } from "vitest";
import { monthlyReport } from "../src/report.js";
import type { CategorizedTransaction } from "../src/categorize.js";

function tx(overrides: Partial<CategorizedTransaction>): CategorizedTransaction {
  return {
    date: "2024-01-05",
    amount: -100,
    description: "Тест",
    currency: "RUB",
    category: "Прочее",
    ...overrides,
  };
}

describe("monthlyReport", () => {
  it("filters transactions to the given YYYY-MM month", () => {
    const transactions = [
      tx({ date: "2024-01-15", amount: -100, category: "Еда" }),
      tx({ date: "2024-02-01", amount: -200, category: "Еда" }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    expect(report.expense).toBe(100);
    expect(report.categories).toEqual([{ category: "Еда", amount: 100, count: 1, share: 100 }]);
  });

  it("excludes transactions from neighboring months", () => {
    const transactions = [
      tx({ date: "2023-12-31", amount: -50 }),
      tx({ date: "2024-01-01", amount: -50 }),
      tx({ date: "2024-02-01", amount: -50 }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    expect(report.expense).toBe(50);
  });

  it("aggregates expenses as positive amounts and income separately", () => {
    const transactions = [
      tx({ amount: 1000, category: "Доход" }),
      tx({ amount: -300, category: "Еда" }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    expect(report.income).toBe(1000);
    expect(report.expense).toBe(300);
    expect(report.categories).toEqual([{ category: "Еда", amount: 300, count: 1, share: 100 }]);
  });

  it("counts transactions per category", () => {
    const transactions = [
      tx({ amount: -100, category: "Еда" }),
      tx({ amount: -50, category: "Еда" }),
      tx({ amount: -25, category: "Транспорт" }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    const food = report.categories.find((c) => c.category === "Еда");
    expect(food).toEqual({ category: "Еда", amount: 150, count: 2, share: 85.7 });
  });

  it("sorts categories by expense amount descending", () => {
    const transactions = [
      tx({ amount: -50, category: "Малое" }),
      tx({ amount: -500, category: "Большое" }),
      tx({ amount: -200, category: "Среднее" }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    expect(report.categories.map((c) => c.category)).toEqual(["Большое", "Среднее", "Малое"]);
  });

  it("breaks ties deterministically by category name", () => {
    const transactions = [
      tx({ amount: -100, category: "Бета" }),
      tx({ amount: -100, category: "Альфа" }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    expect(report.categories.map((c) => c.category)).toEqual(["Альфа", "Бета"]);
  });

  it("rounds category shares to one decimal place without forcing totals to 100", () => {
    const transactions = [
      tx({ amount: -100, category: "A" }),
      tx({ amount: -100, category: "B" }),
      tx({ amount: -100, category: "C" }),
    ];

    const report = monthlyReport(transactions, "2024-01");

    expect(report.categories.map((c) => c.share)).toEqual([33.3, 33.3, 33.3]);
  });

  it("rejects a month not in YYYY-MM format", () => {
    expect(() => monthlyReport([], "2024/01")).toThrowError(/YYYY-MM/);
  });

  it("returns an empty category list and zero totals when there are no matching transactions", () => {
    const report = monthlyReport([tx({ date: "2024-02-01" })], "2024-01");

    expect(report).toEqual({ month: "2024-01", income: 0, expense: 0, categories: [] });
  });
});
