import { describe, expect, it } from "vitest";
import {
  TITLE_SOFT_MAX,
  normalizeTaskTitle,
  splitTaskDraft,
  titleToSave,
} from "./task-title";

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

describe("splitTaskDraft", () => {
  it("короткое остаётся названием целиком", () => {
    const short = "Починить кнопку сохранения";
    expect(splitTaskDraft(short)).toEqual({ title: short, description: "" });
  });

  it("пустое поле делить нечего", () => {
    expect(splitTaskDraft("   ")).toEqual({ title: "", description: "" });
  });

  it("режет по концу предложения и оставляет точку в названии", () => {
    const text =
      "Починить кнопку сохранения в карточке. Сейчас она не реагирует на нажатие, и правка теряется.";
    const split = splitTaskDraft(text);

    expect(split.title).toBe("Починить кнопку сохранения в карточке.");
    expect(split.description).toBe(
      "Сейчас она не реагирует на нажатие, и правка теряется.",
    );
  });

  it("без точки режет по пробелу и ставит многоточие", () => {
    const text =
      "Сделать так чтобы длинный текст задачи из формы сам делился на название и описание без потерь";
    const split = splitTaskDraft(text);

    expect(split.title.endsWith("…")).toBe(true);
    expect(split.title.length).toBeLessThanOrEqual(TITLE_SOFT_MAX + 1);
    // Слово пополам не рвём: описание начинается с целого слова.
    expect(split.description.startsWith(" ")).toBe(false);
    expect(`${split.title.slice(0, -1)} ${split.description}`).toBe(text);
  });

  it("перевод строки — готовая граница, её и берём", () => {
    const split = splitTaskDraft("Купить билеты\nна поезд, туда и обратно");

    expect(split.title).toBe("Купить билеты");
    expect(split.description).toBe("на поезд, туда и обратно");
  });

  it("длинная первая строка делится дальше, остальное едет следом", () => {
    const head =
      "Разобраться почему уведомления приходят дважды и почему это видно только на телефоне";
    const split = splitTaskDraft(`${head}\nПроверял вчера вечером`);

    expect(split.title.length).toBeLessThanOrEqual(TITLE_SOFT_MAX + 1);
    expect(split.description).toContain("Проверял вчера вечером");
    expect(split.description.split("\n\n").length).toBe(2);
  });

  it("одно длинное слово режется по счётчику: другой границы нет", () => {
    const split = splitTaskDraft("а".repeat(120), 80);

    expect(split.title).toBe(`${"а".repeat(80)}…`);
    expect(split.description).toBe("а".repeat(40));
  });

  it("короткий обрывок не годится: берём границу подальше", () => {
    // Точка стоит на шестой букве — резать по ней значит оставить «Итак.»
    const text = `Итак. ${"слово ".repeat(30)}конец`;
    const split = splitTaskDraft(text);

    expect(split.title).not.toBe("Итак.");
    expect(split.title.length).toBeGreaterThan(24);
  });
});
