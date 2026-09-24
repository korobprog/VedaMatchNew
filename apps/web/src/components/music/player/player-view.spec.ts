import { describe, expect, it } from "vitest";
import {
  parsePlayerView,
  reservedPlayerSpace,
  serializePlayerView,
  type PlayerView,
} from "./player-view";

describe("parsePlayerView", () => {
  it("читает прежнюю отметку свёрнутости", () => {
    // До VED-366 ключ хранил «1»/«0» — свёрнутые остаются свёрнутыми.
    expect(parsePlayerView("1")).toBe("collapsed");
    expect(parsePlayerView("0")).toBe("expanded");
  });

  it("читает пузырь", () => {
    expect(parsePlayerView("bubble")).toBe("bubble");
  });

  it("незнакомое и пустое — развёрнутая полоса", () => {
    expect(parsePlayerView(null)).toBe("expanded");
    expect(parsePlayerView(undefined)).toBe("expanded");
    expect(parsePlayerView("true")).toBe("expanded");
  });

  it("сохранённое читается обратно тем же", () => {
    for (const view of ["expanded", "collapsed", "bubble"] as PlayerView[]) {
      expect(parsePlayerView(serializePlayerView(view))).toBe(view);
    }
  });
});

describe("reservedPlayerSpace", () => {
  it("от верха полосы до низа окна, с округлением вверх", () => {
    // Полоса 162 точки у самого низа окна 780: верх на 618.
    expect(reservedPlayerSpace("expanded", 618, 780)).toBe(162);
    expect(reservedPlayerSpace("collapsed", 731.4, 780)).toBe(49);
  });

  it("поднятая полоса занимает и зазор под собой", () => {
    // Подъём 72: верх полосы выше на 72, место растёт на столько же.
    expect(reservedPlayerSpace("expanded", 546, 780)).toBe(234);
  });

  it("пузырь места не занимает", () => {
    expect(reservedPlayerSpace("bubble", 700, 780)).toBe(0);
  });

  it("мусор в замере не даёт отрицательного или бесконечного отступа", () => {
    expect(reservedPlayerSpace("expanded", 900, 780)).toBe(0);
    expect(reservedPlayerSpace("expanded", Number.NaN, 780)).toBe(0);
  });
});
