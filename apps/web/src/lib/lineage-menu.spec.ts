import { describe, expect, it } from "vitest";
import { LINEAGES } from "@vedamatch/shared";
import {
  LINEAGE_MENU_NONE,
  lineageButtonLabel,
  lineageMenuGroups,
} from "./lineage-menu";

describe("lineageMenuGroups", () => {
  it("«без линии» первым, затем ISKCON, Гаудия-матх и Паривары", () => {
    const groups = lineageMenuGroups();

    expect(groups.map((group) => group.label)).toEqual([
      null,
      "ISKCON",
      "Гаудия-матх",
      "Паривары",
    ]);
    expect(groups[0].options).toEqual([
      { value: null, label: LINEAGE_MENU_NONE },
    ]);
  });

  it("перечисляет весь справочник ровно по разу", () => {
    const values = lineageMenuGroups()
      .flatMap((group) => group.options)
      .map((option) => option.value)
      .filter((value) => value !== null);

    expect(values).toEqual(LINEAGES.map((item) => item.id));
  });
});

describe("lineageButtonLabel", () => {
  it("называет текущую линию", () => {
    expect(lineageButtonLabel("iskcon")).toBe("Линия: ISKCON");
    expect(lineageButtonLabel("ipbys")).toBe("Линия: IPBYS");
  });

  it("без линии — «для всех линий»", () => {
    expect(lineageButtonLabel(null)).toBe("Линия: для всех линий");
  });
});
