import { describe, expect, it } from "vitest";
import {
  nextScrollTop,
  sameScrollButtonsVisibility,
  scrollButtonsVisibility,
  type ScrollMetrics,
} from "./scroll-nav";

function metrics(over: Partial<ScrollMetrics>): ScrollMetrics {
  return { scrollTop: 0, scrollHeight: 5000, clientHeight: 800, ...over };
}

describe("scrollButtonsVisibility (VED-265)", () => {
  it("в середине ленты видны все четыре кнопки", () => {
    expect(scrollButtonsVisibility(metrics({ scrollTop: 2000 }))).toEqual({
      toTop: true,
      upTenth: true,
      downTenth: true,
      toBottom: true,
    });
  });

  it("в самом верху прячет «вверх до конца» и «на десятую вверх»", () => {
    expect(scrollButtonsVisibility(metrics({ scrollTop: 0 }))).toEqual({
      toTop: false,
      upTenth: false,
      downTenth: true,
      toBottom: true,
    });
  });

  it("в самом низу прячет «вниз до конца» и «на десятую вниз»", () => {
    // scrollHeight(5000) - clientHeight(800) = maxScroll 4200
    expect(scrollButtonsVisibility(metrics({ scrollTop: 4200 }))).toEqual({
      toTop: true,
      upTenth: true,
      downTenth: false,
      toBottom: false,
    });
  });

  it("терпит дробные пиксели у края (зум, масштаб)", () => {
    expect(
      scrollButtonsVisibility(metrics({ scrollTop: 0.4 })).toTop,
    ).toBe(false);
    expect(
      scrollButtonsVisibility(metrics({ scrollTop: 4199.6 })).toBottom,
    ).toBe(false);
  });

  it("короткая страница без прокрутки не показывает ни одной кнопки", () => {
    expect(
      scrollButtonsVisibility(
        metrics({ scrollTop: 0, scrollHeight: 600, clientHeight: 800 }),
      ),
    ).toEqual({
      toTop: false,
      upTenth: false,
      downTenth: false,
      toBottom: false,
    });
  });
});

describe("sameScrollButtonsVisibility (VED-265, круг 2)", () => {
  const middle = scrollButtonsVisibility(metrics({ scrollTop: 2000 }));

  it("одинаковые снимки — совпадают, даже разными объектами", () => {
    const copy = { ...middle };
    expect(sameScrollButtonsVisibility(middle, copy)).toBe(true);
    expect(copy).not.toBe(middle); // разные ссылки — сравнение всё равно по полям
  });

  it("различие хотя бы в одном поле — не совпадают", () => {
    expect(
      sameScrollButtonsVisibility(middle, { ...middle, toTop: !middle.toTop }),
    ).toBe(false);
    expect(
      sameScrollButtonsVisibility(middle, {
        ...middle,
        downTenth: !middle.downTenth,
      }),
    ).toBe(false);
  });

  it("переход через край — видимость меняется, сравнение это ловит", () => {
    const top = scrollButtonsVisibility(metrics({ scrollTop: 0 }));
    expect(sameScrollButtonsVisibility(middle, top)).toBe(false);
  });
});

describe("nextScrollTop (VED-265)", () => {
  const full = metrics({ scrollTop: 2000 }); // maxScroll = 4200

  it("«в начало» и «в конец» — это 0 и maxScrollTop", () => {
    expect(nextScrollTop(full, "top")).toBe(0);
    expect(nextScrollTop(full, "bottom")).toBe(4200);
  });

  it("«на одну десятую» шагает от всей прокручиваемой длины, не от экрана", () => {
    // 4200 / 10 = 420 — ровно десять нажатий подряд проходят весь путь.
    expect(nextScrollTop(full, "down-tenth")).toBe(2420);
    expect(nextScrollTop(full, "up-tenth")).toBe(1580);
  });

  it("не выходит за границы у самого края", () => {
    expect(nextScrollTop(metrics({ scrollTop: 100 }), "up-tenth")).toBe(0);
    expect(
      nextScrollTop(metrics({ scrollTop: 4100 }), "down-tenth"),
    ).toBe(4200);
  });

  it("ровно десять шагов «на десятую вниз» доходят до самого низа", () => {
    let top = 0;
    const m = metrics({});
    for (let i = 0; i < 10; i += 1) {
      top = nextScrollTop({ ...m, scrollTop: top }, "down-tenth");
    }
    expect(top).toBe(4200);
  });
});
