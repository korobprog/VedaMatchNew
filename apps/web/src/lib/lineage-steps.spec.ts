import { describe, expect, it } from "vitest";
import {
  lineageDetailOptions,
  lineageDetailValue,
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
    expect(lineageFirstStepPick("iskcon", "ipbys")).toEqual({
      value: "iskcon",
    });
    expect(lineageFirstStepPick("", "ipbys")).toEqual({ value: "" });
    expect(lineageFirstStepPick("all", "ipbys")).toEqual({
      value: "all",
    });
  });

  it("группа только открывает второй шаг — целиком её не выбрать", () => {
    expect(lineageFirstStepPick("gaudiya_math", "iskcon")).toEqual({
      pending: "gaudiya_math",
    });
    expect(lineageFirstStepPick("parivara", "")).toEqual({
      pending: "parivara",
    });
    // Та же группа, что уже стоит, — линия выбрана, ждать нечего.
    expect(lineageFirstStepPick("gaudiya_math", "ipbys")).toBeNull();
    // Сохранённая раньше группа целиком — линия ещё не выбрана.
    expect(lineageFirstStepPick("parivara", "group:parivara")).toEqual({
      pending: "parivara",
    });
  });

  it("второй шаг: линия значения, иначе — ещё не уточнено", () => {
    expect(lineageDetailValue("ipbys", null)).toBe("ipbys");
    expect(lineageDetailValue("ipbys", "parivara")).toBe("");
    expect(lineageDetailValue("group:gaudiya_math", null)).toBe("");
    expect(lineageDetailValue("", null)).toBe("");
  });

  it("второй шаг — только линии группы, без «любого» (VED-568)", () => {
    expect(lineageDetailOptions("gaudiya_math").map((o) => o.value)).toEqual([
      "sri_chaitanya_gaudiya_math",
      "sri_chaitanya_saraswat_math",
      "sri_gopinath_gaudiya_math",
      "ipbys",
    ]);
    const parivara = lineageDetailOptions("parivara");
    expect(parivara).toHaveLength(5);
    expect(parivara.some((o) => o.value.startsWith("group:"))).toBe(false);
    expect(parivara.some((o) => o.label.startsWith("Любой"))).toBe(false);
    expect(
      lineageDetailOptions("gaudiya_math", { compact: true }).find(
        (o) => o.value === "ipbys",
      )?.label,
    ).toBe("IPBYS");
  });
});
