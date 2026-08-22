import { describe, expect, it } from "vitest";
import { authorColor, authorPalette } from "./chat-author-color";

describe("authorPalette", () => {
  it("у одного человека цвет всегда один и тот же", () => {
    expect(authorPalette("user-1")).toEqual(authorPalette("user-1"));
  });

  it("разным людям достаются разные цвета", () => {
    const colors = new Set(
      ["a1", "b2", "c3", "d4", "e5", "f6"].map(authorColor),
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it("возвращает класс из палитры, а не произвольную строку", () => {
    const palette = ["text-cyan", "text-violet", "text-gold", "text-blue"];
    for (const id of ["x", "yy", "zzz", "0000"])
      expect(palette).toContain(authorColor(id));
  });

  it("у аватара есть подложка и цвет буквы", () => {
    const { avatar } = authorPalette("кто-то");
    expect(avatar.from).toMatch(/^#[0-9A-F]{6}$/i);
    expect(avatar.to).toMatch(/^#[0-9A-F]{6}$/i);
    expect(avatar.ink).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("пустой id не роняет расчёт", () => {
    expect(typeof authorColor("")).toBe("string");
  });
});
