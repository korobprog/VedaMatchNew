import { describe, expect, it } from "vitest";
import { COMPOSER_MIN_HEIGHT, composerHeight } from "./composer-height";

describe("composerHeight (VED-147)", () => {
  it("пустое поле — одна строка, как рядом стоящие кнопки", () => {
    expect(composerHeight(20, 800)).toEqual({
      height: COMPOSER_MIN_HEIGHT,
      scrolls: false,
    });
  });

  it("растёт вместе с текстом", () => {
    expect(composerHeight(137.4, 800)).toEqual({ height: 138, scrolls: false });
  });

  it("выше 40% окна не растёт и начинает прокручиваться", () => {
    // Телефон с открытой клавиатурой: видимое окно около 420 точек.
    expect(composerHeight(400, 420)).toEqual({ height: 168, scrolls: true });
  });

  it("на совсем низком окне всё равно даёт несколько строк", () => {
    expect(composerHeight(300, 200)).toEqual({ height: 112, scrolls: true });
  });
});
