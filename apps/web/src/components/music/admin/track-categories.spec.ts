import { describe, expect, it } from "vitest";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { styleCategoryId } from "./track-categories";

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

describe("styleCategoryId", () => {
  it("находит стилевой id среди тегов записи", () => {
    expect(styleCategoryId(["style-mantra"], categories)).toBe("style-mantra");
  });

  it("пустой набор — пустая строка, не 'не выбрано' через null", () => {
    expect(styleCategoryId([], categories)).toBe("");
  });

  it("только корневая (данные до VED-165-2) — стиля нет, пустая строка", () => {
    expect(styleCategoryId(["root-trad"], categories)).toBe("");
  });

  it("неизвестный id в наборе не роняет разбор", () => {
    expect(styleCategoryId(["gone", "style-kirtan"], categories)).toBe(
      "style-kirtan",
    );
  });

  it("корневая и стиль одновременно (старые данные) — берёт стилевой, игнорируя корневой", () => {
    expect(styleCategoryId(["root-modern", "style-mantra"], categories)).toBe(
      "style-mantra",
    );
  });

  it("два стилевых тега — берёт первый по порядку в массиве", () => {
    expect(
      styleCategoryId(["style-mantra", "style-kirtan"], categories),
    ).toBe("style-mantra");
  });
});
