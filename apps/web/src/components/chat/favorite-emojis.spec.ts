import { describe, expect, it } from "vitest";
import { CHAT_FAVORITE_EMOJI_MAX } from "@vedamatch/shared";
import { parseFavoriteEmojis, toggleFavoriteEmoji } from "./favorite-emojis";

describe("parseFavoriteEmojis (VED-123)", () => {
  it("своего набора нет — null, показываем набор по умолчанию", () => {
    expect(parseFavoriteEmojis(null)).toBeNull();
  });

  it("мусор в хранилище читается как «набора нет»", () => {
    expect(parseFavoriteEmojis("{не json")).toBeNull();
    expect(parseFavoriteEmojis('{"a":1}')).toBeNull();
  });

  it("пустой свой набор — это выбор человека, а не отсутствие набора", () => {
    expect(parseFavoriteEmojis("[]")).toEqual([]);
  });

  it("выбрасывает не-строки и держит предел", () => {
    const many = Array.from({ length: CHAT_FAVORITE_EMOJI_MAX + 5 }, (_, i) =>
      String.fromCodePoint(0x1f600 + i),
    );
    expect(parseFavoriteEmojis('["🙏",7,"",null,"🌸"]')).toEqual(["🙏", "🌸"]);
    expect(parseFavoriteEmojis(JSON.stringify(many))).toHaveLength(
      CHAT_FAVORITE_EMOJI_MAX,
    );
  });
});

describe("toggleFavoriteEmoji", () => {
  it("добавляет в конец и убирает повторным нажатием", () => {
    expect(toggleFavoriteEmoji(["🙏"], "🌸")).toEqual(["🙏", "🌸"]);
    expect(toggleFavoriteEmoji(["🙏", "🌸"], "🙏")).toEqual(["🌸"]);
  });

  it("полный набор новых не принимает и старые не выталкивает", () => {
    const full = Array.from({ length: CHAT_FAVORITE_EMOJI_MAX }, (_, i) =>
      String.fromCodePoint(0x1f600 + i),
    );
    expect(toggleFavoriteEmoji(full, "🙏")).toEqual(full);
  });
});
