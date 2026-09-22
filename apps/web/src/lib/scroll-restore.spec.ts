import { describe, expect, it } from "vitest";
import {
  SCROLL_RESTORE_DEADLINE_MS,
  scrollReach,
  stepScrollRestore,
} from "./scroll-restore";

describe("scrollReach", () => {
  it("считает, докуда вообще можно прокрутить", () => {
    expect(scrollReach(5000, 800)).toBe(4200);
  });

  it("страница короче экрана не прокручивается вовсе", () => {
    expect(scrollReach(400, 800)).toBe(0);
  });
});

describe("stepScrollRestore", () => {
  it("возвращать наверх нечего", () => {
    expect(stepScrollRestore({ target: 0, reach: 9000, elapsed: 0 })).toEqual({
      top: null,
      done: true,
    });
  });

  it("высоты хватает — возвращаемся сразу и заканчиваем", () => {
    expect(
      stepScrollRestore({ target: 4200, reach: 9000, elapsed: 0 }),
    ).toEqual({ top: 4200, done: true });
  });

  /**
   * Та самая сцена из VED-325: список задач приезжает запросом, и в первый
   * кадр после перехода страница ростом с экран.
   */
  it("страница ещё не доросла — прокручиваем насколько можно и ждём", () => {
    expect(stepScrollRestore({ target: 4200, reach: 0, elapsed: 16 })).toEqual({
      top: 0,
      done: false,
    });
    // Между скелетом и данными высота стоит на месте: ждать надо и тогда,
    // когда страница не растёт (VED-325).
    expect(
      stepScrollRestore({ target: 4200, reach: 0, elapsed: 1800 }),
    ).toEqual({ top: 0, done: false });
    expect(
      stepScrollRestore({ target: 4200, reach: 1500, elapsed: 2100 }),
    ).toEqual({ top: 1500, done: false });
    expect(
      stepScrollRestore({ target: 4200, reach: 4200, elapsed: 400 }),
    ).toEqual({ top: 4200, done: true });
  });

  it("не ждём вечно: страница могла стать короче навсегда", () => {
    expect(
      stepScrollRestore({
        target: 4200,
        reach: 100,
        elapsed: SCROLL_RESTORE_DEADLINE_MS,
      }),
    ).toEqual({ top: 100, done: true });
  });

  it("допуск в несколько пикселей — высота редко сходится до пикселя", () => {
    expect(
      stepScrollRestore({ target: 4200, reach: 4195, elapsed: 0 }).done,
    ).toBe(true);
    expect(
      stepScrollRestore({ target: 4200, reach: 4100, elapsed: 0 }).done,
    ).toBe(false);
  });

  it("ниже конца страницы не уводим", () => {
    expect(
      stepScrollRestore({ target: 4200, reach: 300, elapsed: 2000 }).top,
    ).toBe(300);
  });
});
