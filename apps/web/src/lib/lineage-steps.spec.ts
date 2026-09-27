import { describe, expect, it } from "vitest";
import {
  lineageDetailOptions,
  lineageFirstStepPick,
  lineageFirstStepValue,
  lineageGroupHasDetail,
  lineageGroupOptions,
  lineageValueGroup,
} from "./lineage-steps";

describe("выбор линии в два шага (VED-568)", () => {
  it("первый шаг — три группы, ISKCON одной строкой с расшифровкой", () => {
    expect(lineageGroupOptions().map((o) => [o.value, o.label])).toEqual([
      ["iskcon", "ISKCON — Международное общество сознания Кришны"],
      ["gaudiya_math", "Гаудия-матх"],
      ["parivara", "Паривары"],
    ]);
    expect(lineageGroupOptions(true)[0].label).toBe("ISKCON");
  });

  it("второй шаг нужен только группам из нескольких линий", () => {
    expect(lineageGroupHasDetail("iskcon")).toBe(false);
    expect(lineageGroupHasDetail("gaudiya_math")).toBe(true);
    expect(lineageGroupHasDetail("parivara")).toBe(true);
  });

  it("группа значения — и у линии, и у группы-фильтра", () => {
    expect(lineageValueGroup("ipbys")).toBe("gaudiya_math");
    expect(lineageValueGroup("group:parivara")).toBe("parivara");
    expect(lineageValueGroup("")).toBeNull();
    expect(lineageValueGroup("all")).toBeNull();
  });

  it("первый шаг показывает группу значения, а начатый выбор — сильнее", () => {
    expect(lineageFirstStepValue("", null)).toBe("");
    expect(lineageFirstStepValue("all", null)).toBe("all");
    expect(lineageFirstStepValue("iskcon", null)).toBe("iskcon");
    expect(lineageFirstStepValue("advaita_vamsha", null)).toBe("parivara");
    expect(lineageFirstStepValue("group:gaudiya_math", null)).toBe(
      "gaudiya_math",
    );
    expect(lineageFirstStepValue("iskcon", "parivara")).toBe("parivara");
  });

  it("ISKCON, «пусто» и «все» выбираются сразу", () => {
    expect(lineageFirstStepPick("iskcon", "ipbys", false)).toEqual({
      value: "iskcon",
    });
    expect(lineageFirstStepPick("", "ipbys", false)).toEqual({ value: "" });
    expect(lineageFirstStepPick("all", "ipbys", false)).toEqual({
      value: "all",
    });
  });

  it("линия материала: группа только открывает второй шаг", () => {
    expect(lineageFirstStepPick("gaudiya_math", "iskcon", false)).toEqual({
      pending: "gaudiya_math",
    });
    // Та же группа, что уже стоит, — линия выбрана, ждать нечего.
    expect(lineageFirstStepPick("gaudiya_math", "ipbys", false)).toBeNull();
  });

  it("фильтр: группа выбирается целиком", () => {
    expect(lineageFirstStepPick("parivara", "", true)).toEqual({
      value: "group:parivara",
    });
  });

  it("второй шаг — линии группы, в фильтре первым «любой»", () => {
    expect(lineageDetailOptions("gaudiya_math").map((o) => o.value)).toEqual([
      "sri_chaitanya_gaudiya_math",
      "sri_chaitanya_saraswat_math",
      "sri_gopinath_gaudiya_math",
      "ipbys",
    ]);
    const filter = lineageDetailOptions("parivara", { allowGroup: true });
    expect(filter[0]).toMatchObject({
      value: "group:parivara",
      label: "Любой паривар",
    });
    expect(filter).toHaveLength(6);
    expect(
      lineageDetailOptions("gaudiya_math", { compact: true }).find(
        (o) => o.value === "ipbys",
      )?.label,
    ).toBe("IPBYS");
  });
});
