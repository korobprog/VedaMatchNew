import { describe, expect, it } from "vitest";
import { TOUR_CHAPTERS, parseTourWatched, tourChapterIndex } from "./tour";

/* VED-651: «Познакомиться с проектом» — туториал с видео. */
describe("TOUR_CHAPTERS", () => {
  it("у глав разные якоря, текст и ссылка внутри портала", () => {
    const ids = TOUR_CHAPTERS.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of TOUR_CHAPTERS) {
      expect(chapter.text.length).toBeGreaterThan(20);
      expect(chapter.cta.href.startsWith("/")).toBe(true);
    }
  });
});

describe("tourChapterIndex", () => {
  it("находит главу по якорю", () => {
    expect(tourChapterIndex("#union", TOUR_CHAPTERS)).toBe(
      TOUR_CHAPTERS.findIndex((chapter) => chapter.id === "union"),
    );
  });

  it("пустой или чужой якорь — первая глава", () => {
    expect(tourChapterIndex("", TOUR_CHAPTERS)).toBe(0);
    expect(tourChapterIndex("#nope", TOUR_CHAPTERS)).toBe(0);
  });
});

describe("parseTourWatched", () => {
  it("оставляет только известные главы", () => {
    expect(
      parseTourWatched(JSON.stringify(["union", "nope", 5]), TOUR_CHAPTERS),
    ).toEqual(["union"]);
  });

  it("мусор и пустота — пустой список", () => {
    expect(parseTourWatched(null, TOUR_CHAPTERS)).toEqual([]);
    expect(parseTourWatched("{oops", TOUR_CHAPTERS)).toEqual([]);
    expect(parseTourWatched('{"a":1}', TOUR_CHAPTERS)).toEqual([]);
  });
});
