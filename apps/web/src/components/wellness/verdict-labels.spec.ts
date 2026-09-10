import { describe, expect, it } from "vitest";
import {
  basketHeadline,
  hasSomethingToJudge,
  ingredientClassLabel,
  reasonSummary,
  verdictLook,
} from "./verdict-labels";

const ALL = ["clean", "warning", "forbidden", "unknown"] as const;

describe("verdictLook", () => {
  it("у каждого исхода есть слово и значок, а не только цвет", () => {
    for (const verdict of ALL) {
      const look = verdictLook(verdict);
      expect(look.label.length).toBeGreaterThan(2);
      expect(look.glyph).toBeTruthy();
    }
  });

  it("акцент задаётся именем токена, а не шестнадцатеричным цветом", () => {
    for (const verdict of ALL) {
      expect(verdictLook(verdict).accent).not.toMatch(/^#/);
    }
  });

  it("«неизвестно» не выдаёт себя за «подходит»", () => {
    expect(verdictLook("unknown").label).not.toBe(verdictLook("clean").label);
  });
});

describe("ingredientClassLabel", () => {
  it("переводит класс на человеческий язык", () => {
    expect(ingredientClassLabel("rennet")).toBe("Сычужный фермент");
    expect(ingredientClassLabel("onion")).toBe("Лук");
  });
});

describe("reasonSummary", () => {
  const reason = (name: string) => ({ ingredient: { name } });

  it("перечисляет найденное", () => {
    expect(reasonSummary([reason("Желатин"), reason("Кармин")], 0)).toBe(
      "Желатин, Кармин",
    );
  });

  it("не умалчивает о позициях без ясного ответа", () => {
    expect(reasonSummary([reason("Желатин")], 3)).toContain(
      "3 позиций состава без ясного ответа",
    );
  });

  it("на полностью разобранном чистом составе говорит об этом прямо", () => {
    expect(reasonSummary([], 0)).toBe("Состав разобран полностью");
  });
});

describe("hasSomethingToJudge", () => {
  const empty = { reasons: [], unrecognized: [] };

  it("штрихкод без продукта судить не о чем", () => {
    expect(
      hasSomethingToJudge({ product: null, ingredientsRaw: null, result: empty }),
    ).toBe(false);
  });

  it("найденный продукт судить есть о чем", () => {
    expect(
      hasSomethingToJudge({ product: { id: "1" }, result: empty }),
    ).toBe(true);
  });

  it("прочитанный со снимка состав тоже", () => {
    expect(
      hasSomethingToJudge({
        product: null,
        ingredientsRaw: "сахар, соль",
        result: empty,
      }),
    ).toBe(true);
  });

  it("и разбор, давший хоть что-то", () => {
    expect(
      hasSomethingToJudge({
        product: null,
        result: { reasons: [], unrecognized: ["камедь"] },
      }),
    ).toBe(true);
  });
});

describe("basketHeadline", () => {
  const of = (o: Partial<Parameters<typeof basketHeadline>[0]>) =>
    basketHeadline({ total: 0, warning: 0, forbidden: 0, unknown: 0, ...o });

  it("пустую корзину называет пустой", () => {
    expect(of({})).toBe("Корзина пуста");
  });

  it("запрет важнее всего остального", () => {
    expect(of({ total: 4, warning: 1, forbidden: 1, unknown: 1 })).toBe(
      "Не подходит: 1 из 4",
    );
  });

  it("без запретов говорит о сомнительном", () => {
    expect(of({ total: 2, warning: 1 })).toBe("Под вопросом: 1 из 2");
  });

  it("не выдаёт неразобранное за благополучие", () => {
    expect(of({ total: 3, unknown: 2 })).toBe("Разобрано не до конца: 2 из 3");
  });

  it("и только на чистой корзине радуется", () => {
    expect(of({ total: 2 })).toBe("Всё подходит: 2");
  });
});
