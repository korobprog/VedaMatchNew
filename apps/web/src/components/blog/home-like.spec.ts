import { describe, expect, it } from "vitest";
import { homeLikeOf, toggleHomeLike } from "./home-like";

describe("«Нравится» в панели Блог-ленты на главной (VED-586)", () => {
  const post = { id: "p1", liked: false, likeCount: 3 };

  it("без своей отметки — отметка поста", () => {
    expect(homeLikeOf(post, {})).toEqual({ liked: false, likeCount: 3 });
  });

  it("своя отметка важнее пришедшей с постом", () => {
    expect(homeLikeOf(post, { p1: { liked: true, likeCount: 4 } })).toEqual({
      liked: true,
      likeCount: 4,
    });
    expect(homeLikeOf(post, { p2: { liked: true, likeCount: 9 } })).toEqual({
      liked: false,
      likeCount: 3,
    });
  });

  it("поставить и снять — число на единицу, не ниже нуля", () => {
    expect(toggleHomeLike({ liked: false, likeCount: 3 })).toEqual({
      liked: true,
      likeCount: 4,
    });
    expect(toggleHomeLike({ liked: true, likeCount: 4 })).toEqual({
      liked: false,
      likeCount: 3,
    });
    expect(toggleHomeLike({ liked: true, likeCount: 0 })).toEqual({
      liked: false,
      likeCount: 0,
    });
  });
});
