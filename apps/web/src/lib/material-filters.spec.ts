import { describe, expect, it } from "vitest";
import {
  lineageGroupState,
  materialFiltersActive,
  materialFiltersButtonLabel,
  profileMaterialFilters,
  sameMaterialFilters,
  toggleLineage,
  toggleLineageGroup,
} from "./material-filters";

describe("отметки линий (VED-617)", () => {
  it("линия отмечается и снимается, порядок — справочника", () => {
    expect(toggleLineage(["ipbys"], "iskcon")).toEqual(["iskcon", "ipbys"]);
    expect(toggleLineage(["iskcon", "ipbys"], "iskcon")).toEqual(["ipbys"]);
  });

  it("группа: частично — отмечается вся, целиком — снимается", () => {
    const some = toggleLineage([], "ipbys");
    expect(lineageGroupState(some, "gaudiya_math")).toBe("some");
    const all = toggleLineageGroup(some, "gaudiya_math");
    expect(lineageGroupState(all, "gaudiya_math")).toBe("all");
    expect(all).toHaveLength(4);
    expect(toggleLineageGroup(all, "gaudiya_math")).toEqual([]);
    expect(lineageGroupState([], "parivara")).toBe("none");
  });
});

describe("подписи и сравнение", () => {
  it("имя кнопки говорит, что видно сейчас", () => {
    expect(materialFiltersButtonLabel({ stages: [], lineages: [] })).toBe(
      "Фильтры материалов: ступени — все; линии — все",
    );
    expect(
      materialFiltersButtonLabel({ stages: ["yogi"], lineages: ["iskcon"] }),
    ).toBe("Фильтры материалов: ступени — Йог; линии — ISKCON");
  });

  it("фильтры активны, когда сужают хоть один раздел", () => {
    expect(materialFiltersActive({ stages: [], lineages: [] })).toBe(false);
    expect(materialFiltersActive({ stages: [], lineages: ["ipbys"] })).toBe(
      true,
    );
  });

  it("наборы сравниваются без учёта порядка", () => {
    expect(
      sameMaterialFilters(
        { stages: ["yogi", "seeker"], lineages: [] },
        { stages: ["seeker", "yogi"], lineages: [] },
      ),
    ).toBe(true);
    expect(
      sameMaterialFilters(
        { stages: ["yogi"], lineages: [] },
        { stages: ["yogi"], lineages: ["iskcon"] },
      ),
    ).toBe(false);
  });
});

describe("profileMaterialFilters", () => {
  it("берёт фильтры из профиля, а у старого ответа — по анкете", () => {
    expect(
      profileMaterialFilters({
        spiritualStage: "devotee",
        lineage: "ipbys",
        materialFilters: { stages: [], lineages: [], custom: true },
      }),
    ).toEqual({ stages: [], lineages: [], custom: true });
    expect(
      profileMaterialFilters({ spiritualStage: "devotee", lineage: "ipbys" }),
    ).toEqual({ stages: ["devotee"], lineages: ["ipbys"], custom: false });
    expect(profileMaterialFilters(null)).toEqual({
      stages: [],
      lineages: [],
      custom: false,
    });
  });
});
