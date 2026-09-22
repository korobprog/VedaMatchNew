import { describe, expect, it } from "vitest";
import type { BlogPostDto } from "@vedamatch/shared";
import { buildBlogPostCopy, postLink } from "./blog-copy";

function makePost(overrides: Partial<BlogPostDto> = {}): BlogPostDto {
  return {
    id: "post-1",
    author: { id: "u1", name: "Бхавани Даяни", avatarUrl: null },
    title: "Праздник в храме",
    text: "Приходите в субботу к шести.",
    images: [],
    createdAt: "2026-09-21T12:00:00.000Z",
    feedUntil: null,
    inFeed: true,
    pinned: false,
    repostCount: 0,
    repostOf: null,
    canManage: false,
    canModerate: false,
    ...overrides,
  };
}

describe("buildBlogPostCopy", () => {
  it("copies author, title and text", () => {
    expect(buildBlogPostCopy(makePost())).toBe(
      "Бхавани Даяни\nПраздник в храме\nПриходите в субботу к шести.",
    );
  });

  it("skips a missing title", () => {
    expect(buildBlogPostCopy(makePost({ title: null }))).toBe(
      "Бхавани Даяни\nПриходите в субботу к шести.",
    );
  });

  // Копируется содержание, а не адрес: ссылка идёт последней строкой, чтобы
  // не мешать прочитать сам текст.
  it("appends the link last when the portal address is known", () => {
    const copy = buildBlogPostCopy(makePost(), {
      origin: "https://vedamatch.ru/",
    });
    expect(copy.split("\n\n").at(-1)).toBe(
      "https://vedamatch.ru/blog?post=post-1",
    );
  });

  it("omits the link when the portal address is unknown", () => {
    expect(buildBlogPostCopy(makePost(), { origin: "  " })).not.toContain(
      "http",
    );
  });

  // Оригинал первым: именно он и есть содержание, комментарий — приписка.
  it("puts the reposted original above the reposter's words", () => {
    const copy = buildBlogPostCopy(
      makePost({
        id: "post-2",
        author: { id: "u2", name: "Кешава", avatarUrl: null },
        title: null,
        text: "Обязательно приходите!",
        repostOf: {
          id: "post-1",
          author: { id: "u1", name: "Бхавани Даяни", avatarUrl: null },
          title: "Праздник в храме",
          text: "Приходите в субботу к шести.",
          images: [],
          createdAt: "2026-09-21T12:00:00.000Z",
        },
      }),
    );
    expect(copy).toBe(
      "Бхавани Даяни\nПраздник в храме\nПриходите в субботу к шести." +
        "\n\nрепост: Кешава\nОбязательно приходите!",
    );
  });

  // Репост без своих слов не должен оставлять в буфере голое имя.
  it("drops an empty repost comment", () => {
    const copy = buildBlogPostCopy(
      makePost({
        author: { id: "u2", name: "Кешава", avatarUrl: null },
        title: null,
        text: "   ",
        repostOf: {
          id: "post-1",
          author: { id: "u1", name: "Бхавани Даяни", avatarUrl: null },
          title: null,
          text: "Приходите.",
          images: [],
          createdAt: "2026-09-21T12:00:00.000Z",
        },
      }),
    );
    expect(copy).toBe("Бхавани Даяни\nПриходите.");
  });

  // Картиночный пост: копировать нечего, и одно имя в буфере только мешает.
  it("returns nothing for a picture-only post without a link", () => {
    expect(buildBlogPostCopy(makePost({ title: null, text: "" }))).toBe("");
  });
});

describe("postLink", () => {
  it("points at the full feed with the post opened", () => {
    expect(postLink({ id: "a b" }, "https://vedamatch.ru")).toBe(
      "https://vedamatch.ru/blog?post=a%20b",
    );
  });

  it("trims a trailing slash", () => {
    expect(postLink({ id: "x" }, "https://vedamatch.ru/")).toBe(
      "https://vedamatch.ru/blog?post=x",
    );
  });

  it("returns null without an origin", () => {
    expect(postLink({ id: "x" }, null)).toBeNull();
    expect(postLink({ id: "x" }, undefined)).toBeNull();
    expect(postLink({ id: "x" }, "")).toBeNull();
  });
});
