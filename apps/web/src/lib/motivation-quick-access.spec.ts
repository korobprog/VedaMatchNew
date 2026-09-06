import { describe, expect, it } from "vitest";
import type { MotivationFeedResponse, MotivationPostDto } from "@vedamatch/shared";
import {
  QUOTE_MAX_LENGTH,
  buildMotivationQuickAccess,
  clampQuote,
} from "./motivation-quick-access";

const post = (over: Partial<MotivationPostDto> = {}): MotivationPostDto => ({
  id: "p1",
  slug: "gita-4-18",
  contentDate: "2026-09-06",
  profileType: "devotee",
  audienceTrack: "vaishnava",
  category: "wisdom",
  categoryTitle: "Мудрость",
  imageUrl: "",
  storyImageUrl: "",
  videoUrl: "",
  videoHasSound: false,
  title: "О действии",
  text: "Тот, кто видит бездействие в действии и действие в бездействии, разумен среди людей.",
  storyText: "",
  attributionKind: "exact_quote",
  attributionSpeaker: "Кришна",
  attributionWork: "Бхагавад-гита",
  attributionLocator: "4.18",
  attributionSourceUrl: null,
  sourceVerified: true,
  publishedAt: "2026-09-06T05:00:00.000Z",
  isFavorite: false,
  isViewed: false,
  likeCount: 0,
  isLiked: false,
  origin: "editorial",
  author: null,
  isOwn: false,
  feedTier: "fresh",
  ...over,
});

const feed = (items: MotivationPostDto[]): MotivationFeedResponse => ({
  items,
  nextCursor: null,
});

describe("buildMotivationQuickAccess", () => {
  it("пустая лента или упавший сервис — слота нет", () => {
    expect(buildMotivationQuickAccess(null)).toEqual({ quote: null, freshMore: 0 });
    expect(buildMotivationQuickAccess(feed([]))).toEqual({ quote: null, freshMore: 0 });
  });

  it("берёт первый пост ленты: подпись — произведение и место", () => {
    const data = buildMotivationQuickAccess(feed([post()]));
    expect(data.quote).toEqual({
      slug: "gita-4-18",
      text: "Тот, кто видит бездействие в действии и действие в бездействии, разумен среди людей.",
      attribution: "Бхагавад-гита 4.18",
    });
  });

  it("без произведения подписывает говорящим, без всего — ничем", () => {
    expect(
      buildMotivationQuickAccess(
        feed([post({ attributionWork: null, attributionLocator: null })]),
      ).quote?.attribution,
    ).toBe("Кришна");
    expect(
      buildMotivationQuickAccess(
        feed([
          post({
            attributionWork: null,
            attributionLocator: null,
            attributionSpeaker: null,
          }),
        ]),
      ).quote?.attribution,
    ).toBeNull();
  });

  it("считает свежие после показанного и не считает архив", () => {
    const data = buildMotivationQuickAccess(
      feed([
        post({ id: "1" }),
        post({ id: "2", feedTier: "fresh" }),
        post({ id: "3", feedTier: "fresh" }),
        post({ id: "4", feedTier: "unseen" }),
        post({ id: "5", feedTier: "seen" }),
      ]),
    );
    expect(data.freshMore).toBe(2);
  });

  it("повтор тоже годится в цитату, когда свежего нет", () => {
    const data = buildMotivationQuickAccess(feed([post({ feedTier: "seen" })]));
    expect(data.quote?.slug).toBe("gita-4-18");
    expect(data.freshMore).toBe(0);
  });
});

describe("clampQuote", () => {
  it("короткий текст не трогает, лишние пробелы схлопывает", () => {
    expect(clampQuote("  Мир   вам  ")).toBe("Мир вам");
  });

  it("длинный режет по слову и ставит многоточие", () => {
    const long = Array.from({ length: 40 }, (_, i) => `слово${i}`).join(" ");
    const result = clampQuote(long);
    expect(result.length).toBeLessThanOrEqual(QUOTE_MAX_LENGTH + 1);
    expect(result.endsWith("…")).toBe(true);
    // Последнее слово целое: перед многоточием нет обрубка.
    const words = result.slice(0, -1).split(" ");
    expect(long.split(" ")).toContain(words[words.length - 1]);
  });

  it("не оставляет запятую перед многоточием", () => {
    const text = `${"а".repeat(130)}, ${"б".repeat(30)}`;
    expect(clampQuote(text)).toBe(`${"а".repeat(130)}…`);
  });
});
