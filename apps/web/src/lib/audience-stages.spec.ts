import { describe, expect, it } from "vitest";
import {
  audienceStagesMatch,
  parseAudienceStages,
  resolveAudienceStage,
  toAudienceStages,
} from "@vedamatch/shared";
import {
  audienceStagesButtonLabel,
  audienceStagesSummary,
  sameAudienceStages,
  stageScopeTitle,
  toggleAudienceStage,
} from "./audience-stages";

describe("общие правила ступеней (VED-575)", () => {
  it("разметка из запроса: без повторов, в порядке пути", () => {
    expect(parseAudienceStages(["devotee", "seeker", "devotee"])).toEqual([
      "seeker",
      "devotee",
    ]);
    expect(parseAudienceStages([])).toEqual([]);
  });

  it("неверная разметка — null", () => {
    expect(parseAudienceStages("yogi")).toBeNull();
    expect(parseAudienceStages(["yogi", "guru"])).toBeNull();
    expect(parseAudienceStages(undefined)).toBeNull();
  });

  it("из базы незнакомое значение отбрасывается", () => {
    expect(toAudienceStages(["yogi", "old_stage", "seeker"])).toEqual([
      "seeker",
      "yogi",
    ]);
    expect(toAudienceStages(null)).toEqual([]);
  });

  it("ступень зрителя: «Все ступени» и отсутствие анкеты снимают фильтр", () => {
    expect(resolveAudienceStage({ spiritualStage: "yogi" })).toBe("yogi");
    expect(
      resolveAudienceStage({ spiritualStage: "yogi", showAllStages: true }),
    ).toBeNull();
    expect(resolveAudienceStage({ spiritualStage: null })).toBeNull();
    expect(resolveAudienceStage(null)).toBeNull();
  });

  it("материал «для всех» виден любому, размеченный — своей ступени", () => {
    expect(audienceStagesMatch([], "seeker")).toBe(true);
    expect(audienceStagesMatch(["yogi"], "seeker")).toBe(false);
    expect(audienceStagesMatch(["yogi", "seeker"], "seeker")).toBe(true);
    expect(audienceStagesMatch(["yogi"], null)).toBe(true);
  });
});

describe("меню «Ступени»", () => {
  it("отмечает и снимает ступень, держа порядок пути", () => {
    expect(toggleAudienceStage(["devotee"], "seeker")).toEqual([
      "seeker",
      "devotee",
    ]);
    expect(toggleAudienceStage(["seeker", "devotee"], "seeker")).toEqual([
      "devotee",
    ]);
  });

  it("сравнивает наборы без учёта порядка", () => {
    expect(sameAudienceStages(["yogi", "seeker"], ["seeker", "yogi"])).toBe(
      true,
    );
    expect(sameAudienceStages(["yogi"], ["seeker"])).toBe(false);
    expect(sameAudienceStages([], [])).toBe(true);
  });

  it("подпись: пусто и все четыре — «для всех»", () => {
    expect(audienceStagesSummary([])).toBe("для всех");
    expect(
      audienceStagesSummary(["seeker", "practitioner", "yogi", "devotee"]),
    ).toBe("для всех");
    expect(audienceStagesButtonLabel(["devotee", "yogi"])).toBe(
      "Ступени самоидентификации: Йог, Преданный",
    );
  });
});

describe("переключатель на главной", () => {
  it("подсказка говорит, что видно сейчас", () => {
    expect(stageScopeTitle("yogi", false)).toContain("«Йог» и для всех");
    expect(stageScopeTitle("yogi", true)).toContain(
      "Показаны материалы всех ступеней",
    );
  });
});
