import { describe, expect, it } from "vitest";
import { categorize, parseRules, UNCATEGORIZED, type CategoryRule } from "../src/categorize.js";
import type { Transaction } from "../src/ledger.js";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    date: "2024-01-05",
    amount: -100,
    description: "Тест",
    currency: "RUB",
    ...overrides,
  };
}

describe("categorize", () => {
  it("assigns the category of the first matching rule when several rules could match", () => {
    const rules: CategoryRule[] = [
      { category: "Еда", descriptionContains: ["пятёрочка"] },
      { category: "Магазины", descriptionContains: ["пятёрочка"] },
    ];

    const [result] = categorize([tx({ description: "Пятёрочка №5" })], rules);

    expect(result.category).toBe("Еда");
  });

  it("matches descriptionContains case-insensitively", () => {
    const rules: CategoryRule[] = [{ category: "Еда", descriptionContains: ["кафе"] }];

    const [result] = categorize([tx({ description: "ОПЛАТА КАФЕ ВЕЧЕР" })], rules);

    expect(result.category).toBe("Еда");
  });

  it("matches descriptionContains against any of the listed substrings", () => {
    const rules: CategoryRule[] = [{ category: "Транспорт", descriptionContains: ["такси", "метро"] }];

    const results = categorize(
      [tx({ description: "Оплата метро" }), tx({ description: "Такси домой" }), tx({ description: "Прочее" })],
      rules,
    );

    expect(results[0]?.category).toBe("Транспорт");
    expect(results[1]?.category).toBe("Транспорт");
    expect(results[2]?.category).toBe(UNCATEGORIZED);
  });

  it("matches via descriptionRegex", () => {
    const rules: CategoryRule[] = [{ category: "Связь", descriptionRegex: "^МТС|Билайн$" }];

    const results = categorize([tx({ description: "МТС оплата" }), tx({ description: "Абонемент Билайн" })], rules);

    expect(results[0]?.category).toBe("Связь");
    expect(results[1]?.category).toBe("Связь");
  });

  it("applies inclusive amountMin/amountMax bounds", () => {
    const rules: CategoryRule[] = [{ category: "Крупные покупки", amountMin: 1000, amountMax: 5000 }];

    const results = categorize(
      [tx({ amount: -999 }), tx({ amount: -1000 }), tx({ amount: -5000 }), tx({ amount: -5001 })],
      rules,
    );

    expect(results.map((r) => r.category)).toEqual([
      UNCATEGORIZED,
      "Крупные покупки",
      "Крупные покупки",
      UNCATEGORIZED,
    ]);
  });

  it("requires all conditions of a rule to match (AND semantics)", () => {
    const rules: CategoryRule[] = [
      { category: "Дорогие продукты", descriptionContains: ["пятёрочка"], amountMin: 1000 },
    ];

    const results = categorize(
      [tx({ description: "Пятёрочка", amount: -500 }), tx({ description: "Пятёрочка", amount: -1500 })],
      rules,
    );

    expect(results[0]?.category).toBe(UNCATEGORIZED);
    expect(results[1]?.category).toBe("Дорогие продукты");
  });

  it("falls back to 'Без категории' when no rule matches", () => {
    const [result] = categorize([tx({ description: "Необычная операция" })], [
      { category: "Еда", descriptionContains: ["кафе"] },
    ]);

    expect(result.category).toBe(UNCATEGORIZED);
  });
});

describe("parseRules", () => {
  it("parses a valid rules file", () => {
    const rules = parseRules(JSON.stringify([{ category: "Еда", descriptionContains: ["кафе"] }]));

    expect(rules).toEqual([{ category: "Еда", descriptionContains: ["кафе"] }]);
  });

  it("reports bad JSON with a clear diagnostic", () => {
    expect(() => parseRules("{not valid json")).toThrowError(/JSON/);
  });

  it("requires the top-level value to be an array", () => {
    expect(() => parseRules(JSON.stringify({ category: "Еда" }))).toThrowError(/массив/);
  });

  it("reports the 1-based rule number when a rule is not an object", () => {
    expect(() => parseRules(JSON.stringify(["oops"]))).toThrowError(/Правило 1:/);
  });

  it("reports the 1-based rule number for a missing category", () => {
    expect(() => parseRules(JSON.stringify([{ descriptionContains: ["a"] }]))).toThrowError(/Правило 1:.*category/s);
  });

  it("reports the 1-based rule number for an invalid descriptionContains", () => {
    expect(() =>
      parseRules(
        JSON.stringify([
          { category: "Еда", descriptionContains: ["кафе"] },
          { category: "Транспорт", descriptionContains: [] },
        ]),
      ),
    ).toThrowError(/Правило 2:.*descriptionContains/s);
  });

  it("reports the 1-based rule number for an invalid regex", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", descriptionRegex: "(unterminated" }])),
    ).toThrowError(/Правило 1:.*регулярное выражение/s);
  });

  it("reports the 1-based rule number for a non-numeric amountMin", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", amountMin: "100" }])),
    ).toThrowError(/Правило 1:.*amountMin/s);
  });

  it("reports the 1-based rule number for a negative amountMax", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", amountMax: -1 }])),
    ).toThrowError(/Правило 1:.*amountMax/s);
  });

  it("reports the 1-based rule number when amountMin exceeds amountMax", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", amountMin: 100, amountMax: 10 }])),
    ).toThrowError(/Правило 1:.*amountMin.*amountMax/s);
  });

  it("reports the 1-based rule number when no condition is provided", () => {
    expect(() => parseRules(JSON.stringify([{ category: "Еда" }]))).toThrowError(/Правило 1:.*условие/s);
  });
});
