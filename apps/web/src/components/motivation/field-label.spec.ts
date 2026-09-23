import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_GROUP_CLASS,
  ATTRIBUTION_ICON_CLASS,
  ATTRIBUTION_LABEL_CLASS,
  ATTRIBUTION_OPTIONAL_CLASS,
  ATTRIBUTION_TITLE_CLASS,
  fieldLabelClass,
} from "./field-label";

describe("fieldLabelClass (VED-203)", () => {
  it("подпись выделена и весом, и самым контрастным текстовым токеном", () => {
    const base = fieldLabelClass();

    // Вес — чтобы подпись отличалась от пояснения под полем.
    expect(base).toContain("font-semibold");
    // Цвет — `--vm-text-0`, а не `--vm-text-1`: на фоне с орбами подпись
    // цветом text-1 сливалась с пояснениями рядом. Регэксп заякорен по
    // границе слова, иначе `text-text-0` совпал бы и с `text-text-1`.
    expect(base).toMatch(/\btext-text-0\b/);
    expect(base).not.toMatch(/\btext-text-[12]\b/);
  });

  it("цвет задан токеном, а не хардкодом", () => {
    // Хардкод `#RRGGBB` и произвольное значение в квадратных скобках
    // (`text-[#180F2C]`) пережили бы переключение темы и остались бы от
    // чужой: цвет обязан приходить из токена `globals.css`.
    expect(fieldLabelClass()).not.toMatch(/#|\[/);
  });

  it("свои классы подписи дописываются после общих", () => {
    expect(fieldLabelClass("mb-2")).toBe(`${fieldLabelClass()} mb-2`);
  });

  it("пустая добавка не оставляет хвоста из пробелов", () => {
    const base = fieldLabelClass();

    expect(fieldLabelClass("")).toBe(base);
    expect(fieldLabelClass("   ")).toBe(base);
    expect(fieldLabelClass(undefined)).toBe(base);
    expect(base).not.toMatch(/\s{2}|^\s|\s$/);
  });
});

describe("выделение «Автор» и «Источник» (VED-203, второй круг)", () => {
  const all = [
    ATTRIBUTION_GROUP_CLASS,
    ATTRIBUTION_ICON_CLASS,
    ATTRIBUTION_LABEL_CLASS,
    ATTRIBUTION_OPTIONAL_CLASS,
    ATTRIBUTION_TITLE_CLASS,
  ];

  it("слово набрано заголовочным шрифтом, крупнее и жирнее обычной подписи", () => {
    expect(ATTRIBUTION_TITLE_CLASS).toMatch(/\bfont-display\b/);
    expect(ATTRIBUTION_TITLE_CLASS).toMatch(/\btext-base\b/);
    expect(ATTRIBUTION_TITLE_CLASS).toMatch(/\bfont-(semibold|bold)\b/);
    expect(ATTRIBUTION_LABEL_CLASS).toMatch(/\btext-text-0\b/);
  });

  it("акцент — рамкой и значком, а не цветом букв", () => {
    // Маджента текстом на светлой теме — 4.46:1, мелкому кеглю мало.
    expect(ATTRIBUTION_GROUP_CLASS).toMatch(/\bborder-magenta\//);
    expect(ATTRIBUTION_ICON_CLASS).toMatch(/\btext-magenta\b/);
    expect(ATTRIBUTION_TITLE_CLASS).not.toMatch(/text-magenta/);
  });

  it("«(необязательно)» тише слова, но не `--vm-text-2`", () => {
    // На маджента-заливке блока text-2 в тёмной теме — 4.37:1.
    expect(ATTRIBUTION_OPTIONAL_CLASS).toMatch(/\btext-text-1\b/);
    expect(ATTRIBUTION_OPTIONAL_CLASS).toMatch(/\bfont-normal\b/);
  });

  it("только токены: ни хардкода цвета, ни произвольных значений", () => {
    for (const value of all) expect(value).not.toMatch(/#|\[/);
  });
});
