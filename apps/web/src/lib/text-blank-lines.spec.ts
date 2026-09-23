import { collapseBlankLines } from "@vedamatch/shared";
import { describe, expect, it } from "vitest";
import { collapseBlankLines as blogCollapse } from "@/components/blog/blog-blank-lines";

/**
 * Портальная уборка пустых строк из `@vedamatch/shared` (VED-372). У пакета
 * нет своего прогона тестов, поэтому функция проверяется здесь, у
 * потребителя. Подробные случаи блога — в `blog-blank-lines.spec.ts`, он
 * гоняет ту же функцию через прежнее имя.
 */
describe("collapseBlankLines (@vedamatch/shared)", () => {
  // Блог и «Образование» обязаны убирать одинаково: это одна функция, а не
  // две похожие копии.
  it("is the very function the blog form uses", () => {
    expect(blogCollapse).toBe(collapseBlankLines);
  });

  // Главный случай: текст вставлен из мессенджера, и «пустые» строки
  // состоят из пробелов и табуляций.
  it("treats lines of spaces and tabs as blank", () => {
    expect(collapseBlankLines("Раз\n   \n\t\nДва\n\n\n\nТри")).toEqual({
      text: "Раз\nДва\nТри",
      removed: 5,
    });
  });

  it("keeps as many blank lines as asked and no more", () => {
    expect(collapseBlankLines("Раз\n \n\n\nДва\nТри", 1)).toEqual({
      text: "Раз\n\nДва\nТри",
      removed: 2,
    });
  });

  it("does not touch lines with words, indents included", () => {
    const text = "  Стих с отступом\n    вторая строка стиха\n\nАбзац";
    expect(collapseBlankLines(text, 1)).toEqual({ text, removed: 0 });
  });

  it("understands Windows and old Mac line endings", () => {
    expect(collapseBlankLines("Раз\r\n\r\nДва\r\rТри").text).toBe(
      "Раз\nДва\nТри",
    );
  });

  // Нажать кнопку второй раз — ничего не должно поменяться: иначе автор не
  // поймёт, закончена ли уборка.
  it.each([0, 1, 2])("is stable when run again with keep %i", (keep) => {
    const once = collapseBlankLines("\n Раз\n\n \n\nДва\t\n\n\nТри \n\n", keep);
    expect(collapseBlankLines(once.text, keep)).toEqual({
      text: once.text,
      removed: 0,
    });
  });
});
