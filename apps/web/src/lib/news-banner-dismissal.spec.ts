import { describe, expect, it } from "vitest";
import { isNewsDismissed, readNewsDismissal } from "./news-banner-dismissal";

describe("readNewsDismissal", () => {
  it("пустое хранилище — ничего не скрыто", () => {
    expect(readNewsDismissal(null)).toBeNull();
    expect(readNewsDismissal("")).toBeNull();
    expect(readNewsDismissal("   ")).toBeNull();
  });

  it("возвращает сохранённый id", () => {
    expect(readNewsDismissal("news-1")).toBe("news-1");
  });
});

describe("isNewsDismissed", () => {
  it("скрыта ровно та новость, которую закрыли", () => {
    expect(isNewsDismissed("news-1", "news-1")).toBe(true);
  });

  it("следующая новость показывается, хотя предыдущую закрыли", () => {
    // Ради этого хранится id, а не флаг «закрыто».
    expect(isNewsDismissed("news-1", "news-2")).toBe(false);
  });

  it("без записи в хранилище ничего не скрыто", () => {
    expect(isNewsDismissed(null, "news-1")).toBe(false);
  });

  it("пустой id новости не считается скрытым", () => {
    expect(isNewsDismissed("", "")).toBe(false);
  });
});
