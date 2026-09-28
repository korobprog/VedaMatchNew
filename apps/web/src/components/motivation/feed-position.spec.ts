import { describe, expect, it } from "vitest";
import {
  feedEnding,
  feedPositionBody,
  feedStartHref,
  isSameFeedHref,
} from "./feed-position";

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

describe("isSameFeedHref", () => {
  it("тот же адрес при другом порядке и кодировке параметров", () => {
    expect(
      isSameFeedHref(
        "/motivation?category=filosofiya-2&tab=cards",
        "/motivation?tab=cards&category=filosofiya-2",
      ),
    ).toBe(true);
    expect(
      isSameFeedHref(
        "/motivation?work=%D0%93%D0%B8%D1%82%D0%B0",
        "/motivation?work=Гита",
      ),
    ).toBe(true);
    expect(isSameFeedHref("/motivation/", "/motivation")).toBe(true);
  });

  it("лента с места остановки или с поста — другой адрес", () => {
    expect(
      isSameFeedHref(
        "/motivation?category=filosofiya-2&resume=1",
        "/motivation?category=filosofiya-2",
      ),
    ).toBe(false);
    expect(
      isSameFeedHref(
        "/motivation?category=filosofiya-2&from=p",
        "/motivation?category=filosofiya-2",
      ),
    ).toBe(false);
    expect(
      isSameFeedHref("/motivation?tab=cards", "/motivation?category=a"),
    ).toBe(false);
  });
});

describe("feedStartHref", () => {
  it("оставляет вкладку, папку, фильтры и порядок, но снимает сдвиг начала", () => {
    expect(
      feedStartHref(
        "/motivation?tab=cards&category=guru&work=Гита&order=random&resume=1",
      ),
    ).toBe(
      "/motivation?tab=cards&category=guru&work=%D0%93%D0%B8%D1%82%D0%B0&order=random",
    );
    expect(feedStartHref("/motivation?post=abc")).toBe("/motivation");
    expect(feedStartHref("/motivation?category=guru&from=abc")).toBe(
      "/motivation?category=guru",
    );
  });

  it("у ленты без сдвига начало — тот же адрес", () => {
    const current = "/motivation?tab=video&category=guru";
    expect(isSameFeedHref(current, feedStartHref(current))).toBe(true);
    expect(feedStartHref("/motivation")).toBe("/motivation");
  });
});
