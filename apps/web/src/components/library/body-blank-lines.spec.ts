import { describe, expect, it } from "vitest";
import {
  BODY_BLANK_LINES_DEFAULT_KEEP,
  BODY_BLANK_LINES_KEEP_CHOICES,
  BODY_BLANK_LINES_KEEP_LABELS,
  bodyBlankLinesMessage,
} from "./body-blank-lines";
import { libraryDictionary } from "./i18n";

describe("body blank lines choices (VED-372)", () => {
  // «Две» здесь не предлагается: сервер хранит текст материала не больше
  // чем с одной пустой строкой подряд, и выбор молча превращался бы в
  // «одну». Проверка на сервере — entry-body.spec.ts.
  it("offers none or one, none by default", () => {
    expect(BODY_BLANK_LINES_KEEP_CHOICES).toEqual([0, 1]);
    expect(BODY_BLANK_LINES_DEFAULT_KEEP).toBe(0);
  });

  it("names every choice in both languages", () => {
    for (const choice of BODY_BLANK_LINES_KEEP_CHOICES) {
      const key = BODY_BLANK_LINES_KEEP_LABELS[choice];
      expect(libraryDictionary.ru[key]).toBeTruthy();
      expect(libraryDictionary.en[key]).toBeTruthy();
    }
  });
});

describe("bodyBlankLinesMessage", () => {
  it("agrees the Russian verb and noun with the number", () => {
    expect(bodyBlankLinesMessage("ru", 1)).toBe("Убрана 1 пустая строка.");
    expect(bodyBlankLinesMessage("ru", 3)).toBe("Убрано 3 пустые строки.");
    expect(bodyBlankLinesMessage("ru", 5)).toBe("Убрано 5 пустых строк.");
    expect(bodyBlankLinesMessage("ru", 11)).toBe("Убрано 11 пустых строк.");
    expect(bodyBlankLinesMessage("ru", 21)).toBe("Убрана 21 пустая строка.");
  });

  it("speaks English in the English interface", () => {
    expect(bodyBlankLinesMessage("en", 1)).toBe("Removed 1 blank line.");
    expect(bodyBlankLinesMessage("en", 4)).toBe("Removed 4 blank lines.");
  });

  // Нажал, а убирать нечего: молчать нельзя — решат, что кнопка сломана.
  it("says plainly that there was nothing to remove", () => {
    expect(bodyBlankLinesMessage("ru", 0)).toBe(
      "Пустых строк между абзацами не нашлось.",
    );
    expect(bodyBlankLinesMessage("en", 0)).toBe(
      "No blank lines between paragraphs.",
    );
  });
});
