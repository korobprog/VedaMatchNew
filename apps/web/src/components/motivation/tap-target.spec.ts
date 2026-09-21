import { describe, expect, it } from "vitest";
import { tapButtonClass, tapFieldClass } from "./tap-target";

describe("tap-target: размер тап-цели в мастере «Вдохновения»", () => {
  it("и поле, и кнопка поднимаются до 44px одним и тем же классом", () => {
    // `min-h-11` в Tailwind — это 2.75rem, то есть 44px. Классы двух
    // половин мастера обязаны совпадать: разойдись они, открытки и ролики
    // снова стали бы разной высоты.
    expect(tapFieldClass()).toMatch(/\bmin-h-11\b/);
    expect(tapButtonClass()).toMatch(/\bmin-h-11\b/);
  });

  it("минимум, а не фиксированная высота", () => {
    // `h-11` обрезало бы кнопку, у которой подпись перенеслась на вторую
    // строку, и поле с длинным содержимым. Класс ищем с начала слова:
    // `\bh-11\b` нашёл бы и хвост самого `min-h-11`.
    for (const value of [tapFieldClass(), tapButtonClass()])
      expect(value).not.toMatch(/(^|\s)h-11\b/);
  });

  it("размер задан шагом сетки, а не числом в пикселях", () => {
    // `min-h-[44px]` пережил бы смену шага спейсинга и остался бы числом,
    // которое никто не пересчитает.
    for (const value of [tapFieldClass(), tapButtonClass()])
      expect(value).not.toMatch(/\[|px\]|#/);
  });

  it("кнопка центрует подпись, иначе она уедет вверх паддингов", () => {
    const button = tapButtonClass();

    expect(button).toContain("items-center");
    expect(button).toContain("justify-center");
    // `inline-flex`, а не `flex`: в рядах `flex flex-wrap gap-2` кнопка
    // должна остаться по ширине подписи.
    expect(button).toMatch(/\binline-flex\b/);
    expect(button).not.toMatch(/(^|\s)flex\b/);
  });

  it("поле не получает раскладку кнопки", () => {
    // `inline-flex` на `<input>` и `<select>` ломает их собственный рендер:
    // поле отвечает за высоту, а не за раскладку содержимого.
    expect(tapFieldClass()).not.toMatch(/flex/);
  });

  it("фокус-обводку модуль не отключает", () => {
    // Глобальный `*:focus-visible` в globals.css — единственный источник
    // обводки; `outline-none` без замены был бы регрессом доступности.
    for (const value of [tapFieldClass(), tapButtonClass()])
      expect(value).not.toMatch(/outline-none|focus:outline-none/);
  });

  it("свои классы дописываются после общих", () => {
    expect(tapFieldClass("w-full")).toBe(`${tapFieldClass()} w-full`);
    expect(tapButtonClass("rounded-xl")).toBe(`${tapButtonClass()} rounded-xl`);
  });

  it("пустая добавка не оставляет хвоста из пробелов", () => {
    for (const build of [tapFieldClass, tapButtonClass]) {
      const base = build();

      expect(build("")).toBe(base);
      expect(build("   ")).toBe(base);
      expect(build(undefined)).toBe(base);
      expect(base).not.toMatch(/\s{2}|^\s|\s$/);
    }
  });
});
