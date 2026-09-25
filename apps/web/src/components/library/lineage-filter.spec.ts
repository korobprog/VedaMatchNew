import { describe, expect, it } from "vitest";
import { LINEAGES } from "@vedamatch/shared";
import {
  activeLineageChoice,
  hrefWithoutLineage,
  lineageChoiceGroup,
  lineageFilterMenu,
  lineageFilterOptions,
  preferenceForChoice,
} from "./lineage-filter";

describe("lineageFilterOptions", () => {
  it("начинается с «все линии» и содержит каждую линию справочника по порядку", () => {
    const options = lineageFilterOptions("Все линии");
    expect(options[0]).toEqual({ value: "all", label: "Все линии", title: "Все линии" });
    expect(options.slice(1).map((o) => o.value)).toEqual(LINEAGES.map((l) => l.id));
  });

  it("на кнопке короткое название, в подсказке — полное с расшифровкой", () => {
    const options = lineageFilterOptions("Все линии");
    const iskcon = options.find((o) => o.value === "iskcon");
    expect(iskcon?.label).toBe("ISKCON");
    expect(iskcon?.title).toBe("ISKCON — Международное общество сознания Кришны");
    const saraswat = options.find((o) => o.value === "sri_chaitanya_saraswat_math");
    expect(saraswat?.label).toBe("Шри Чайтанья Сарасват Матх");
    expect(saraswat?.title).toBe("Шри Чайтанья Сарасват Матх");
  });
});

describe("activeLineageChoice", () => {
  it("без фильтра нажата «все линии»", () => {
    expect(activeLineageChoice(null)).toBe("all");
  });
  it("с фильтром — кнопка этой линии", () => {
    expect(activeLineageChoice("ipbys")).toBe("ipbys");
  });
});

describe("preferenceForChoice (VED-483)", () => {
  it("«Все» — пустая настройка: так Образование и показывает по умолчанию", () => {
    expect(preferenceForChoice("all")).toBeNull();
  });

  it("линия записывается явно — и у преданного, и у ищущего", () => {
    expect(preferenceForChoice("iskcon")).toBe("iskcon");
    expect(preferenceForChoice("sri_chaitanya_gaudiya_math")).toBe(
      "sri_chaitanya_gaudiya_math",
    );
  });
});

describe("hrefWithoutLineage", () => {
  it("убирает lineage и cursor, остальное оставляет", () => {
    expect(
      hrefWithoutLineage("/library", "?lineage=all&type=VIDEO&cursor=abc&q=гита"),
    ).toBe("/library?type=VIDEO&q=%D0%B3%D0%B8%D1%82%D0%B0");
  });

  it("без параметров — голый путь", () => {
    expect(hrefWithoutLineage("/library", "?lineage=iskcon")).toBe("/library");
    expect(hrefWithoutLineage("/library", "")).toBe("/library");
  });
});

describe("lineageFilterMenu (VED-449)", () => {
  const menu = lineageFilterMenu({
    all: "Всё",
    groups: { iskcon: "ИСККОН", gaudiya_math: "Гаудия-матх", parivara: "Паривары" },
  });

  it("четыре позиции: всё, ИСККОН сразу выбором, две раскрывающиеся группы", () => {
    expect(menu.map((item) => (item.kind === "choice" ? item.option.label : item.label))).toEqual([
      "Всё",
      "ИСККОН",
      "Гаудия-матх",
      "Паривары",
    ]);
    expect(menu.map((item) => item.kind)).toEqual(["choice", "choice", "group", "group"]);
  });

  it("в группах — все линии справочника, ни одна не потеряна", () => {
    const inGroups = menu.flatMap((item) =>
      item.kind === "group" ? item.options.map((option) => option.value) : [item.option.value],
    );
    expect(inGroups).toHaveLength(11);
    expect(inGroups).toContain("ipbys");
    expect(inGroups).toContain("shyamananda_parivara");
  });

  it("группа выбранной линии", () => {
    expect(lineageChoiceGroup("all")).toBeNull();
    expect(lineageChoiceGroup("iskcon")).toBe("iskcon");
    expect(lineageChoiceGroup("ipbys")).toBe("gaudiya_math");
    expect(lineageChoiceGroup("narottama_parivara")).toBe("parivara");
  });
});
