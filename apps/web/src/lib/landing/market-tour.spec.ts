import { describe, expect, it } from "vitest";
import type { MarketListingSummary } from "@vedamatch/shared";
import {
  MARKET_DEMO_CARDS,
  MARKET_SHOWCASE_LIMIT,
  MARKET_TOUR_START,
  formatShowcasePrice,
  isListingOpen,
  isMarketPressing,
  marketCaption,
  nextMarketState,
  showcaseCards,
} from "./market-tour";

const объявление = (over: Partial<MarketListingSummary> = {}) =>
  ({
    id: "l1",
    kind: "product",
    titleRu: "Бусы из натуральных камней",
    titleEn: null,
    price: { mode: "fixed", minor: 290000, maxMinor: null, currency: "rub" },
    condition: "new_item",
    serviceFormat: null,
    status: "published",
    primaryImageUrl: "https://s3.example/one.webp",
    city: "Хабаровск",
    country: null,
    favoritesCount: 0,
    publishedAt: "2026-08-27T02:01:12.304Z",
    shop: { id: "s1", slug: "shop", name: "CrystalManjari", logoUrl: null },
    favorited: false,
    available: true,
    canEdit: false,
    ...over,
  }) as MarketListingSummary;

describe("машина фаз", () => {
  it("проходит круг и переходит к следующему объявлению", () => {
    let state = MARKET_TOUR_START;
    const фазы = [state.phase];
    for (let i = 0; i < 4; i++) {
      state = nextMarketState(state, 3);
      фазы.push(state.phase);
    }

    expect(фазы).toEqual([
      "browsing",
      "press",
      "opened",
      "closing",
      "browsing",
    ]);
    expect(state.index).toBe(1);
  });

  it("после последнего возвращается к первому", () => {
    const state = nextMarketState({ index: 2, phase: "closing" }, 3);

    expect(state).toEqual({ index: 0, phase: "browsing" });
  });

  it("на пустом списке не уходит в отрицательный индекс", () => {
    // Деление по модулю нуля даёт NaN, и палец уехал бы в никуда.
    expect(nextMarketState({ index: 0, phase: "closing" }, 0)).toEqual({
      index: 0,
      phase: "browsing",
    });
  });

  it("нажатие и раскрытие — разные фазы", () => {
    expect(isMarketPressing("press")).toBe(true);
    expect(isMarketPressing("opened")).toBe(false);
    expect(isListingOpen("opened")).toBe(true);
    expect(isListingOpen("browsing")).toBe(false);
  });

  it("подпись меняется вместе с экраном", () => {
    expect(marketCaption("browsing")).toContain("Витрина");
    expect(marketCaption("opened")).toContain("карточке");
  });
});

describe("цена", () => {
  it("переводит минорные единицы и ставит знак валюты", () => {
    expect(
      formatShowcasePrice({ mode: "fixed", minor: 290000, currency: "rub" }),
    ).toBe("2\u202f900\u00a0₽");
  });

  it("разряды не разрывают строку", () => {
    // Обычный пробел переносит «29 000 ₽» пополам в узкой карточке.
    const цена = formatShowcasePrice({
      mode: "fixed",
      minor: 1234500,
      currency: "rub",
    });

    expect(цена).toBe("12\u202f345\u00a0₽");
    // Обычного пробела в цене нет вовсе — только неразрывные.
    expect(цена).not.toMatch(/ /);
  });

  it("знает бесплатное и договорное", () => {
    expect(
      formatShowcasePrice({ mode: "free", minor: null, currency: "rub" }),
    ).toBe("Даром");
    expect(
      formatShowcasePrice({ mode: "negotiable", minor: null, currency: "rub" }),
    ).toBe("Договорная");
  });

  it("знает валюты, кроме рубля", () => {
    expect(
      formatShowcasePrice({ mode: "fixed", minor: 1000, currency: "usd" }),
    ).toBe("10\u00a0$");
    expect(
      formatShowcasePrice({ mode: "fixed", minor: 5000, currency: "xyz" }),
    ).toBe("50\u00a0XYZ");
  });
});

describe("что показываем", () => {
  it("берёт настоящие объявления площадки", () => {
    // Витрина с выдуманными товарами не отвечает на вопрос «работает ли он».
    const cards = showcaseCards([объявление()]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Бусы из натуральных камней",
      price: "2\u202f900\u00a0₽",
      city: "Хабаровск",
      shopName: "CrystalManjari",
      demo: false,
    });
  });

  it("падает на запасные, когда площадка пуста или API молчит", () => {
    // Страница сервиса обязана открыться и без API — пустая рамка выглядит
    // хуже, чем отсутствие витрины.
    expect(showcaseCards([])).toBe(MARKET_DEMO_CARDS);
    expect(showcaseCards(null)).toBe(MARKET_DEMO_CARDS);
    expect(showcaseCards(undefined)).toBe(MARKET_DEMO_CARDS);
  });

  it("запасные помечены — обещать по ним живой товар нельзя", () => {
    expect(MARKET_DEMO_CARDS.every((card) => card.demo)).toBe(true);
  });

  it("объявление без названия не берём", () => {
    // Заголовок необязателен в обоих языках; карточка без него пуста.
    const cards = showcaseCards([объявление({ titleRu: null, titleEn: null })]);

    expect(cards).toBe(MARKET_DEMO_CARDS);
  });

  it("берёт английское название, когда русского нет", () => {
    const cards = showcaseCards([
      объявление({ titleRu: null, titleEn: "Tulasi mala" }),
    ]);

    expect(cards[0].title).toBe("Tulasi mala");
  });

  it("не берёт больше, чем помещается в макет", () => {
    // В рамке два ряда по две плитки. Пятая обрезалась бы, а палец уехал бы
    // к ней за нижний край экрана.
    const много = Array.from({ length: 12 }, (_, i) =>
      объявление({ id: `l${i}` }),
    );

    expect(MARKET_SHOWCASE_LIMIT).toBe(4);
    expect(showcaseCards(много)).toHaveLength(MARKET_SHOWCASE_LIMIT);
  });
});
