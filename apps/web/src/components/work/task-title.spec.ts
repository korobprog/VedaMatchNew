import { describe, expect, it } from "vitest";
import { normalizeTaskTitle, titleToSave } from "./task-title";

describe("normalizeTaskTitle", () => {
  it("убирает пробелы по краям", () => {
    expect(normalizeTaskTitle("  Починить кнопку  ")).toBe("Починить кнопку");
  });

  it("схлопывает перевод строки в пробел", () => {
    expect(normalizeTaskTitle("Починить\nкнопку")).toBe("Починить кнопку");
  });

  it("схлопывает вставленный из письма текст с двойными пробелами", () => {
    expect(normalizeTaskTitle("Починить \n\n  кнопку")).toBe(
      "Починить кнопку",
    );
  });
});

describe("titleToSave", () => {
  it("без изменений сохранять нечего", () => {
    expect(titleToSave("Починить кнопку", "Починить кнопку")).toBeNull();
  });

  it("разница только в пробелах — тоже нечего", () => {
    expect(titleToSave("  Починить  кнопку ", "Починить кнопку")).toBeNull();
  });

  it("пустое название не сохраняется", () => {
    expect(titleToSave("   ", "Починить кнопку")).toBeNull();
    expect(titleToSave("\n", "Починить кнопку")).toBeNull();
  });

  it("новое название возвращается очищенным", () => {
    expect(titleToSave(" Починить\nкнопку ", "Старое")).toBe(
      "Починить кнопку",
    );
  });
});
