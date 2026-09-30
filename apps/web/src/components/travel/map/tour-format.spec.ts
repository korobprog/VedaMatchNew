import { describe, expect, it } from "vitest";
import {
  formatTourWhen,
  isoToZonedLocal,
  parseCommaList,
  tourPaymentLabel,
  tourSeatsLabel,
  zonedLocalToIso,
} from "./tour-format";

describe("formatTourWhen", () => {
  it("показывает время в зоне встречи", () => {
    expect(formatTourWhen("2026-10-12T01:30:00.000Z", "Asia/Kolkata")).toBe(
      "12 окт, 07:00 (Asia/Kolkata)",
    );
  });
  it("неверная зона не падает и не попадает в подпись", () => {
    const text = formatTourWhen("2026-10-12T01:30:00.000Z", "Nope/Zone");
    expect(text).toMatch(/^12 окт, \d\d:\d\d$/);
  });
  it("неверная дата — пусто", () => {
    expect(formatTourWhen("bad", "UTC")).toBe("");
  });
});

describe("tourSeatsLabel", () => {
  it("свободные места", () => {
    expect(tourSeatsLabel(20, 15)).toBe("5 из 20 мест");
  });
  it("мест нет", () => {
    expect(tourSeatsLabel(10, 10)).toBe("Мест нет");
    expect(tourSeatsLabel(10, 12)).toBe("Мест нет");
  });
  it("без лимита", () => {
    expect(tourSeatsLabel(null, 12)).toBe("12 записались");
    expect(tourSeatsLabel(null, 1)).toBe("1 записался");
  });
});

describe("tourPaymentLabel", () => {
  it("бесплатно и за служение без цены", () => {
    expect(tourPaymentLabel("free", null, "rub")).toBe("Бесплатно");
    expect(tourPaymentLabel("seva", 500, "rub")).toBe("За служение");
  });
  it("за плату с ценой", () => {
    expect(tourPaymentLabel("paid", 50000, "rub")).toBe(
      "За плату · 500\u00a0₽",
    );
  });
  it("за плату без цены или с чужой валютой", () => {
    expect(tourPaymentLabel("paid", null, "rub")).toBe("За плату");
    expect(tourPaymentLabel("paid", 100, "xxx")).toBe("За плату");
  });
});

describe("зоны и datetime-local", () => {
  it("туда и обратно", () => {
    const iso = zonedLocalToIso("2026-10-12T07:00", "Asia/Kolkata");
    expect(iso).toBe("2026-10-12T01:30:00.000Z");
    expect(isoToZonedLocal(iso, "Asia/Kolkata")).toBe("2026-10-12T07:00");
  });
  it("зима и лето в Москве/Берлине", () => {
    expect(zonedLocalToIso("2026-07-01T10:00", "Europe/Berlin")).toBe(
      "2026-07-01T08:00:00.000Z",
    );
    expect(zonedLocalToIso("2026-01-01T10:00", "Europe/Berlin")).toBe(
      "2026-01-01T09:00:00.000Z",
    );
  });
  it("плохой ввод — пусто", () => {
    expect(zonedLocalToIso("", "UTC")).toBe("");
  });
});

describe("parseCommaList", () => {
  it("чистит, убирает повторы и режет по лимиту", () => {
    expect(parseCommaList(" Маяпур, ,маяпур; Вриндаван ,Пури", 3)).toEqual([
      "Маяпур",
      "Вриндаван",
      "Пури",
    ]);
    expect(parseCommaList("a,b,c", 2)).toEqual(["a", "b"]);
  });
});
