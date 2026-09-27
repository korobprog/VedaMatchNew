import { describe, expect, it } from "vitest";
import { lastSeenLabel, newcomerDay, newcomerLabel } from "./people-presence";

// Местное время, а не UTC: подпись рисуется в поясе смотрящего, и тест не
// должен зависеть от пояса машины, на которой гоняется.
const now = new Date(2026, 8, 27, 14, 30);
const iso = (d: Date) => d.toISOString();
const minutesAgo = (m: number) => iso(new Date(now.getTime() - m * 60_000));
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("newcomerDay", () => {
  it("первые сутки — 0", () => {
    expect(newcomerDay(minutesAgo(1), now)).toBe(0);
    expect(newcomerDay(hoursAgo(23.9), now)).toBe(0);
  });

  it("вторые и третьи сутки — 1 и 2", () => {
    expect(newcomerDay(hoursAgo(24), now)).toBe(1);
    expect(newcomerDay(hoursAgo(47), now)).toBe(1);
    expect(newcomerDay(hoursAgo(48), now)).toBe(2);
    expect(newcomerDay(hoursAgo(71.9), now)).toBe(2);
  });

  it("с четвёртых суток метки нет", () => {
    expect(newcomerDay(hoursAgo(72), now)).toBeNull();
    expect(newcomerDay(hoursAgo(24 * 30), now)).toBeNull();
  });

  it("дата из будущего (часы клиента отстают) — первые сутки", () => {
    expect(newcomerDay(minutesAgo(-3), now)).toBe(0);
  });

  it("нет даты или она битая — метки нет", () => {
    expect(newcomerDay(null, now)).toBeNull();
    expect(newcomerDay(undefined, now)).toBeNull();
    expect(newcomerDay("не дата", now)).toBeNull();
  });
});

describe("newcomerLabel", () => {
  it("называет день словами, не только цветом", () => {
    expect(newcomerLabel(0)).toBe("Новый участник: 1-й день на портале");
    expect(newcomerLabel(2)).toBe("Новый участник: 3-й день на портале");
  });
});

describe("lastSeenLabel", () => {
  it("в первые пять минут — «в сети»", () => {
    expect(lastSeenLabel(minutesAgo(0), now)).toBe("в сети");
    expect(lastSeenLabel(minutesAgo(5), now)).toBe("в сети");
    expect(lastSeenLabel(minutesAgo(-2), now)).toBe("в сети");
  });

  it("сегодня — «сегодня в ЧЧ:ММ», а не «был недавно»", () => {
    expect(lastSeenLabel(minutesAgo(6), now)).toBe("был(а) сегодня в 14:24");
    expect(lastSeenLabel(iso(new Date(2026, 8, 27, 0, 5)), now)).toBe(
      "был(а) сегодня в 00:05",
    );
  });

  it("вчера — «вчера в ЧЧ:ММ»", () => {
    expect(lastSeenLabel(iso(new Date(2026, 8, 26, 23, 59)), now)).toBe(
      "был(а) вчера в 23:59",
    );
  });

  it("раньше — дата и время, год только когда не текущий", () => {
    expect(lastSeenLabel(iso(new Date(2026, 8, 3, 9, 7)), now)).toBe(
      "был(а) 3 сентября в 09:07",
    );
    expect(lastSeenLabel(iso(new Date(2025, 11, 31, 18, 0)), now)).toMatch(
      /^был\(а\) 31 декабря 2025( г\.)? в 18:00$/,
    );
  });

  it("не заходил — подписи нет", () => {
    expect(lastSeenLabel(null, now)).toBeNull();
    expect(lastSeenLabel("мусор", now)).toBeNull();
  });
});
