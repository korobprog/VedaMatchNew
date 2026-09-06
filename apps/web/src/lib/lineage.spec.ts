import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTENT_LINEAGE,
  LINEAGES,
  defaultLineageFor,
  detectSpiritualStage,
  isLineageId,
  isLineagePreference,
  lineageLabel,
  lineagesByGroup,
  needsLineageChoice,
  resolveContentLineage,
  toLineageId,
  toLineagePreference,
  type SelfIdentificationAnswers,
} from "@vedamatch/shared";

/**
 * Правила линии живут в общем пакете, у которого своих тестов нет; веб —
 * ближайший потребитель с vitest. API проверяет те же функции через сервисы.
 */

const devotee = { spiritualStage: "devotee" as const, lineage: "ipbys" as const };
const devoteeNoLineage = { spiritualStage: "devotee" as const, lineage: null };
const yogi = { spiritualStage: "yogi" as const, lineage: "ipbys" as const };

describe("справочник линий", () => {
  it("содержит ISKCON, четыре Гаудия-матха и пять паривар в этом порядке", () => {
    const groups = lineagesByGroup();
    expect(groups.map((g) => [g.group, g.items.length])).toEqual([
      ["iskcon", 1],
      ["gaudiya_math", 4],
      ["parivara", 5],
    ]);
    expect(LINEAGES[0].id).toBe(DEFAULT_CONTENT_LINEAGE);
  });

  it("идентификаторы уникальны и у каждого есть подпись", () => {
    const ids = LINEAGES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of LINEAGES) {
      expect(lineageLabel(item.id)).toBe(item.label);
      expect(isLineageId(item.id)).toBe(true);
    }
  });

  it("чужие строки не признаёт ни линией, ни настройкой", () => {
    expect(isLineageId("hare")).toBe(false);
    expect(toLineageId("hare")).toBeNull();
    expect(lineageLabel("hare")).toBeNull();
    expect(isLineagePreference("hare")).toBe(false);
    expect(toLineagePreference("hare")).toBeNull();
    expect(isLineagePreference("all")).toBe(true);
    expect(isLineagePreference(null)).toBe(true);
  });
});

describe("resolveContentLineage: что показывать", () => {
  it("преданному без настройки — линию из профиля", () => {
    expect(resolveContentLineage(devotee, null)).toBe("ipbys");
  });

  it("преданному без линии в профиле — ничего не фильтрует", () => {
    expect(resolveContentLineage(devoteeNoLineage, null)).toBeNull();
  });

  it("йогу ничего не фильтрует, даже если поле в профиле заполнено", () => {
    expect(resolveContentLineage(yogi, null)).toBeNull();
    expect(resolveContentLineage(null, null)).toBeNull();
  });

  it("настройка сервиса сильнее профиля и работает у любого этапа", () => {
    expect(resolveContentLineage(devotee, "iskcon")).toBe("iskcon");
    expect(resolveContentLineage(yogi, "iskcon")).toBe("iskcon");
  });

  it("«all» снимает фильтр и у преданного", () => {
    expect(resolveContentLineage(devotee, "all")).toBeNull();
  });
});

describe("needsLineageChoice и defaultLineageFor", () => {
  it("предлагает выбрать линию только преданному без линии", () => {
    expect(needsLineageChoice(devoteeNoLineage)).toBe(true);
    expect(needsLineageChoice(devotee)).toBe(false);
    expect(needsLineageChoice({ spiritualStage: "yogi", lineage: null })).toBe(false);
    expect(needsLineageChoice(null)).toBe(false);
  });

  it("новый материал получает линию преданного, иначе ISKCON", () => {
    expect(defaultLineageFor(devotee)).toBe("ipbys");
    expect(defaultLineageFor(devoteeNoLineage)).toBe("iskcon");
    expect(defaultLineageFor(yogi)).toBe("iskcon");
    expect(defaultLineageFor(null)).toBe("iskcon");
  });
});

describe("detectSpiritualStage: общая с сервером функция", () => {
  const base: SelfIdentificationAnswers = {
    interest: "beginning",
    regularPractice: "none",
    currentFocus: "curiosity",
    hasMentor: false,
    hasCommunity: false,
    hasSpiritualName: false,
    participatesInService: false,
    wantsRecommendations: true,
  };

  it("четыре признака преданного дают «преданного», три — нет", () => {
    expect(
      detectSpiritualStage({
        ...base,
        hasMentor: true,
        hasCommunity: true,
        hasSpiritualName: true,
        participatesInService: true,
      }),
    ).toBe("devotee");
    expect(
      detectSpiritualStage({
        ...base,
        hasMentor: true,
        hasCommunity: true,
        hasSpiritualName: true,
      }),
    ).not.toBe("devotee");
  });

  it("остальные этапы — по практике и интересу", () => {
    expect(detectSpiritualStage(base)).toBe("seeker");
    expect(detectSpiritualStage({ ...base, regularPractice: "sometimes" })).toBe(
      "practitioner",
    );
    expect(detectSpiritualStage({ ...base, regularPractice: "daily" })).toBe(
      "yogi",
    );
  });
});
