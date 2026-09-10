import { describe, expect, it } from "vitest";
import {
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

  it("не умалчивает о неразобранных позициях", () => {
    expect(reasonSummary([reason("Желатин")], 3)).toContain("3 позиций");
  });

  it("на полностью разобранном чистом составе говорит об этом прямо", () => {
    expect(reasonSummary([], 0)).toBe("Состав разобран полностью");
  });
});
