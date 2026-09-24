import { describe, expect, it } from "vitest";
import type { BlogMediaDto, BlogPostDto } from "@vedamatch/shared";
import {
  BLOG_MEDIA_MAX_ASPECT,
  BLOG_MEDIA_MIN_ASPECT,
  blogHomeSlide,
  blogMediaAspect,
  formatBlogDuration,
  postMedia,
} from "./blog-media-list";

function media(over: Partial<BlogMediaDto> = {}): BlogMediaDto {
  return {
    id: "m1",
    kind: "photo",
    url: "https://cdn/p.webp",
    width: 1000,
    height: 1000,
    posterUrl: null,
    durationSec: null,
    ...over,
  };
}

function post(over: Partial<BlogPostDto> = {}): BlogPostDto {
  return {
    id: "p1",
    author: { id: "u1", name: "Автор", avatarUrl: null },
    title: "Заголовок",
    text: "Текст поста",
    images: [],
    media: [],
    createdAt: "2026-09-21T10:00:00.000Z",
    editedAt: null,
    feedUntil: null,
    inFeed: true,
    pinned: false,
    repostCount: 0,
    repostOf: null,
    canEdit: false,
    canManage: false,
    canModerate: false,
    favorited: false,
    ...over,
  };
}

describe("blogMediaAspect", () => {
  it("keeps the picture's own proportion inside the bounds", () => {
    expect(blogMediaAspect(media({ width: 1600, height: 1200 }))).toBeCloseTo(4 / 3);
  });

  // Вертикальный снимок с телефона не вытягивает рамку в два экрана.
  it("clamps very tall and very wide pictures", () => {
    expect(blogMediaAspect(media({ width: 1080, height: 2400 }))).toBe(BLOG_MEDIA_MIN_ASPECT);
    expect(blogMediaAspect(media({ width: 4000, height: 1000 }))).toBe(BLOG_MEDIA_MAX_ASPECT);
  });

  it("falls back to a square when the size is unknown", () => {
    expect(blogMediaAspect(media({ width: null, height: null }))).toBe(1);
    expect(blogMediaAspect(null)).toBe(1);
  });
});

describe("formatBlogDuration", () => {
  it("formats like a player", () => {
    expect(formatBlogDuration(7)).toBe("0:07");
    expect(formatBlogDuration(245)).toBe("4:05");
    expect(formatBlogDuration(3723)).toBe("1:02:03");
  });

  it("says nothing about an unknown duration", () => {
    expect(formatBlogDuration(null)).toBeNull();
    expect(formatBlogDuration(0)).toBeNull();
  });
});

describe("postMedia", () => {
  // Старый API без `media` не должен опустошать ленту во время выкладки.
  it("builds photos from images when media is missing", () => {
    const old = { images: [{ id: "i", url: "u", width: 1, height: 2 }] };
    expect(postMedia(old)).toEqual([
      { id: "i", url: "u", width: 1, height: 2, kind: "photo", posterUrl: null, durationSec: null },
    ]);
  });
});

describe("blogHomeSlide", () => {
  // Чек-лист: на главной — картинка и заголовок, без автора.
  it("shows the picture and the title, nothing about the author", () => {
    const slide = blogHomeSlide(post({ media: [media()] }));
    expect(slide).toMatchObject({ title: "Заголовок", coverUrl: "https://cdn/p.webp" });
    expect(JSON.stringify(slide)).not.toContain("Автор");
  });

  it("uses the poster for a video", () => {
    const slide = blogHomeSlide(
      post({ media: [media({ kind: "video", url: "v.mp4", posterUrl: "v.webp" })] }),
    );
    expect(slide).toMatchObject({ coverUrl: "v.webp", isVideo: true });
  });

  it("shows the original of a repost", () => {
    const source = { ...post({ id: "src", title: "Оригинал", media: [media()] }) };
    const slide = blogHomeSlide(post({ id: "r", title: null, text: "", repostOf: source }));
    expect(slide).toMatchObject({ id: "r", title: "Оригинал", coverUrl: "https://cdn/p.webp" });
  });

  // Пост из одних слов: слова в рамке, и одно и то же дважды не пишется.
  it("does not repeat the words of a text-only post", () => {
    expect(blogHomeSlide(post({ title: null, text: "Только слова" }))).toMatchObject({
      coverUrl: null,
      frameText: "Только слова",
      title: null,
    });
    expect(blogHomeSlide(post({ title: "Тема", text: "Слова" }))).toMatchObject({
      frameText: "Слова",
      title: "Тема",
    });
  });

  it("captions a photo without a title with the start of the text", () => {
    const slide = blogHomeSlide(post({ title: null, text: "а".repeat(200), media: [media()] }));
    expect(slide.title?.endsWith("…")).toBe(true);
    expect(slide.title!.length).toBeLessThanOrEqual(81);
  });
});
