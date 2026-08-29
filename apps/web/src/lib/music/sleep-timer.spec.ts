import { describe, expect, it } from "vitest";
import {
  SLEEP_TIMER_OFF,
  formatSleepLeft,
  shouldStopNow,
  shouldStopOnEnded,
  sleepSecondsLeft,
  sleepTimerAfterMinutes,
} from "./sleep-timer";

const NOW = 1_700_000_000_000;

describe("sleepTimerAfterMinutes", () => {
  it("отсчитывает от переданного момента", () => {
    const timer = sleepTimerAfterMinutes(30, NOW);
    expect(timer).toEqual({ mode: "at", endsAt: NOW + 30 * 60_000 });
  });

  // Ноль и минус превратили бы «поставил на ночь» в мгновенную остановку.
  it("не даёт завести таймер в прошлое", () => {
    expect(sleepTimerAfterMinutes(0, NOW)).toEqual({
      mode: "at",
      endsAt: NOW + 60_000,
    });
    expect(sleepTimerAfterMinutes(-5, NOW)).toEqual({
      mode: "at",
      endsAt: NOW + 60_000,
    });
  });
});

describe("sleepSecondsLeft", () => {
  it("считает остаток", () => {
    expect(sleepSecondsLeft({ mode: "at", endsAt: NOW + 90_000 }, NOW)).toBe(90);
  });

  it("не уходит в минус после срабатывания", () => {
    expect(sleepSecondsLeft({ mode: "at", endsAt: NOW - 5_000 }, NOW)).toBe(0);
  });

  // Выключенный и «до конца записи» время не отсчитывают — показывать нечего.
  it("молчит там, где отсчёта нет", () => {
    expect(sleepSecondsLeft(SLEEP_TIMER_OFF, NOW)).toBeNull();
    expect(sleepSecondsLeft({ mode: "end-of-track" }, NOW)).toBeNull();
  });
});

describe("shouldStopNow", () => {
  it("срабатывает ровно в срок и после", () => {
    expect(shouldStopNow({ mode: "at", endsAt: NOW }, NOW)).toBe(true);
    expect(shouldStopNow({ mode: "at", endsAt: NOW - 1 }, NOW)).toBe(true);
  });

  it("до срока молчит", () => {
    expect(shouldStopNow({ mode: "at", endsAt: NOW + 1 }, NOW)).toBe(false);
  });

  it("выключенный и «до конца записи» по времени не останавливают", () => {
    expect(shouldStopNow(SLEEP_TIMER_OFF, NOW)).toBe(false);
    expect(shouldStopNow({ mode: "end-of-track" }, NOW)).toBe(false);
  });
});

describe("shouldStopOnEnded", () => {
  it("«до конца записи» останавливает на её конце", () => {
    expect(shouldStopOnEnded({ mode: "end-of-track" }, NOW)).toBe(true);
  });

  // Запись могла кончиться за секунду до срабатывания таймера: уйти в
  // следующую в этот момент — ровно то, чего просили не делать.
  it("истёкший таймер по времени тоже не пускает дальше", () => {
    expect(shouldStopOnEnded({ mode: "at", endsAt: NOW - 1_000 }, NOW)).toBe(
      true,
    );
  });

  it("живой таймер по времени переходу не мешает", () => {
    expect(shouldStopOnEnded({ mode: "at", endsAt: NOW + 60_000 }, NOW)).toBe(
      false,
    );
  });

  it("без таймера всё как обычно", () => {
    expect(shouldStopOnEnded(SLEEP_TIMER_OFF, NOW)).toBe(false);
  });
});

describe("formatSleepLeft", () => {
  it("минуты округляет вверх — «0 мин» на экране бессмысленно", () => {
    expect(formatSleepLeft(1_680)).toBe("28 мин");
    expect(formatSleepLeft(61)).toBe("2 мин");
  });

  it("последнюю минуту показывает секундами", () => {
    expect(formatSleepLeft(45)).toBe("45 сек");
  });

  it("не показывает отрицательное", () => {
    expect(formatSleepLeft(0)).toBe("0 сек");
    expect(formatSleepLeft(-10)).toBe("0 сек");
  });
});
