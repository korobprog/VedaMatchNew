import { describe, expect, it } from "vitest";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { mergeTrackCategories, splitTrackCategories } from "./track-categories";

const category = (
  id: string,
  kind: MusicCategoryDto["kind"],
) => ({ id, slug: id, title: id, position: 0, kind, trackCount: 0 }) as MusicCategoryDto;

const categories = [
  category("root-trad", "root"),
  category("root-modern", "root"),
  category("style-kirtan", "style"),
  category("style-mantra", "style"),
];

describe("splitTrackCategories", () => {
  it("разводит корневую и стиль по видам", () => {
    expect(
      splitTrackCategories(["root-trad", "style-mantra"], categories),
    ).toEqual({ rootId: "root-trad", styleId: "style-mantra" });
  });

  it("без корневой отдаёт пустую строку — не 'не выбрано' через null", () => {
    expect(splitTrackCategories(["style-kirtan"], categories)).toEqual({
      rootId: "",
      styleId: "style-kirtan",
    });
  });

  it("пустой набор — обе пустые", () => {
    expect(splitTrackCategories([], categories)).toEqual({
      rootId: "",
      styleId: "",
    });
  });

  it("неизвестный id в наборе не роняет разбор", () => {
    expect(
      splitTrackCategories(["gone", "style-kirtan"], categories),
    ).toEqual({ rootId: "", styleId: "style-kirtan" });
  });

  it("порядок в categoryIds не важен — root и style видны сами по себе", () => {
    expect(
      splitTrackCategories(["style-mantra", "root-modern"], categories),
    ).toEqual({ rootId: "root-modern", styleId: "style-mantra" });
  });
});

describe("mergeTrackCategories", () => {
  it("собирает оба id в массив", () => {
    expect(mergeTrackCategories("root-trad", "style-mantra")).toEqual([
      "root-trad",
      "style-mantra",
    ]);
  });

  it("пустые строки не попадают в массив", () => {
    expect(mergeTrackCategories("root-trad", "")).toEqual(["root-trad"]);
    expect(mergeTrackCategories("", "")).toEqual([]);
  });
});
