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
  const node = (
    childrenCount: number,
    entriesCount: number,
    subtreeEntriesCount: number,
  ) => ({ childrenCount, entriesCount, subtreeEntriesCount });

  it("у листа — только его материалы, без оговорок", () => {
    expect(categoryPageSummary("ru", node(0, 12, 12), true)).toBe(
      "12 материалов",
    );
  });

  it("у раздела с подразделами число материалов названо чужим", () => {
    // Ровно тот случай, из-за которого правка: своих материалов ноль, а
    // «3 материала» над лентой читались как «здесь три».
    expect(categoryPageSummary("ru", node(4, 0, 3), true)).toBe(
      "4 подраздела · 3 материала включая подразделы",
    );
  });

  it("выключенные вложенные показывают собственный ноль честно", () => {
    expect(categoryPageSummary("ru", node(4, 0, 3), false)).toBe(
      "4 подраздела · 0 материалов в самой рубрике",
    );
  });

  it("склонения не разъезжаются на единице", () => {
    expect(categoryPageSummary("ru", node(1, 1, 1), false)).toBe(
      "1 подраздел · 1 материал в самой рубрике",
    );
  });

  it("по-английски единственное число тоже не ломается", () => {
    expect(categoryPageSummary("en", node(1, 1, 1), false)).toBe(
      "1 subsection · 1 material in this category only",
    );
  });
});
