import { describe, expect, it } from "vitest";
import {
  categoryOrderHref,
  isAlphabeticalOrder,
  sortCategoriesForView,
} from "./category-order";

const authors = [
  { titleRu: "Торсунов Олег", titleEn: null },
  { titleRu: "ари Мардан Прабху", titleEn: "Ari Mardan" },
  { titleRu: "Ананда Вардахна", titleEn: null },
  { titleRu: "Глава 10", titleEn: null },
  { titleRu: "Глава 2", titleEn: null },
];

describe("sortCategoriesForView (VED-573)", () => {
  it("«Свой порядок» оставляет порядок админа как есть", () => {
    expect(sortCategoriesForView(authors, "ru", false)).toBe(authors);
  });

  it("«По алфавиту» — по имени без учёта регистра, числа по значению", () => {
    expect(
      sortCategoriesForView(authors, "ru", true).map((a) => a.titleRu),
    ).toEqual([
      "Ананда Вардахна",
      "ари Мардан Прабху",
      "Глава 2",
      "Глава 10",
      "Торсунов Олег",
    ]);
  });

  it("не меняет исходный массив", () => {
    const copy = [...authors];
    sortCategoriesForView(authors, "ru", true);
    expect(authors).toEqual(copy);
  });

  it("на английском сортирует по английскому имени, где оно есть", () => {
    const sorted = sortCategoriesForView(
      [
        { titleRu: "Б", titleEn: "Zeta" },
        { titleRu: "Я", titleEn: "Alpha" },
      ],
      "en",
      true,
    );
    expect(sorted.map((a) => a.titleEn)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("categoryOrderHref", () => {
  it("«По алфавиту» пишет ?order=alpha и сохраняет прочие параметры", () => {
    expect(
      categoryOrderHref(
        "/library/propovedniki",
        new URLSearchParams("type=video"),
        true,
      ),
    ).toBe("/library/propovedniki?type=video&order=alpha");
  });

  it("«Свой порядок» убирает параметр", () => {
    expect(
      categoryOrderHref(
        "/library/propovedniki",
        new URLSearchParams("order=alpha"),
        false,
      ),
    ).toBe("/library/propovedniki");
  });

  it("isAlphabeticalOrder узнаёт только alpha", () => {
    expect(isAlphabeticalOrder("alpha")).toBe(true);
    expect(isAlphabeticalOrder(undefined)).toBe(false);
    expect(isAlphabeticalOrder(["alpha"])).toBe(false);
  });
});
