import { describe, expect, it } from "vitest";
import type {
  TravelCashCategoryDto,
  TravelCashEntryDto,
} from "@vedamatch/shared";
import {
  categoryTotals,
  niceMax,
  periodTotals,
  statsRange,
  totalsOf,
} from "./cash-stats";

let seq = 0;
const entry = (
  occurredOn: string,
  kind: "income" | "expense",
  amountMinor: number,
  categoryId: string | null = null,
): TravelCashEntryDto => ({
  id: `e${(seq += 1)}`,
  kind,
  amountMinor,
  occurredOn,
  categoryId,
  note: "",
  tags: [],
  authorName: null,
  createdAt: "2026-05-18T10:00:00.000Z",
  guestId: null,
  guestName: null,
  guestColor: null,
  nights: null,
});

const categories: TravelCashCategoryDto[] = [
  {
    id: "live",
    kind: "income",
    name: "Проживание",
    icon: "house",
    position: 0,
  },
  { id: "food", kind: "expense", name: "Продукты", icon: "food", position: 0 },
  { id: "fix", kind: "expense", name: "Ремонт", icon: "repair", position: 1 },
];

describe("statsRange", () => {
  it("этот месяц — с первого числа по дням", () => {
    expect(statsRange("month", "2026-09-14")).toEqual({
      from: "2026-09-01",
      to: "2026-09-14",
      grouping: "day",
    });
  });

  it("30 дней включают сегодня", () => {
    expect(statsRange("30days", "2026-09-14").from).toBe("2026-08-16");
  });

  it("3 месяца — с начала позапрошлого месяца по неделям", () => {
    expect(statsRange("quarter", "2026-01-10")).toEqual({
      from: "2025-11-01",
      to: "2026-01-10",
      grouping: "week",
    });
  });

  it("год и три года — по месяцам с 1 января", () => {
    expect(statsRange("year", "2026-09-14").from).toBe("2026-01-01");
    expect(statsRange("3years", "2026-09-14")).toMatchObject({
      from: "2024-01-01",
      grouping: "month",
    });
  });
});

describe("totalsOf и categoryTotals", () => {
  const entries = [
    entry("2026-05-18", "income", 170_000, "live"),
    entry("2026-05-18", "expense", 30_000, "food"),
    entry("2026-05-19", "expense", 140_000, "fix"),
    entry("2026-05-19", "expense", 30_000, "deleted-category"),
    entry("2026-05-20", "expense", 10_000, null),
  ];

  it("итоги по видам", () => {
    expect(totalsOf(entries)).toEqual({
      incomeMinor: 170_000,
      expenseMinor: 210_000,
    });
  });

  it("статьи расходов крупными сверху, удалённая и пустая — «Без статьи»", () => {
    const rows = categoryTotals(entries, categories, "expense");
    expect(rows.map((r) => [r.name, r.amountMinor, r.count])).toEqual([
      ["Ремонт", 140_000, 1],
      ["Без статьи", 40_000, 2],
      ["Продукты", 30_000, 1],
    ]);
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1);
  });

  it("пустой вид — пустая разбивка", () => {
    expect(categoryTotals([], categories, "income")).toEqual([]);
  });
});

describe("periodTotals", () => {
  it("заполняет пустые дни нулями и идёт от старых к новым", () => {
    const rows = periodTotals(
      [
        entry("2026-05-20", "income", 340_000),
        entry("2026-05-18", "expense", 140_000),
      ],
      "day",
      "2026-05-18",
      "2026-05-20",
    );
    expect(rows.map((r) => [r.key, r.incomeMinor, r.expenseMinor])).toEqual([
      ["2026-05-18", 0, 140_000],
      ["2026-05-19", 0, 0],
      ["2026-05-20", 340_000, 0],
    ]);
  });

  it("запись вне промежутка не попадает в график", () => {
    const rows = periodTotals(
      [entry("2026-04-30", "income", 1)],
      "month",
      "2026-05-01",
      "2026-05-31",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].incomeMinor).toBe(0);
  });
});

describe("niceMax", () => {
  it.each([
    [0, 1],
    [7, 10],
    [120_000, 200_000],
    [340_000, 500_000],
    [1_000_000, 1_000_000],
  ])("%i → %i", (value, expected) => {
    expect(niceMax(value)).toBe(expected);
  });
});
