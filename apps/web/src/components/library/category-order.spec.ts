import { describe, expect, it } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { isCategoryOrder, sortCategories } from "./category-order";

function category(over: Partial<LibraryCategoryDto>): LibraryCategoryDto {
  return {
    id: "c",
    parentId: null,
    slug: "c",
    titleRu: "Рубрика",
    titleEn: "Category",
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 0,
    entriesCount: 0,
    subtreeEntriesCount: 0,
    childrenCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    canEdit: false,
    canMove: false,
    canDelete: false,
    ...over,
  };
}

const philosophy = category({
  id: "1",
  titleRu: "Философия",
  titleEn: "Ancient wisdom",
  position: 2,
  createdAt: "2026-03-01T00:00:00.000Z",
});
const yolka = category({
  id: "2",
  titleRu: "Ёлка",
  titleEn: "Fir tree",
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const music = category({
  id: "3",
  titleRu: "Музыка",
  titleEn: "Music",
  position: 1,
  createdAt: "2026-05-01T00:00:00.000Z",
});

const all = [philosophy, yolka, music];

function ids(list: LibraryCategoryDto[]) {
  return list.map((item) => item.id);
}

describe("sortCategories", () => {
  it("свой порядок — тот, что выставлен перетаскиванием", () => {
    expect(ids(sortCategories(all, "own", "ru"))).toEqual(["2", "3", "1"]);
  });

  it("по алфавиту — по показанному названию, а не по русскому всегда", () => {
    // Ёлка, Музыка, Философия.
    expect(ids(sortCategories(all, "alpha", "ru"))).toEqual(["2", "3", "1"]);
    // Те же три рубрики по-английски: Ancient wisdom, Fir tree, Music —
    // порядок другой, потому что название другое.
    expect(ids(sortCategories(all, "alpha", "en"))).toEqual(["1", "2", "3"]);
  });

  it("«ё» стоит рядом с «е», а не в конце по коду символа", () => {
    const fir = category({ id: "e", titleRu: "Ель", position: 9 });
    const yajna = category({ id: "ya", titleRu: "Ягья", position: 0 });
    expect(ids(sortCategories([yajna, yolka, fir], "alpha", "ru"))).toEqual([
      "2",
      "e",
      "ya",
    ]);
  });

  it("по дате — сначала новые", () => {
    expect(ids(sortCategories(all, "new", "ru"))).toEqual(["3", "1", "2"]);
  });

  it("одинаковая дата не даёт случайный порядок", () => {
    const a = category({ id: "a", position: 1, createdAt: "2026-01-01T00:00:00.000Z" });
    const b = category({ id: "b", position: 0, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(ids(sortCategories([a, b], "new", "ru"))).toEqual(["b", "a"]);
  });

  it("не трогает исходный массив: он приходит с сервера и его читают соседи", () => {
    const source = [...all];
    sortCategories(source, "alpha", "ru");
    expect(ids(source)).toEqual(["1", "2", "3"]);
  });
});

describe("isCategoryOrder", () => {
  it("узнаёт свои значения", () => {
    expect(isCategoryOrder("alpha")).toBe(true);
    expect(isCategoryOrder("own")).toBe(true);
  });

  it("не пускает мусор из localStorage", () => {
    expect(isCategoryOrder("что попало")).toBe(false);
    expect(isCategoryOrder(null)).toBe(false);
    expect(isCategoryOrder(3)).toBe(false);
  });
});
