import { describe, expect, it } from "vitest";
import { fieldLabelClass } from "./field-label";

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
