import { describe, expect, it } from "vitest";
import { ARTIST_VIEW_KEY, CATALOG_VIEW_KEY, parseTrackView } from "./track-view";

describe("parseTrackView", () => {
  it("сохранённый выбор уважает", () => {
    expect(parseTrackView("list", "grid")).toBe("list");
    expect(parseTrackView("grid", "list")).toBe("grid");
  });

  it("пустое и незнакомое — умолчание страницы", () => {
    expect(parseTrackView(null, "grid")).toBe("grid");
    expect(parseTrackView(undefined, "list")).toBe("list");
    expect(parseTrackView("tiles", "list")).toBe("list");
  });

  it("у витрины и исполнителя разные ключи", () => {
    // Умолчания разные: витрина — плитки, исполнитель — строки.
    expect(CATALOG_VIEW_KEY).not.toBe(ARTIST_VIEW_KEY);
    // Ключ витрины прежний: выбор, сделанный до VED-390, не теряется.
    expect(CATALOG_VIEW_KEY).toBe("vm.music.view");
  });
});
