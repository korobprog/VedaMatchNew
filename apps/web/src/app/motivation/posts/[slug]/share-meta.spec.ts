import { describe, expect, it } from "vitest";
import { buildShareMeta, type ShareMetaPost } from "./share-meta";

function post(overrides: Partial<ShareMetaPost> = {}): ShareMetaPost {
  return {
    attributionSpeaker: "Шри Кришна",
    attributionWork: "Бхагавад-гита 2.47",
    categoryTitle: "Карма-йога",
    ...overrides,
  };
}

describe("buildShareMeta", () => {
  it("описание — портал и категория, без текста цитаты", () => {
    expect(buildShareMeta(post()).description).toBe(
      "Портал Саморазвития VedaMatch · Карма-йога",
    );
  });

  it("без категории описание остаётся без хвостового разделителя", () => {
    expect(buildShareMeta(post({ categoryTitle: "" })).description).toBe(
      "Портал Саморазвития VedaMatch",
    );
  });

  it("заголовок — источник: автор и работа через точку", () => {
    expect(buildShareMeta(post()).title).toBe(
      "Шри Кришна · Бхагавад-гита 2.47",
    );
  });

  it("известна одна часть источника — она и идёт заголовком", () => {
    expect(
      buildShareMeta(post({ attributionSpeaker: "Иван", attributionWork: null }))
        .title,
    ).toBe("Иван");
  });

  it("без источника и автора — нейтральный заголовок", () => {
    expect(
      buildShareMeta(
        post({ attributionSpeaker: null, attributionWork: null }),
      ).title,
    ).toBe("Вдохновение");
  });

  it("пустые строки атрибуции считаются отсутствием источника", () => {
    expect(
      buildShareMeta(post({ attributionSpeaker: "   ", attributionWork: "" }))
        .title,
    ).toBe("Вдохновение");
  });

  /**
   * Тот самый дубль из карточки: у открытки без текста заголовок поста —
   * «Картинка из раздела «Философия»», и ровно он уходит в тело сообщения
   * (`shareQuoteOf()` подставляет `post.title`, когда цитаты нет). Превью
   * не имеет права повторить эту строку.
   */
  it("не повторяет строку про раздел, которая уехала в тело сообщения", () => {
    const meta = buildShareMeta(
      post({
        attributionSpeaker: null,
        attributionWork: null,
        categoryTitle: "Философия",
      }),
    );
    const messageBody = "Картинка из раздела «Философия»";
    expect(meta.title).not.toBe(messageBody);
    expect(meta.title).not.toContain("раздела");
    expect(meta.description).not.toBe(messageBody);
  });

  it("не повторяет и сам текст цитаты", () => {
    const quote = "Как человек, снимая старые одежды, надевает новые…";
    const meta = buildShareMeta(post());
    expect(meta.title).not.toContain(quote);
    expect(meta.description).not.toContain(quote);
  });
});
