import { describe, expect, it } from "vitest";
import { scrollDeltaToCenter } from "./scroll-to-message";

describe("scrollDeltaToCenter", () => {
  it("сообщение выше окна ленты — прокрутка вверх, значит отрицательная", () => {
    expect(
      scrollDeltaToCenter({
        laneTop: 100,
        laneHeight: 400,
        targetTop: -800,
        targetHeight: 60,
      }),
    ).toBe(-1070);
  });

  it("сообщение ниже — прокрутка вниз", () => {
    expect(
      scrollDeltaToCenter({
        laneTop: 0,
        laneHeight: 400,
        targetTop: 600,
        targetHeight: 40,
      }),
    ).toBe(420);
  });

  it("сообщение уже по центру — не двигаемся", () => {
    // Иначе нажатие на цитату дёргало бы ленту без всякой пользы.
    expect(
      scrollDeltaToCenter({
        laneTop: 0,
        laneHeight: 400,
        targetTop: 180,
        targetHeight: 40,
      }),
    ).toBe(0);
  });
});
