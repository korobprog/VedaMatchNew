import { describe, expect, it } from "vitest";
import {
  BLOG_PREVIEW_MAX_CHARS,
  BLOG_PREVIEW_MAX_LINES,
  buildBlogTextPreview,
} from "./blog-text-preview";

describe("buildBlogTextPreview", () => {
  it("leaves a short text alone and says there is nothing to expand", () => {
    const preview = buildBlogTextPreview("Харе Кришна!");
    expect(preview).toEqual({ text: "Харе Кришна!", truncated: false });
  });

  it("returns nothing for an empty text", () => {
    expect(buildBlogTextPreview("")).toEqual({ text: "", truncated: false });
  });

  it("keeps the allowed number of lines untouched", () => {
    const text = ["Первая", "Вторая", "Третья"].join("\n");
    expect(buildBlogTextPreview(text)).toEqual({ text, truncated: false });
  });

  it("cuts the fourth line and marks the rest as hidden", () => {
    const preview = buildBlogTextPreview(
      ["Первая", "Вторая", "Третья", "Четвёртая"].join("\n"),
    );
    expect(preview.truncated).toBe(true);
    expect(preview.text).toBe("Первая\nВторая\nТретья…");
  });

  // Пустая строка занимает в карточке столько же места, сколько строка слов,
  // поэтому считается наравне с ними.
  it("counts a blank line as a line", () => {
    const preview = buildBlogTextPreview("Первая\n\nВторая");
    expect(preview).toEqual({ text: "Первая\n\nВторая", truncated: false });
    expect(buildBlogTextPreview("Первая\n\nВторая\nТретья").truncated).toBe(
      true,
    );
  });

  // Хвост из одних переводов строк разворачивать нечего — кнопки быть не
  // должно, иначе нажатие ничего не меняет.
  it("does not promise more when only blank lines were cut off", () => {
    expect(buildBlogTextPreview("Первая\nВторая\nТретья\n\n  \n")).toEqual({
      text: "Первая\nВторая\nТретья\n\n  \n",
      truncated: false,
    });
  });

  it("cuts a long single paragraph by characters, on a word boundary", () => {
    const text = `${"слово ".repeat(80)}конец`;
    const preview = buildBlogTextPreview(text);
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBeLessThanOrEqual(BLOG_PREVIEW_MAX_CHARS + 1);
    expect(preview.text.endsWith("…")).toBe(true);
    // Слово не разорвано посередине.
    expect(preview.text.replace(/…$/, "").endsWith("слово")).toBe(true);
  });

  it("cuts a single endless word hard rather than showing two letters", () => {
    const preview = buildBlogTextPreview(`Начало ${"я".repeat(400)}`);
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBe(BLOG_PREVIEW_MAX_CHARS + 1);
  });

  it("drops a dangling comma before the ellipsis", () => {
    const preview = buildBlogTextPreview("Первая,\nВторая\nТретья\nЧетвёртая");
    expect(preview.text).toBe("Первая,\nВторая\nТретья…");
    expect(
      buildBlogTextPreview("Раз\nДва\nТри,\nЧетыре").text.endsWith("Три…"),
    ).toBe(true);
  });

  it("does not add an ellipsis after a finished sentence", () => {
    const preview = buildBlogTextPreview("Раз\nДва\nТри.\nЧетыре");
    expect(preview).toEqual({ text: "Раз\nДва\nТри.", truncated: true });
  });

  it("understands Windows line endings", () => {
    const preview = buildBlogTextPreview("Раз\r\nДва\r\nТри\r\nЧетыре");
    expect(preview.text).toBe("Раз\nДва\nТри…");
    expect(preview.truncated).toBe(true);
  });

  it("obeys explicit limits", () => {
    const preview = buildBlogTextPreview("Раз\nДва\nТри", {
      maxLines: 1,
      maxChars: 100,
    });
    expect(preview).toEqual({ text: "Раз…", truncated: true });
  });

  // Ноль строк оставил бы карточку без текста вовсе — это не «свернуть».
  it("keeps at least one line whatever the caller asks", () => {
    expect(
      buildBlogTextPreview("Раз\nДва", { maxLines: 0 }).text,
    ).toBe("Раз…");
  });

  it("has sane defaults", () => {
    expect(BLOG_PREVIEW_MAX_LINES).toBe(3);
    expect(BLOG_PREVIEW_MAX_CHARS).toBeGreaterThan(100);
  });
});
