import { describe, expect, it } from "vitest";
import type { WorkTaskPriority } from "@vedamatch/shared";
import { priorityMark } from "./task-priority";

describe("priorityMark", () => {
  it("обычная важность метки не получает", () => {
    expect(priorityMark("normal")).toBeNull();
  });

  it("срочное и важное различаются и цветом, и словом", () => {
    const urgent = priorityMark("urgent");
    const high = priorityMark("high");
    expect(urgent?.label).toBe("Срочно");
    expect(high?.label).toBe("Важная");
    expect(urgent?.dot).not.toBe(high?.dot);
    expect(urgent?.edge).not.toBe(high?.edge);
  });

  it("«не горит» помечено, но края не красит", () => {
    const low = priorityMark("low");
    expect(low?.label).toBe("Не горит");
    expect(low?.edge).toBe("");
  });

  it("у каждой метки есть слово, а не только цвет", () => {
    const all: WorkTaskPriority[] = ["low", "normal", "high", "urgent"];
    for (const priority of all) {
      const mark = priorityMark(priority);
      if (mark) expect(mark.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("незнакомая важность не роняет карточку", () => {
    expect(priorityMark("shouting" as WorkTaskPriority)).toBeNull();
  });
});
