import { describe, expect, it } from "vitest";
import type { TravelCashEntryDto } from "@vedamatch/shared";
import {
  cashRangeFor,
  groupCashEntries,
  localToday,
  MAX_CASH_RANGE_DAYS,
  periodKey,
  periodLabel,
} from "./cash-grouping";

let seq = 0;
function entry(
  occurredOn: string,
  kind: "income" | "expense",
  amountMinor: number,
): TravelCashEntryDto {
  seq += 1;
  return {
    id: `e${seq}`,
    kind,
    amountMinor,
    occurredOn,
    categoryId: null,
    note: "",
    tags: [],
    authorName: null,
    createdAt: `2026-05-20T10:00:${String(seq).padStart(2, "0")}.000Z`,
  };
}

describe("groupCashEntries", () => {
  // Числа со скриншота хостела: 18–20 мая 2026.
  const entries = [
    entry("2026-05-18", "income", 1_340_000),
    entry("2026-05-18", "expense", 6_888_100),
    entry("2026-05-19", "income", 170_000),
    entry("2026-05-19", "expense", 264_600),
    entry("2026-05-20", "income", 340_000),
  ];

  it("считает итоги дня и нарастающий остаток", () => {
    const groups = groupCashEntries(entries, "day", 12_452_600);
    expect(groups.map((g) => g.key)).toEqual([
      "2026-05-20",
      "2026-05-19",
      "2026-05-18",
    ]);
    expect(groups[2]).toMatchObject({
      startMinor: 12_452_600,
      incomeMinor: 1_340_000,
      expenseMinor: 6_888_100,
      endMinor: 6_904_500,
    });
    expect(groups[1]).toMatchObject({
      startMinor: 6_904_500,
      endMinor: 6_809_900,
    });
    expect(groups[0]).toMatchObject({
      startMinor: 6_809_900,
      endMinor: 7_149_900,
    });
  });

  it("внутри группы новые записи сверху", () => {
    const [today] = groupCashEntries(
      [entry("2026-05-20", "income", 1), entry("2026-05-20", "income", 2)],
      "day",
      0,
    );
    expect(today.entries.map((e) => e.amountMinor)).toEqual([2, 1]);
  });

  it("не зависит от порядка, в котором пришли записи", () => {
    const shuffled = [
      entries[3],
      entries[0],
      entries[4],
      entries[2],
      entries[1],
    ];
    expect(groupCashEntries(shuffled, "day", 0)).toEqual(
      groupCashEntries(entries, "day", 0),
    );
  });

  it("складывает неделю в одну группу", () => {
    const groups = groupCashEntries(entries, "week", 0);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "2026-05-18",
      incomeMinor: 1_850_000,
      expenseMinor: 7_152_700,
      endMinor: -5_302_700,
    });
  });

  it("пустая лента — ни одной группы", () => {
    expect(groupCashEntries([], "month", 100)).toEqual([]);
  });
});

describe("periodKey", () => {
  it("неделя начинается с понедельника, воскресенье — её конец", () => {
    expect(periodKey("2026-05-24", "week")).toBe("2026-05-18");
    expect(periodKey("2026-05-25", "week")).toBe("2026-05-25");
  });

  it("неделя на стыке лет берёт понедельник прошлого года", () => {
    expect(periodKey("2027-01-01", "week")).toBe("2026-12-28");
  });

  it("месяц и год", () => {
    expect(periodKey("2026-05-20", "month")).toBe("2026-05");
    expect(periodKey("2026-05-20", "year")).toBe("2026");
  });
});

describe("periodLabel", () => {
  it("день — с днём недели, как в кассовой книге", () => {
    expect(periodLabel("2026-05-20", "day")).toMatch(/среда.*20 мая 2026/);
  });

  it("месяц — с заглавной и без «г.»", () => {
    expect(periodLabel("2026-05", "month")).toBe("Май 2026");
  });

  it("неделя — промежуток дат", () => {
    expect(periodLabel("2026-05-18", "week")).toBe("18 мая — 24 мая 2026");
  });
});

describe("cashRangeFor", () => {
  it("по дням — 31 день по сегодня включительно", () => {
    expect(cashRangeFor("day", "2026-05-20", 1)).toEqual({
      from: "2026-04-20",
      to: "2026-05-20",
    });
  });

  it("по неделям — от понедельника, 12 недель", () => {
    expect(cashRangeFor("week", "2026-05-20", 1).from).toBe("2026-03-02");
  });

  it("по месяцам — с первого числа, 12 месяцев", () => {
    expect(cashRangeFor("month", "2026-05-20", 1).from).toBe("2025-06-01");
  });

  it("по годам — с 1 января, три года", () => {
    expect(cashRangeFor("year", "2026-05-20", 1).from).toBe("2024-01-01");
  });

  it("не просит у API больше, чем оно отдаёт", () => {
    for (const grouping of ["day", "week", "month", "year"] as const) {
      const { from, to } = cashRangeFor(grouping, "2026-05-20", 50);
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(MAX_CASH_RANGE_DAYS);
    }
  });
});

describe("localToday", () => {
  it("берёт день по местным часам, а не по UTC", () => {
    expect(localToday(new Date(2026, 4, 20, 23, 50))).toBe("2026-05-20");
  });
});
