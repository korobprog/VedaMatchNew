import { describe, expect, it } from "vitest";
import { LINEAGES } from "@vedamatch/shared";
import {
  activeLineageChoice,
  hrefWithoutLineage,
  lineageFilterOptions,
  preferenceForChoice,
} from "./lineage-filter";

const devotee = (lineage: (typeof LINEAGES)[number]["id"] | null) => ({
  spiritualStage: "devotee" as const,
  lineage,
});
const seeker = { spiritualStage: "seeker" as const, lineage: null };

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
    expect(saraswat?.label).toBe("Сарасват Матх");
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

describe("preferenceForChoice", () => {
  it("своя линия преданного сбрасывает настройку в «как в профиле»", () => {
    expect(preferenceForChoice(devotee("iskcon"), "iskcon")).toBeNull();
  });

  it("чужая линия преданного записывается явно", () => {
    expect(
      preferenceForChoice(devotee("iskcon"), "sri_chaitanya_gaudiya_math"),
    ).toBe("sri_chaitanya_gaudiya_math");
  });

  it("«все линии» у преданного с линией — явное «all»", () => {
    expect(preferenceForChoice(devotee("iskcon"), "all")).toBe("all");
  });

  it("«все линии» у преданного без линии и у ищущего — «как в профиле»", () => {
    expect(preferenceForChoice(devotee(null), "all")).toBeNull();
    expect(preferenceForChoice(seeker, "all")).toBeNull();
    expect(preferenceForChoice(null, "all")).toBeNull();
  });

  it("линия у ищущего записывается явно: без неё он видит всё", () => {
    expect(preferenceForChoice(seeker, "iskcon")).toBe("iskcon");
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
