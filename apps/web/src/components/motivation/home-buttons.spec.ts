import { describe, expect, it } from "vitest";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import {
  categoryCardsHref,
  categoryOptions,
  resolveHomeButtons,
  sourceOptions,
} from "./home-buttons";

const category = (
  title: string,
  slug: string,
  counts: { art?: number; cards?: number } = {},
): MotivationCategoryDto => ({
  id: slug,
  slug,
  title,
  sortOrder: 0,
  isDefault: false,
  parentId: null,
  postCount: (counts.art ?? 0) + (counts.cards ?? 0),
  feed: "both",
  artCount: counts.art ?? 0,
  cardsCount: counts.cards ?? 0,
});

const wisdom = category("Мудрость мира", "filosofiya-2", { art: 3, cards: 25 });
const vedy = category("Веды", "vedy", { art: 9, cards: 2 });

describe("resolveHomeButtons", () => {
  it("по умолчанию — Гита и открытки «Мудрости мира»", () => {
    const buttons = resolveHomeButtons(null, [vedy, wisdom]);

    expect(buttons.source).toEqual({
      href: "/motivation?work=%D0%91%D1%85%D0%B0%D0%B3%D0%B0%D0%B2%D0%B0%D0%B4-%D0%B3%D0%B8%D1%82%D0%B0",
      title: "Бхагавад-гита",
      custom: false,
    });
    expect(buttons.cards).toEqual({
      href: "/motivation?tab=cards&category=filosofiya-2",
      title: "Мудрость мира",
      custom: false,
    });
  });

  // Умолчание — по слагу: переименование папки его не ломает.
  it("находит папку по умолчанию по слагу, а не по названию", () => {
    const renamed = { ...wisdom, title: "Мудрость народов" };
    expect(resolveHomeButtons(null, [renamed]).cards?.title).toBe(
      "Мудрость народов",
    );
  });

  it("берёт выбор участника", () => {
    const buttons = resolveHomeButtons(
      { homeSourceWork: "Шримад-Бхагаватам", homeCategorySlug: "vedy" },
      [vedy, wisdom],
    );

    expect(buttons.source.title).toBe("Шримад-Бхагаватам");
    expect(buttons.source.custom).toBe(true);
    expect(buttons.source.href).toContain("work=");
    expect(buttons.cards).toMatchObject({
      href: "/motivation?tab=cards&category=vedy",
      title: "Веды",
      custom: true,
    });
  });

  it("удалённая папка участника — снова умолчание", () => {
    const buttons = resolveHomeButtons({ homeCategorySlug: "gone" }, [wisdom]);
    expect(buttons.cards).toMatchObject({ title: "Мудрость мира", custom: false });
  });

  it("нет ни выбранной, ни умолчательной папки — второй кнопки нет", () => {
    expect(resolveHomeButtons(null, [vedy]).cards).toBeNull();
    expect(resolveHomeButtons(null, null).cards).toBeNull();
  });
});

describe("categoryCardsHref", () => {
  it("папка без открыток, но с афоризмами — в «Ленту» той же папки", () => {
    expect(categoryCardsHref(category("Практика", "praktika", { art: 4 }))).toBe(
      "/motivation?category=praktika",
    );
  });

  it("пустая папка — всё равно в открытки, как просили", () => {
    expect(categoryCardsHref(category("Пусто", "pusto"))).toBe(
      "/motivation?tab=cards&category=pusto",
    );
  });
});

describe("sourceOptions", () => {
  it("первым — умолчание с пустым значением, дальше источники со счётчиком", () => {
    expect(
      sourceOptions([{ label: "Бхагавад-гита", count: 40 }], null),
    ).toEqual([
      { value: "", label: "По умолчанию — Бхагавад-гита" },
      { value: "Бхагавад-гита", label: "Бхагавад-гита (40)" },
    ]);
  });

  it("сохранённый источник, которого нет в списке, не теряется", () => {
    const options = sourceOptions([], "Упанишады");
    expect(options.at(-1)).toEqual({ value: "Упанишады", label: "Упанишады" });
  });
});

describe("categoryOptions", () => {
  it("называет умолчание по нынешнему названию и не предлагает пустых папок", () => {
    const empty = category("Пусто", "pusto");
    const onlyArt = category("Практика", "praktika", { art: 4 });

    expect(categoryOptions([wisdom, empty, onlyArt], null)).toEqual([
      { value: "", label: "По умолчанию — Мудрость мира" },
      { value: "filosofiya-2", label: "Мудрость мира (открыток: 25)" },
      { value: "praktika", label: "Практика (только афоризмы)" },
    ]);
  });

  it("сохранённая папка остаётся в списке, даже если опустела", () => {
    const empty = category("Пусто", "pusto");
    expect(categoryOptions([empty], "pusto").map((o) => o.value)).toEqual([
      "",
      "pusto",
    ]);
  });
});
