import { describe, expect, it } from "vitest";
import {
  ADVISOR_LIMIT,
  buildAdvisorCards,
  greetFirst,
  type AdvisorInput,
} from "./advisor-cards";

/** Человек, у которого всё заполнено и ничего не висит: советнику молчать. */
const calm: AdvisorInput = {
  hasHomeLocation: true,
  unionProfilePercent: 100,
  unionIncomingLikes: 0,
  astroPercent: 100,
  astroTodayText: null,
  expiringNotice: null,
  myNoticesTotal: 4,
  silentResponse: null,
  communityCount: 1,
};

const idsOf = (input: Partial<AdvisorInput>, limit = ADVISOR_LIMIT) =>
  buildAdvisorCards({ ...calm, ...input }, limit).map((card) => card.id);

describe("buildAdvisorCards: когда молчать", () => {
  it("у человека без дел и пробелов карточек нет", () => {
    expect(buildAdvisorCards(calm)).toEqual([]);
  });

  it("недоступный источник убирает свою карточку, а не весь советник", () => {
    // Все сервисные сигналы отвалились (null), но город не указан — пробел
    // портального профиля виден и без них.
    expect(
      idsOf({
        hasHomeLocation: false,
        unionProfilePercent: null,
        astroPercent: null,
        myNoticesTotal: null,
        communityCount: null,
      }),
    ).toEqual(["profile-city"]);
  });
});

describe("buildAdvisorCards: порядок", () => {
  it("дело важнее пробела, пробел важнее предложения попробовать", () => {
    const cards = buildAdvisorCards(
      {
        ...calm,
        expiringNotice: { title: "Отдам холодильник", daysLeft: 2 },
        hasHomeLocation: false,
        myNoticesTotal: 0,
        astroTodayText: "Луна в четвёртой бхаве",
      },
      10,
    );
    const tones = cards.map((card) => card.tone);
    expect(tones).toEqual([...tones].sort(byToneRank));
  });

  it("показывает не больше трёх", () => {
    const cards = buildAdvisorCards({
      ...calm,
      expiringNotice: { title: "Отдам холодильник", daysLeft: 1 },
      unionIncomingLikes: 3,
      silentResponse: { noticeTitle: "Нужны руки", daysWaiting: 6 },
      hasHomeLocation: false,
      unionProfilePercent: 40,
      astroPercent: 0,
      communityCount: 0,
    });
    expect(cards).toHaveLength(ADVISOR_LIMIT);
  });

  it("персональный день стоит последним — им заполняют тишину", () => {
    const cards = buildAdvisorCards(
      { ...calm, astroTodayText: "Луна в четвёртой бхаве", myNoticesTotal: 0 },
      10,
    );
    expect(cards[cards.length - 1].id).toBe("astro-today");
  });
});

describe("greetFirst", () => {
  it("называет имя только в первой карточке", () => {
    const cards = greetFirst(
      buildAdvisorCards({ ...calm, unionIncomingLikes: 2, hasHomeLocation: false }),
      "Марина",
    );
    expect(cards[0].text.startsWith("Марина, ")).toBe(true);
    expect(cards.slice(1).some((card) => card.text.includes("Марина"))).toBe(
      false,
    );
  });

  it("гасит заглавную после имени", () => {
    const [first] = greetFirst(
      buildAdvisorCards({ ...calm, hasHomeLocation: false }),
      "Марина",
    );
    expect(first.text).toBe(
      "Марина, без города Объявления и Контакты не покажут, что происходит рядом с вами",
    );
  });

  it("без имени карточка остаётся как есть", () => {
    const [first] = greetFirst(
      buildAdvisorCards({ ...calm, hasHomeLocation: false }),
      "  ",
    );
    expect(first.text.startsWith("Без города")).toBe(true);
  });

  it("не гасит имя собственное в начале карточки", () => {
    // «Сита, джйотиш ничего не рассчитает» — так нельзя.
    const [first] = greetFirst(
      buildAdvisorCards({ ...calm, astroPercent: 0 }),
      "Сита",
    );
    expect(first.text).toBe(
      "Сита, Джйотиш ничего не рассчитает, пока нет точного времени и места рождения",
    );
  });

  it("на пустом списке ничего не выдумывает", () => {
    expect(greetFirst([], "Марина")).toEqual([]);
  });

  it("приветствует ту карточку, что осталась после скрытия верхней", () => {
    // Ради этого приветствие и отделено от сборки: скрытие живёт на клиенте,
    // и вшитое на сервере имя ушло бы вместе с первой карточкой.
    const all = buildAdvisorCards({
      ...calm,
      unionIncomingLikes: 2,
      hasHomeLocation: false,
    });
    const withoutTop = greetFirst(all.slice(1), "Марина");
    expect(withoutTop[0].text.startsWith("Марина, ")).toBe(true);
  });
});

describe("buildAdvisorCards: формулировки", () => {
  it("у истёкшего объявления другой текст, а не «через 0 дней»", () => {
    const [expired] = buildAdvisorCards({
      ...calm,
      expiringNotice: { title: "Отдам холодильник", daysLeft: 0 },
    });
    expect(expired.text).toContain("сняли по сроку");
    expect(expired.actionLabel).toBe("Вернуть");

    const [soon] = buildAdvisorCards({
      ...calm,
      expiringNotice: { title: "Отдам холодильник", daysLeft: 2 },
    });
    expect(soon.text).toContain("через 2 дня");
    expect(soon.actionLabel).toBe("Продлить");
  });

  it("длинный заголовок обрезается, а не ломает строку", () => {
    const [card] = buildAdvisorCards({
      ...calm,
      expiringNotice: {
        title: "Отдам большой двухкамерный холодильник в рабочем состоянии",
        daysLeft: 1,
      },
    });
    expect(card.text).toContain("…»");
    expect(card.text.length).toBeLessThan(100);
  });

  it("идентификаторы не зависят от данных — иначе скрытие слетало бы", () => {
    const one = idsOf({ expiringNotice: { title: "Первое", daysLeft: 1 } });
    const two = idsOf({ expiringNotice: { title: "Второе", daysLeft: 3 } });
    expect(one).toEqual(two);
  });
});

const TONE_RANK = { todo: 0, gap: 1, discover: 2 } as const;
function byToneRank(a: keyof typeof TONE_RANK, b: keyof typeof TONE_RANK) {
  return TONE_RANK[a] - TONE_RANK[b];
}
