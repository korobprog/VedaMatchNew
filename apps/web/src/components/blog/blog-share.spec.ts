import { describe, expect, it, vi } from "vitest";
import { blogPostShareUrl, shareBlogPost } from "./blog-share";

const origin = "https://vedamatch.ru";

describe("«Поделиться» постом Блог-ленты (VED-442)", () => {
  it("ссылка — на страницу самого поста", () => {
    expect(blogPostShareUrl(origin, "a b")).toBe(
      "https://vedamatch.ru/blog/posts/a%20b",
    );
  });

  it("есть системное окно — отдаёт ему заголовок и ссылку", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();
    await expect(
      shareBlogPost({ id: "p1", title: "Заголовок" }, origin, { share, copy }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Заголовок",
      url: "https://vedamatch.ru/blog/posts/p1",
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it("без заголовка — название ленты", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await shareBlogPost({ id: "p1", title: null }, origin, {
      share,
      copy: vi.fn(),
    });
    expect(share.mock.calls[0][0].title).toBe("Блог-лента VedaMatch");
  });

  it("окно закрыли — не ошибка и не копирование", async () => {
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    const copy = vi.fn();
    await expect(
      shareBlogPost({ id: "p1" }, origin, {
        share: vi.fn().mockRejectedValue(abort),
        copy,
      }),
    ).resolves.toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });

  it("окна нет или оно отказало — ссылка в буфер", async () => {
    const copy = vi.fn().mockResolvedValue(true);
    await expect(shareBlogPost({ id: "p1" }, origin, { copy })).resolves.toBe(
      "copied",
    );
    const denied = Object.assign(new Error("no"), { name: "NotAllowedError" });
    await expect(
      shareBlogPost({ id: "p1" }, origin, {
        share: vi.fn().mockRejectedValue(denied),
        copy,
      }),
    ).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith("https://vedamatch.ru/blog/posts/p1");
    await expect(
      shareBlogPost({ id: "p1" }, origin, {
        copy: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toBe("failed");
  });
});
