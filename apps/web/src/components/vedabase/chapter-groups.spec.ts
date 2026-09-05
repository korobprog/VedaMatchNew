import { describe, expect, it } from "vitest";
import {
  chapterGroupLabel,
  groupChapters,
  parseChapterGroup,
} from "./chapter-groups";

function chapter(slug: string, order: number, title = `Глава ${slug}`) {
  return { slug, title, order, file: `${slug}.json` };
}

describe("parseChapterGroup", () => {
  it("читает песнь и главу из слага", () => {
    expect(parseChapterGroup("1-14")).toEqual({ group: 1, chapter: 14 });
    expect(parseChapterGroup("10-90")).toEqual({ group: 10, chapter: 90 });
  });

  it("книга без песней: слаг — просто номер главы", () => {
    expect(parseChapterGroup("7")).toBeNull();
  });

  it("не выдумывает группу из чужого слага", () => {
    expect(parseChapterGroup("preface")).toBeNull();
    expect(parseChapterGroup("1-2-3")).toBeNull();
    expect(parseChapterGroup("0-5")).toBeNull();
    expect(parseChapterGroup("")).toBeNull();
  });
});

describe("chapterGroupLabel", () => {
  it("у Чайтанья-чаритамриты это лилы", () => {
    expect(chapterGroupLabel("chaitanya-charitamrita", 1)).toBe("Ади-лила");
    expect(chapterGroupLabel("chaitanya-charitamrita", 2)).toBe("Мадхья-лила");
    expect(chapterGroupLabel("chaitanya-charitamrita", 3)).toBe("Антья-лила");
  });

  it("у Бхагаватам — песни", () => {
    expect(chapterGroupLabel("srimad-bhagavatam", 10)).toBe("Песнь 10");
  });

  it("на незнакомой книге не падает", () => {
    expect(chapterGroupLabel("nectar-devotion", 2)).toBe("Часть 2");
    expect(chapterGroupLabel("chaitanya-charitamrita", 9)).toBe("Лила 9");
  });
});

describe("groupChapters", () => {
  it("собирает главы по песням в порядке чтения", () => {
    const groups = groupChapters("srimad-bhagavatam", [
      chapter("2-1", 3),
      chapter("1-1", 1),
      chapter("1-2", 2),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Песнь 1", "Песнь 2"]);
    expect(groups[0].chapters.map((item) => item.slug)).toEqual(["1-1", "1-2"]);
  });

  it("книга без песней остаётся одним списком без названия", () => {
    const groups = groupChapters("bhagavad-gita", [
      chapter("2", 2),
      chapter("1", 1),
    ]);

    // Один способ отрисовки на все книги, а не два.
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].chapters.map((item) => item.slug)).toEqual(["1", "2"]);
  });

  it("предисловие остаётся наверху, а не прячется в первую песнь", () => {
    const groups = groupChapters("srimad-bhagavatam", [
      chapter("preface", 0, "Предисловие"),
      chapter("1-1", 1),
    ]);

    // Оно и правда идёт до первой песни.
    expect(groups[0].label).toBeNull();
    expect(groups[0].chapters.map((item) => item.title)).toEqual([
      "Предисловие",
    ]);
    expect(groups[1].label).toBe("Песнь 1");
  });

  it("не теряет и не двоит главы", () => {
    const chapters = [
      chapter("1-1", 1),
      chapter("1-2", 2),
      chapter("3-1", 3),
      chapter("preface", 0),
    ];

    const flattened = groupChapters("srimad-bhagavatam", chapters).flatMap(
      (group) => group.chapters,
    );

    expect(flattened).toHaveLength(chapters.length);
    expect(new Set(flattened.map((item) => item.slug)).size).toBe(
      chapters.length,
    );
  });

  it("не трогает исходный список: он приходит из манифеста", () => {
    const chapters = [chapter("2-1", 2), chapter("1-1", 1)];
    groupChapters("srimad-bhagavatam", chapters);

    expect(chapters.map((item) => item.slug)).toEqual(["2-1", "1-1"]);
  });
});
