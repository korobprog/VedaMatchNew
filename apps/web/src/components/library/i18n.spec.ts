import { describe, expect, it } from "vitest";
import { categoryPageSummary, entryTypeLabel, pickLocalized, t } from "./i18n";

describe("pickLocalized", () => {
  it("prefers the current locale", () => {
    expect(pickLocalized("en", { ru: "Статья", en: "Article" })).toBe("Article");
    expect(pickLocalized("ru", { ru: "Статья", en: "Article" })).toBe("Статья");
  });

  it("falls back to the other language instead of showing nothing", () => {
    expect(pickLocalized("en", { ru: "Статья", en: null })).toBe("Статья");
    expect(pickLocalized("ru", { ru: null, en: "Article" })).toBe("Article");
  });

  it("returns an empty string when both are missing", () => {
    expect(pickLocalized("ru", { ru: null, en: null })).toBe("");
  });
});

describe("t", () => {
  it("returns localized ui strings", () => {
    expect(t("ru", "feed.empty")).toBe("Пока ничего не добавлено");
    expect(t("en", "feed.empty")).toBe("Nothing here yet");
  });

  it("falls back to the key when a translation is missing", () => {
    expect(t("en", "missing.key" as never)).toBe("missing.key");
  });
});

describe("entryTypeLabel", () => {
  it("localizes every entry type", () => {
    expect(entryTypeLabel("ru", "video")).toBe("Видео");
    expect(entryTypeLabel("en", "telegram_channel")).toBe("Telegram channel");
  });
});

describe("categoryPageSummary", () => {
  it("раздел показывает подразделы, а не материалы внутри них", () => {
    // Ровно тот случай, из-за которого правка: своих материалов ноль, во
    // вложенных три, и «3 материала» над лентой читались как «здесь три».
    expect(
      categoryPageSummary("ru", { childrenCount: 4, entriesCount: 0 }),
    ).toBe("4 подраздела");
  });

  it("свои материалы раздела в число не подмешиваются", () => {
    expect(
      categoryPageSummary("ru", { childrenCount: 4, entriesCount: 12 }),
    ).toBe("4 подраздела");
  });

  it("подраздел показывает свои материалы", () => {
    expect(
      categoryPageSummary("ru", { childrenCount: 0, entriesCount: 12 }),
    ).toBe("12 материалов");
  });

  it("склонения не разъезжаются на единице", () => {
    expect(
      categoryPageSummary("ru", { childrenCount: 1, entriesCount: 0 }),
    ).toBe("1 подраздел");
    expect(
      categoryPageSummary("ru", { childrenCount: 0, entriesCount: 1 }),
    ).toBe("1 материал");
  });

  it("и на одиннадцати, где правило склонения другое", () => {
    expect(
      categoryPageSummary("ru", { childrenCount: 11, entriesCount: 0 }),
    ).toBe("11 подразделов");
  });

  it("по-английски единственное число тоже не ломается", () => {
    expect(
      categoryPageSummary("en", { childrenCount: 1, entriesCount: 0 }),
    ).toBe("1 subsection");
  });
});
