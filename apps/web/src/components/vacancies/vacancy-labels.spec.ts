import { describe, expect, it } from "vitest";
import { formatExpiry, formatPay } from "./vacancy-labels";

describe("formatPay", () => {
  const base = { currency: "RUB", period: "month" as const, negotiable: false };

  it("вилка, «от» и «до»", () => {
    expect(formatPay({ ...base, min: 60000, max: 80000 })).toBe(
      "60 000–80 000 ₽ в месяц",
    );
    expect(formatPay({ ...base, min: 500, max: null, period: "hour" })).toBe(
      "от 500 ₽ в час",
    );
    expect(formatPay({ ...base, min: null, max: 3000, period: "task" })).toBe(
      "до 3 000 ₽ за задачу",
    );
  });

  it("по договорённости без цифр, и ничего — если нет ни того, ни другого", () => {
    expect(formatPay({ ...base, min: null, max: null, negotiable: true })).toBe(
      "По договорённости",
    );
    expect(formatPay({ ...base, min: null, max: null })).toBeNull();
    expect(formatPay(null)).toBeNull();
  });
});

describe("formatExpiry", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const inDays = (d: number) =>
    new Date(now.getTime() + d * 86_400_000).toISOString();

  it("склоняет дни", () => {
    expect(formatExpiry(inDays(1), now)).toBe("истекает через 1 день");
    expect(formatExpiry(inDays(3), now)).toBe("истекает через 3 дня");
    expect(formatExpiry(inDays(12), now)).toBe("истекает через 12 дней");
  });

  it("сегодня и после срока", () => {
    expect(formatExpiry(now.toISOString(), now)).toBe("истекает сегодня");
    expect(formatExpiry(inDays(-2), now)).toBe("срок вышел");
  });
});
