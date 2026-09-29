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
      { category: "Еда", match: { descriptionContains: ["пятёрочка"] } },
      { category: "Магазины", match: { descriptionContains: ["пятёрочка"] } },
    ];

    const [result] = categorize([tx({ description: "Пятёрочка №5" })], rules);

    expect(result.category).toBe("Еда");
  });

  it("matches descriptionContains case-insensitively", () => {
    const rules: CategoryRule[] = [{ category: "Еда", match: { descriptionContains: ["кафе"] } }];

    const [result] = categorize([tx({ description: "ОПЛАТА КАФЕ ВЕЧЕР" })], rules);

    expect(result.category).toBe("Еда");
  });

  it("matches descriptionContains against any of the listed substrings", () => {
    const rules: CategoryRule[] = [{ category: "Транспорт", match: { descriptionContains: ["такси", "метро"] } }];

    const results = categorize(
      [tx({ description: "Оплата метро" }), tx({ description: "Такси домой" }), tx({ description: "Прочее" })],
      rules,
    );

    expect(results[0]?.category).toBe("Транспорт");
    expect(results[1]?.category).toBe("Транспорт");
    expect(results[2]?.category).toBe(UNCATEGORIZED);
  });

  it("matches via descriptionRegex", () => {
    const rules: CategoryRule[] = [{ category: "Связь", match: { descriptionRegex: "^МТС|Билайн$" } }];

    const results = categorize([tx({ description: "МТС оплата" }), tx({ description: "Абонемент Билайн" })], rules);

    expect(results[0]?.category).toBe("Связь");
    expect(results[1]?.category).toBe("Связь");
  });

  it("applies inclusive amountMin/amountMax bounds against the signed amount", () => {
    const rules: CategoryRule[] = [{ category: "Крупные покупки", match: { amountMin: -5000, amountMax: -1000 } }];

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

  it("excludes income when amountMin is 0 (the signed-amount example from the user's request)", () => {
    const rules: CategoryRule[] = [{ category: "Расходы", match: { amountMin: 0 } }];

    const results = categorize([tx({ amount: 5000, description: "Зарплата" }), tx({ amount: -100 })], rules);

    expect(results[0]?.category).toBe("Расходы");
    expect(results[1]?.category).toBe(UNCATEGORIZED);
  });

  it("supports negative amountMax to match only expenses beyond a threshold", () => {
    const rules: CategoryRule[] = [{ category: "Крупные траты", match: { amountMax: -1000 } }];

    const results = categorize([tx({ amount: -1500 }), tx({ amount: -500 }), tx({ amount: 2000 })], rules);

    expect(results.map((r) => r.category)).toEqual(["Крупные траты", UNCATEGORIZED, UNCATEGORIZED]);
  });

  it("requires all conditions of a rule to match (AND semantics)", () => {
    const rules: CategoryRule[] = [
      { category: "Дорогие продукты", match: { descriptionContains: ["пятёрочка"], amountMax: -1000 } },
    ];

    const results = categorize(
      [tx({ description: "Пятёрочка", amount: -500 }), tx({ description: "Пятёрочка", amount: -1500 })],
      rules,
    );

    expect(results[0]?.category).toBe(UNCATEGORIZED);
    expect(results[1]?.category).toBe("Дорогие продукты");
  });

  it("falls back to 'Без категории' when no rule matches", () => {
    const [result] = categorize(
      [tx({ description: "Необычная операция" })],
      [{ category: "Еда", match: { descriptionContains: ["кафе"] } }],
    );

    expect(result.category).toBe(UNCATEGORIZED);
  });
});

describe("parseRules", () => {
  it("parses a valid rules file", () => {
    const rules = parseRules(JSON.stringify([{ category: "Еда", match: { descriptionContains: ["кафе"] } }]));

    expect(rules).toEqual([{ category: "Еда", match: { descriptionContains: ["кафе"] } }]);
  });

  it("reports bad JSON with a clear diagnostic and a best-effort rule number", () => {
    const rules = JSON.stringify([
      { category: "Еда", match: { descriptionContains: ["кафе"] } },
      { category: "Транспорт", match: { descriptionContains: ["такси"] } },
    ]);
    const broken = rules.replace('"Транспорт"', "Транспорт");

    expect(() => parseRules(broken)).toThrowError(/Правило 2:.*JSON/s);
  });

  it("requires the top-level value to be an array", () => {
    expect(() => parseRules(JSON.stringify({ category: "Еда" }))).toThrowError(/массив/);
  });

  it("reports the 1-based rule number when a rule is not an object", () => {
    expect(() => parseRules(JSON.stringify(["oops"]))).toThrowError(/Правило 1:/);
  });

  it("reports the 1-based rule number for a missing category", () => {
    expect(() => parseRules(JSON.stringify([{ match: { descriptionContains: ["a"] } }]))).toThrowError(
      /Правило 1:.*category/s,
    );
  });

  it("reports the 1-based rule number for an empty category", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "  ", match: { descriptionContains: ["a"] } }])),
    ).toThrowError(/Правило 1:.*category/s);
  });

  it("reports the 1-based rule number for an unknown top-level field", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", match: { descriptionContains: ["a"] }, extra: true }])),
    ).toThrowError(/Правило 1:.*неизвестное поле.*extra/s);
  });

  it("reports the 1-based rule number for an unknown key inside match", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", match: { description: "кафе" } }])),
    ).toThrowError(/Правило 1:.*неизвестное условие.*description/s);
  });

  it("reports the 1-based rule number for an invalid descriptionContains", () => {
    expect(() =>
      parseRules(
        JSON.stringify([
          { category: "Еда", match: { descriptionContains: ["кафе"] } },
          { category: "Транспорт", match: { descriptionContains: [] } },
        ]),
      ),
    ).toThrowError(/Правило 2:.*descriptionContains/s);
  });

  it("reports the 1-based rule number for an invalid regex", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", match: { descriptionRegex: "(unterminated" } }])),
    ).toThrowError(/Правило 1:.*регулярное выражение/s);
  });

  it("reports the 1-based rule number for a non-numeric amountMin", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", match: { amountMin: "100" } }])),
    ).toThrowError(/Правило 1:.*amountMin/s);
  });

  it("allows negative amountMin/amountMax bounds", () => {
    const rules = parseRules(JSON.stringify([{ category: "Еда", match: { amountMin: -500, amountMax: -100 } }]));

    expect(rules[0]?.match).toEqual({ amountMin: -500, amountMax: -100 });
  });

  it("reports the 1-based rule number when amountMin exceeds amountMax", () => {
    expect(() =>
      parseRules(JSON.stringify([{ category: "Еда", match: { amountMin: 100, amountMax: 10 } }])),
    ).toThrowError(/Правило 1:.*amountMin.*amountMax/s);
  });

  it("reports the 1-based rule number when match has no fields", () => {
    expect(() => parseRules(JSON.stringify([{ category: "Еда", match: {} }]))).toThrowError(
      /Правило 1:.*условие/s,
    );
  });

  it("reports the 1-based rule number when match is missing", () => {
    expect(() => parseRules(JSON.stringify([{ category: "Еда" }]))).toThrowError(/Правило 1:.*match/s);
  });
});
