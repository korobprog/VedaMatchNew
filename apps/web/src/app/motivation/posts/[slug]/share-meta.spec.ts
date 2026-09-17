import { describe, expect, it } from "vitest";
import { buildShareMeta, type ShareMetaPost } from "./share-meta";

function post(overrides: Partial<ShareMetaPost> = {}): ShareMetaPost {
  return {
    title: "Бхагавад-гита как она есть 2.47",
    attributionSpeaker: "Шри Кришна",
    attributionWork: "Бхагавад-гита 2.47",
    categoryTitle: "Карма-йога",
    ...overrides,
  };
}

describe("buildShareMeta", () => {
  it("не повторяет текст цитаты — описание нейтральное, с категорией", () => {
    const meta = buildShareMeta(post());
    expect(meta.description).toBe(
      "Цитата на Портале Саморазвития VedaMatch · Карма-йога",
    );
  });

  it("без категории описание остаётся нейтральным, без хвостового разделителя", () => {
    const meta = buildShareMeta(post({ categoryTitle: "" }));
    expect(meta.description).toBe("Цитата на Портале Саморазвития VedaMatch");
  });

  it("содержательный заголовок поста идёт в превью как есть", () => {
    const meta = buildShareMeta(post());
    expect(meta.title).toBe("Бхагавад-гита как она есть 2.47");
  });

  it("«Свой рилс» заменяется на источник/атрибуцию, если она есть", () => {
    const meta = buildShareMeta(
      post({
        title: "Свой рилс",
        attributionSpeaker: "Иван",
        attributionWork: null,
      }),
    );
    expect(meta.title).toBe("Иван");
  });

  it("«Свой рилс» с автором и работой — обе части через точку", () => {
    const meta = buildShareMeta(
      post({
        title: "Свой рилс",
        attributionSpeaker: "Иван",
        attributionWork: "Личный дневник",
      }),
    );
    expect(meta.title).toBe("Иван · Личный дневник");
  });

  it("«Свой рилс» без источника и автора — нейтральный заголовок", () => {
    const meta = buildShareMeta(
      post({
        title: "Свой рилс",
        attributionSpeaker: null,
        attributionWork: null,
      }),
    );
    expect(meta.title).toBe("Вдохновение — VedaMatch");
  });

  it("пустые строки атрибуции считаются отсутствием источника", () => {
    const meta = buildShareMeta(
      post({
        title: "Свой рилс",
        attributionSpeaker: "   ",
        attributionWork: "",
      }),
    );
    expect(meta.title).toBe("Вдохновение — VedaMatch");
  });
});
