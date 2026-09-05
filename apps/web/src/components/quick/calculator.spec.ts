import { describe, expect, it } from "vitest";
import {
  calcBackspace,
  calcClear,
  calcDigit,
  calcDot,
  calcEquals,
  calcOperator,
  calcSign,
  format,
  initialCalcState,
  type CalcState,
} from "./calculator";

/** Набор с клавиатуры: «12+3=» одной строкой. */
function press(keys: string): string {
  let state: CalcState = initialCalcState;
  for (const key of keys) {
    if (/\d/.test(key)) state = calcDigit(state, key);
    else if (key === ".") state = calcDot(state);
    else if (key === "=") state = calcEquals(state);
    else if (key === "c") state = calcClear();
    else if (key === "<") state = calcBackspace(state);
    else if (key === "~") state = calcSign(state);
    else state = calcOperator(state, key as never);
  }
  return state.display;
}

describe("калькулятор", () => {
  it("складывает, вычитает, умножает и делит", () => {
    expect(press("12+3=")).toBe("15");
    expect(press("12−3=")).toBe("9");
    expect(press("12×3=")).toBe("36");
    expect(press("12÷3=")).toBe("4");
  });

  it("считает цепочку без «=» между действиями", () => {
    // Так считает любой калькулятор на телефоне: 2+3 показывается до ×.
    expect(press("2+3×4=")).toBe("20");
  });

  it("две операции подряд — правка выбора, а не второе действие", () => {
    expect(press("8+×2=")).toBe("16");
  });

  it("повторное «=» повторяет последнюю операцию", () => {
    expect(press("2×2===")).toBe("16");
  });

  it("не даёт двух точек в числе", () => {
    expect(press("1.2.5")).toBe("1.25");
  });

  it("точка после результата начинает новое число", () => {
    expect(press("1+1=.5")).toBe("0.5");
  });

  it("цифра после результата начинает заново, а не дописывает", () => {
    expect(press("1+1=7")).toBe("7");
  });

  it("меняет знак", () => {
    expect(press("5~")).toBe("-5");
    expect(press("5~~")).toBe("5");
  });

  it("стирает последний знак и не уходит в пустоту", () => {
    expect(press("123<")).toBe("12");
    expect(press("5<")).toBe("0");
    expect(press("5~<")).toBe("0");
  });

  it("сброс возвращает всё в начало", () => {
    expect(press("12+3c")).toBe("0");
  });

  it("на ноль не делит и говорит об этом словами", () => {
    expect(press("5÷0=")).toBe("На ноль не делится");
  });

  it("не показывает двоичный хвост деления", () => {
    // 0.1 + 0.2 в двоичной арифметике даёт 0.30000000000000004.
    expect(press("0.1+0.2=")).toBe("0.3");
  });

  it("не пускает на табло больше двенадцати цифр", () => {
    expect(press("1234567890123456").length).toBeLessThanOrEqual(12);
  });
});

describe("format", () => {
  it("округляет до предела, за которым дробь всё равно врёт", () => {
    expect(format(0.30000000000000004)).toBe("0.3");
  });

  it("объясняет переполнение словами", () => {
    expect(format(Number.POSITIVE_INFINITY)).toBe("Слишком много");
  });
});
