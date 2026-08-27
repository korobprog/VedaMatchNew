import { describe, expect, it } from "vitest";
import {
  MAX_AGE_YEARS,
  MONTH_NAMES,
  birthDateProblem,
  daysInMonth,
  toIso,
  toParts,
  withPart,
  yearOptions,
} from "./birth-date";

const TODAY = new Date("2026-08-27T00:00:00.000Z");

describe("toParts", () => {
  it("разбирает ISO на части", () => {
    expect(toParts("1985-03-07")).toEqual({
      year: "1985",
      month: "03",
      day: "07",
    });
  });

  it("на пустой и битой строке даёт пустые части", () => {
    for (const value of ["", null, undefined, "07.03.1985", "1985-3-7"]) {
      expect(toParts(value)).toEqual({ day: "", month: "", year: "" });
    }
  });
});

describe("daysInMonth", () => {
  it("знает короткие месяцы", () => {
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 1)).toBe(31);
  });

  it("считает февраль по високосности", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    // Век без високоса: 1900 делится на 100, но не на 400.
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("toIso", () => {
  it("собирает дату с ведущими нулями", () => {
    expect(toIso({ day: "7", month: "3", year: "1985" })).toBe("1985-03-07");
  });

  it("молчит, пока часть не выбрана", () => {
    expect(toIso({ day: "7", month: "3", year: "" })).toBeNull();
    expect(toIso({ day: "", month: "3", year: "1985" })).toBeNull();
  });

  it("не собирает несуществующую дату", () => {
    // 31 февраля выбрать можно, а существовать оно не начнёт.
    expect(toIso({ day: "31", month: "2", year: "1985" })).toBeNull();
    expect(toIso({ day: "29", month: "2", year: "2025" })).toBeNull();
    expect(toIso({ day: "31", month: "4", year: "1985" })).toBeNull();
  });

  it("принимает 29 февраля високосного года", () => {
    expect(toIso({ day: "29", month: "2", year: "2024" })).toBe("2024-02-29");
  });

  it("отбрасывает невозможные месяцы и дни", () => {
    expect(toIso({ day: "0", month: "3", year: "1985" })).toBeNull();
    expect(toIso({ day: "7", month: "13", year: "1985" })).toBeNull();
  });

  it("разбор и сборка возвращают исходную дату", () => {
    for (const iso of ["1929-12-31", "2000-02-29", "1985-03-07"]) {
      expect(toIso(toParts(iso))).toBe(iso);
    }
  });
});

describe("yearOptions", () => {
  it("начинает с нынешнего года — недавние сверху", () => {
    expect(yearOptions(TODAY)[0]).toBe(2026);
  });

  it("покрывает разумный возраст и не уходит дальше", () => {
    const years = yearOptions(TODAY);
    expect(years).toHaveLength(MAX_AGE_YEARS + 1);
    expect(years[years.length - 1]).toBe(2026 - MAX_AGE_YEARS);
  });
});

describe("birthDateProblem", () => {
  it("молчит на нормальной дате", () => {
    expect(
      birthDateProblem({ day: "07", month: "03", year: "1985" }, TODAY),
    ).toBeNull();
  });

  it("просит заполнить незаполненное", () => {
    expect(birthDateProblem({ day: "", month: "03", year: "1985" }, TODAY)).toMatch(
      /Укажите/,
    );
  });

  it("ловит несуществующую дату", () => {
    expect(
      birthDateProblem({ day: "31", month: "02", year: "1985" }, TODAY),
    ).toMatch(/не существует/);
  });

  it("не пускает дату рождения в будущее", () => {
    // Старая форма принимала её молча, и карта строилась по моменту,
    // которого ещё не было.
    expect(
      birthDateProblem({ day: "27", month: "06", year: "2027" }, TODAY),
    ).toMatch(/в будущем/);
  });

  it("сегодняшнюю дату пропускает", () => {
    expect(
      birthDateProblem({ day: "27", month: "08", year: "2026" }, TODAY),
    ).toBeNull();
  });
});

describe("withPart", () => {
  it("меняет свою часть и не трогает соседние", () => {
    expect(
      withPart({ day: "07", month: "03", year: "1985" }, "year", "1990"),
    ).toEqual({ day: "07", month: "03", year: "1990" });
  });

  it("подрезает день под короткий месяц", () => {
    // Выбрал 31-е, потом февраль — иначе день молча исчез бы из списка.
    expect(
      withPart({ day: "31", month: "01", year: "2025" }, "month", "02"),
    ).toEqual({ day: "28", month: "02", year: "2025" });
  });

  it("подрезает и при смене года — високосный февраль короче", () => {
    expect(
      withPart({ day: "29", month: "02", year: "2024" }, "year", "2025"),
    ).toEqual({ day: "28", month: "02", year: "2025" });
  });

  it("не трогает день, который в месяц помещается", () => {
    expect(
      withPart({ day: "07", month: "01", year: "2025" }, "month", "02"),
    ).toEqual({ day: "07", month: "02", year: "2025" });
  });

  it("не выдумывает день, пока его не выбрали", () => {
    expect(withPart({ day: "", month: "", year: "" }, "month", "02")).toEqual({
      day: "",
      month: "02",
      year: "",
    });
  });
});

describe("MONTH_NAMES", () => {
  it("двенадцать месяцев в родительном падеже — «7 марта»", () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[2]).toBe("марта");
  });
});
