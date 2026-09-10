import { describe, expect, it } from "vitest";
import { formatPrice, nightsWord, priceLabel } from "./price";

describe("formatPrice", () => {
  it("целую сумму показывает без копеек", () => {
    expect(formatPrice(50000, "rub")).toBe("500\u00a0₽");
  });

  it("копейки показывает, когда они есть", () => {
    expect(formatPrice(50050, "rub")).toBe("500,50\u00a0₽");
  });

  it("разделяет разряды неразрывным пробелом", () => {
    expect(formatPrice(120000, "rub")).toBe("1\u00a0200\u00a0₽");
  });

  it("знает знаки других валют", () => {
    expect(formatPrice(100000, "inr")).toBe("1\u00a0000\u00a0₹");
    expect(formatPrice(2500, "eur")).toBe("25\u00a0€");
  });

  it("отсутствие цены остаётся отсутствием, а не нулём", () => {
    expect(formatPrice(null, "rub")).toBeNull();
  });
});

describe("priceLabel", () => {
  it("ночлег за служение цены не показывает", () => {
    expect(priceLabel(null, "rub", "seva")).toBe("За служение");
  });

  it("даже с проставленной ценой служение остаётся служением", () => {
    expect(priceLabel(50000, "rub", "seva")).toBe("За служение");
  });

  it("объект за плату называет цену за ночь", () => {
    expect(priceLabel(50000, "rub", "paid")).toBe("500\u00a0₽ за ночь");
  });

  it("объект «и так, и так» называет обе возможности", () => {
    expect(priceLabel(50000, "rub", "both")).toBe(
      "500\u00a0₽ за ночь или за служение",
    );
  });

  it("объект за плату без цены просит уточнить, а не показывает ноль", () => {
    expect(priceLabel(null, "rub", "paid")).toBe("Цену уточняйте");
  });
});

describe("nightsWord", () => {
  it("склоняет ночи", () => {
    expect(nightsWord(1)).toBe("1 ночь");
    expect(nightsWord(3)).toBe("3 ночи");
    expect(nightsWord(7)).toBe("7 ночей");
    expect(nightsWord(21)).toBe("21 ночь");
  });

  it("не спотыкается на 11–14", () => {
    expect(nightsWord(11)).toBe("11 ночей");
    expect(nightsWord(13)).toBe("13 ночей");
  });
});
