import { describe, expect, it } from "vitest";
import { LINEAGES } from "@vedamatch/shared";
import {
  LINEAGE_MENU_NONE,
  lineageButtonLabel,
  lineageMenuItems,
  lineageMenuOpenGroup,
} from "./lineage-menu";

describe("lineageMenuItems", () => {
  it("«без линии» первым, затем ISKCON, Гаудия-матх и Паривары", () => {
    const items = lineageMenuItems();

    expect(
      items.map((item) =>
        item.kind === "choice" ? item.option.label : item.label,
      ),
    ).toEqual([LINEAGE_MENU_NONE, "ISKCON", "Гаудия-матх", "Паривары"]);
    expect(items[0]).toEqual({
      kind: "choice",
      option: { value: null, label: LINEAGE_MENU_NONE },
    });
  });

  it("ISKCON — один пункт, без заголовка группы над ним (VED-568)", () => {
    const labels = lineageMenuItems().flatMap((item) =>
      item.kind === "choice"
        ? [item.option.label]
        : [item.label, ...item.options.map((option) => option.label)],
    );
    expect(labels.filter((label) => label === "ISKCON")).toHaveLength(1);
    expect(lineageMenuItems()[1]).toEqual({
      kind: "choice",
      option: { value: "iskcon", label: "ISKCON" },
    });
  });

  it("перечисляет весь справочник ровно по разу", () => {
    const values = lineageMenuItems()
      .flatMap((item) =>
        item.kind === "choice" ? [item.option] : item.options,
      )
      .map((option) => option.value)
      .filter((value) => value !== null);

    expect(values).toEqual(LINEAGES.map((item) => item.id));
  });
});

describe("lineageMenuOpenGroup", () => {
  it("раскрывает группу текущей линии, если в ней есть что выбирать", () => {
    expect(lineageMenuOpenGroup("ipbys")).toBe("gaudiya_math");
    expect(lineageMenuOpenGroup("advaita_vamsha")).toBe("parivara");
    expect(lineageMenuOpenGroup("iskcon")).toBeNull();
    expect(lineageMenuOpenGroup(null)).toBeNull();
  });
});

describe("lineageButtonLabel", () => {
  it("называет группу и текущую линию", () => {
    expect(lineageButtonLabel("iskcon")).toBe("Линия: ISKCON");
    expect(lineageButtonLabel("ipbys")).toBe("Линия: Гаудия-матх — IPBYS");
  });

  it("без линии — «для всех линий»", () => {
    expect(lineageButtonLabel(null)).toBe("Линия: для всех линий");
  });
});
