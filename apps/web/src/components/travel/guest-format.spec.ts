import { describe, expect, it } from "vitest";
import {
  guestPaymentLabel,
  matchesGuest,
  nightsLabel,
  shortDate,
  suggestedAmountMinor,
} from "./guest-format";

describe("nightsLabel", () => {
  it.each([
    [1, "1 сутки"],
    [2, "2 суток"],
    [5, "5 суток"],
    [21, "21 сутки"],
  ])("%i → %s", (n, text) => {
    expect(nightsLabel(n)).toBe(text);
  });
});

describe("shortDate", () => {
  it("день и месяц словом", () => {
    expect(shortDate("2026-05-19")).toBe("19 мая");
  });
});

describe("guestPaymentLabel", () => {
  it("долг первым, потом срок", () => {
    expect(
      guestPaymentLabel({
        paidThrough: "2026-05-19",
        unpaidNights: 1,
        living: true,
      }),
    ).toBe("не оплачено 1 сутки · оплачено по 19 мая");
  });

  it("живёт без оплат", () => {
    expect(
      guestPaymentLabel({ paidThrough: null, unpaidNights: 0, living: true }),
    ).toBe("оплат ещё не было");
  });

  it("выехал без долга и оплат — пусто", () => {
    expect(
      guestPaymentLabel({ paidThrough: null, unpaidNights: 0, living: false }),
    ).toBe("");
  });
});

describe("matchesGuest", () => {
  const guest = {
    fullName: "Соловьёв Кирилл",
    phone: "+7 900 123-45-67",
    keyLabel: "14",
    roomLabel: "Корпус 2 · 14",
  };

  it("ищет без регистра и путаницы е/ё", () => {
    expect(matchesGuest(guest, "соловьев")).toBe(true);
  });

  it("находит по телефону, ключу и комнате", () => {
    expect(matchesGuest(guest, "123-45")).toBe(true);
    expect(matchesGuest(guest, "корпус 2")).toBe(true);
  });

  it("пустой запрос пропускает всех", () => {
    expect(matchesGuest(guest, "  ")).toBe(true);
  });

  it("мимо — false", () => {
    expect(matchesGuest(guest, "Одарий")).toBe(false);
  });
});

describe("suggestedAmountMinor", () => {
  it("сутки на цену", () => {
    expect(suggestedAmountMinor(2, 85_000)).toBe(170_000);
  });

  it("без цены или суток — нет подсказки", () => {
    expect(suggestedAmountMinor(2, null)).toBeNull();
    expect(suggestedAmountMinor(null, 85_000)).toBeNull();
  });
});
