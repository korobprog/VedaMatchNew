import { describe, expect, it } from "vitest";
import type { TravelCashEntryDto } from "@vedamatch/shared";
import { NBSP } from "./cash-money";
import {
  duplicateOf,
  filterChips,
  filtersToQuery,
  hasFilters,
  selectionTotals,
  templateLabel,
  templateOf,
  withoutFilter,
} from "./cash-tools";

const entry = (
  id: string,
  kind: "income" | "expense",
  amountMinor: number,
): TravelCashEntryDto => ({
  id,
  kind,
  amountMinor,
  occurredOn: "2026-05-18",
  categoryId: "cat-live",
  note: "Кэлин Вячеслав",
  tags: ["наличные"],
  authorName: "Радха",
  createdAt: "2026-05-18T10:00:00.000Z",
  guestId: "g1",
  guestName: "Кэлин Вячеслав",
  guestColor: "cyan",
  nights: 2,
});

describe("filtersToQuery", () => {
  it("пропускает пустые поля и числа превращает в строки", () => {
    expect(
      filtersToQuery({
        q: "",
        kind: "income",
        minMinor: 0,
        maxMinor: undefined,
      }),
    ).toEqual({ kind: "income", minMinor: "0" });
  });

  it("hasFilters видит только заполненное", () => {
    expect(hasFilters({ q: "" })).toBe(false);
    expect(hasFilters({ tag: "авито" })).toBe(true);
  });
});

describe("withoutFilter", () => {
  it("снимает один фильтр и не трогает исходный объект", () => {
    const filters = { q: "цепь", kind: "expense" as const };
    expect(withoutFilter(filters, "q")).toEqual({ kind: "expense" });
    expect(filters.q).toBe("цепь");
  });
});

describe("filterChips", () => {
  it("подставляет названия статей и гостей", () => {
    const chips = filterChips(
      {
        q: "цепь",
        kind: "expense",
        categoryId: "cat-repair",
        guestId: "g1",
        tag: "авито",
        minMinor: 100_000,
      },
      [
        {
          id: "cat-repair",
          kind: "expense",
          name: "Ремонт",
          icon: "repair",
          position: 0,
        },
      ],
      [{ id: "g1", fullName: "Соловьёв Кирилл" }],
      "rub",
    );
    expect(chips.map((chip) => chip.label)).toEqual([
      "«цепь»",
      "Расходы",
      "Ремонт",
      "Соловьёв Кирилл",
      "#авито",
      `от 1${NBSP}000${NBSP}₽`,
    ]);
  });

  it("«без статьи» подписан словами", () => {
    expect(filterChips({ categoryId: "none" }, [], [], "rub")[0].label).toBe(
      "Без статьи",
    );
  });
});

describe("selectionTotals", () => {
  it("складывает только выбранные", () => {
    const entries = [
      entry("a", "income", 85_000),
      entry("b", "expense", 99_000),
      entry("c", "income", 170_000),
    ];
    expect(selectionTotals(entries, new Set(["a", "b"]))).toEqual({
      count: 2,
      incomeMinor: 85_000,
      expenseMinor: 99_000,
    });
  });
});

describe("duplicateOf", () => {
  it("копирует запись на сегодня вместе с гостем и сутками", () => {
    expect(duplicateOf(entry("a", "income", 170_000), "2026-09-14")).toEqual({
      kind: "income",
      amountMinor: 170_000,
      occurredOn: "2026-09-14",
      categoryId: "cat-live",
      note: "Кэлин Вячеслав",
      tags: ["наличные"],
      guestId: "g1",
      nights: 2,
    });
  });
});

describe("templateOf", () => {
  it("гость и сутки в шаблон не переходят", () => {
    const template = templateOf(entry("a", "income", 85_000), " Сутки ");
    expect(template).toEqual({
      name: "Сутки",
      kind: "income",
      amountMinor: 85_000,
      categoryId: "cat-live",
      note: "Кэлин Вячеслав",
      tags: ["наличные"],
    });
  });
});

describe("templateLabel", () => {
  it("с суммой и без", () => {
    const base = {
      id: "t",
      name: "Продукты",
      kind: "expense" as const,
      categoryId: null,
      note: "",
      tags: [],
    };
    expect(templateLabel({ ...base, amountMinor: null }, "rub")).toBe(
      "Продукты",
    );
    expect(templateLabel({ ...base, amountMinor: 70_000 }, "rub")).toBe(
      `Продукты · 700${NBSP}₽`,
    );
  });
});
