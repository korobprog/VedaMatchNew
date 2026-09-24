import { describe, expect, it } from "vitest";
import {
  EMPTY_COMMERCIAL_DRAFT,
  commercialDraftToInput,
  formatElapsed,
  formatMinutes,
  formatMoney,
  minutesToHoursInput,
  moneyToInput,
  parseHoursInput,
  parseMoneyInput,
  toDateTimeLocal,
} from "./finance-format";

const nbsp = (text: string) => text.replace(/\s/g, " ");

describe("деньги", () => {
  it("копейки показываются, только когда есть", () => {
    expect(nbsp(formatMoney(150_000, "RUB"))).toBe("1 500 ₽");
    expect(nbsp(formatMoney(150_050, "RUB"))).toBe("1 500,50 ₽");
    expect(nbsp(formatMoney(0, "USD"))).toBe("0 $");
  });

  it("ввод суммы понимает пробелы, запятую и знак валюты", () => {
    expect(parseMoneyInput("1 500")).toBe(150_000);
    expect(parseMoneyInput("1500,5")).toBe(150_050);
    expect(parseMoneyInput("1 500.25 ₽")).toBe(150_025);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNaN();
    expect(parseMoneyInput("полторы")).toBeNaN();
    expect(parseMoneyInput("1,999")).toBeNaN();
  });

  it("сумма возвращается в поле без копеечного хвоста", () => {
    expect(moneyToInput(150_000)).toBe("1500");
    expect(moneyToInput(150_050)).toBe("1500,5");
    expect(moneyToInput(0)).toBe("");
  });
});

describe("часы", () => {
  it("минуты словами", () => {
    expect(formatMinutes(390)).toBe("6 ч 30 мин");
    expect(formatMinutes(180)).toBe("3 ч");
    expect(formatMinutes(45)).toBe("45 мин");
  });

  it("ввод часов: число, дробь и часы:минуты", () => {
    expect(parseHoursInput("3")).toBe(180);
    expect(parseHoursInput("1,5")).toBe(90);
    expect(parseHoursInput("1:40")).toBe(100);
    expect(parseHoursInput(" ")).toBeNull();
    expect(parseHoursInput("1:75")).toBeNaN();
    expect(parseHoursInput("три")).toBeNaN();
  });

  it("минуты обратно в поле", () => {
    expect(minutesToHoursInput(90)).toBe("1,5");
    expect(minutesToHoursInput(100)).toBe("1:40");
    expect(minutesToHoursInput(null)).toBe("");
  });
});

describe("черновик настроек оплаты", () => {
  it("пустые поля — нули, пояс из браузера", () => {
    expect(
      commercialDraftToInput(
        { ...EMPTY_COMMERCIAL_DRAFT, rate: "1500", normHours: "3" },
        "Europe/Moscow",
      ),
    ).toEqual({
      input: {
        clientName: "",
        currency: "RUB",
        pricingModel: "hourly",
        rateMinor: 150_000,
        dailyNormMinutes: 180,
        overtimeRateMinor: 0,
        overtimeMode: "on_request",
        budgetMinor: 0,
        timezone: "Europe/Moscow",
      },
    });
  });

  it("мусор — ошибка словами, а не ноль", () => {
    expect(
      commercialDraftToInput(
        { ...EMPTY_COMMERCIAL_DRAFT, rate: "дорого" },
        "UTC",
      ),
    ).toEqual({ error: "Ставка: число, например 1500" });
    expect(
      commercialDraftToInput(
        { ...EMPTY_COMMERCIAL_DRAFT, normHours: "25" },
        "UTC",
      ),
    ).toHaveProperty("error");
  });
});

describe("таймер и поле времени", () => {
  it("идущий таймер часами, минутами и секундами", () => {
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(59_000)).toBe("0:00:59");
    expect(formatElapsed(-5)).toBe("0:00:00");
  });

  it("поле даты и времени — в местном времени, без секунд", () => {
    expect(toDateTimeLocal(new Date(2026, 8, 4, 7, 5, 30))).toBe(
      "2026-09-04T07:05",
    );
  });
});
