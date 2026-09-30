import { describe, expect, it } from "vitest";
import { closedWarning, freshnessLabel } from "./map-freshness";

const now = new Date("2026-09-30T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const f = (lastConfirmedAt: string | null, stale = false) => ({ lastConfirmedAt, stale });

describe("freshnessLabel", () => {
  it("сегодня", () => {
    expect(freshnessLabel(f(ago(0)), now)).toBe("Подтверждено сегодня");
    expect(freshnessLabel(f(ago(0.5)), now)).toBe("Подтверждено сегодня");
  });
  it("склоняет дни", () => {
    expect(freshnessLabel(f(ago(1)), now)).toBe("Подтверждено 1 день назад");
    expect(freshnessLabel(f(ago(2)), now)).toBe("Подтверждено 2 дня назад");
    expect(freshnessLabel(f(ago(5)), now)).toBe("Подтверждено 5 дней назад");
    expect(freshnessLabel(f(ago(11)), now)).toBe("Подтверждено 11 дней назад");
    expect(freshnessLabel(f(ago(21)), now)).toBe("Подтверждено 21 день назад");
  });
  it("будущая дата не уходит в минус", () => {
    expect(freshnessLabel(f(ago(-3)), now)).toBe("Подтверждено сегодня");
  });
  it("stale важнее даты", () => {
    expect(freshnessLabel(f(ago(400), true), now)).toBe("Давно не проверялось");
    expect(freshnessLabel(f(null, true), now)).toBe("Давно не проверялось");
  });
  it("никто не подтверждал", () => {
    expect(freshnessLabel(f(null), now)).toBe("Ещё никто не подтверждал");
  });
});

describe("closedWarning", () => {
  it("null без голосов", () => {
    expect(closedWarning({ closedVotes: 0 })).toBeNull();
  });
  it("склоняет", () => {
    expect(closedWarning({ closedVotes: 1 })).toBe("1 человек отметил: закрылось");
    expect(closedWarning({ closedVotes: 2 })).toBe("2 человека отметили: закрылось");
    expect(closedWarning({ closedVotes: 5 })).toBe("5 человек отметили: закрылось");
    expect(closedWarning({ closedVotes: 12 })).toBe("12 человек отметили: закрылось");
  });
});
