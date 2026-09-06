import { describe, expect, it } from "vitest";
import type { LibraryEntryDto, LibraryFeedResponse } from "@vedamatch/shared";
import { buildLibraryQuickAccess } from "./library-quick-access";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const entry = (over: Partial<LibraryEntryDto> = {}): LibraryEntryDto => ({
  id: "e1",
  url: "https://example.org/a",
  domain: "example.org",
  source: null,
  type: "video",
  contentLanguage: "ru",
  titleRu: "Лекция о Гите, часть 3",
  titleEn: null,
  descriptionRu: null,
  descriptionEn: null,
  faviconUrl: null,
  previewUrl: null,
  status: "published",
  usefulCount: 0,
  uniqueClickCount: 0,
  bookmarkCount: 0,
  commentsCount: 0,
  bookmarked: false,
  publishedAt: daysAgo(1),
  categories: [{ id: "c1", slug: "lectures", titleRu: "Лекции и видео", titleEn: "Lectures" }],
  addedBy: null,
  community: null,
  lineage: "iskcon",
  canEdit: false,
  hasCustomPreview: false,
  ...over,
});

const feed = (items: LibraryEntryDto[], nextCursor: string | null = null): LibraryFeedResponse => ({
  items,
  nextCursor,
  total: items.length,
});

describe("buildLibraryQuickAccess", () => {
  it("пустая лента или упавший сервис — слота нет", () => {
    expect(buildLibraryQuickAccess(null, NOW).latest).toBeNull();
    expect(buildLibraryQuickAccess(feed([]), NOW).latest).toBeNull();
  });

  it("берёт верхний материал: заголовок, тип, первая рубрика, свежесть", () => {
    const data = buildLibraryQuickAccess(feed([entry()]), NOW);
    expect(data.latest).toEqual({
      id: "e1",
      title: "Лекция о Гите, часть 3",
      type: "video",
      rubric: "Лекции и видео",
      isFresh: true,
    });
    expect(data.weekCount).toBe(1);
    expect(data.weekCountCapped).toBe(false);
  });

  it("старый материал показывается, но не свежий, и неделя пустая", () => {
    const data = buildLibraryQuickAccess(feed([entry({ publishedAt: daysAgo(30) })]), NOW);
    expect(data.latest?.isFresh).toBe(false);
    expect(data.weekCount).toBe(0);
  });

  it("считает только опубликованное за семь дней", () => {
    const data = buildLibraryQuickAccess(
      feed([
        entry({ id: "1", publishedAt: daysAgo(0) }),
        entry({ id: "2", publishedAt: daysAgo(6) }),
        entry({ id: "3", publishedAt: daysAgo(8) }),
      ]),
      NOW,
    );
    expect(data.weekCount).toBe(2);
  });

  it("вся страница свежая и есть продолжение — счёт с плюсом", () => {
    const page = Array.from({ length: 20 }, (_, i) => entry({ id: String(i) }));
    expect(buildLibraryQuickAccess(feed(page, "next"), NOW).weekCountCapped).toBe(true);
    expect(buildLibraryQuickAccess(feed(page, null), NOW).weekCountCapped).toBe(false);
  });

  it("без русского заголовка берёт английский, потом домен", () => {
    expect(
      buildLibraryQuickAccess(feed([entry({ titleRu: "  ", titleEn: "Gita talk" })]), NOW).latest?.title,
    ).toBe("Gita talk");
    expect(
      buildLibraryQuickAccess(feed([entry({ titleRu: null, titleEn: null })]), NOW).latest?.title,
    ).toBe("example.org");
  });
});
