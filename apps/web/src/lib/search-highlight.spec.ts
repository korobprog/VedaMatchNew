import { describe, expect, it } from "vitest";
import { highlightParts } from "./search-highlight";

/** Подсвеченные куски — чтобы проверки читались словами. */
const hits = (text: string, query: string) =>
  highlightParts(text, query)
    .filter((part) => part.hit)
    .map((part) => part.text);

describe("highlightParts (VED-98)", () => {
  it("подсвечивает слово запроса, не теряя остальной текст", () => {
    const parts = highlightParts("Киртан в субботу", "киртан");

    expect(parts).toEqual([
      { text: "Киртан", hit: true },
      { text: " в субботу", hit: false },
    ]);
    expect(parts.map((part) => part.text).join("")).toBe("Киртан в субботу");
  });

  it("находит другую форму того же слова", () => {
    expect(hits("Лекции о Бхагавад-гите и киртан", "лекцию киртаны")).toEqual([
      "Лекции",
      "киртан",
    ]);
  });

  it("не путает «е» и «ё»", () => {
    expect(hits("Ёлочные игрушки", "елочные")).toEqual(["Ёлочные"]);
    expect(hits("Зелёный чай", "зеленый")).toEqual(["Зелёный"]);
  });

  it("ищет в начале слов, а не в середине", () => {
    // «от» не должен гореть внутри «работа» и «кот».
    expect(hits("Работа и кот", "от")).toEqual([]);
    expect(hits("Отпуск", "от")).toEqual(["Отпуск"]);
  });

  it("подсвечивает слово текста целиком", () => {
    expect(hits("Киртаны по средам", "кирт")).toEqual(["Киртаны"]);
  });

  it("слишком короткие слова запроса не подсвечивает", () => {
    expect(highlightParts("и в лес", "и")).toEqual([
      { text: "и в лес", hit: false },
    ]);
  });

  it("спецсимволы запроса не ломают поиск", () => {
    expect(hits("C++ для начинающих", "c++ (начинающих)")).toEqual([
      "начинающих",
    ]);
  });

  it("пустой текст — пустой результат", () => {
    expect(highlightParts("", "киртан")).toEqual([]);
  });
});
