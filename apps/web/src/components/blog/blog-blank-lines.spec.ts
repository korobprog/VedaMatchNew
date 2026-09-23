import { describe, expect, it } from "vitest";
import {
  BLOG_BLANK_LINES_DEFAULT_KEEP,
  BLOG_BLANK_LINES_KEEP_CHOICES,
  blogBlankLinesMessage,
  collapseBlankLines,
} from "./blog-blank-lines";

describe("collapseBlankLines", () => {
  it("removes all blank lines between paragraphs by default", () => {
    expect(collapseBlankLines("Раз\n\n\nДва")).toEqual({
      text: "Раз\nДва",
      removed: 2,
    });
  });

  it("leaves exactly as many blank lines as asked", () => {
    expect(collapseBlankLines("Раз\n\n\n\nДва", 1)).toEqual({
      text: "Раз\n\nДва",
      removed: 2,
    });
    expect(collapseBlankLines("Раз\n\n\n\nДва", 2)).toEqual({
      text: "Раз\n\n\nДва",
      removed: 1,
    });
  });

  // Главный случай из VED-372: текст вставлен из мессенджера, и «пустые»
  // строки на самом деле состоят из пробелов — серверное схлопывание
  // `\n{3,}` их не видит, а человек видит дыру.
  it("treats a line of spaces and tabs as blank", () => {
    expect(collapseBlankLines("Раз\n   \n\t\nДва")).toEqual({
      text: "Раз\nДва",
      removed: 2,
    });
  });

  // Оставленная пустая строка становится действительно пустой: невидимые
  // пробелы в ней мешают следующей уборке и серверному схлопыванию.
  it("empties the blank line it keeps", () => {
    expect(collapseBlankLines("Раз\n  \n  \nДва", 1)).toEqual({
      text: "Раз\n\nДва",
      removed: 1,
    });
  });

  it("does not touch the words themselves", () => {
    const text = "  Раз с отступом  \n\nДва — с тире";
    expect(collapseBlankLines(text, 1).text).toBe(text);
    expect(collapseBlankLines(text, 1).removed).toBe(0);
  });

  it("removes blank lines at the start and at the end whatever is asked", () => {
    expect(collapseBlankLines("\n\nРаз\nДва\n\n\n", 2)).toEqual({
      text: "Раз\nДва",
      removed: 5,
    });
  });

  it("adds nothing when there is nothing to remove", () => {
    expect(collapseBlankLines("Раз\nДва", 2)).toEqual({
      text: "Раз\nДва",
      removed: 0,
    });
  });

  it("understands Windows line endings", () => {
    expect(collapseBlankLines("Раз\r\n\r\n\r\nДва")).toEqual({
      text: "Раз\nДва",
      removed: 2,
    });
  });

  it("survives a text of blank lines only", () => {
    expect(collapseBlankLines("\n   \n\n")).toEqual({ text: "", removed: 4 });
  });

  it("survives an empty text and reports no work done", () => {
    expect(collapseBlankLines("")).toEqual({ text: "", removed: 0 });
  });

  // Текст без пустых строк, но с лишним переводом строки в конце: он
  // действительно уходит, значит об этом надо сказать честно.
  it("counts the trailing line break it removes", () => {
    expect(collapseBlankLines("Раз\nДва\n")).toEqual({
      text: "Раз\nДва",
      removed: 1,
    });
  });

  it("treats a broken keep value as zero instead of throwing", () => {
    expect(collapseBlankLines("Раз\n\nДва", Number.NaN).text).toBe("Раз\nДва");
    expect(collapseBlankLines("Раз\n\nДва", -3).text).toBe("Раз\nДва");
    expect(collapseBlankLines("Раз\n\n\nДва", 1.7).text).toBe("Раз\n\nДва");
  });

  it("offers the choices the form shows", () => {
    // «Две» нет: сервер схлопывает пустые строки до одной, и выбор «две»
    // молча превращался бы в «одну» при сохранении.
    expect(BLOG_BLANK_LINES_KEEP_CHOICES).toEqual([0, 1]);
    expect(BLOG_BLANK_LINES_DEFAULT_KEEP).toBe(0);
  });
});

describe("blogBlankLinesMessage", () => {
  // Склонений здесь два подряд — «Убрана 1 пустая строка» против «Убрано 2
  // пустые строки», — и в разметке такое глазами не проверить.
  it("agrees the verb and the noun with the number", () => {
    expect(blogBlankLinesMessage(1)).toBe("Убрана 1 пустая строка.");
    expect(blogBlankLinesMessage(2)).toBe("Убрано 2 пустые строки.");
    expect(blogBlankLinesMessage(5)).toBe("Убрано 5 пустых строк.");
    // Одиннадцать заканчивается на единицу, но склоняется как «много».
    expect(blogBlankLinesMessage(11)).toBe("Убрано 11 пустых строк.");
    expect(blogBlankLinesMessage(21)).toBe("Убрана 21 пустая строка.");
  });

  // Нажал кнопку, а убирать было нечего: молчать нельзя — человек решит, что
  // кнопка не работает.
  it("says plainly that there was nothing to remove", () => {
    expect(blogBlankLinesMessage(0)).toBe(
      "Пустых строк между абзацами не нашлось.",
    );
    expect(blogBlankLinesMessage(-1)).toBe(
      "Пустых строк между абзацами не нашлось.",
    );
  });
});
