import { describe, expect, it } from "vitest";
import { readerBlockText } from "./block-text";

describe("readerBlockText", () => {
  it("разделяет абзацы комментария пустой строкой", () => {
    expect(
      readerBlockText("<p>Первый абзац.</p><p>Второй абзац.</p>"),
    ).toBe("Первый абзац.\n\nВторой абзац.");
  });

  it("переносы строк из разметки не превращает в переносы текста", () => {
    expect(
      readerBlockText("<p>Воплотившаяся   душа\n постепенно  меняет тело</p>"),
    ).toBe("Воплотившаяся душа постепенно меняет тело");
  });

  it("<br> — перенос строки, как в стихе", () => {
    expect(readerBlockText("мātrā-sparśās tu<br>śītoṣṇa-sukha")).toBe(
      "мātrā-sparśās tu\nśītoṣṇa-sukha",
    );
  });

  it("сохраняет выделение как обычный текст", () => {
    expect(
      readerBlockText("<p>о сын <em>Кунти</em>, <strong>терпеливо</strong> переноси</p>"),
    ).toBe("о сын Кунти, терпеливо переноси");
  });

  it("пункты списка — отдельными абзацами, без лишних пустых строк", () => {
    expect(readerBlockText("<ul><li>одно</li><li>другое</li></ul>")).toBe(
      "одно\n\nдругое",
    );
  });
});
