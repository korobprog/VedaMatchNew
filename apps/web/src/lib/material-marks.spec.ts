import { describe, expect, it } from "vitest";
import {
  hasMarkedStages,
  materialMarksButtonLabel,
  materialMarksButtonToneClass,
} from "./material-marks";

describe("materialMarksButtonLabel (VED-616)", () => {
  it("подпись «Разметки»: без ступеней — только линия (Блог)", () => {
    expect(materialMarksButtonLabel({ lineage: null })).toBe(
      "Разметка. Линия: для всех линий",
    );
    expect(
      materialMarksButtonLabel({ stages: ["devotee"], lineage: "iskcon" }),
    ).toBe("Разметка. Ступени: Преданный. Линия: ISKCON");
  });
});

describe("materialMarksButtonToneClass (VED-613)", () => {
  const pink = "border-magenta/50";
  const green = "border-cyan/60";

  it("«для всех» — ни ступеней, ни линии — зелёная", () => {
    expect(
      materialMarksButtonToneClass({ stages: [], lineage: null }),
    ).toContain(green);
    expect(materialMarksButtonToneClass({ lineage: null })).toContain(green);
    expect(
      materialMarksButtonToneClass({
        stages: ["seeker", "practitioner", "yogi", "devotee"],
        lineage: null,
      }),
    ).toContain(green);
  });

  it("одна отмеченная ступень без линии — розовая (скриншот заказчика)", () => {
    expect(
      materialMarksButtonToneClass({ stages: ["devotee"], lineage: null }),
    ).toContain(pink);
  });

  it("линия без ступеней и ступени с линией — розовая", () => {
    expect(
      materialMarksButtonToneClass({ stages: [], lineage: "iskcon" }),
    ).toContain(pink);
    expect(materialMarksButtonToneClass({ lineage: "iskcon" })).toContain(pink);
    expect(
      materialMarksButtonToneClass({ stages: ["devotee"], lineage: "iskcon" }),
    ).toContain(pink);
  });

  it("hasMarkedStages: от одной до трёх ступеней", () => {
    expect(hasMarkedStages(undefined)).toBe(false);
    expect(hasMarkedStages([])).toBe(false);
    expect(hasMarkedStages(["devotee", "yogi"])).toBe(true);
  });
});
