import { describe, expect, it } from "vitest";
import {
  BLOG_HOME_DEFAULT_VISIBLE,
  parseBlogHomeVisible,
  resolveBlogHomeVisible,
  serializeBlogHomeVisible,
} from "./blog-home-visibility";

const USER = "user-1";

describe("parseBlogHomeVisible", () => {
  it("reads both states back", () => {
    expect(
      parseBlogHomeVisible(serializeBlogHomeVisible(USER, false), USER),
    ).toBe(false);
    expect(
      parseBlogHomeVisible(serializeBlogHomeVisible(USER, true), USER),
    ).toBe(true);
  });

  // На общем устройстве второй человек не должен получить чужую настройку.
  it("ignores a choice made by another person", () => {
    expect(
      parseBlogHomeVisible(serializeBlogHomeVisible("user-2", false), USER),
    ).toBeNull();
  });

  it("returns null for anything unusable", () => {
    expect(parseBlogHomeVisible(undefined, USER)).toBeNull();
    expect(parseBlogHomeVisible("", USER)).toBeNull();
    expect(parseBlogHomeVisible("без разделителя", USER)).toBeNull();
    expect(parseBlogHomeVisible(`${USER}|неизвестно`, USER)).toBeNull();
    expect(parseBlogHomeVisible("%E0%A4%A", USER)).toBeNull();
  });
});

describe("serializeBlogHomeVisible", () => {
  // В значении cookie нельзя пробел, точку с запятой и запятую — именно их
  // и убирает кодирование, а разделитель `|` уезжает в %7C.
  it("is safe to put into a cookie value", () => {
    const value = serializeBlogHomeVisible("id с пробелом", false);
    expect(value).not.toMatch(/[\s;,]/);
    expect(parseBlogHomeVisible(value, "id с пробелом")).toBe(false);
  });
});

describe("resolveBlogHomeVisible", () => {
  // Человек, который ничего не трогал, видит ленту: карточка VED-238 просит
  // её именно наверху главной.
  it("falls back to the default when nothing was chosen", () => {
    expect(resolveBlogHomeVisible(undefined, USER)).toBe(
      BLOG_HOME_DEFAULT_VISIBLE,
    );
  });

  it("honours an explicit choice", () => {
    expect(
      resolveBlogHomeVisible(serializeBlogHomeVisible(USER, false), USER),
    ).toBe(false);
  });
});
