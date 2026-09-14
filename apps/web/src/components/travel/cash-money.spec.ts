import { describe, expect, it } from "vitest";
import {
  formatBalance,
  formatSigned,
  MINUS,
  moneyInputValue,
  NBSP,
  parseMoneyInput,
  parseSignedMoneyInput,
} from "./cash-money";

describe("parseMoneyInput", () => {
  it.each([
    ["850", 85_000],
    ["1 700", 170_000],
    [`1${NBSP}700`, 170_000],
    ["1700,50", 170_050],
    ["1700.5", 170_050],
    [" 0,01 ", 1],
  ])("«%s» → %i", (raw, minor) => {
    expect(parseMoneyInput(raw)).toBe(minor);
  });

  it.each(["", "0", "-850", "12,345", "abc", "1.2.3", "1e5"])(
    "«%s» — не сумма",
    (raw) => {
      expect(parseMoneyInput(raw)).toBeNull();
    },
  );
});

describe("parseSignedMoneyInput", () => {
  it.each([
    ["0", 0],
    ["-500", -50_000],
    [`${MINUS}1 700,5`, -170_050],
    ["68 099", 6_809_900],
  ])("«%s» → %i", (raw, minor) => {
    expect(parseSignedMoneyInput(raw)).toBe(minor);
  });

  it.each(["", "--5", "5-", "abc"])("«%s» — не сумма", (raw) => {
    expect(parseSignedMoneyInput(raw)).toBeNull();
  });
});

describe("moneyInputValue", () => {
  it("возвращает то, что разбор прочтёт обратно", () => {
    for (const minor of [1, 85_000, 170_050, 99]) {
      expect(parseMoneyInput(moneyInputValue(minor))).toBe(minor);
    }
    for (const minor of [0, -50_000, -170_050]) {
      expect(parseSignedMoneyInput(moneyInputValue(minor))).toBe(minor);
    }
  });
});

describe("formatSigned", () => {
  it("плюс у дохода, типографский минус у расхода", () => {
    expect(formatSigned(340_000, "rub")).toBe(`+3${NBSP}400${NBSP}₽`);
    expect(formatSigned(-94_600, "rub")).toBe(`${MINUS}946${NBSP}₽`);
  });
});

describe("formatBalance", () => {
  it("долг — с минусом, остаток — без плюса", () => {
    expect(formatBalance(7_149_900, "rub")).toBe(`71${NBSP}499${NBSP}₽`);
    expect(formatBalance(-100, "rub")).toBe(`${MINUS}1${NBSP}₽`);
  });
});
