import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEADER_ITEMS,
  HEADER_OWN_ITEMS,
  MAX_HEADER_BUTTONS,
  headerButtonCount,
  headerCatalog,
  headerToggleBlock,
  headerToggleNote,
  moveHeaderItem,
  parseHeaderToolbar,
  resolveHeaderToolbar,
  serializeHeaderToolbar,
  toggleHeaderItem,
} from "./header-toolbar";
import type { QuickActionMeta } from "./quick-actions";

const known = new Set([
  "menu",
  "history",
  "search",
  "player",
  "bookmarks",
  "service:music",
  "custom:/work/planner",
]);

describe("header toolbar", () => {
  it("по умолчанию — звёздочка, колокольчик, аватар и самым правым «Меню»", () => {
    expect(DEFAULT_HEADER_ITEMS).toEqual(["hotkeys", "bell", "avatar", "menu"]);
    expect(parseHeaderToolbar(null)).toEqual(DEFAULT_HEADER_ITEMS);
  });

  it("истории в шапке по умолчанию больше нет (VED-412)", () => {
    expect(DEFAULT_HEADER_ITEMS).not.toContain("history");
  });

  it("сломанная или чужая запись даёт умолчание", () => {
    expect(parseHeaderToolbar("{")).toEqual(DEFAULT_HEADER_ITEMS);
    expect(parseHeaderToolbar('{"v":99,"ids":["search"]}')).toEqual(
      DEFAULT_HEADER_ITEMS,
    );
    expect(parseHeaderToolbar('["search"]')).toEqual(DEFAULT_HEADER_ITEMS);
  });

  it("запись переживает сохранение и чтение без потерь", () => {
    const ids = ["search", "bell", "hotkeys", "avatar", "menu"];
    expect(parseHeaderToolbar(serializeHeaderToolbar(ids))).toEqual(ids);
  });

  it("разбор убирает дубли и нестроки", () => {
    expect(
      parseHeaderToolbar('{"v":1,"ids":["menu","menu",3,"bell","avatar"]}'),
    ).toEqual(["menu", "bell", "avatar"]);
  });

  describe("resolveHeaderToolbar", () => {
    it("пропускает исчезнувшие кнопки", () => {
      expect(
        resolveHeaderToolbar(
          ["hotkeys", "custom:/gone", "bell", "avatar", "menu"],
          known,
        ),
      ).toEqual(["hotkeys", "bell", "avatar", "menu"]);
    });

    it("возвращает колокольчик и аватар, если их нет в записи, — перед последним «Меню»", () => {
      expect(resolveHeaderToolbar(["hotkeys", "menu"], known)).toEqual([
        "hotkeys",
        "bell",
        "avatar",
        "menu",
      ]);
      expect(resolveHeaderToolbar(["menu", "search"], known)).toEqual([
        "menu",
        "search",
        "bell",
        "avatar",
      ]);
    });

    it("без звёздочки и «Меню» разом не остаётся", () => {
      expect(resolveHeaderToolbar(["search", "bell", "avatar"], known)).toEqual([
        "hotkeys",
        "search",
        "bell",
        "avatar",
      ]);
    });

    it("не больше четырёх настраиваемых кнопок", () => {
      const resolved = resolveHeaderToolbar(
        ["search", "history", "player", "bookmarks", "bell", "avatar", "menu"],
        known,
      );
      expect(headerButtonCount(resolved)).toBe(MAX_HEADER_BUTTONS);
      expect(resolved).toEqual([
        "hotkeys",
        "search",
        "history",
        "player",
        "bell",
        "avatar",
      ]);
    });
  });

  describe("toggleHeaderItem", () => {
    it("новая кнопка встаёт левее колокольчика", () => {
      expect(toggleHeaderItem(DEFAULT_HEADER_ITEMS, "search")).toEqual([
        "hotkeys",
        "search",
        "bell",
        "avatar",
        "menu",
      ]);
    });

    it("звёздочку и «Меню» можно убрать по одной (VED-412)", () => {
      const withoutStar = toggleHeaderItem(DEFAULT_HEADER_ITEMS, "hotkeys");
      expect(withoutStar).toEqual(["bell", "avatar", "menu"]);
      const withoutMenu = toggleHeaderItem(DEFAULT_HEADER_ITEMS, "menu");
      expect(withoutMenu).toEqual(["hotkeys", "bell", "avatar"]);
    });

    it("последнюю из звёздочки и «Меню» не убрать", () => {
      const ids = ["bell", "avatar", "menu"];
      expect(headerToggleBlock(ids, "menu")).toBe("last-entry");
      expect(toggleHeaderItem(ids, "menu")).toEqual(ids);
    });

    it("колокольчик и аватар закреплены", () => {
      expect(headerToggleBlock(DEFAULT_HEADER_ITEMS, "bell")).toBe("fixed");
      expect(toggleHeaderItem(DEFAULT_HEADER_ITEMS, "avatar")).toEqual(
        DEFAULT_HEADER_ITEMS,
      );
    });

    it("пятую кнопку не поставить, пока не уберёшь одну", () => {
      const full = ["hotkeys", "search", "history", "bell", "avatar", "menu"];
      expect(headerToggleBlock(full, "player")).toBe("full");
      expect(toggleHeaderItem(full, "player")).toEqual(full);
      expect(headerToggleBlock(full, "search")).toBeNull();
    });

    it("у каждого запрета есть объяснение", () => {
      expect(headerToggleNote("fixed")).toBe("Всегда в шапке");
      expect(headerToggleNote("last-entry")).toMatch(/звёздочка или «Меню»/);
      expect(headerToggleNote("full")).toMatch(/уже 4 кнопки/);
      expect(headerToggleNote(null)).toBeNull();
    });
  });

  describe("moveHeaderItem", () => {
    it("«Меню» проходит мимо аватара и колокольчика влево", () => {
      let ids = [...DEFAULT_HEADER_ITEMS];
      ids = moveHeaderItem(ids, "menu", -1);
      ids = moveHeaderItem(ids, "menu", -1);
      expect(ids).toEqual(["hotkeys", "menu", "bell", "avatar"]);
    });

    it("колокольчик и аватар сами не двигаются, за края не выходим", () => {
      expect(moveHeaderItem(DEFAULT_HEADER_ITEMS, "bell", -1)).toEqual(
        DEFAULT_HEADER_ITEMS,
      );
      expect(moveHeaderItem(DEFAULT_HEADER_ITEMS, "hotkeys", -1)).toEqual(
        DEFAULT_HEADER_ITEMS,
      );
      expect(moveHeaderItem(DEFAULT_HEADER_ITEMS, "menu", 1)).toEqual(
        DEFAULT_HEADER_ITEMS,
      );
    });
  });

  it("каталог шапки — свои строки и все горячие кнопки", () => {
    const quick: QuickActionMeta[] = [
      { id: "search", kind: "builtin", label: "Поиск", hint: "", href: "/search" },
    ];
    expect(headerCatalog(quick).map((meta) => meta.id)).toEqual([
      ...HEADER_OWN_ITEMS.map((meta) => meta.id),
      "search",
    ]);
  });
});
