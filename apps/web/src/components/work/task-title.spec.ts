import { describe, expect, it } from "vitest";
import {
  TITLE_SOFT_MAX,
  descriptionHasWholeText,
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
    // VED-104: в описании текст целиком, а не хвост после названия.
    expect(split.description).toBe(text);
  });

  it("без точки режет по пробелу и ставит многоточие", () => {
    const text =
      "Сделать так чтобы длинный текст задачи из формы сам делился на название и описание без потерь";
    const split = splitTaskDraft(text);

    expect(split.title.endsWith("…")).toBe(true);
    expect(split.title.length).toBeLessThanOrEqual(TITLE_SOFT_MAX + 1);
    // Слово пополам не рвём: название обрывается ровно перед пробелом.
    expect(text.startsWith(split.title.slice(0, -1))).toBe(true);
    expect(text[split.title.length - 1]).toBe(" ");
    expect(split.description).toBe(text);
  });

  // VED-104: на скриншоте название кончалось «…исполнителя в админ…», а
  // описание начиналось с «панели либо прям в сервисе для админов.» —
  // начало фразы видно было только в урезанном названии.
  it("описание не начинается с середины фразы", () => {
    const text =
      "Сделать возможность добавлять и редактировать исполнителя в админ панели либо прям в сервисе для админов.";
    const split = splitTaskDraft(text);

    expect(split.title).toBe(
      "Сделать возможность добавлять и редактировать исполнителя в админ панели либо…",
    );
    expect(split.description).toBe(text);
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
    // Разрезанная первая строка едет в описание целиком.
    expect(split.description).toBe(`${head}\n\nПроверял вчера вечером`);
  });

  it("одно длинное слово режется по счётчику: другой границы нет", () => {
    const split = splitTaskDraft("а".repeat(120), 80);

    expect(split.title).toBe(`${"а".repeat(80)}…`);
    expect(split.description).toBe("а".repeat(120));
  });

  it("короткий обрывок не годится: берём границу подальше", () => {
    // Точка стоит на шестой букве — резать по ней значит оставить «Итак.»
    const text = `Итак. ${"слово ".repeat(30)}конец`;
    const split = splitTaskDraft(text);

    expect(split.title).not.toBe("Итак.");
    expect(split.title.length).toBeGreaterThan(24);
  });
});

describe("descriptionHasWholeText", () => {
  it("строку резали — в описании весь текст", () => {
    const text =
      "Починить кнопку сохранения в карточке. Сейчас она не реагирует на нажатие, и правка теряется.";
    expect(descriptionHasWholeText(splitTaskDraft(text))).toBe(true);
    expect(
      descriptionHasWholeText(splitTaskDraft(`${"слово ".repeat(20)}конец`)),
    ).toBe(true);
  });

  it("граница по переводу строки — в описании только остальное", () => {
    expect(
      descriptionHasWholeText(
        splitTaskDraft("Купить билеты\nна поезд, туда и обратно"),
      ),
    ).toBe(false);
  });

  it("короткое название без описания — подсказки нет вовсе", () => {
    expect(descriptionHasWholeText(splitTaskDraft("Купить билеты"))).toBe(
      false,
    );
  });
});
