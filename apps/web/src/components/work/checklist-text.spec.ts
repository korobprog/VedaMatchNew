import { describe, expect, it } from "vitest";
import { isLongChecklistText } from "./checklist-text";

describe("isLongChecklistText (VED-375)", () => {
  it("короткий пункт не сворачивается", () => {
    expect(isLongChecklistText("Проверить на телефоне")).toBe(false);
  });

  it("длиннее трёх строк телефона — сворачивается", () => {
    expect(isLongChecklistText("а".repeat(141))).toBe(true);
    expect(isLongChecklistText("а".repeat(140))).toBe(false);
  });

  it("четыре абзаца — сворачивается, даже если коротко", () => {
    expect(isLongChecklistText("1\n2\n3\n4")).toBe(true);
    expect(isLongChecklistText("1\n2\n3")).toBe(false);
  });
});
