import { describe, expect, it } from "vitest";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

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
