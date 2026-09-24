import { describe, expect, it } from "vitest";
import { feedEnding, feedPositionBody } from "./feed-position";

describe("feedPositionBody", () => {
  it("запоминает ленту раздела, источника и автора", () => {
    expect(
      feedPositionBody({ tab: "forYou", category: "filosofiya-2" }, "p"),
    ).toEqual({
      post: "p",
      style: "art",
      category: "filosofiya-2",
    });
    expect(
      feedPositionBody({ tab: "cards", category: "filosofiya-2" }, "p"),
    ).toEqual({
      post: "p",
      style: "cards",
      category: "filosofiya-2",
    });
    expect(
      feedPositionBody({ tab: "forYou", work: " Бхагавад-гита " }, "p"),
    ).toEqual({
      post: "p",
      style: "art",
      work: "Бхагавад-гита",
    });
    expect(
      feedPositionBody({ tab: "forYou", speaker: "Прабхупада" }, "p"),
    ).toMatchObject({
      speaker: "Прабхупада",
    });
  });

  it("личную ленту, избранное и «Вперемешку» не запоминает", () => {
    expect(feedPositionBody({ tab: "forYou" }, "p")).toBeNull();
    expect(feedPositionBody({ tab: "cards" }, "p")).toBeNull();
    expect(
      feedPositionBody({ tab: "saved", category: "vedy" }, "p"),
    ).toBeNull();
    expect(
      feedPositionBody(
        { tab: "forYou", category: "vedy", order: "random" },
        "p",
      ),
    ).toBeNull();
  });

  it("источник вперемешку всё равно идёт по стихам — его помним", () => {
    expect(
      feedPositionBody(
        { tab: "forYou", work: "Бхагавад-гита", order: "random" },
        "p",
      ),
    ).toMatchObject({ work: "Бхагавад-гита" });
  });
});

describe("feedEnding", () => {
  const categories = [{ slug: "filosofiya-2", title: "Мудрость мира" }];

  it("раздел: все открытки или картинки и ссылка на начало без resume", () => {
    expect(
      feedEnding({ tab: "cards", category: "filosofiya-2" }, categories),
    ).toEqual({
      title: "Вы посмотрели все открытки раздела «Мудрость мира»",
      restartHref: "/motivation?tab=cards&category=filosofiya-2",
    });
    expect(
      feedEnding({ tab: "forYou", category: "filosofiya-2" }, categories),
    ).toEqual({
      title: "Вы посмотрели все картинки раздела «Мудрость мира»",
      restartHref: "/motivation?category=filosofiya-2",
    });
  });

  it("источник и автор называются по имени", () => {
    expect(
      feedEnding({ tab: "forYou", work: "Бхагавад-гита" }, categories),
    ).toEqual({
      title: "Вы посмотрели все картинки источника «Бхагавад-гита»",
      restartHref:
        "/motivation?work=%D0%91%D1%85%D0%B0%D0%B3%D0%B0%D0%B2%D0%B0%D0%B4-%D0%B3%D0%B8%D1%82%D0%B0",
    });
    expect(
      feedEnding({ tab: "forYou", speaker: "Прабхупада" }, categories).title,
    ).toBe("Вы посмотрели все картинки автора «Прабхупада»");
  });

  it("неизвестная папка — без названия, но с началом", () => {
    expect(
      feedEnding({ tab: "forYou", category: "gone" }, categories),
    ).toMatchObject({
      title: "Вы посмотрели все картинки раздела",
      restartHref: "/motivation?category=gone",
    });
  });

  it("личная лента и избранное — прежний финал без «сначала»", () => {
    expect(feedEnding({ tab: "forYou" }, categories)).toEqual({
      title: "На сегодня это всё",
      restartHref: null,
    });
    expect(feedEnding({ tab: "saved" }, categories)).toEqual({
      title: "Это всё избранное",
      restartHref: null,
    });
  });
});
