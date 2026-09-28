import { describe, expect, it } from "vitest";
import { materialMarksButtonLabel } from "./material-marks";

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
