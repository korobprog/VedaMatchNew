import { describe, expect, it } from "vitest";
import { isOnline, presenceLabel } from "./chat-presence";

const now = new Date("2026-08-22T18:00:00");
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

describe("presenceLabel", () => {
  it("в первые пять минут — «в сети»", () => {
    expect(presenceLabel(minutesAgo(0), now)).toBe("в сети");
    expect(presenceLabel(minutesAgo(5), now)).toBe("в сети");
  });

  it("до часа — «был недавно»", () => {
    expect(presenceLabel(minutesAgo(20), now)).toBe("был недавно");
    expect(presenceLabel(minutesAgo(60), now)).toBe("был недавно");
  });

  it("в тот же день показывает время", () => {
    expect(presenceLabel(minutesAgo(300), now)).toMatch(/был \d\d:\d\d/);
  });

  it("вчерашнее подписывает словом", () => {
    expect(presenceLabel(minutesAgo(60 * 26), now)).toBe("был вчера");
  });

  it("старое показывает датой", () => {
    expect(presenceLabel(minutesAgo(60 * 24 * 10), now)).toMatch(/авг/);
  });

  it("без отметки молчит, а не выдумывает", () => {
    expect(presenceLabel(null, now)).toBeNull();
    expect(presenceLabel("не дата", now)).toBeNull();
  });

  it("время из будущего не ломает подпись", () => {
    expect(presenceLabel(minutesAgo(-10), now)).toBe("в сети");
  });
});

describe("isOnline", () => {
  it("точка горит только в первые пять минут", () => {
    expect(isOnline(minutesAgo(4), now)).toBe(true);
    expect(isOnline(minutesAgo(6), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });
});
