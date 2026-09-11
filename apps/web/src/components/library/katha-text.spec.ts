import { describe, expect, it } from "vitest";
import { kathaParagraphs } from "./katha-text";

describe("kathaParagraphs", () => {
  it("делит текст на абзацы по пустым строкам", () => {
    expect(kathaParagraphs("Первый абзац.\n\nВторой абзац.")).toEqual([
      "Первый абзац.",
      "Второй абзац.",
    ]);
  });

  it("не рвёт абзац на одиночном переводе строки", () => {
    expect(kathaParagraphs("Харе Кришна\nХаре Рама\n\nДальше")).toEqual([
      "Харе Кришна\nХаре Рама",
      "Дальше",
    ]);
  });

  it("пустая строка из пробелов — тоже граница абзаца", () => {
    expect(kathaParagraphs("Один\n   \nДва")).toEqual(["Один", "Два"]);
  });

  it("понимает переводы строк Windows и не оставляет пустых абзацев", () => {
    expect(kathaParagraphs("\r\n\r\nОдин\r\n\r\n\r\n\r\nДва\r\n")).toEqual([
      "Один",
      "Два",
    ]);
  });
});
