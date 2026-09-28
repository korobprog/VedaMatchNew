import { describe, expect, it } from "vitest";
import { formatTaskDate } from "./task-date";

describe("formatTaskDate", () => {
  it("пишет день, месяц словом и год", () => {
    // Полдень по UTC — тот же день в любой зоне, где гоняют тесты.
    expect(formatTaskDate("2026-09-09T12:00:00.000Z")).toBe(
      "9 сентября 2026 г.",
    );
  });

  it("битая дата не превращается в «Invalid Date»", () => {
    expect(formatTaskDate("не дата")).toBe("—");
  });
});
