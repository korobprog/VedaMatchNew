import { describe, expect, it } from "vitest";
import {
  TOUR_CHAPTERS,
  parseTourWatched,
  TOUR_MEDIA_BASE,
  pickTourVideo,
  tourChapterIndex,
  tourHelpChapter,
} from "./tour";

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

describe("pickTourVideo", () => {
  const both = {
    desktopUrl: "d.mp4",
    mobileUrl: "m.mp4",
    posterUrl: "d.jpg",
    mobilePosterUrl: "m.jpg",
  };

  it("версия под экран — со своей обложкой", () => {
    expect(pickTourVideo(both, true)).toEqual({
      url: "m.mp4",
      vertical: true,
      poster: "m.jpg",
    });
    expect(pickTourVideo(both, false)).toEqual({
      url: "d.mp4",
      vertical: false,
      poster: "d.jpg",
    });
  });

  it("нет своей — другая, с её ориентацией и обложкой", () => {
    expect(pickTourVideo({ ...both, mobileUrl: null }, true)).toEqual({
      url: "d.mp4",
      vertical: false,
      poster: "d.jpg",
    });
  });

  it("нет вертикальной обложки — горизонтальная", () => {
    expect(
      pickTourVideo({ ...both, mobilePosterUrl: null }, true)?.poster,
    ).toBe("d.jpg");
  });

  it("нет никакого видео — null", () => {
    expect(
      pickTourVideo({ ...both, desktopUrl: null, mobileUrl: null }, true),
    ).toBeNull();
  });
});

describe("tourHelpChapter", () => {
  it("значок «?» — у Знакомств, у остальных нет", () => {
    expect(tourHelpChapter("union")?.id).toBe("union");
    expect(tourHelpChapter("market")).toBeNull();
    expect(tourHelpChapter("chat")).toBeNull();
  });
});

/* VED-653: видео Знакомств и обложки под версию. */
describe("глава «Знакомства»", () => {
  const union = TOUR_CHAPTERS.find((chapter) => chapter.id === "union")!;

  it("обе версии видео и обложки лежат в папке тура на media", () => {
    const { desktopUrl, mobileUrl, posterUrl, mobilePosterUrl } = union.video;
    for (const url of [desktopUrl, mobileUrl, posterUrl, mobilePosterUrl]) {
      expect(url?.startsWith(`${TOUR_MEDIA_BASE}/`)).toBe(true);
    }
    expect(desktopUrl).toMatch(/16x9\.mp4$/);
    expect(mobileUrl).toMatch(/9x16\.mp4$/);
  });

  it("есть рекламный текст и подпись для ссылки", () => {
    expect(union.promo?.text.length).toBeGreaterThan(80);
    expect(union.promo?.share.length).toBeGreaterThan(20);
  });

  it("у глав без видео нет рекламы — звать смотреть заглушку незачем", () => {
    for (const chapter of TOUR_CHAPTERS) {
      if (!chapter.video.desktopUrl && !chapter.video.mobileUrl) {
        expect(chapter.promo).toBeUndefined();
      }
    }
  });
});
