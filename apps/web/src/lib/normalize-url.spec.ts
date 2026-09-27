import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./normalize-url";

describe("normalizeUrl", () => {
  it("дописывает https:// к голому домену", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("www.example.com/a?b=1")).toBe(
      "https://www.example.com/a?b=1",
    );
    expect(normalizeUrl("сайт.рф")).toBe("https://сайт.рф");
  });

  it("обрезает пробелы по краям", () => {
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
    expect(normalizeUrl(" https://example.com ")).toBe("https://example.com");
  });

  it("пустое оставляет пустым", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });

  it("не трогает http:// и https:// в любом регистре", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com");
  });

  it("не трогает mailto:, tel: и прочие схемы", () => {
    expect(normalizeUrl("mailto:a@b.ru")).toBe("mailto:a@b.ru");
    expect(normalizeUrl("tel:+79990000000")).toBe("tel:+79990000000");
    expect(normalizeUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it("порт не принимает за схему", () => {
    expect(normalizeUrl("example.com:8080/x")).toBe(
      "https://example.com:8080/x",
    );
  });

  it("слово без точки в имени сайта адресом не делает", () => {
    expect(normalizeUrl("битая")).toBe("битая");
    expect(normalizeUrl("localhost:3000")).toBe("localhost:3000");
    expect(normalizeUrl("@username")).toBe("@username");
  });

  it("адрес без схемы вида //example.com получает https:", () => {
    expect(normalizeUrl("//example.com")).toBe("https://example.com");
  });

  it("текст с пробелами внутри не считает адресом", () => {
    expect(normalizeUrl("мой сайт")).toBe("мой сайт");
  });
});
